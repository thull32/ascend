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
FROM node:24-trixie-slim@sha256:8ec5d7557396cfe32d21c3f9c13072355ceab22b584578ca4bb28af31120cffe AS web
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
FROM lukemathwalker/cargo-chef:latest-rust-1.98-slim-trixie@sha256:38dfdbf4fda95c516f873f33032e490baa988b75f7d83c7d12f788f770785b36 AS chef
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
FROM gcr.io/distroless/cc-debian13:nonroot@sha256:e792ab3d241a468a4fd7519ddbbebe66b49b5f365771716ea688ad40b6c6f1c2 AS runtime
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
