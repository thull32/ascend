use std::collections::HashMap;
use std::sync::Arc;

use chrono::{Datelike, Duration, Utc};
use sea_orm::*;
use sea_orm::sea_query;
use serde::{Deserialize, Serialize};
use uuid::Uuid;

use crate::content::Curriculum;
use crate::entities::prelude::*;
use crate::entities::{lesson_progress, module_preferences, quiz_attempts, submissions};
use crate::error::{AppError, AppResult};

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum LessonStatus {
    InProgress,
    Completed,
}

impl LessonStatus {
    fn as_str(self) -> &'static str {
        match self {
            Self::InProgress => "in_progress",
            Self::Completed => "completed",
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum ModulePreference {
    Normal,
    /// "I already know this" — removed from the roadmap, still browsable.
    Confident,
    /// "Get me here fast" — pulled forward in the roadmap.
    Priority,
}

impl ModulePreference {
    pub fn as_str(self) -> &'static str {
        match self {
            Self::Normal => "normal",
            Self::Confident => "confident",
            Self::Priority => "priority",
        }
    }
    pub fn parse(s: &str) -> Self {
        match s {
            "confident" => Self::Confident,
            "priority" => Self::Priority,
            _ => Self::Normal,
        }
    }
}

/// Everything the dashboard needs, in one round trip of a few small queries.
#[derive(Debug, Serialize)]
pub struct ProgressSummary {
    pub lessons_completed: usize,
    pub lessons_total: usize,
    pub lessons_in_progress: usize,
    pub problems_solved: usize,
    pub problems_total: usize,
    pub quizzes_passed: usize,
    pub streak_days: u32,
    pub xp: u64,
    pub completed_slugs: Vec<String>,
    pub in_progress_slugs: Vec<String>,
    pub solved_problem_slugs: Vec<String>,
    pub module_preferences: HashMap<String, ModulePreference>,
    /// Most recently touched lesson, for "continue where you left off".
    pub last_lesson: Option<String>,
    pub per_track: Vec<TrackProgress>,
}

#[derive(Debug, Serialize)]
pub struct TrackProgress {
    pub track_slug: String,
    pub completed: usize,
    pub total: usize,
}

#[derive(Clone)]
pub struct ProgressService {
    db: DatabaseConnection,
    curriculum: Arc<Curriculum>,
}

impl ProgressService {
    pub fn new(db: DatabaseConnection, curriculum: Arc<Curriculum>) -> Self {
        Self { db, curriculum }
    }

    pub async fn set_lesson_status(&self, user_id: Uuid, lesson_slug: &str, status: LessonStatus) -> AppResult<lesson_progress::Model> {
        if self.curriculum.lesson(lesson_slug).is_none() {
            return Err(AppError::NotFound("lesson"));
        }
        let now = Utc::now();
        let completed_at = matches!(status, LessonStatus::Completed).then_some(now);
        let model = lesson_progress::ActiveModel {
            user_id: Set(user_id),
            lesson_slug: Set(lesson_slug.to_string()),
            status: Set(status.as_str().to_string()),
            completed_at: Set(completed_at),
            created_at: Set(now),
            updated_at: Set(now),
        };
        // Upsert: one statement, no read-modify-write race.
        LessonProgress::insert(model)
            .on_conflict(
                sea_query::OnConflict::columns([lesson_progress::Column::UserId, lesson_progress::Column::LessonSlug])
                    .update_columns([
                        lesson_progress::Column::Status,
                        lesson_progress::Column::CompletedAt,
                        lesson_progress::Column::UpdatedAt,
                    ])
                    .to_owned(),
            )
            .exec(&self.db)
            .await?;
        LessonProgress::find_by_id((user_id, lesson_slug.to_string()))
            .one(&self.db)
            .await?
            .ok_or(AppError::NotFound("progress"))
    }

    pub async fn set_module_preference(&self, user_id: Uuid, module_slug: &str, pref: ModulePreference) -> AppResult<()> {
        if self.curriculum.module(module_slug).is_none() {
            return Err(AppError::NotFound("module"));
        }
        let now = Utc::now();
        ModulePreferences::insert(module_preferences::ActiveModel {
            user_id: Set(user_id),
            module_slug: Set(module_slug.to_string()),
            preference: Set(pref.as_str().to_string()),
            created_at: Set(now),
            updated_at: Set(now),
        })
        .on_conflict(
            sea_query::OnConflict::columns([module_preferences::Column::UserId, module_preferences::Column::ModuleSlug])
                .update_columns([module_preferences::Column::Preference, module_preferences::Column::UpdatedAt])
                .to_owned(),
        )
        .exec(&self.db)
        .await?;
        Ok(())
    }

