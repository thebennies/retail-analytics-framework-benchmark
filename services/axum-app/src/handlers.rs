//! HTTP handlers — /health + 9 benchmark endpoints.

use std::time::Instant;

use axum::extract::State;
use axum::http::StatusCode;
use axum::response::{IntoResponse, Json as AxumJson};
use serde::Serialize;
use serde_json::Value;

use crate::{db, response::BenchmarkResponse, AppState};

// ── /health ──

#[derive(Serialize)]
pub struct HealthResponse {
    pub status: &'static str,
    pub framework: &'static str,
    pub db_pool_size: u32,
    pub db_pool_min: u32,
}

pub async fn health(State(state): State<AppState>) -> AxumJson<HealthResponse> {
    AxumJson(HealthResponse {
        status: "ok",
        framework: crate::response::FRAMEWORK,
        db_pool_size: state.pool_max,
        db_pool_min: state.pool_min,
    })
}

// ── Generic single-query runner ──

pub(crate) async fn run_single_query(
    state: &AppState,
    task: &'static str,
) -> Result<BenchmarkResponse, AppError> {
    let sql = state
        .queries
        .get(task)
        .map_err(|e| AppError::internal(e.to_string()))?;

    let exec_start = Instant::now();
    let query_start = Instant::now();
    let rows = sqlx::query(sql)
        .fetch_all(&state.pool)
        .await
        .map_err(|e| AppError::internal(format!("sqlx fetch: {e}")))?;
    let query_ms = elapsed_ms(query_start);

    let result: Vec<Value> =
        db::rows_to_json(&rows).map_err(|e| AppError::internal(e.to_string()))?;
    let exec_ms = elapsed_ms(exec_start);

    Ok(BenchmarkResponse::new(task, exec_ms, query_ms, result))
}

#[inline]
pub(crate) fn elapsed_ms(start: Instant) -> f64 {
    start.elapsed().as_secs_f64() * 1000.0
}

// ── 8 single-query endpoints ──

pub async fn daily_sales(
    State(state): State<AppState>,
) -> Result<AxumJson<BenchmarkResponse>, AppError> {
    run_single_query(&state, "daily-sales").await.map(AxumJson)
}

pub async fn sales_by_location(
    State(state): State<AppState>,
) -> Result<AxumJson<BenchmarkResponse>, AppError> {
    run_single_query(&state, "sales-by-location").await.map(AxumJson)
}

pub async fn sales_by_product(
    State(state): State<AppState>,
) -> Result<AxumJson<BenchmarkResponse>, AppError> {
    run_single_query(&state, "sales-by-product").await.map(AxumJson)
}

pub async fn sales_by_payment(
    State(state): State<AppState>,
) -> Result<AxumJson<BenchmarkResponse>, AppError> {
    run_single_query(&state, "sales-by-payment").await.map(AxumJson)
}

pub async fn hourly_sales(
    State(state): State<AppState>,
) -> Result<AxumJson<BenchmarkResponse>, AppError> {
    run_single_query(&state, "hourly-sales").await.map(AxumJson)
}

pub async fn top_products(
    State(state): State<AppState>,
) -> Result<AxumJson<BenchmarkResponse>, AppError> {
    run_single_query(&state, "top-products").await.map(AxumJson)
}

pub async fn location_product_matrix(
    State(state): State<AppState>,
) -> Result<AxumJson<BenchmarkResponse>, AppError> {
    run_single_query(&state, "location-product-matrix").await.map(AxumJson)
}

pub async fn discount_impact(
    State(state): State<AppState>,
) -> Result<AxumJson<BenchmarkResponse>, AppError> {
    run_single_query(&state, "discount-impact").await.map(AxumJson)
}

// ── /benchmark/full-summary — SEQUENTIAL (spec section 5) ──

/// 8 sub-queries run SEQUENTIALLY via .await chaining. NOT tokio::join!.
/// Rationale: parallel fan-out at c=1000 creates 8000 in-flight queries,
/// contaminating cross-framework comparison.
pub async fn full_summary(
    State(state): State<AppState>,
) -> Result<AxumJson<BenchmarkResponse>, AppError> {
    let tasks: [&str; 8] = [
        "daily-sales",
        "sales-by-location",
        "sales-by-product",
        "sales-by-payment",
        "hourly-sales",
        "top-products",
        "location-product-matrix",
        "discount-impact",
    ];

    let exec_start = Instant::now();
    let mut query_ms_total: f64 = 0.0;
    let mut sub_results: Vec<Value> = Vec::with_capacity(tasks.len());

    for task in tasks {
        let sql = state
            .queries
            .get(task)
            .map_err(|e| AppError::internal(e.to_string()))?;

        let q_start = Instant::now();
        let rows = sqlx::query(sql)
            .fetch_all(&state.pool)
            .await
            .map_err(|e| AppError::internal(format!("sqlx fetch [{task}]: {e}")))?;
        query_ms_total += elapsed_ms(q_start);

        let rows_json =
            db::rows_to_json(&rows).map_err(|e| AppError::internal(e.to_string()))?;

        sub_results.push(serde_json::json!({
            "task": task,
            "rows_returned": rows_json.len(),
            "result": rows_json,
        }));
    }

    let exec_ms = elapsed_ms(exec_start);
    Ok(AxumJson(BenchmarkResponse::new(
        "full-summary",
        exec_ms,
        query_ms_total,
        sub_results,
    )))
}

// ── Error type ──

#[derive(Debug)]
pub struct AppError {
    status: StatusCode,
    msg: String,
}

impl AppError {
    pub fn internal(msg: impl Into<String>) -> Self {
        Self { status: StatusCode::INTERNAL_SERVER_ERROR, msg: msg.into() }
    }
}

impl IntoResponse for AppError {
    fn into_response(self) -> axum::response::Response {
        tracing::error!(error = %self.msg, "handler error");
        (self.status, AxumJson(serde_json::json!({ "error": self.msg }))).into_response()
    }
}
