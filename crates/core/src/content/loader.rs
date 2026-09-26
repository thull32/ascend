//! Builds the [`Curriculum`] graph from Markdown files.
//!
//! Two sources are supported through one code path: the directory embedded in
//! the binary at compile time (production), or a directory on disk (local
//! authoring, where `CONTENT_DIR=./content` lets you edit lessons and restart
//! without recompiling). Both are flattened to `(relative path, text)` pairs
//! first, so the parser never touches the filesystem.
use std::collections::{BTreeMap, HashMap};
use std::path::Path;
use std::sync::Arc;

use gray_matter::{Matter, engine::YAML};
use include_dir::{Dir, include_dir};
use serde::Deserialize;
use sha2::{Digest, Sha256};

use super::blocks;
use super::model::*;
use super::search::SearchIndex;

static EMBEDDED: Dir<'static> = include_dir!("$CARGO_MANIFEST_DIR/../../content");

#[derive(Debug, Clone)]
pub enum ContentSource {
    Embedded,
    Disk(std::path::PathBuf),
}

#[derive(Debug, thiserror::Error)]
pub enum ContentError {
    #[error("io error reading content: {0}")]
    Io(#[from] std::io::Error),
    #[error("{file}: missing or invalid front matter: {reason}")]
    FrontMatter { file: String, reason: String },
    #[error(transparent)]
    Block(#[from] blocks::BlockError),
    #[error("{file}: {reason}")]
    Invalid { file: String, reason: String },
    #[error("duplicate slug {slug} ({a} and {b})")]
    DuplicateSlug { slug: String, a: String, b: String },
    #[error("{file}: unknown reference to {kind} '{slug}'")]
    DanglingRef { file: String, kind: &'static str, slug: String },
}

// ---------- front matter shapes ----------

#[derive(Debug, Deserialize)]
struct TrackFm {
    slug: String,
    title: String,
    description: String,
    #[serde(default = "default_icon")]
    icon: String,
    phase: u8,
}
fn default_icon() -> String {
    "book".into()
}

#[derive(Debug, Deserialize)]
struct ModuleFm {
    slug: String,
    title: String,
    description: String,
    #[serde(default)]
    prerequisites: Vec<String>,
}

#[derive(Debug, Deserialize)]
struct LessonFm {
    slug: String,
    title: String,
    description: String,
    #[serde(default = "default_minutes")]
    minutes: u32,
    #[serde(default)]
    difficulty: Difficulty,
    #[serde(default)]
    tags: Vec<String>,
    #[serde(default)]
    problems: Vec<String>,
}
fn default_minutes() -> u32 {
    25
}

#[derive(Debug, Deserialize)]
struct ProblemFm {
    slug: String,
    title: String,
    difficulty: Difficulty,
    #[serde(default)]
    patterns: Vec<String>,
    #[serde(default)]
    lists: Vec<String>,
    #[serde(default)]
    companies: Vec<String>,
    #[serde(default)]
    order: u32,
    #[serde(default)]
    lesson: Option<String>,
    #[serde(default)]
    hints: Vec<String>,
    signatures: HashMap<String, Signature>,
    tests: Vec<TestCase>,
    #[serde(default = "default_problem_time_limit")]
    time_limit_ms: u32,
}
fn default_problem_time_limit() -> u32 {
    4000
}

// ---------- file collection ----------

fn collect_embedded(dir: &Dir<'static>, out: &mut BTreeMap<String, String>) {
    for f in dir.files() {
        if f.path().extension().and_then(|e| e.to_str()) == Some("md")
            && let Some(text) = f.contents_utf8() {
                out.insert(f.path().to_string_lossy().replace('\\', "/"), text.to_string());
            }
    }
    for d in dir.dirs() {
        collect_embedded(d, out);
    }
}

fn collect_disk(root: &Path, dir: &Path, out: &mut BTreeMap<String, String>) -> std::io::Result<()> {
    for entry in std::fs::read_dir(dir)? {
        let entry = entry?;
        let path = entry.path();
        if path.is_dir() {
            collect_disk(root, &path, out)?;
        } else if path.extension().and_then(|e| e.to_str()) == Some("md") {
            let rel = path.strip_prefix(root).unwrap_or(&path).to_string_lossy().replace('\\', "/");
            out.insert(rel, std::fs::read_to_string(&path)?);
        }
    }
    Ok(())
}

fn parse<T: for<'de> Deserialize<'de>>(file: &str, text: &str) -> Result<(T, String), ContentError> {
    let matter = Matter::<YAML>::new();
    let parsed = matter
        .parse::<T>(text)
        .map_err(|e| ContentError::FrontMatter { file: file.into(), reason: e.to_string() })?;
    let data = parsed
        .data
        .ok_or_else(|| ContentError::FrontMatter { file: file.into(), reason: "no front matter".into() })?;
    Ok((data, parsed.content))
}

/// Ordering prefix "03-foo" -> 3. Files without a prefix sort last.
fn order_of(segment: &str) -> u32 {
    segment.split('-').next().and_then(|n| n.parse().ok()).unwrap_or(u32::MAX)
}

// ---------- build ----------

pub fn load_curriculum(source: &ContentSource) -> Result<Arc<Curriculum>, ContentError> {
    let mut files = BTreeMap::new();
    match source {
        ContentSource::Embedded => collect_embedded(&EMBEDDED, &mut files),
        ContentSource::Disk(root) => collect_disk(root, root, &mut files)?,
    }

    let mut hasher = Sha256::new();
    for (path, text) in &files {
        hasher.update(path.as_bytes());
        hasher.update(text.as_bytes());
    }
    let version: String = hasher.finalize().iter().take(8).map(|b| format!("{b:02x}")).collect();

    let mut search = SearchIndex::default();

    // --- problems first so lessons can validate references ---
    let mut problems: Vec<Arc<Problem>> = Vec::new();
    let mut problems_by_slug: HashMap<String, Arc<Problem>> = HashMap::new();
    for (path, text) in files.iter().filter(|(p, _)| p.starts_with("problems/")) {
        let (fm, body): (ProblemFm, String) = match parse(path, text) {
            Ok(v) => v,
            Err(e) if lenient() => {
                eprintln!("warning: skipping {path}: {e} (lenient mode)");
                continue;
            }
            Err(e) => return Err(e),
        };
        let (statement, solution) = split_solution(&body);
        if fm.signatures.is_empty() {
            return Err(ContentError::Invalid { file: path.clone(), reason: "needs at least one signature".into() });
        }
        if fm.tests.is_empty() {
            return Err(ContentError::Invalid { file: path.clone(), reason: "needs at least one test".into() });
        }
        let p = Arc::new(Problem {
            slug: fm.slug.clone(),
            title: fm.title,
            difficulty: fm.difficulty,
            patterns: fm.patterns,
            lists: fm.lists,
            companies: fm.companies,
            order: fm.order,
            lesson: fm.lesson,
            statement,
            hints: fm.hints,
            solution,
            signatures: fm.signatures,
            tests: fm.tests,
            time_limit_ms: fm.time_limit_ms,
        });
        if let Some(prev) = problems_by_slug.insert(fm.slug.clone(), p.clone()) {
            return Err(ContentError::DuplicateSlug { slug: prev.slug.clone(), a: path.clone(), b: "another problem".into() });
        }
        search.add("problem", &p.slug, &p.title, &p.patterns.join(", "), &p.patterns, &p.statement);
        problems.push(p);
    }
    problems.sort_by(|a, b| a.order.cmp(&b.order).then_with(|| a.title.cmp(&b.title)));

    // --- tracks / modules / lessons ---
    // Group by directory: tracks/<t>/track.md, tracks/<t>/<m>/module.md, tracks/<t>/<m>/<l>.md
    let mut track_dirs: BTreeMap<String, ()> = BTreeMap::new();
    for path in files.keys().filter(|p| p.starts_with("tracks/")) {
        let parts: Vec<&str> = path.split('/').collect();
        if parts.len() >= 3 {
            track_dirs.insert(parts[1].to_string(), ());
        }
    }

    let mut tracks: Vec<Track> = Vec::new();
    let mut lessons: HashMap<String, Arc<Lesson>> = HashMap::new();
    let mut lesson_slug_to_file: HashMap<String, String> = HashMap::new();
    // (lesson, module index in track, track index) in order, for prev/next linking
    let mut ordered: Vec<(Arc<Lesson>, usize, usize)> = Vec::new();

    for (ti, track_dir) in track_dirs.keys().enumerate() {
        let track_file = format!("tracks/{track_dir}/track.md");
        let Some(track_text) = files.get(&track_file) else {
            if lenient() {
                eprintln!("warning: skipping track dir {track_dir}: missing track.md (lenient mode)");
                continue;
            }
            return Err(ContentError::Invalid { file: track_file.clone(), reason: "missing track.md".into() });
        };
        let (tfm, tintro): (TrackFm, String) = match parse(&track_file, track_text) {
            Ok(v) => v,
            Err(e) if lenient() => {
                eprintln!("warning: skipping track {track_file}: {e} (lenient mode)");
                continue;
            }
            Err(e) => return Err(e),
        };

        let mut module_dirs: BTreeMap<String, ()> = BTreeMap::new();
        for path in files.keys().filter(|p| p.starts_with(&format!("tracks/{track_dir}/"))) {
            let parts: Vec<&str> = path.split('/').collect();
            if parts.len() == 4 {
                module_dirs.insert(parts[2].to_string(), ());
            }
        }

        let mut modules: Vec<Module> = Vec::new();
        for module_dir in module_dirs.keys() {
            let module_file = format!("tracks/{track_dir}/{module_dir}/module.md");
            let Some(module_text) = files.get(&module_file) else {
                if lenient() {
                    eprintln!("warning: skipping module dir {module_dir}: missing module.md (lenient mode)");
                    continue;
                }
                return Err(ContentError::Invalid { file: module_file.clone(), reason: "missing module.md".into() });
            };
            let (mfm, mintro): (ModuleFm, String) = match parse(&module_file, module_text) {
                Ok(v) => v,
                Err(e) if lenient() => {
                    eprintln!("warning: skipping module {module_file}: {e} (lenient mode)");
                    continue;
                }
                Err(e) => return Err(e),
            };
            let module_slug = format!("{}/{}", tfm.slug, mfm.slug);

            let mut lesson_files: Vec<&String> = files
                .keys()
                .filter(|p| {
                    p.starts_with(&format!("tracks/{track_dir}/{module_dir}/")) && !p.ends_with("/module.md")
                })
                .collect();
            lesson_files.sort_by_key(|p| order_of(p.rsplit('/').next().unwrap_or("")));

            let mut summaries = Vec::new();
            for (li, lfile) in lesson_files.iter().enumerate() {
                let (lfm, lbody): (LessonFm, String) = match parse(lfile, &files[*lfile]) {
                    Ok(v) => v,
                    Err(e) if lenient() => {
                        eprintln!("warning: skipping lesson {lfile}: {e} (lenient mode)");
                        continue;
                    }
                    Err(e) => return Err(e),
                };
                let slug = format!("{module_slug}/{}", lfm.slug);
                if let Some(prev) = lesson_slug_to_file.insert(slug.clone(), (*lfile).clone()) {
                    return Err(ContentError::DuplicateSlug { slug, a: prev, b: (*lfile).clone() });
                }
                for p in &lfm.problems {
                    if !problems_by_slug.contains_key(p) {
                        if lenient() {
                            eprintln!("warning: {lfile}: unknown problem '{p}' (lenient mode)");
                            continue;
                        }
                        return Err(ContentError::DanglingRef { file: (*lfile).clone(), kind: "problem", slug: p.clone() });
                    }
                }
                let extracted = match blocks::extract(lfile, &lbody) {
                    Ok(v) => v,
                    Err(e) if lenient() => {
                        eprintln!("warning: skipping lesson {lfile}: {e} (lenient mode)");
                        lesson_slug_to_file.remove(&slug);
                        continue;
                    }
                    Err(e) => return Err(ContentError::Block(e)),
                };
                let toc = blocks::headings(&extracted.public_body);
                let summary = LessonSummary {
                    slug: slug.clone(),
                    title: lfm.title.clone(),
                    description: lfm.description.clone(),
                    minutes: lfm.minutes,
                    difficulty: lfm.difficulty.clone(),
                    tags: lfm.tags.clone(),
                    has_exercise: !extracted.exercises.is_empty(),
                    has_quiz: extracted.quiz.is_some(),
                    has_viz: extracted.has_viz,
                    order: li as u32,
                };
                search.add("lesson", &slug, &lfm.title, &lfm.description, &lfm.tags, &extracted.public_body);
                let lesson = Arc::new(Lesson {
                    summary: summary.clone(),
                    track_slug: tfm.slug.clone(),
                    track_title: tfm.title.clone(),
                    module_slug: module_slug.clone(),
                    module_title: mfm.title.clone(),
                    body: extracted.public_body,
                    toc,
                    quiz_question_count: extracted.quiz.as_ref().map(|q| q.questions.len()).unwrap_or(0),
                    exercises: extracted.exercises,
                    quiz: extracted.quiz,
                    problems: lfm.problems,
                    prev: None,
                    next: None,
                });
                ordered.push((lesson, modules.len(), ti));
                summaries.push(summary);
            }
            let hours = summaries.iter().map(|l| l.minutes as f32).sum::<f32>() / 60.0;
            modules.push(Module {
                slug: module_slug,
                track_slug: tfm.slug.clone(),
                title: mfm.title,
                description: mfm.description,
                order: order_of(module_dir),
                prerequisites: mfm.prerequisites,
                intro: mintro.trim().to_string(),
                lessons: summaries,
                estimated_hours: (hours * 10.0).round() / 10.0,
            });
        }
        if modules.is_empty() && lenient() {
            eprintln!("warning: track {} has no modules yet (lenient mode)", tfm.slug);
            continue;
        }
        let lesson_count = modules.iter().map(|m| m.lessons.len()).sum();
        let hours: f32 = modules.iter().map(|m| m.estimated_hours).sum();
        tracks.push(Track {
            slug: tfm.slug,
            title: tfm.title,
            description: tfm.description,
            icon: tfm.icon,
            phase: tfm.phase,
            order: order_of(track_dir),
            intro: tintro.trim().to_string(),
            modules,
            lesson_count,
            estimated_hours: (hours * 10.0).round() / 10.0,
        });
    }

    // Validate module prerequisites reference real modules.
    let module_slugs: std::collections::HashSet<String> =
        tracks.iter().flat_map(|t| t.modules.iter().map(|m| m.slug.clone())).collect();
    for t in &tracks {
        for m in &t.modules {
            for p in &m.prerequisites {
                if !module_slugs.contains(p) {
                    if lenient() {
                        eprintln!("warning: {}: unknown prerequisite module '{p}' (lenient mode)", m.slug);
                        continue;
                    }
                    return Err(ContentError::DanglingRef { file: m.slug.clone(), kind: "module", slug: p.clone() });
                }
            }
        }
    }

    // Link prev/next across the global order (tracks are already sorted by dir).
    for i in 0..ordered.len() {
        let prev = i.checked_sub(1).map(|j| LessonRef { slug: ordered[j].0.summary.slug.clone(), title: ordered[j].0.summary.title.clone() });
        let next = ordered.get(i + 1).map(|n| LessonRef { slug: n.0.summary.slug.clone(), title: n.0.summary.title.clone() });
        let mut l = (*ordered[i].0).clone();
        l.prev = prev;
        l.next = next;
        lessons.insert(l.summary.slug.clone(), Arc::new(l));
    }

    // Validate problem -> lesson references now that lessons exist.
    for p in &problems {
        if let Some(ls) = &p.lesson
            && !lessons.contains_key(ls)
        {
            if lenient() {
                eprintln!("warning: problems/{}.md: unknown lesson '{ls}' (lenient mode)", p.slug);
                continue;
            }
            return Err(ContentError::DanglingRef { file: format!("problems/{}.md", p.slug), kind: "lesson", slug: ls.clone() });
        }
    }

    // Patterns: derived from problems, titled from the pattern lesson if any.
    let mut pattern_map: BTreeMap<String, (Option<String>, usize)> = BTreeMap::new();
    for p in &problems {
        for pat in &p.patterns {
            let e = pattern_map.entry(pat.clone()).or_insert((None, 0));
            e.1 += 1;
        }
    }
    for l in lessons.values() {
        for tag in &l.summary.tags {
            if let Some(t) = tag.strip_prefix("pattern:")
                && let Some(e) = pattern_map.get_mut(t) {
                    e.0 = Some(l.summary.slug.clone());
                }
        }
    }
    let patterns = pattern_map
        .into_iter()
        .map(|(slug, (lesson, count))| Pattern { title: title_case(&slug), slug, lesson, problem_count: count })
        .collect();

    Ok(Arc::new(Curriculum { tracks, lessons, problems, problems_by_slug, patterns, version, search }))
}

/// `CONTENT_LENIENT=1` downgrades cross-reference errors to warnings so
/// authors can work on lessons and problems concurrently. Never set in CI.
fn lenient() -> bool {
    std::env::var("CONTENT_LENIENT").is_ok_and(|v| v == "1")
}

/// Problem bodies are `statement ... \n## Solution\n ... editorial`.
fn split_solution(body: &str) -> (String, String) {
    match body.find("\n## Solution") {
        Some(i) => (body[..i].trim().to_string(), body[i..].trim().to_string()),
        None => (body.trim().to_string(), String::new()),
    }
}

fn title_case(slug: &str) -> String {
    slug.split('-')
        .map(|w| {
            let mut c = w.chars();
            match c.next() {
                Some(f) => f.to_uppercase().collect::<String>() + c.as_str(),
                None => String::new(),
            }
        })
        .collect::<Vec<_>>()
        .join(" ")
}

#[cfg(test)]
mod tests {
    use super::*;

    /// The embedded curriculum must always load. This test is the content CI:
    /// a broken front matter or dangling reference fails the build.
    #[test]
    fn embedded_curriculum_loads() {
        let c = load_curriculum(&ContentSource::Embedded).expect("curriculum loads");
        assert!(!c.tracks.is_empty(), "no tracks");
        assert!(c.lesson_count() > 0, "no lessons");
        for t in &c.tracks {
            assert!(!t.modules.is_empty(), "track {} has no modules", t.slug);
            for m in &t.modules {
                assert!(!m.lessons.is_empty(), "module {} has no lessons", m.slug);
            }
        }
    }
}
