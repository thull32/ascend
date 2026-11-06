//! Where learners drop off: weekly sign-up cohorts through onboarding, a
//! first lesson, a first finished module and coming back in weeks 2 and 4,
//! and the lessons learners were on when they went quiet.
//!
//! Return visits count activity days 8–14 ("week 2") and 22–28 ("week 4")
//! after sign-up. A learner only counts towards a week once that week is
//! over, so young cohorts are not shown as having churned; `*_eligible` is
//! the denominator.
use std::collections::HashMap;
use std::sync::Arc;

use chrono::{Datelike, Duration, NaiveDate, Utc};
use sea_orm::*;
use serde::Serialize;

use super::admin::stmt;
use crate::content::Curriculum;
use crate::error::{AppError, AppResult};

/// A learner is quiet after this many days without activity.
pub const QUIET_DAYS: i32 = 14;

#[derive(Debug, Clone, Default, Serialize, FromQueryResult)]
pub struct Cohort {
    /// The Monday (UTC) of the sign-up week.
    pub week: NaiveDate,
    pub signed_up: i64,
    pub onboarded: i64,
    pub started_lesson: i64,
    pub completed_lesson: i64,
    pub completed_module: i64,
    pub week2_eligible: i64,
    pub week2_active: i64,
    pub week4_eligible: i64,
    pub week4_active: i64,
}

#[derive(Debug, Serialize)]
pub struct StopPoint {
    pub slug: String,
    /// Null when the lesson is no longer in the curriculum.
    pub title: Option<String>,
    pub track: Option<String>,
    /// Quiet learners whose last lesson this was, still unfinished.
    pub stopped_in: i64,
    /// Quiet learners who finished it and did not start another.
    pub stopped_after: i64,
}

#[derive(Debug, Serialize)]
pub struct Funnel {
    pub weeks: i32,
    /// Oldest first, every week present.
    pub cohorts: Vec<Cohort>,
    pub quiet_days: i32,
    /// Accounts older than `quiet_days` with no activity in that time.
    pub quiet_learners: i64,
    /// Of those, how many never opened a lesson.
    pub quiet_never_started: i64,
    pub stop_points: Vec<StopPoint>,
}

#[derive(Clone)]
pub struct FunnelService {
    db: DatabaseConnection,
    curriculum: Arc<Curriculum>,
}

impl FunnelService {
    pub fn new(db: DatabaseConnection, curriculum: Arc<Curriculum>) -> Self {
        Self { db, curriculum }
    }

