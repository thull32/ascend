//! Load the curriculum from a directory and report what was found.
//! `cargo run -p ascend-core --example validate_content -- ./content`
use ascend_core::content::{ContentSource, load_curriculum};

fn main() {
    let dir = std::env::args().nth(1).unwrap_or_else(|| "content".into());
    match load_curriculum(&ContentSource::Disk(dir.into())) {
        Ok(c) => {
            for t in &c.tracks {
                println!("track {:<28} phase {} modules {:>2} lessons {:>3} ~{:>5.1}h", t.slug, t.phase, t.modules.len(), t.lesson_count, t.estimated_hours);
                for m in &t.modules {
                    let ex: usize = m.lessons.iter().filter(|l| l.has_exercise).count();
                    let viz: usize = m.lessons.iter().filter(|l| l.has_viz).count();
                    let quiz: usize = m.lessons.iter().filter(|l| l.has_quiz).count();
                    println!("  {:<40} lessons {:>2}  exercises {:>2}  viz {:>2}  quiz {:>2}", m.slug, m.lessons.len(), ex, viz, quiz);
                }
            }
            println!("problems: {}  patterns: {}  version: {}", c.problems.len(), c.patterns.len(), c.version);
            println!("OK");
        }
        Err(e) => {
            eprintln!("CONTENT ERROR: {e}");
            std::process::exit(1);
        }
    }
}
