//! Application services. Each service owns one bounded context, takes a
//! `DatabaseConnection` (cheap to clone; it's a pool handle) and returns
//! domain types. No HTTP, no global state.
pub mod comments;
pub mod interviews;
pub mod progress;
pub mod quiz;
pub mod roadmap;
pub mod submissions;

pub use comments::CommentService;
pub use interviews::InterviewService;
pub use progress::ProgressService;
pub use quiz::QuizService;
pub use roadmap::RoadmapService;
pub use submissions::SubmissionService;
