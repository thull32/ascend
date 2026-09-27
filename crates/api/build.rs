//! `include_dir!` does not tell Cargo which files it read, so without this a
//! rebuilt SPA would not rebuild the binary that embeds it.
fn main() {
    println!("cargo:rerun-if-changed=../../web/dist");
    println!("cargo:rerun-if-env-changed=ASCEND_BUILD_ID");
}
