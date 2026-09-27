//! The personalised roadmap: the full curriculum ordered by phase, with the
//! learner's preferences and progress applied.
//!
//! Ordering rules (simple on purpose — learners should be able to predict it):
//! 1. Phases in order (foundations → senior skills).
//! 2. Within a phase, "priority" modules first, then curriculum order.
//! 3. "Confident" modules are listed but marked skipped; they don't count
//!    toward the remaining-hours estimate.
//! 4. A module whose prerequisites aren't complete is flagged `locked_by`,
//!    but never hidden — adults get to decide.
use std::collections::{HashMap, HashSet};
use std::sync::Arc;

use serde::Serialize;

use crate::content::Curriculum;
use crate::services::progress::{ModulePreference, ProgressSummary};

#[derive(Debug, Serialize)]
pub struct Roadmap {
    pub phases: Vec<RoadmapPhase>,
    pub remaining_hours: f32,
    pub weeks_at_current_pace: f32,
    /// The single next lesson to open.
    pub next_lesson: Option<RoadmapNext>,
}

#[derive(Debug, Serialize)]
pub struct RoadmapNext {
    pub slug: String,
    pub title: String,
    pub module_title: String,
}

#[derive(Debug, Serialize)]
pub struct RoadmapPhase {
    pub phase: u8,
    pub title: String,
    pub modules: Vec<RoadmapModule>,
}

#[derive(Debug, Serialize)]
pub struct RoadmapModule {
    pub slug: String,
    pub title: String,
    pub track_slug: String,
    pub track_title: String,
    pub description: String,
    pub estimated_hours: f32,
    pub lesson_count: usize,
    pub completed: usize,
    pub preference: ModulePreference,
    pub locked_by: Vec<String>,
    pub first_incomplete_lesson: Option<String>,
}

pub fn phase_title(phase: u8) -> &'static str {
    match phase {
        1 => "Foundations",
        2 => "Data structures & algorithms",
        3 => "Interview patterns & practice",
        4 => "Systems, networking & databases",
        5 => "System design & big data",
        6 => "AI, modern tooling & senior craft",
        _ => "Beyond",
    }
}

pub struct RoadmapService {
    curriculum: Arc<Curriculum>,
}

impl RoadmapService {
    pub fn new(curriculum: Arc<Curriculum>) -> Self {
        Self { curriculum }
    }

    pub fn build(&self, progress: Option<&ProgressSummary>, weekly_hours: f32) -> Roadmap {
        let completed: HashSet<&str> =
            progress.map(|p| p.completed_slugs.iter().map(String::as_str).collect()).unwrap_or_default();
        let prefs: HashMap<&str, ModulePreference> =
            progress.map(|p| p.module_preferences.iter().map(|(k, v)| (k.as_str(), *v)).collect()).unwrap_or_default();

        let mut modules: Vec<RoadmapModule> = Vec::new();
        for t in &self.curriculum.tracks {
            for m in &t.modules {
                let done = m.lessons.iter().filter(|l| completed.contains(l.slug.as_str())).count();
                modules.push(RoadmapModule {
                    slug: m.slug.clone(),
                    title: m.title.clone(),
                    track_slug: t.slug.clone(),
                    track_title: t.title.clone(),
                    description: m.description.clone(),
                    estimated_hours: m.estimated_hours,
                    lesson_count: m.lessons.len(),
                    completed: done,
                    preference: prefs.get(m.slug.as_str()).copied().unwrap_or(ModulePreference::Normal),
                    locked_by: Vec::new(),
                    first_incomplete_lesson: m
                        .lessons
                        .iter()
                        .find(|l| !completed.contains(l.slug.as_str()))
                        .map(|l| l.slug.clone()),
                });
            }
        }
        // Prerequisite locks: a prerequisite counts as satisfied if completed
        // or marked confident.
        let satisfied: HashSet<String> = modules
            .iter()
            .filter(|m| m.completed == m.lesson_count || m.preference == ModulePreference::Confident)
            .map(|m| m.slug.clone())
            .collect();
        let prereqs: HashMap<String, Vec<String>> = self
            .curriculum
            .tracks
            .iter()
            .flat_map(|t| t.modules.iter().map(|m| (m.slug.clone(), m.prerequisites.clone())))
            .collect();
        for m in &mut modules {
            if let Some(p) = prereqs.get(&m.slug) {
                m.locked_by = p.iter().filter(|s| !satisfied.contains(*s)).cloned().collect();
            }
        }

        // Group by phase, apply ordering rules.
        let phase_of: HashMap<&str, u8> = self.curriculum.tracks.iter().map(|t| (t.slug.as_str(), t.phase)).collect();
        let mut by_phase: std::collections::BTreeMap<u8, Vec<RoadmapModule>> = Default::default();
        for m in modules {
            let phase = *phase_of.get(m.track_slug.as_str()).unwrap_or(&9);
            by_phase.entry(phase).or_default().push(m);
        }
        let mut phases = Vec::new();
        let mut remaining_hours = 0.0;
        let mut next: Option<RoadmapNext> = None;
        for (phase, mut mods) in by_phase {
            mods.sort_by_key(|m| (m.preference != ModulePreference::Priority) as u8);
            for m in &mods {
                if m.preference != ModulePreference::Confident && m.completed < m.lesson_count {
                    let frac = 1.0 - (m.completed as f32 / m.lesson_count.max(1) as f32);
                    remaining_hours += m.estimated_hours * frac;
                    if next.is_none()
                        && let Some(slug) = &m.first_incomplete_lesson
                    {
                        let title = self.curriculum.lesson(slug).map(|l| l.summary.title.clone()).unwrap_or_default();
                        next = Some(RoadmapNext { slug: slug.clone(), title, module_title: m.title.clone() });
                    }
                }
            }
            phases.push(RoadmapPhase { phase, title: phase_title(phase).to_string(), modules: mods });
        }
        let weeks = if weekly_hours > 0.0 { remaining_hours / weekly_hours } else { 0.0 };
        Roadmap {
            phases,
            remaining_hours: (remaining_hours * 10.0).round() / 10.0,
            weeks_at_current_pace: (weeks * 10.0).round() / 10.0,
            next_lesson: next,
        }
    }
}
