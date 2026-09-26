use std::sync::Arc;

use chrono::Utc;
use sea_orm::*;
use serde::{Deserialize, Serialize};
use uuid::Uuid;

use crate::content::Curriculum;
use crate::content::blocks::QuizPublicQuestion;
use crate::entities::quiz_attempts;
use crate::error::{AppError, AppResult};

#[derive(Debug, Deserialize)]
pub struct GradeInput {
    /// Chosen option index per question (same order as served).
    pub answers: Vec<usize>,
}

#[derive(Debug, Serialize)]
pub struct GradedQuestion {
    pub correct: bool,
    pub chosen: usize,
    pub answer: usize,
    pub explanation: String,
}

#[derive(Debug, Serialize)]
pub struct GradeResult {
    pub score: usize,
    pub total: usize,
    pub passed: bool,
    pub questions: Vec<GradedQuestion>,
}

#[derive(Clone)]
pub struct QuizService {
    db: DatabaseConnection,
    curriculum: Arc<Curriculum>,
}

impl QuizService {
    pub fn new(db: DatabaseConnection, curriculum: Arc<Curriculum>) -> Self {
        Self { db, curriculum }
    }

    pub fn questions(&self, lesson_slug: &str) -> AppResult<Vec<QuizPublicQuestion>> {
        let lesson = self.curriculum.lesson(lesson_slug).ok_or(AppError::NotFound("lesson"))?;
        Ok(lesson.quiz.as_ref().map(|q| q.public()).unwrap_or_default())
    }

    /// Grades against the authored answers and records the attempt.
    pub async fn grade(&self, user_id: Uuid, lesson_slug: &str, input: GradeInput) -> AppResult<GradeResult> {
        let lesson = self.curriculum.lesson(lesson_slug).ok_or(AppError::NotFound("lesson"))?;
        let quiz = lesson.quiz.as_ref().ok_or(AppError::NotFound("quiz"))?;
        if input.answers.len() != quiz.questions.len() {
            return Err(AppError::validation(format!("expected {} answers", quiz.questions.len())));
        }
        let questions: Vec<GradedQuestion> = quiz
            .questions
            .iter()
            .zip(&input.answers)
            .map(|(q, &chosen)| GradedQuestion {
                correct: chosen == q.answer,
                chosen,
                answer: q.answer,
                explanation: q.explanation.clone(),
            })
            .collect();
        let score = questions.iter().filter(|q| q.correct).count();
        let total = questions.len();
        quiz_attempts::ActiveModel {
            id: Set(Uuid::now_v7()),
            user_id: Set(user_id),
            lesson_slug: Set(lesson_slug.to_string()),
            source: Set("authored".into()),
            score: Set(score as i16),
            total: Set(total as i16),
            answers: Set(serde_json::json!(input.answers)),
            created_at: Set(Utc::now()),
        }
        .insert(&self.db)
        .await?;
        Ok(GradeResult { score, total, passed: total > 0 && score * 10 >= total * 7, questions })
    }

    /// Records an attempt at an AI-generated quiz (graded client-side because
    /// the questions were generated for that session only).
    pub async fn record_generated(&self, user_id: Uuid, lesson_slug: &str, score: usize, total: usize, answers: serde_json::Value) -> AppResult<()> {
        if self.curriculum.lesson(lesson_slug).is_none() {
            return Err(AppError::NotFound("lesson"));
        }
        if total == 0 || score > total || total > 50 {
            return Err(AppError::validation("invalid score"));
        }
        quiz_attempts::ActiveModel {
            id: Set(Uuid::now_v7()),
            user_id: Set(user_id),
            lesson_slug: Set(lesson_slug.to_string()),
            source: Set("generated".into()),
            score: Set(score as i16),
            total: Set(total as i16),
            answers: Set(answers),
            created_at: Set(Utc::now()),
        }
        .insert(&self.db)
        .await?;
        Ok(())
    }
}
