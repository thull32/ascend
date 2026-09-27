# syntax=docker/dockerfile:1.7
#
# Ascend production image. Three build stages, one tiny runtime stage:
#
#   web      Node 24 builds the React SPA into web/dist
#   planner  cargo-chef computes a dependency "recipe" from the manifests
#   builder  compiles dependencies (cached layer), then the app, embedding
#            web/dist and content/ into the binary via include_dir!
#   runtime  distroless (glibc + CA certificates, no shell), non-root
#
# The result is a single ~85 MB image whose only moving part is one binary.
# Dependency layers are reused across deploys unless Cargo.lock changes, so
# a content-only change rebuilds in about a minute.

# ---------- web ----------
FROM node:24-trixie-slim AS web
WORKDIR /app/web
RUN corepack enable
COPY web/package.json web/pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile
COPY web/ ./
RUN pnpm build

# ---------- rust dependency plan ----------
FROM lukemathwalker/cargo-chef:latest-rust-1.98-slim-trixie AS chef
WORKDIR /app

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
RUN cargo build --release -p ascend-api \
 && cp target/release/ascend-api /ascend-api \
 # Strict content validation: a broken lesson fails the build, not the deploy.
 && CONTENT_LENIENT=${CONTENT_LENIENT} /ascend-api --check-content

# ---------- runtime ----------
FROM gcr.io/distroless/cc-debian13:nonroot AS runtime
COPY --from=builder /ascend-api /usr/local/bin/ascend-api
ENV APP_ENV=production \
    HOST=0.0.0.0 \
    PORT=8080 \
    RUST_LOG=info,ascend_api=info,ascend_core=info,tower_http=info,sea_orm=warn,sqlx=warn
EXPOSE 8080
USER nonroot
ENTRYPOINT ["/usr/local/bin/ascend-api"]
