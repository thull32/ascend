//! Special fenced blocks inside lesson Markdown.
//!
//! We deliberately reuse fenced code blocks (```` ```exercise ````) instead of
//! inventing a directive syntax: every Markdown editor and renderer already
//! understands fences, the raw file stays readable, and the frontend only has
//! to special-case the info string.
//!
//! Block schemas (YAML unless noted):
//!
//! ```` markdown
//! ```exercise
//! id: implement-stack
//! title: Implement a stack with O(1) min
//! prompt: |
//!   Markdown prompt shown above the editor.
//! languages: [python, javascript]
//! entry: MinStack            # function/class name the tests call
//! starter:
//!   python: |
//!     class MinStack: ...
//!   javascript: |
//!     class MinStack { ... }
//! tests:
//!   - args: [[1, 2, 3]]
//!     expected: 3
//! hints: ["Keep a second stack of running minimums."]
//! ```
//!
//! ```quiz
//! - q: What is the amortised cost of push on a dynamic array?
//!   options: ["O(1)", "O(log n)", "O(n)"]
//!   answer: 0
//!   explanation: Doubling means each element is copied O(1) times on average.
//! ```
//!
//! ```viz
//! {"type": "graph-bfs", "graph": {...}, "start": "A"}
//! ```
//! ````
//!
//! `viz` blocks are opaque JSON passed straight to the frontend's visualiser
//! registry (`web/src/viz`). The backend only validates that it parses.
use regex::Regex;
use serde::{Deserialize, Serialize};

use super::model::TestCase;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ExerciseSpec {
    pub id: String,
    pub title: String,
    pub prompt: String,
    #[serde(default = "default_languages")]
    pub languages: Vec<String>,
    pub entry: String,
    pub starter: std::collections::HashMap<String, String>,
    #[serde(default)]
    pub tests: Vec<TestCase>,
    #[serde(default)]
    pub hints: Vec<String>,
    #[serde(default = "default_time_limit")]
    pub time_limit_ms: u32,
}

