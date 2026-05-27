# syntax=docker/dockerfile:1.7

# Stage 1: builder — cache deps via dummy main, then build real binary
FROM rust:1.83-slim AS builder

RUN apt-get update && apt-get install -y --no-install-recommends \
      pkg-config libssl-dev ca-certificates \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /build
COPY Cargo.toml Cargo.lock ./
RUN mkdir -p src && echo 'fn main() { println!("dummy"); }' > src/main.rs
RUN cargo build --release && rm -rf src target/release/deps/axum_app* target/release/axum-app*

COPY src ./src
COPY shared-queries.sql ./shared-queries.sql
RUN cargo build --release
RUN strip target/release/axum-app

# Stage 2: runtime
FROM debian:bookworm-slim AS runtime

RUN apt-get update && apt-get install -y --no-install-recommends \
      ca-certificates libpq5 curl \
    && rm -rf /var/lib/apt/lists/*

COPY --from=builder /build/target/release/axum-app /usr/local/bin/axum-app
COPY --from=builder /build/shared-queries.sql /app/shared-queries.sql

ENV RUST_LOG=info
ENV QUERIES_PATH=/app/shared-queries.sql
ENV AXUM_PORT=8003

EXPOSE 8003
CMD ["/usr/local/bin/axum-app"]