    pub async fn summary(&self, user_id: Uuid) -> AppResult<ProgressSummary> {
        let progress = LessonProgress::find()
            .filter(lesson_progress::Column::UserId.eq(user_id))
            .order_by_desc(lesson_progress::Column::UpdatedAt)
            .all(&self.db)
            .await?;
        let prefs = ModulePreferences::find().filter(module_preferences::Column::UserId.eq(user_id)).all(&self.db).await?;
        let solved: Vec<String> = Submissions::find()
            .select_only()
            .column(submissions::Column::TargetSlug)
            .distinct()
            .filter(submissions::Column::UserId.eq(user_id))
            .filter(submissions::Column::TargetKind.eq("problem"))
            .filter(submissions::Column::Passed.eq(true))
            .into_tuple::<String>()
            .all(&self.db)
            .await?;
        let quizzes = QuizAttempts::find().filter(quiz_attempts::Column::UserId.eq(user_id)).all(&self.db).await?;

        let completed: Vec<String> =
            progress.iter().filter(|p| p.status == "completed").map(|p| p.lesson_slug.clone()).collect();
        let in_progress: Vec<String> =
            progress.iter().filter(|p| p.status == "in_progress").map(|p| p.lesson_slug.clone()).collect();

        // Streak: consecutive UTC days (ending today or yesterday) with any activity.
        let mut days: Vec<chrono::NaiveDate> = progress.iter().map(|p| p.updated_at.date_naive()).collect();
        days.extend(quizzes.iter().map(|q| q.created_at.date_naive()));
        days.sort_unstable();
        days.dedup();
        let streak = compute_streak(&days, Utc::now().date_naive());

        let quizzes_passed = quizzes.iter().filter(|q| q.total > 0 && q.score * 10 >= q.total * 7).count();
        let xp = completed.len() as u64 * 50 + solved.len() as u64 * 100 + quizzes_passed as u64 * 30;

        let completed_set: std::collections::HashSet<&str> = completed.iter().map(String::as_str).collect();
        let per_track = self
            .curriculum
            .tracks
            .iter()
            .map(|t| TrackProgress {
                track_slug: t.slug.clone(),
                total: t.lesson_count,
                completed: t
                    .modules
                    .iter()
                    .flat_map(|m| m.lessons.iter())
                    .filter(|l| completed_set.contains(l.slug.as_str()))
                    .count(),
            })
            .collect();

        Ok(ProgressSummary {
            lessons_completed: completed.len(),
            lessons_total: self.curriculum.lesson_count(),
            lessons_in_progress: in_progress.len(),
            problems_solved: solved.len(),
            problems_total: self.curriculum.problems.len(),
            quizzes_passed,
            streak_days: streak,
            xp,
            last_lesson: progress.first().map(|p| p.lesson_slug.clone()),
            completed_slugs: completed,
            in_progress_slugs: in_progress,
            solved_problem_slugs: solved,
            module_preferences: prefs.into_iter().map(|p| (p.module_slug, ModulePreference::parse(&p.preference))).collect(),
            per_track,
        })
    }
}

fn compute_streak(sorted_unique_days: &[chrono::NaiveDate], today: chrono::NaiveDate) -> u32 {
    let mut streak = 0u32;
    let mut cursor = today;
    let set: std::collections::HashSet<_> = sorted_unique_days.iter().copied().collect();
    // Allow the streak to be "alive" if the last activity was yesterday.
    if !set.contains(&cursor) {
        cursor -= Duration::days(1);
    }
    while set.contains(&cursor) {
        streak += 1;
        cursor -= Duration::days(1);
    }
    let _ = today.weekday();
    streak
}

#[cfg(test)]
mod tests {
    use super::*;
    use chrono::NaiveDate;

    #[test]
    fn streak_counts_consecutive_days() {
        let d = |s: &str| NaiveDate::parse_from_str(s, "%Y-%m-%d").unwrap();
        let today = d("2026-09-26");
        assert_eq!(compute_streak(&[d("2026-09-24"), d("2026-09-25"), d("2026-09-26")], today), 3);
        assert_eq!(compute_streak(&[d("2026-09-24"), d("2026-09-25")], today), 2);
        assert_eq!(compute_streak(&[d("2026-09-20")], today), 0);
        assert_eq!(compute_streak(&[], today), 0);
    }
}
