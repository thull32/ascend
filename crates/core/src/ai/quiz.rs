//! Fresh quiz generation with JSON-schema constrained output, so the response
//! is guaranteed to parse into [`GeneratedQuiz`].
use serde::{Deserialize, Serialize};
use uuid::Uuid;

use super::anthropic::{ChatMessage, Effort, Request, Role};
use super::coach::CoachService;
use crate::error::{AppError, AppResult};

#[derive(Debug, Serialize, Deserialize)]
pub struct GeneratedQuestion {
    pub q: String,
    pub options: Vec<String>,
    pub answer: usize,
    pub explanation: String,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct GeneratedQuiz {
    pub questions: Vec<GeneratedQuestion>,
}

fn schema() -> serde_json::Value {
    serde_json::json!({
        "type": "object",
        "additionalProperties": false,
        "required": ["questions"],
        "properties": {
            "questions": {
                "type": "array",
                "items": {
                    "type": "object",
                    "additionalProperties": false,
                    "required": ["q", "options", "answer", "explanation"],
                    "properties": {
                        "q": {"type": "string"},
                        "options": {"type": "array", "items": {"type": "string"}},
                        "answer": {"type": "integer"},
                        "explanation": {"type": "string"}
                    }
                }
            }
        }
    })
}

pub async fn generate(
    coach: &CoachService,
    user_id: Uuid,
    lesson_slug: &str,
    count: usize,
) -> AppResult<GeneratedQuiz> {
    let client = coach.client()?;
    let curriculum_lesson = coach_lesson(coach, lesson_slug)?;
    coach.budget().check_and_reserve(user_id).await?;

    let count = count.clamp(3, 10);
    let system = "You write rigorous, senior-level multiple-choice quizzes for software engineers preparing for FAANG interviews.\n\
         Rules: each question has exactly 4 options and exactly one correct answer (index 0-3). \
         Test understanding and trade-offs, not vocabulary recall. At least one question must present a short scenario or code snippet. \
         Distractors must be plausible misconceptions. Explanations must say why the right answer is right AND why the most tempting wrong option is wrong. \
         Never reuse a question that appears verbatim in the lesson's own quiz.".to_string();
    let user = format!(
        "Lesson title: {}\nLesson description: {}\n\nLesson body:\n<lesson>\n{}\n</lesson>\n\nWrite {count} questions.",
        curriculum_lesson.summary.title,
        curriculum_lesson.summary.description,
        curriculum_lesson.body.chars().take(30_000).collect::<String>()
    );
    let req = Request {
        model: coach.model().to_string(),
        system,
        context: None,
        cache_conversation: false,
        messages: vec![ChatMessage { role: Role::User, content: user }],
        max_tokens: super::STRUCTURED_MAX_TOKENS,
        effort: Effort::Medium,
        json_schema: Some(schema()),
    };
    let completion = client.complete(&req).await?;
    coach.budget().record(user_id, completion.usage).await?;
    let mut quiz: GeneratedQuiz = serde_json::from_str(&completion.text)
        .map_err(|e| AppError::ai_upstream("the quiz could not be generated; try again", e))?;
    quiz.questions.retain(|q| q.options.len() >= 2 && q.answer < q.options.len());
    if quiz.questions.is_empty() {
        return Err(AppError::AiUpstream("quiz generation returned no usable questions".into()));
    }
    Ok(quiz)
}

fn coach_lesson(coach: &CoachService, slug: &str) -> AppResult<std::sync::Arc<crate::content::Lesson>> {
    coach.curriculum_lesson(slug).ok_or(AppError::NotFound("lesson"))
}

#[cfg(test)]
mod tests {
    #[test]
    fn questions_are_written_before_their_answers() {
        let text = super::schema().to_string();
        let at = |k: &str| text.find(&format!("\"{k}\":")).unwrap();
        assert!(at("q") < at("options") && at("options") < at("answer") && at("answer") < at("explanation"));
    }
}
