//! SeaORM entities. One module per table; the `prelude` re-exports the
//! `Entity` types under table-ish names so services read naturally
//! (`Users::find_by_id(..)`).
pub mod activity_days;
pub mod ai_usage;
pub mod comments;
pub mod conversations;
pub mod interviews;
pub mod lesson_progress;
pub mod messages;
pub mod module_preferences;
pub mod quiz_attempts;
pub mod sessions;
pub mod submissions;
pub mod users;

pub mod prelude {
    pub use super::activity_days::Entity as ActivityDays;
    pub use super::ai_usage::Entity as AiUsage;
    pub use super::comments::Entity as Comments;
    pub use super::conversations::Entity as Conversations;
    pub use super::interviews::Entity as Interviews;
    pub use super::lesson_progress::Entity as LessonProgress;
    pub use super::messages::Entity as Messages;
    pub use super::module_preferences::Entity as ModulePreferences;
    pub use super::quiz_attempts::Entity as QuizAttempts;
    pub use super::sessions::Entity as Sessions;
    pub use super::submissions::Entity as Submissions;
    pub use super::users::Entity as Users;
}