    /// Cohorts for the last `weeks` sign-up weeks (4 to 52), this one included.
    pub async fn report(&self, weeks: i32) -> AppResult<Funnel> {
        if !(4..=52).contains(&weeks) {
            return Err(AppError::validation("weeks must be between 4 and 52"));
        }
        // Lesson → module, for "finished a whole module".
        let (mut lessons, mut modules) = (Vec::new(), Vec::new());
        for t in &self.curriculum.tracks {
            for m in &t.modules {
                for l in &m.lessons {
                    lessons.push(l.slug.clone());
                    modules.push(format!("{}/{}", t.slug, m.slug));
                }
            }
        }
        let rows = Cohort::find_by_statement(stmt(
            "WITH m AS (SELECT * FROM unnest($1::text[], $2::text[]) AS m(lesson, module)), \
             sizes AS (SELECT module, count(*) AS n FROM m GROUP BY module), \
             u AS ( \
               SELECT id, onboarded_at, date_trunc('week', created_at AT TIME ZONE 'UTC')::date AS week, \
                 (created_at AT TIME ZONE 'UTC')::date AS d0 \
               FROM users \
               WHERE created_at >= (date_trunc('week', now() AT TIME ZONE 'UTC') - make_interval(weeks => $3 - 1)) \
                 AT TIME ZONE 'UTC') \
             SELECT week, count(*)::bigint AS signed_up, \
               count(*) FILTER (WHERE onboarded_at IS NOT NULL)::bigint AS onboarded, \
               count(*) FILTER (WHERE EXISTS (SELECT 1 FROM lesson_progress p WHERE p.user_id = u.id))::bigint \
                 AS started_lesson, \
               count(*) FILTER (WHERE EXISTS (SELECT 1 FROM lesson_progress p \
                 WHERE p.user_id = u.id AND p.status = 'completed'))::bigint AS completed_lesson, \
               count(*) FILTER (WHERE EXISTS (SELECT 1 FROM lesson_progress p \
                 JOIN m ON m.lesson = p.lesson_slug JOIN sizes s ON s.module = m.module \
                 WHERE p.user_id = u.id AND p.status = 'completed' \
                 GROUP BY m.module, s.n HAVING count(*) >= s.n))::bigint AS completed_module, \
               count(*) FILTER (WHERE d0 <= current_date - 14)::bigint AS week2_eligible, \
               count(*) FILTER (WHERE d0 <= current_date - 14 AND EXISTS (SELECT 1 FROM activity_days a \
                 WHERE a.user_id = u.id AND a.day BETWEEN d0 + 7 AND d0 + 13))::bigint AS week2_active, \
               count(*) FILTER (WHERE d0 <= current_date - 28)::bigint AS week4_eligible, \
               count(*) FILTER (WHERE d0 <= current_date - 28 AND EXISTS (SELECT 1 FROM activity_days a \
                 WHERE a.user_id = u.id AND a.day BETWEEN d0 + 21 AND d0 + 27))::bigint AS week4_active \
             FROM u GROUP BY week ORDER BY week",
            [lessons.into(), modules.into(), weeks.into()],
        ))
        .all(&self.db)
        .await?;
        let by_week: HashMap<NaiveDate, Cohort> = rows.into_iter().map(|c| (c.week, c)).collect();
        let today = Utc::now().date_naive();
        let this_monday = today - Duration::days(today.weekday().num_days_from_monday() as i64);
        let cohorts = (0..weeks)
            .rev()
            .map(|i| {
                let week = this_monday - Duration::weeks(i as i64);
                by_week.get(&week).cloned().unwrap_or(Cohort { week, ..Default::default() })
            })
            .collect();

        let quiet = self
            .db
            .query_one_raw(stmt(
                "SELECT count(*)::bigint AS quiet, \
                   count(*) FILTER (WHERE NOT EXISTS (SELECT 1 FROM lesson_progress p WHERE p.user_id = u.id))::bigint \
                     AS never_started \
                 FROM users u WHERE u.created_at < now() - make_interval(days => $1) \
                   AND NOT EXISTS (SELECT 1 FROM activity_days a \
                     WHERE a.user_id = u.id AND a.day > current_date - $1)",
                [QUIET_DAYS.into()],
            ))
            .await?
            .ok_or_else(|| AppError::internal("quiet learners returned no row"))?;

        // Each quiet learner's most recently touched lesson.
        let stops = self
            .db
            .query_all_raw(stmt(
                "SELECT lesson_slug, count(*) FILTER (WHERE status <> 'completed')::bigint AS stopped_in, \
                   count(*) FILTER (WHERE status = 'completed')::bigint AS stopped_after \
                 FROM (SELECT DISTINCT ON (p.user_id) p.user_id, p.lesson_slug, p.status \
                       FROM lesson_progress p JOIN users u ON u.id = p.user_id \
                       WHERE u.created_at < now() - make_interval(days => $1) \
                         AND NOT EXISTS (SELECT 1 FROM activity_days a \
                           WHERE a.user_id = p.user_id AND a.day > current_date - $1) \
                       ORDER BY p.user_id, p.updated_at DESC) last \
                 GROUP BY lesson_slug ORDER BY count(*) DESC, lesson_slug LIMIT 20",
                [QUIET_DAYS.into()],
            ))
            .await?;
        let track_of: HashMap<&str, &str> = self
            .curriculum
            .tracks
            .iter()
            .flat_map(|t| {
                t.modules.iter().flat_map(|m| m.lessons.iter()).map(move |l| (l.slug.as_str(), t.title.as_str()))
            })
            .collect();
        let stop_points = stops
            .iter()
            .map(|r| {
                let slug: String = r.try_get("", "lesson_slug")?;
                Ok(StopPoint {
                    title: self.curriculum.lesson(&slug).map(|l| l.summary.title.clone()),
                    track: track_of.get(slug.as_str()).map(|t| (*t).to_owned()),
                    stopped_in: r.try_get("", "stopped_in")?,
                    stopped_after: r.try_get("", "stopped_after")?,
                    slug,
                })
            })
            .collect::<Result<_, DbErr>>()?;
        Ok(Funnel {
            weeks,
            cohorts,
            quiet_days: QUIET_DAYS,
            quiet_learners: quiet.try_get("", "quiet")?,
            quiet_never_started: quiet.try_get("", "never_started")?,
            stop_points,
        })
    }
}
