//! Content model types. These are the shapes the API serialises directly, so
//! they double as the public content schema.
use std::collections::HashMap;
use std::sync::Arc;

use serde::{Deserialize, Serialize};

use super::blocks::{ExerciseSpec, QuizSpec};

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq, PartialOrd, Ord, Hash)]
#[serde(rename_all = "lowercase")]
#[derive(Default)]
pub enum Difficulty {
    Intro,
    Easy,
    #[default]
    Medium,
    Hard,
    Expert,
}

/// A heading extracted from a lesson body, for the table of contents.
#[derive(Debug, Clone, Serialize)]
pub struct Heading {
    pub level: u8,
    pub text: String,
    pub id: String,
}

#[derive(Debug, Clone, Serialize)]
pub struct Track {
    pub slug: String,
    pub title: String,
    pub description: String,
    pub icon: String,
    /// 1 = foundations … 6 = senior polish. Drives the roadmap ordering.
    pub phase: u8,
    pub order: u32,
    pub intro: String,
    pub modules: Vec<Module>,
    pub lesson_count: usize,
    pub estimated_hours: f32,
}

#[derive(Debug, Clone, Serialize)]
pub struct Module {
    /// `track/module`
    pub slug: String,
    pub track_slug: String,
    pub title: String,
    pub description: String,
    pub order: u32,
    /// Module slugs that should be completed first. Used by the roadmap to
    /// order work and to warn the learner.
    pub prerequisites: Vec<String>,
    pub intro: String,
    pub lessons: Vec<LessonSummary>,
    pub estimated_hours: f32,
}

#[derive(Debug, Clone, Serialize)]
pub struct LessonSummary {
    /// `track/module/lesson`
    pub slug: String,
    pub title: String,
    pub description: String,
    pub minutes: u32,
    pub difficulty: Difficulty,
    pub tags: Vec<String>,
    pub has_exercise: bool,
    pub has_quiz: bool,
    pub has_viz: bool,
    pub order: u32,
}

#[derive(Debug, Clone, Serialize)]
pub struct Lesson {
    pub summary: LessonSummary,
    pub track_slug: String,
    pub track_title: String,
    pub module_slug: String,
    pub module_title: String,
    /// Markdown body with quiz answers removed (see `blocks::strip_quiz_answers`).
    pub body: String,
    pub toc: Vec<Heading>,
    pub exercises: Vec<ExerciseSpec>,
    /// Quiz with answers — never serialised; graded server-side.
    #[serde(skip)]
    pub quiz: Option<QuizSpec>,
    pub quiz_question_count: usize,
    /// Practice problems this lesson recommends (slugs).
    pub problems: Vec<String>,
    pub prev: Option<LessonRef>,
    pub next: Option<LessonRef>,
}

#[derive(Debug, Clone, Serialize)]
pub struct LessonRef {
    pub slug: String,
    pub title: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TestCase {
    /// Positional arguments passed to the solution function.
    pub args: Vec<serde_json::Value>,
    pub expected: serde_json::Value,
    #[serde(default)]
    pub hidden: bool,
    /// Compare as multisets (for "return in any order" problems).
    #[serde(default)]
    pub any_order: bool,
    #[serde(default)]
    pub label: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Signature {
    pub name: String,
    pub starter: String,
}

#[derive(Debug, Clone, Serialize)]
pub struct Problem {
    pub slug: String,
    pub title: String,
    pub difficulty: Difficulty,
    pub patterns: Vec<String>,
    /// Curated lists this problem belongs to, e.g. "core-75", "ascend-150".
    pub lists: Vec<String>,
    pub companies: Vec<String>,
    pub order: u32,
    /// Lesson slug that teaches the underlying pattern.
    pub lesson: Option<String>,
    pub statement: String,
    pub hints: Vec<String>,
    /// Full editorial walkthrough (Markdown). Served only on request.
    #[serde(skip)]
    pub solution: String,
    pub signatures: HashMap<String, Signature>,
    pub tests: Vec<TestCase>,
    pub time_limit_ms: u32,
}

#[derive(Debug, Clone, Serialize)]
pub struct ProblemSummary {
    pub slug: String,
    pub title: String,
    pub difficulty: Difficulty,
    pub patterns: Vec<String>,
    pub lists: Vec<String>,
    pub order: u32,
    pub lesson: Option<String>,
}

impl From<&Problem> for ProblemSummary {
    fn from(p: &Problem) -> Self {
        Self {
            slug: p.slug.clone(),
            title: p.title.clone(),
            difficulty: p.difficulty.clone(),
            patterns: p.patterns.clone(),
            lists: p.lists.clone(),
            order: p.order,
            lesson: p.lesson.clone(),
        }
    }
}

/// A named pattern (e.g. "sliding-window") with its teaching lesson and problems.
#[derive(Debug, Clone, Serialize)]
pub struct Pattern {
    pub slug: String,
    pub title: String,
    pub lesson: Option<String>,
    pub problem_count: usize,
}

/// The whole curriculum, built once at startup.
#[derive(Debug)]
pub struct Curriculum {
    pub tracks: Vec<Track>,
    pub lessons: HashMap<String, Arc<Lesson>>,
    pub problems: Vec<Arc<Problem>>,
    pub problems_by_slug: HashMap<String, Arc<Problem>>,
    pub patterns: Vec<Pattern>,
    /// Content fingerprint (hash of all source bytes) — used for ETags.
    pub version: String,
    pub search: super::search::SearchIndex,
}

impl Curriculum {
    pub fn lesson(&self, slug: &str) -> Option<Arc<Lesson>> {
        self.lessons.get(slug).cloned()
    }
    pub fn problem(&self, slug: &str) -> Option<Arc<Problem>> {
        self.problems_by_slug.get(slug).cloned()
    }
    pub fn module(&self, slug: &str) -> Option<&Module> {
        self.tracks.iter().flat_map(|t| t.modules.iter()).find(|m| m.slug == slug)
    }
    pub fn track(&self, slug: &str) -> Option<&Track> {
        self.tracks.iter().find(|t| t.slug == slug)
    }
    /// Every lesson slug in curriculum order.
    pub fn ordered_lesson_slugs(&self) -> Vec<String> {
        self.tracks
            .iter()
            .flat_map(|t| t.modules.iter())
            .flat_map(|m| m.lessons.iter())
            .map(|l| l.slug.clone())
            .collect()
    }
    pub fn lesson_count(&self) -> usize {
        self.lessons.len()
    }
}
