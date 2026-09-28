//! The AI coach: a tutor that knows where the learner is in the curriculum.
//!
//! The system prompt is assembled from stable parts first (persona, rules)
//! and the volatile context last (current lesson body, progress), which keeps
//! the cacheable prefix identical across turns.
use std::sync::Arc;

use chrono::Utc;
use sea_orm::sea_query::Expr;
use sea_orm::*;
use serde::{Deserialize, Serialize};
use uuid::Uuid;

use super::anthropic::{AnthropicClient, ChatMessage, Effort, Request, Role, Usage};
use super::budget::{BudgetService, Reservation};
use crate::content::Curriculum;
use crate::entities::prelude::*;
use crate::entities::{conversations, messages};
use crate::error::{AppError, AppResult};
use crate::services::progress::ProgressSummary;

pub const COACH_PERSONA: &str = r#"You are the Ascend coach: a principal engineer who has run hundreds of senior-level interview loops at companies like Netflix, and who now tutors mid-level engineers toward senior roles.

Teaching rules:
- Diagnose before you explain. If the learner's question is vague, ask one sharp question, then answer.
- Go one level deeper than the obvious answer: mechanism, trade-off, and the failure mode a senior engineer would name.
- Prefer concrete examples over adjectives. Show a tiny worked example or a 5-line snippet when it clarifies.
- Never hand over a full solution to an exercise or practice problem the learner is working on. Give the next hint, the invariant, or the question that unblocks them. If they explicitly say they have given up, give the approach in prose first, then code.
- When asked "what should I do next", use the roadmap context and recommend one concrete lesson or problem with the reason.
- Be direct and warm. No filler, no "great question".
- Format with Markdown: short paragraphs, code fences with a language tag, tables for comparisons.
- If a question is outside software engineering, computer science, or career growth, say so briefly and steer back."#;

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct CoachContext {
    pub kind: Option<String>, // "lesson" | "problem" | "roadmap" | "general"
    pub slug: Option<String>,
    /// The learner's current code in the editor, if any.
    pub code: Option<String>,
    pub language: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct SendMessageInput {
    pub content: String,
    #[serde(default)]
    pub context: CoachContext,
}

#[derive(Clone)]
pub struct CoachService {
    db: DatabaseConnection,
    curriculum: Arc<Curriculum>,
    client: Option<AnthropicClient>,
    budget: BudgetService,
    model: String,
}

/// At most this many past messages are sent with each turn.
const MAX_HISTORY: u64 = 30;
/// The window's start moves in steps of this many messages rather than one
/// turn at a time. A window that slid every turn would change the prompt's
/// first message on every request and so miss the prompt cache on every
/// long conversation; stepping keeps the prefix identical for five turns.
const HISTORY_STEP: u64 = 10;

/// Index of the first message to send, for a conversation of `total`
/// messages: 0 until the window is full, then advancing in whole steps so
/// between `MAX_HISTORY - HISTORY_STEP` and `MAX_HISTORY` messages are kept.
fn history_start(total: u64) -> u64 {
    if total <= MAX_HISTORY {
        return 0;
    }
    (total - MAX_HISTORY).div_ceil(HISTORY_STEP) * HISTORY_STEP
}
const MAX_MESSAGE_CHARS: usize = 8000;

impl CoachService {
    pub fn new(
        db: DatabaseConnection,
        curriculum: Arc<Curriculum>,
        client: Option<AnthropicClient>,
        budget: BudgetService,
        model: String,
    ) -> Self {
        Self { db, curriculum, client, budget, model }
    }

    pub fn enabled(&self) -> bool {
        self.client.is_some()
    }

    pub fn client(&self) -> AppResult<&AnthropicClient> {
        self.client.as_ref().ok_or(AppError::AiDisabled)
    }

    pub fn budget(&self) -> &BudgetService {
        &self.budget
    }

    pub fn model(&self) -> &str {
        &self.model
    }

    pub fn curriculum(&self) -> &Curriculum {
        &self.curriculum
    }

    pub fn curriculum_lesson(&self, slug: &str) -> Option<Arc<crate::content::Lesson>> {
        self.curriculum.lesson(slug)
    }

    pub async fn create_conversation(&self, user_id: Uuid, context: &CoachContext) -> AppResult<conversations::Model> {
        let title = match (&context.kind, &context.slug) {
            (Some(k), Some(s)) if k == "lesson" => {
                self.curriculum.lesson(s).map(|l| l.summary.title.clone()).unwrap_or_else(|| "Lesson".into())
            }
            (Some(k), Some(s)) if k == "problem" => {
                self.curriculum.problem(s).map(|p| p.title.clone()).unwrap_or_else(|| "Problem".into())
            }
            _ => "New conversation".into(),
        };
        let now = Utc::now();
        Ok(conversations::ActiveModel {
            id: Set(Uuid::now_v7()),
            user_id: Set(user_id),
            title: Set(title),
            context: Set(serde_json::to_value(context).map_err(AppError::internal)?),
            created_at: Set(now),
            updated_at: Set(now),
        }
        .insert(&self.db)
        .await?)
    }

    pub async fn list_conversations(&self, user_id: Uuid) -> AppResult<Vec<conversations::Model>> {
        Ok(Conversations::find()
            .filter(conversations::Column::UserId.eq(user_id))
            .order_by_desc(conversations::Column::UpdatedAt)
            .limit(50)
            .all(&self.db)
            .await?)
    }

    pub async fn get_conversation(
        &self,
        user_id: Uuid,
        id: Uuid,
    ) -> AppResult<(conversations::Model, Vec<messages::Model>)> {
        let conv = Conversations::find_by_id(id).one(&self.db).await?.ok_or(AppError::NotFound("conversation"))?;
        if conv.user_id != user_id {
            return Err(AppError::NotFound("conversation"));
        }
        let msgs = Messages::find()
            .filter(messages::Column::ConversationId.eq(id))
            .order_by_asc(messages::Column::CreatedAt)
            .limit(200)
            .all(&self.db)
            .await?;
        Ok((conv, msgs))
    }

    pub async fn delete_conversation(&self, user_id: Uuid, id: Uuid) -> AppResult<()> {
        let res = Conversations::delete_many()
            .filter(conversations::Column::Id.eq(id))
            .filter(conversations::Column::UserId.eq(user_id))
            .exec(&self.db)
            .await?;
        if res.rows_affected == 0 { Err(AppError::NotFound("conversation")) } else { Ok(()) }
    }

    /// Persists the user turn and builds the model request. The caller streams
    /// the reply and then calls [`Self::finish_turn`].
    pub async fn prepare_turn(
        &self,
        user_id: Uuid,
        conv: &conversations::Model,
        input: SendMessageInput,
        progress: Option<&ProgressSummary>,
    ) -> AppResult<(Request, Reservation)> {
        let content = input.content.trim().to_string();
        if content.is_empty() {
            return Err(AppError::validation("message is empty"));
        }
        if content.chars().count() > MAX_MESSAGE_CHARS {
            return Err(AppError::validation("message is too long (8000 characters max)"));
        }
        // Build the request in memory first, reserve budget for it, and only
        // then store the learner's message: a refused request leaves nothing
        // behind, and the hold is sized from the real request.
        let in_conversation = Messages::find().filter(messages::Column::ConversationId.eq(conv.id));
        let stored = in_conversation.clone().count(&self.db).await?;
        let total = stored + 1;
        let history = in_conversation
            .order_by_asc(messages::Column::CreatedAt)
            .offset(history_start(total))
            .limit(MAX_HISTORY)
            .all(&self.db)
            .await?;
        let mut msgs: Vec<ChatMessage> = history
            .into_iter()
            .map(|m| ChatMessage {
                role: if m.role == "assistant" { Role::Assistant } else { Role::User },
                content: m.content,
            })
            .collect();
        msgs.push(ChatMessage { role: Role::User, content: content.clone() });
        // The API requires alternating roles starting with `user`; collapse
        // any accidental doubles (e.g. a failed assistant turn).
        msgs = collapse_roles(msgs);

        let context: CoachContext = serde_json::from_value(conv.context.clone()).unwrap_or_default();
        let context = CoachContext {
            code: input.context.code.or(context.code),
            language: input.context.language.or(context.language),
            kind: input.context.kind.or(context.kind),
            slug: input.context.slug.or(context.slug),
        };
        let mut request = Request {
            model: self.model.clone(),
            system: self.stable_prompt(),
            context: Some(self.context_prompt(&context, progress)),
            cache_conversation: true,
            messages: msgs,
            max_tokens: 4000,
            effort: Effort::Medium,
            json_schema: None,
        };
        let hold = self.budget.reserve(user_id, &mut request).await?;

        messages::ActiveModel {
            id: Set(Uuid::now_v7()),
            conversation_id: Set(conv.id),
            role: Set("user".into()),
            content: Set(content),
            input_tokens: Set(0),
            output_tokens: Set(0),
            created_at: Set(Utc::now()),
        }
        .insert(&self.db)
        .await?;
        Ok((request, hold))
    }

    pub async fn finish_turn(&self, conv_id: Uuid, reply: String, usage: Usage, hold: Reservation) -> AppResult<()> {
        // Settle first: the usage is real whether or not the reply persists.
        hold.settle(usage).await?;
        let now = Utc::now();
        if !reply.trim().is_empty() {
            messages::ActiveModel {
                id: Set(Uuid::now_v7()),
                conversation_id: Set(conv_id),
                role: Set("assistant".into()),
                content: Set(reply),
                input_tokens: Set(i32::try_from(usage.input_tokens).unwrap_or(i32::MAX)),
                output_tokens: Set(i32::try_from(usage.output_tokens).unwrap_or(i32::MAX)),
                created_at: Set(now),
            }
            .insert(&self.db)
            .await?;
        }
        Conversations::update_many()
            .col_expr(conversations::Column::UpdatedAt, Expr::value(now))
            .filter(conversations::Column::Id.eq(conv_id))
            .exec(&self.db)
            .await?;
        Ok(())
    }

    /// Stable for every learner and every turn: persona and curriculum map.
    /// This is the cached prefix.
    fn stable_prompt(&self) -> String {
        let mut s = String::with_capacity(8_000);
        s.push_str(COACH_PERSONA);
        s.push_str("\n\n# Curriculum map\n");
        for t in &self.curriculum.tracks {
            s.push_str(&format!("- {} ({}): ", t.title, t.slug));
            s.push_str(&t.modules.iter().map(|m| m.title.as_str()).collect::<Vec<_>>().join(", "));
            s.push('\n');
        }
        s
    }

    /// Changes between turns (the lesson being read, the code in the editor,
    /// progress). Sent after the cache breakpoint so it never invalidates the
    /// stable prefix.
    fn context_prompt(&self, ctx: &CoachContext, progress: Option<&ProgressSummary>) -> String {
        let mut s = String::with_capacity(16_000);
        s.push_str("# Current context\n");
        match (ctx.kind.as_deref(), ctx.slug.as_deref()) {
            (Some("lesson"), Some(slug)) => {
                if let Some(l) = self.curriculum.lesson(slug) {
                    s.push_str(&format!(
                        "The learner is reading the lesson \"{}\" (track: {}, module: {}).\n",
                        l.summary.title, l.track_title, l.module_title
                    ));
                    s.push_str("Lesson text (for grounding; do not recite it back):\n<lesson>\n");
                    s.push_str(&truncate(&l.body, 24_000));
                    s.push_str("\n</lesson>\n");
                }
            }
            (Some("problem"), Some(slug)) => {
                if let Some(p) = self.curriculum.problem(slug) {
                    s.push_str(&format!(
                        "The learner is solving the practice problem \"{}\" ({:?}; patterns: {}).\n",
                        p.title,
                        p.difficulty,
                        p.patterns.join(", ")
                    ));
                    s.push_str("<problem>\n");
                    s.push_str(&truncate(&p.statement, 8_000));
                    s.push_str("\n</problem>\nHints the author wrote (reveal progressively, one at a time, only when asked):\n");
                    for (i, h) in p.hints.iter().enumerate() {
                        s.push_str(&format!("{}. {}\n", i + 1, h));
                    }
                    s.push_str("Remember: hints and questions only. Never paste a complete working solution unless the learner explicitly gives up.\n");
                }
            }
            _ => s.push_str("General coaching session.\n"),
        }
        if let Some(code) = &ctx.code {
            s.push_str(&format!(
                "\nThe learner's current editor contents ({}):\n```\n{}\n```\n",
                ctx.language.as_deref().unwrap_or("code"),
                truncate(code, 12_000)
            ));
        }
        if let Some(p) = progress {
            s.push_str(&format!(
                "\n# Learner progress\nLessons completed: {}/{}. Problems solved: {}/{}. Streak: {} days.\n",
                p.lessons_completed, p.lessons_total, p.problems_solved, p.problems_total, p.streak_days
            ));
            if let Some(last) = &p.last_lesson {
                s.push_str(&format!("Most recent lesson: {last}\n"));
            }
        }
        s
    }
}

fn truncate(s: &str, max: usize) -> String {
    if s.len() <= max {
        s.to_string()
    } else {
        let mut end = max;
        while !s.is_char_boundary(end) {
            end -= 1;
        }
        format!("{}\n…[truncated]", &s[..end])
    }
}

pub fn collapse_roles(msgs: Vec<ChatMessage>) -> Vec<ChatMessage> {
    let mut out: Vec<ChatMessage> = Vec::with_capacity(msgs.len());
    for m in msgs {
        if out.is_empty() && m.role != Role::User {
            continue;
        }
        match out.last_mut() {
            Some(last) if last.role == m.role => {
                last.content.push_str("\n\n");
                last.content.push_str(&m.content);
            }
            _ => out.push(m),
        }
    }
    // Must end with a user turn.
    while out.last().is_some_and(|m| m.role == Role::Assistant) {
        out.pop();
    }
    out
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn history_window_moves_in_steps_so_the_cached_prefix_survives() {
        assert_eq!(history_start(0), 0);
        assert_eq!(history_start(MAX_HISTORY), 0);
        // One message over: the start jumps a whole step, not one message.
        assert_eq!(history_start(MAX_HISTORY + 1), HISTORY_STEP);
        // ...and stays put while the conversation grows by up to a step.
        assert_eq!(history_start(MAX_HISTORY + HISTORY_STEP), HISTORY_STEP);
        assert_eq!(history_start(MAX_HISTORY + HISTORY_STEP + 1), 2 * HISTORY_STEP);
        for total in 0..500 {
            let kept = total - history_start(total);
            assert!(kept <= MAX_HISTORY, "total {total} keeps {kept}");
            assert!(total <= MAX_HISTORY || kept > MAX_HISTORY - HISTORY_STEP, "total {total} keeps {kept}");
        }
    }

    #[test]
    fn collapse_makes_roles_alternate_and_start_with_user() {
        let m = |r: Role, c: &str| ChatMessage { role: r, content: c.into() };
        let out = collapse_roles(vec![
            m(Role::Assistant, "orphan"),
            m(Role::User, "a"),
            m(Role::User, "b"),
            m(Role::Assistant, "c"),
            m(Role::User, "d"),
            m(Role::Assistant, "trailing"),
        ]);
        assert_eq!(out.len(), 3);
        assert_eq!(out[0].content, "a\n\nb");
        assert_eq!(out[2].role, Role::User);
    }
}