fn default_languages() -> Vec<String> {
    vec!["python".into(), "javascript".into()]
}
fn default_time_limit() -> u32 {
    3000
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct QuizQuestion {
    pub q: String,
    pub options: Vec<String>,
    /// Index into `options`.
    pub answer: usize,
    #[serde(default)]
    pub explanation: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct QuizSpec {
    pub questions: Vec<QuizQuestion>,
}

/// Public shape: what the client sees before answering.
#[derive(Debug, Clone, Serialize)]
pub struct QuizPublicQuestion {
    pub q: String,
    pub options: Vec<String>,
}

impl QuizSpec {
    pub fn public(&self) -> Vec<QuizPublicQuestion> {
        self.questions
            .iter()
            .map(|q| QuizPublicQuestion { q: q.q.clone(), options: q.options.clone() })
            .collect()
    }
}

#[derive(Debug, thiserror::Error)]
pub enum BlockError {
    #[error("exercise block in {file}: {source}")]
    Exercise { file: String, source: serde_yaml_ng::Error },
    #[error("quiz block in {file}: {source}")]
    Quiz { file: String, source: serde_yaml_ng::Error },
    #[error("viz block in {file}: {source}")]
    Viz { file: String, source: serde_json::Error },
    #[error("{file}: more than one quiz block (merge them)")]
    MultipleQuizzes { file: String },
}

/// Everything extracted from one lesson body.
#[derive(Debug, Default)]
pub struct Extracted {
    pub exercises: Vec<ExerciseSpec>,
    pub quiz: Option<QuizSpec>,
    pub has_viz: bool,
    /// Body with quiz answers/explanations removed.
    pub public_body: String,
}

static FENCE: once_cell::sync::Lazy<Regex> = once_cell::sync::Lazy::new(|| {
    // Matches ```lang\n...\n``` (non-greedy, multiline). Info string may carry
    // attributes after the language, which we ignore.
    Regex::new(r"(?ms)^```(exercise|quiz|viz)[^\n]*\n(.*?)^```[ \t]*$").expect("static regex")
});

pub fn extract(file: &str, body: &str) -> Result<Extracted, BlockError> {
    let mut out = Extracted::default();
    let mut public = String::with_capacity(body.len());
    let mut last = 0;

    for cap in FENCE.captures_iter(body) {
        let whole = cap.get(0).expect("group 0");
        let kind = &cap[1];
        let inner = &cap[2];
        public.push_str(&body[last..whole.start()]);
        match kind {
            "exercise" => {
                let spec: ExerciseSpec = serde_yaml_ng::from_str(inner)
                    .map_err(|source| BlockError::Exercise { file: file.into(), source })?;
                // Re-emit a normalised block so the frontend gets canonical JSON.
                public.push_str("```exercise\n");
                public.push_str(&serde_json::to_string(&spec).expect("serialisable"));
                public.push_str("\n```");
                out.exercises.push(spec);
            }
            "quiz" => {
                if out.quiz.is_some() {
                    return Err(BlockError::MultipleQuizzes { file: file.into() });
                }
                let questions: Vec<QuizQuestion> = serde_yaml_ng::from_str(inner)
                    .map_err(|source| BlockError::Quiz { file: file.into(), source })?;
                let spec = QuizSpec { questions };
                public.push_str("```quiz\n");
                public.push_str(&serde_json::to_string(&spec.public()).expect("serialisable"));
                public.push_str("\n```");
                out.quiz = Some(spec);
            }
            "viz" => {
                let value: serde_json::Value = serde_json::from_str(inner)
                    .map_err(|source| BlockError::Viz { file: file.into(), source })?;
                public.push_str("```viz\n");
                public.push_str(&serde_json::to_string(&value).expect("serialisable"));
                public.push_str("\n```");
                out.has_viz = true;
            }
            _ => unreachable!("regex only matches known kinds"),
        }
        last = whole.end();
    }
    public.push_str(&body[last..]);
    out.public_body = public;
    Ok(out)
}

static HEADING: once_cell::sync::Lazy<Regex> =
    once_cell::sync::Lazy::new(|| Regex::new(r"(?m)^(#{2,3})\s+(.+?)\s*$").expect("static regex"));

/// Extract h2/h3 headings for a table of contents. Ids follow the same rule
/// the frontend uses (`slugify`), so anchors line up.
pub fn headings(body: &str) -> Vec<super::model::Heading> {
    // Skip headings inside fenced code blocks.
    let mut in_fence = false;
    let mut out = Vec::new();
    for line in body.lines() {
        if line.trim_start().starts_with("```") {
            in_fence = !in_fence;
            continue;
        }
        if in_fence {
            continue;
        }
        if let Some(cap) = HEADING.captures(line) {
            let level = cap[1].len() as u8;
            let text = cap[2].to_string();
            out.push(super::model::Heading { level, id: slugify(&text), text });
        }
    }
    out
}

pub fn slugify(text: &str) -> String {
    let mut s = String::with_capacity(text.len());
    let mut prev_dash = false;
    for ch in text.chars() {
        if ch.is_alphanumeric() {
            s.extend(ch.to_lowercase());
            prev_dash = false;
        } else if !prev_dash && !s.is_empty() {
            s.push('-');
            prev_dash = true;
        }
    }
    s.trim_end_matches('-').to_string()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn strips_quiz_answers_and_keeps_exercises() {
        let body = "# Hi\n\ntext\n\n```quiz\n- q: A?\n  options: [x, y]\n  answer: 1\n  explanation: because\n```\n\n```exercise\nid: e1\ntitle: T\nprompt: P\nentry: f\nstarter:\n  python: 'def f(): pass'\ntests:\n  - args: [1]\n    expected: 2\n```\nend\n";
        let ex = extract("t.md", body).unwrap();
        assert_eq!(ex.exercises.len(), 1);
        assert!(ex.quiz.is_some());
        assert!(!ex.public_body.contains("because"));
        assert!(ex.public_body.contains("\"q\":\"A?\""));
        assert!(ex.public_body.ends_with("end\n"));
    }

    #[test]
    fn heading_ids_are_stable() {
        let h = headings("## Big-O: the intuition\n```\n## not a heading\n```\n### Sub heading!");
        assert_eq!(h.len(), 2);
        assert_eq!(h[0].id, "big-o-the-intuition");
        assert_eq!(h[1].id, "sub-heading");
    }
}
