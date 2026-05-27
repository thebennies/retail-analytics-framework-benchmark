//! Axum service entrypoint — Phase 2a.

mod db;
mod handlers;
mod queries;
mod response;

use anyhow::{Context, Result};
use axum::{routing::get, Router};
use sqlx::postgres::PgPool;
use std::env;
use std::net::SocketAddr;
use std::sync::Arc;
use tower_http::trace::TraceLayer;
use tracing_subscriber::EnvFilter;

use crate::queries::QueryStore;

#[derive(Clone)]
pub struct AppState {
    pub pool: PgPool,
    pub queries: Arc<QueryStore>,
    pub pool_max: u32,
    pub pool_min: u32,
}

fn main() -> Result<()> {
    tracing_subscriber::fmt()
        .with_env_filter(EnvFilter::from_default_env().add_directive("info".parse().unwrap()))
        .init();

    let worker_threads: usize = env::var("SERVICE_WORKERS")
        .ok()
        .and_then(|v| v.parse().ok())
        .unwrap_or(4);

    tokio::runtime::Builder::new_multi_thread()
        .worker_threads(worker_threads)
        .enable_all()
        .build()
        .context("building tokio runtime")?
        .block_on(async_main())
}

async fn async_main() -> Result<()> {
    let database_url = env::var("DATABASE_URL").context("DATABASE_URL not set")?;
    let queries_path = env::var("QUERIES_PATH").unwrap_or_else(|_| "/app/shared-queries.sql".into());
    let port: u16 = env::var("AXUM_PORT").ok().and_then(|v| v.parse().ok()).unwrap_or(8003);
    let pool_max: u32 = env::var("POOL_MAX").ok().and_then(|v| v.parse().ok()).unwrap_or(100);
    let pool_min: u32 = 5;

    let queries = QueryStore::load_from_path(&queries_path)
        .with_context(|| format!("loading {}", queries_path))?;
    tracing::info!(target: "axum_app", "loaded queries");

    let pool = db::init_pool(&database_url, pool_max).await?;
    tracing::info!(target: "axum_app", pool_max, "pool ready");

    let state = AppState {
        pool,
        queries: Arc::new(queries),
        pool_max,
        pool_min,
    };

    let app = Router::new()
        .route("/health", get(handlers::health))
        .route("/benchmark/daily-sales", get(handlers::daily_sales))
        .route("/benchmark/sales-by-location", get(handlers::sales_by_location))
        .route("/benchmark/sales-by-product", get(handlers::sales_by_product))
        .route("/benchmark/sales-by-payment", get(handlers::sales_by_payment))
        .route("/benchmark/hourly-sales", get(handlers::hourly_sales))
        .route("/benchmark/top-products", get(handlers::top_products))
        .route("/benchmark/location-product-matrix", get(handlers::location_product_matrix))
        .route("/benchmark/discount-impact", get(handlers::discount_impact))
        .route("/benchmark/full-summary", get(handlers::full_summary))
        .with_state(state)
        .layer(TraceLayer::new_for_http());

    let addr = SocketAddr::from(([0, 0, 0, 0], port));
    tracing::info!(target: "axum_app", %addr, "listening");

    let listener = tokio::net::TcpListener::bind(addr)
        .await
        .with_context(|| format!("binding {}", addr))?;
    axum::serve(listener, app)
        .with_graceful_shutdown(shutdown_signal())
        .await
        .context("axum::serve")?;
    Ok(())
}

async fn shutdown_signal() {
    let _ = tokio::signal::ctrl_c().await;
}
