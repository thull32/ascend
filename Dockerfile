# syntax=docker/dockerfile:1.7
#
# Ascend production image. Three build stages, one tiny runtime stage:
#
#   web      Node 24 builds the React SPA into web/dist
#   planner  cargo-chef computes a dependency "recipe" from the manifests
#   runtimes CPython and QuickJS for WASI, which the grader runs learner code in
#   builder  compiles dependencies (cached layer), then the app, embedding
#            web/dist and content/ into the binary via include_dir!
#   runtime  distroless (glibc + CA certificates, no shell), non-root
#
# The result is one binary plus the grader's runtimes (about 55 MB of
# WebAssembly and Python standard library).
# Dependency layers are reused across deploys unless Cargo.lock changes, so
# a content-only change rebuilds in about a minute.

# ---------- web ----------
FROM node:24-trixie-slim@sha256:54f84b4cf8432b21aaffd5d3ce8d41e12cea0d10d33c09d2f3c9879d49d6b446 AS web
WORKDIR /app/web
RUN corepack enable
# The workspace file carries pnpm settings the lockfile records (overrides),
# so a frozen install needs all three.
COPY web/package.json web/pnpm-lock.yaml web/pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile
COPY web/ ./
# The code runners share their harness and comparison rule with the server's
# grader, so the web build needs those files too.
COPY crates/grader/harness /app/crates/grader/harness
RUN pnpm build

# ---------- rust dependency plan ----------
FROM lukemathwalker/cargo-chef:latest-rust-1.99-slim-trixie@sha256:f122e3c240d1c05668b07179cf6fa07647db2a79a110f4bb8a91d75f90d5b8e4 AS chef
WORKDIR /app

# ---------- grader runtimes ----------
# CPython and QuickJS compiled to WebAssembly, in which the server runs
# learner code. The script pins both by SHA-256.
FROM chef AS runtimes
RUN apt-get update \
 && apt-get install -y --no-install-recommends curl unzip ca-certificates \
 && rm -rf /var/lib/apt/lists/*
COPY scripts/grader-runtimes.sh /tmp/grader-runtimes.sh
RUN bash /tmp/grader-runtimes.sh /opt/ascend/grader

FROM chef AS planner
COPY Cargo.toml Cargo.lock ./
COPY crates crates
COPY migration migration
RUN cargo chef prepare --recipe-path recipe.json

# ---------- rust build ----------
FROM chef AS builder
# Keep 0 for releases. 1 downgrades dangling cross-references to warnings
# (only for preview builds while content is being authored).
ARG CONTENT_LENIENT=0
COPY --from=planner /app/recipe.json recipe.json
RUN cargo chef cook --release --recipe-path recipe.json -p ascend-api
COPY Cargo.toml Cargo.lock ./
COPY crates crates
COPY migration migration
COPY content content
COPY --from=web /app/web/dist web/dist
# Railway passes the commit as a build argument; it becomes the build id that
# /api/readyz reports and that content ETags include.
ARG RAILWAY_GIT_COMMIT_SHA=""
ENV ASCEND_BUILD_ID=${RAILWAY_GIT_COMMIT_SHA}
RUN cargo build --release -p ascend-api \
 && cp target/release/ascend-api /ascend-api \
 # Strict content validation: a broken lesson fails the build, not the deploy.
 && CONTENT_LENIENT=${CONTENT_LENIENT} /ascend-api --check-content
# Precompile the grader's Python standard library with the same interpreter
# (about 0.2 s saved on every graded run).
COPY --from=runtimes /opt/ascend/grader /opt/ascend/grader
RUN /ascend-api --prepare-grader /opt/ascend/grader

# ---------- runtime ----------
FROM gcr.io/distroless/cc-debian13:nonroot@sha256:08476c244888bfb425bae1ae4dd7c17f093e972aab8426883d97f3c6f280f7c1 AS runtime
COPY --from=builder /ascend-api /usr/local/bin/ascend-api
COPY --from=builder /opt/ascend/grader /opt/ascend/grader
ENV APP_ENV=production \
    GRADER_DIR=/opt/ascend/grader \
    HOST=0.0.0.0 \
    PORT=8080 \
    RUST_LOG=info,ascend_api=info,ascend_core=info,tower_http=info,sea_orm=warn,sea_orm_migration=info,sqlx=warn
EXPOSE 8080
USER nonroot
ENTRYPOINT ["/usr/local/bin/ascend-api"]
