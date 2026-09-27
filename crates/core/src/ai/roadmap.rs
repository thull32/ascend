//! AI roadmap personalisation: the learner describes their background in
//! their own words; the model proposes which modules to mark "confident"
//! (skip) or "priority" (do first), with a reason for each. Nothing is
//! applied server-side: the learner reviews and applies suggestions, so a
//! model mistake costs one click, not a silently wrong roadmap.
use serde::{Deserialize, Serialize};
use uuid::Uuid;

use super::anthropic::{ChatMessage, Effort, Request, Role};
use super::coach::CoachService;
use crate::error::{AppError, AppResult};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RoadmapSuggestion {
    pub module: String,
    pub preference: String, // "confident" | "priority"
    pub reason: String,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct RoadmapSuggestions {
    pub summary: String,
    pub suggestions: Vec<RoadmapSuggestion>,
}

const MAX_BACKGROUND_CHARS: usize = 4000;

pub async fn suggest(
    coach: &CoachService,
    user_id: Uuid,
    background: &str,
    goal: Option<&str>,
) -> AppResult<RoadmapSuggestions> {
    let background = background.trim();
    if background.chars().count() < 20 {
        return Err(AppError::validation("tell the coach a little more about your background (20+ characters)"));
    }
    if background.chars().count() > MAX_BACKGROUND_CHARS {
        return Err(AppError::validation("background is too long (4000 characters max)"));
    }
    let client = coach.client()?;
    coach.budget().check_and_reserve(user_id).await?;

    let curriculum = coach.curriculum();
    let modules: Vec<(String, String, String)> = curriculum
        .tracks
        .iter()
        .flat_map(|t| {
            t.modules.iter().map(move |m| (m.slug.clone(), format!("{} / {}", t.title, m.title), m.description.clone()))
        })
        .collect();
    let mut catalogue = String::new();
    for (slug, title, desc) in &modules {
        catalogue.push_str(&format!("- {slug}: {title}. {desc}\n"));
    }
    let slugs: Vec<&str> = modules.iter().map(|(s, _, _)| s.as_str()).collect();

    let system = format!(
        "You personalise a learning roadmap for a software engineer preparing for a senior role at a top-tier company.\n\
         Given their self-description, propose modules to mark:\n\
         - \"confident\": only when the background clearly demonstrates mastery at the depth the module description implies \
         (years of hands-on work with the specific topic, not mere exposure). Be conservative: skipping a module they need \
         is worse than reviewing one they know.\n\
         - \"priority\": gaps that matter most for their stated goal and that they mention being weak in or never having done.\n\
         Propose at most 12 suggestions, each with a one-sentence reason that cites their words. Also write a two-sentence \
         summary of how the roadmap should feel for them.\n\n# Modules\n{catalogue}"
    );
    let user = format!(
        "Goal: {}\n\nMy background, in my words:\n<background>\n{}\n</background>",
        goal.unwrap_or("senior software engineer at a top-tier company"),
        background
    );
    let schema = serde_json::json!({
        "type": "object",
        "additionalProperties": false,
        "required": ["summary", "suggestions"],
        "properties": {
            "summary": {"type": "string"},
            "suggestions": {
                "type": "array",
                "items": {
                    "type": "object",
                    "additionalProperties": false,
                    "required": ["module", "preference", "reason"],
                    "properties": {
                        "module": {"type": "string", "enum": slugs},
                        "preference": {"type": "string", "enum": ["confident", "priority"]},
                        "reason": {"type": "string"}
                    }
                }
            }
        }
    });
    let req = Request {
        model: coach.model().to_string(),
        system,
        context: None,
        cache_conversation: false,
        messages: vec![ChatMessage { role: Role::User, content: user }],
        max_tokens: 3000,
        effort: Effort::Medium,
        json_schema: Some(schema),
    };
    let completion = client.complete(&req).await?;
    coach.budget().record(user_id, completion.usage).await?;
    let mut out: RoadmapSuggestions = serde_json::from_str(&completion.text)
        .map_err(|e| AppError::ai_upstream("the coach could not produce suggestions; try again", e))?;
    // Defence in depth: the schema constrains values, but never trust model
    // output as input to state changes. Drop unknown modules and duplicates.
    let mut seen = std::collections::HashSet::new();
    out.suggestions.retain(|s| {
        slugs.contains(&s.module.as_str())
            && (s.preference == "confident" || s.preference == "priority")
            && seen.insert(s.module.clone())
    });
    out.suggestions.truncate(12);
    Ok(out)
}
