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
use std::sync::LazyLock;

use regex::Regex;
use serde::{Deserialize, Serialize};

use super::model::TestCase;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
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
#[serde(deny_unknown_fields)]
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
        self.questions.iter().map(|q| QuizPublicQuestion { q: q.q.clone(), options: q.options.clone() }).collect()
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
    #[error("{file}: {reason}")]
    Invalid { file: String, reason: String },
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

static FENCE: LazyLock<Regex> = LazyLock::new(|| {
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
                validate_exercise(file, &spec)?;
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
                let questions: Vec<QuizQuestion> =
                    serde_yaml_ng::from_str(inner).map_err(|source| BlockError::Quiz { file: file.into(), source })?;
                validate_quiz(file, &questions)?;
                let spec = QuizSpec { questions };
                public.push_str("```quiz\n");
                public.push_str(&serde_json::to_string(&spec.public()).expect("serialisable"));
                public.push_str("\n```");
                out.quiz = Some(spec);
            }
            "viz" => {
                let value: serde_json::Value =
                    serde_json::from_str(inner).map_err(|source| BlockError::Viz { file: file.into(), source })?;
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

fn invalid(file: &str, reason: String) -> BlockError {
    BlockError::Invalid { file: file.into(), reason }
}

fn validate_quiz(file: &str, questions: &[QuizQuestion]) -> Result<(), BlockError> {
    if questions.is_empty() {
        return Err(invalid(file, "quiz block has no questions".into()));
    }
    for (i, q) in questions.iter().enumerate() {
        if q.options.len() < 2 {
            return Err(invalid(file, format!("quiz question {} needs at least two options", i + 1)));
        }
        if q.answer >= q.options.len() {
            return Err(invalid(file, format!("quiz question {} answer index {} is out of range", i + 1, q.answer)));
        }
        let mut seen = std::collections::HashSet::new();
        if !q.options.iter().all(|o| seen.insert(o.trim())) {
            return Err(invalid(file, format!("quiz question {} has duplicate options", i + 1)));
        }
    }
    Ok(())
}

fn validate_exercise(file: &str, spec: &ExerciseSpec) -> Result<(), BlockError> {
    let id = &spec.id;
    if spec.entry.trim().is_empty() {
        return Err(invalid(file, format!("exercise {id}: empty entry")));
    }
    if spec.tests.is_empty() {
        return Err(invalid(file, format!("exercise {id}: no tests")));
    }
    if let Some(lang) = spec.languages.iter().find(|l| !spec.starter.contains_key(*l)) {
        return Err(invalid(file, format!("exercise {id}: language {lang} has no starter code")));
    }
    Ok(())
}

static LINK: LazyLock<Regex> = LazyLock::new(|| Regex::new(r"!?\[([^\]]*)\]\([^)]*\)").expect("static regex"));

/// Heading text as the browser renders it: Markdown link targets, emphasis
/// markers and code backticks removed. Inline maths keeps its TeX source,
/// which is also what `rehype-slug` sees (it runs before KaTeX).
pub fn plain_heading_text(raw: &str) -> String {
    let no_links = LINK.replace_all(raw, "$1");
    no_links.replace("**", "").replace("__", "").replace(['`', '*', '$'], "").trim().to_string()
}

/// Extract h2/h3 headings for a table of contents. Ids are generated exactly
/// as the frontend's `rehype-slug` (github-slugger) does, including `-1`,
/// `-2` suffixes for duplicates counted across *all* heading levels, so every
/// table-of-contents link lands on its heading.
pub fn headings(body: &str) -> Vec<super::model::Heading> {
    let mut in_fence = false;
    let mut slugger = Slugger::default();
    let mut out = Vec::new();
    for line in body.lines() {
        if line.trim_start().starts_with("```") {
            in_fence = !in_fence;
            continue;
        }
        if in_fence {
            continue;
        }
        if let Some(cap) = ANY_HEADING.captures(line) {
            let level = cap[1].len() as u8;
            let text = plain_heading_text(&cap[2]);
            let id = slugger.slug(&text);
            if level == 2 || level == 3 {
                out.push(super::model::Heading { level, id, text });
            }
        }
    }
    out
}

static ANY_HEADING: LazyLock<Regex> =
    LazyLock::new(|| Regex::new(r"^(#{1,6})\s+(.+?)\s*#*\s*$").expect("static regex"));

/// github-slugger's algorithm: lowercase, drop punctuation and symbols (keep
/// letters, numbers, `-`, `_` and spaces), turn each space into `-`, and
/// de-duplicate within one document by appending `-1`, `-2`, ...
#[derive(Default)]
pub struct Slugger {
    seen: std::collections::HashMap<String, usize>,
}

impl Slugger {
    pub fn slug(&mut self, text: &str) -> String {
        let base = slugify(text);
        let mut result = base.clone();
        while self.seen.contains_key(&result) {
            let n = self.seen.entry(base.clone()).or_insert(0);
            *n += 1;
            result = format!("{base}-{n}");
        }
        self.seen.insert(result.clone(), 0);
        result
    }
}

/// One slug without de-duplication (see [`Slugger`] for documents).
pub fn slugify(text: &str) -> String {
    text.to_lowercase()
        .chars()
        .filter_map(|c| match c {
            ' ' => Some('-'),
            '-' | '_' => Some(c),
            c if c.is_alphanumeric() => Some(c),
            // Combining marks (accents written as separate code points) are
            // kept by github-slugger too.
            c if ('\u{0300}'..='\u{036F}').contains(&c) => Some(c),
            _ => None,
        })
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    fn quiz(yaml: &str) -> Result<Extracted, BlockError> {
        extract("t.md", &format!("```quiz\n{yaml}```\n"))
    }

    #[test]
    fn malformed_quizzes_fail_the_build() {
        let reason = |r: Result<Extracted, BlockError>| match r {
            Err(BlockError::Invalid { reason, .. }) => reason,
            other => panic!("expected Invalid, got {other:?}"),
        };
        assert!(reason(quiz("- q: A?\n  options: [x, y]\n  answer: 2\n")).contains("out of range"));
        assert!(reason(quiz("- q: A?\n  options: [x]\n  answer: 0\n")).contains("two options"));
        assert!(reason(quiz("- q: A?\n  options: [x, ' x']\n  answer: 0\n")).contains("duplicate"));
        assert!(reason(quiz("[]\n")).contains("no questions"));
        // A misspelt key is an error, not a silently missing explanation.
        assert!(matches!(
            quiz("- q: A?\n  options: [x, y]\n  answer: 0\n  explaination: typo\n"),
            Err(BlockError::Quiz { .. })
        ));
    }

    #[test]
    fn exercises_need_a_starter_for_every_language() {
        let body = "```exercise\nid: e\ntitle: T\nprompt: P\nentry: f\nstarter:\n  python: 'def f(): pass'\ntests:\n  - args: []\n    expected: 1\n```\n";
        match extract("t.md", body) {
            Err(BlockError::Invalid { reason, .. }) => assert!(reason.contains("javascript"), "{reason}"),
            other => panic!("expected Invalid, got {other:?}"),
        }
    }

    #[test]
    fn strips_quiz_answers_and_keeps_exercises() {
        let body = "# Hi\n\ntext\n\n```quiz\n- q: A?\n  options: [x, y]\n  answer: 1\n  explanation: because\n```\n\n```exercise\nid: e1\ntitle: T\nprompt: P\nlanguages: [python]\nentry: f\nstarter:\n  python: 'def f(): pass'\ntests:\n  - args: [1]\n    expected: 2\n```\nend\n";
        let ex = extract("t.md", body).unwrap();
        assert_eq!(ex.exercises.len(), 1);
        assert!(ex.quiz.is_some());
        assert!(!ex.public_body.contains("because"));
        assert!(ex.public_body.contains("\"q\":\"A?\""));
        assert!(ex.public_body.ends_with("end\n"));
    }

    #[test]
    fn heading_ids_match_github_slugger() {
        let h = headings("## Big-O: the intuition\n```\n## not a heading\n```\n### Sub heading!");
        assert_eq!(h.len(), 2);
        assert_eq!(h[0].id, "big-o-the-intuition");
        assert_eq!(h[1].id, "sub-heading");
        // Cases where the old slugifier disagreed with the browser.
        assert_eq!(slugify("Why O(1) is a lie"), "why-o1-is-a-lie");
        assert_eq!(slugify("TCP vs. UDP: which?"), "tcp-vs-udp-which");
        assert_eq!(slugify("Two  spaces"), "two--spaces");
        assert_eq!(slugify("snake_case & more"), "snake_case--more");
        assert_eq!(slugify("Déjà vu"), "déjà-vu");
    }

    #[test]
    fn heading_text_is_rendered_text_and_duplicates_are_numbered() {
        let body = "# Title\n## The `Vec` type\n## [Two Sum](/practice/two-sum)\n## Summary\n#### Summary\n### Summary";
        let h = headings(body);
        assert_eq!(h[0].text, "The Vec type");
        assert_eq!(h[0].id, "the-vec-type");
        assert_eq!(h[1].id, "two-sum");
        assert_eq!(h[2].id, "summary");
        // The h4 takes "summary-1" even though it is not in the TOC.
        assert_eq!(h[3].id, "summary-2");
    }
}
