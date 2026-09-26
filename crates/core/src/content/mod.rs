//! # The content engine
//!
//! Curriculum content is Markdown with YAML front matter, checked into the
//! repository under `content/` and **compiled into the binary** with
//! `include_dir!`. At boot we parse everything once into an immutable
//! [`Curriculum`] graph behind an `Arc`, so every request is a pointer clone
//! and a hash lookup; there is no content database to keep in sync.
//!
//! Why not a CMS / database?
//! * Content changes go through pull requests: reviewable diffs, history, and
//!   the same CI as code.
//! * The deploy artifact is self-contained: no "content missing in prod".
//! * Reads are free. The curriculum tree is a few MB of memory.
//!
//! Directory layout:
//! ```text
//! content/
//!   tracks/<nn>-<track>/track.md                 # track front matter + intro
//!   tracks/<nn>-<track>/<nn>-<module>/module.md   # module front matter + intro
//!   tracks/<nn>-<track>/<nn>-<module>/<nn>-<lesson>.md
//!   problems/<slug>.md                            # practice problems
//! ```
//! Numeric prefixes give ordering; the slug in the front matter is the stable
//! identifier (progress rows reference `track/module/lesson`).
//!
//! Lesson bodies may contain special fenced blocks the frontend renders as
//! interactive components: ```viz (JSON), ```exercise (YAML), ```quiz (YAML).
//! See [`blocks`] for the schemas.

pub mod blocks;
pub mod loader;
pub mod model;
pub mod search;

pub use loader::{load_curriculum, ContentSource};
pub use model::*;
