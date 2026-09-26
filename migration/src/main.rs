//! Standalone migration runner: `cargo run -p migration -- up|down|status|fresh`.
//! The API binary also runs pending migrations on boot (see `ascend_api::main`),
//! so this binary is only needed for manual operations.
#[tokio::main]
async fn main() {
    dotenvy::dotenv().ok();
    sea_orm_migration::cli::run_cli(migration::Migrator).await;
}
