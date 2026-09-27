//! `include_dir!` does not tell Cargo which files it read, so without this an
//! edited lesson would not rebuild the binary that embeds the curriculum.
fn main() {
    println!("cargo:rerun-if-changed=../../content");
}
