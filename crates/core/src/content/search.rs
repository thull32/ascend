//! A small in-memory inverted index over lesson and problem metadata.
//!
//! For a few hundred documents this beats reaching for a search service: it is
//! built in microseconds at boot, needs no infrastructure, and queries are a
//! handful of hash lookups. If the corpus grew 100x we would move to a
//! dedicated engine (tantivy in-process, or Postgres full-text search).
use std::collections::HashMap;

use serde::Serialize;

#[derive(Debug, Clone, Serialize)]
pub struct SearchHit {
    pub kind: &'static str,
    pub slug: String,
    pub title: String,
    pub description: String,
    pub score: f32,
}

#[derive(Debug, Default)]
pub struct SearchIndex {
    docs: Vec<Doc>,
    /// token -> (doc index, weight)
    postings: HashMap<String, Vec<(usize, f32)>>,
}

#[derive(Debug)]
struct Doc {
    kind: &'static str,
    slug: String,
    title: String,
    description: String,
}

fn tokenize(text: &str) -> impl Iterator<Item = String> + '_ {
    text.split(|c: char| !c.is_alphanumeric()).filter(|t| t.len() > 1).map(|t| t.to_lowercase())
}

impl SearchIndex {
    pub fn add(&mut self, kind: &'static str, slug: &str, title: &str, description: &str, tags: &[String], body: &str) {
        let idx = self.docs.len();
        self.docs.push(Doc { kind, slug: slug.into(), title: title.into(), description: description.into() });
        let mut weights: HashMap<String, f32> = HashMap::new();
        for t in tokenize(title) {
            *weights.entry(t).or_default() += 5.0;
        }
        for t in tokenize(slug) {
            *weights.entry(t).or_default() += 3.0;
        }
        for tag in tags {
            for t in tokenize(tag) {
                *weights.entry(t).or_default() += 4.0;
            }
        }
        for t in tokenize(description) {
            *weights.entry(t).or_default() += 2.0;
        }
        // Body words get a tiny weight, capped so long lessons don't dominate.
        for t in tokenize(body).take(4000) {
            let w = weights.entry(t).or_default();
            if *w < 1.0 {
                *w += 0.05;
            }
        }
        for (t, w) in weights {
            self.postings.entry(t).or_default().push((idx, w));
        }
    }

    pub fn query(&self, q: &str, limit: usize) -> Vec<SearchHit> {
        let mut scores: HashMap<usize, f32> = HashMap::new();
        let terms: Vec<String> = tokenize(q).collect();
        if terms.is_empty() {
            return Vec::new();
        }
        for term in &terms {
            // exact token
            if let Some(list) = self.postings.get(term) {
                for (doc, w) in list {
                    *scores.entry(*doc).or_default() += w;
                }
            }
            // prefix match, for "dijk" -> "dijkstra"
            if term.len() >= 3 {
                for (tok, list) in &self.postings {
                    if tok != term && tok.starts_with(term.as_str()) {
                        for (doc, w) in list {
                            *scores.entry(*doc).or_default() += w * 0.5;
                        }
                    }
                }
            }
        }
        let mut hits: Vec<SearchHit> = scores
            .into_iter()
            .map(|(i, score)| {
                let d = &self.docs[i];
                SearchHit {
                    kind: d.kind,
                    slug: d.slug.clone(),
                    title: d.title.clone(),
                    description: d.description.clone(),
                    score,
                }
            })
            .collect();
        hits.sort_by(|a, b| b.score.partial_cmp(&a.score).unwrap_or(std::cmp::Ordering::Equal));
        hits.truncate(limit);
        hits
    }
}
