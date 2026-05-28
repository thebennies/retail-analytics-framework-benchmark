//! Uniform response struct shared by every /benchmark/* endpoint.

use chrono::{SecondsFormat, Utc};
use serde::Serialize;
use serde_json::{Map, Value};
use uuid::Uuid;

pub const FRAMEWORK: &str = "axum";

#[derive(Serialize)]
pub struct BenchmarkResponse {
    pub framework: &'static str,
    pub task: &'static str,
    pub execution_time_ms: f64,
    pub query_time_ms: f64,
    pub rows_returned: u64,
    pub result: Value,
    pub timestamp: String,
    pub request_id: String,
}

impl BenchmarkResponse {
    pub fn new(task: &'static str, execution_ms: f64, query_ms: f64, result: Vec<Value>) -> Self {
        Self {
            framework: FRAMEWORK,
            task,
            execution_time_ms: round3(execution_ms),
            query_time_ms: round3(query_ms),
            rows_returned: result.len() as u64,
            result: Value::Array(result),
            timestamp: Utc::now().to_rfc3339_opts(SecondsFormat::Micros, true),
            request_id: Uuid::new_v4().to_string(),
        }
    }

    pub fn new_dict(task: &'static str, execution_ms: f64, query_ms: f64, result: Map<String, Value>) -> Self {
        let len = result.len() as u64;
        Self {
            framework: FRAMEWORK,
            task,
            execution_time_ms: round3(execution_ms),
            query_time_ms: round3(query_ms),
            rows_returned: 1, // matches FastAPI's len(dict) ? 1 : len(list)
            result: Value::Object(result),
            timestamp: Utc::now().to_rfc3339_opts(SecondsFormat::Micros, true),
            request_id: Uuid::new_v4().to_string(),
        }
    }
}

#[inline]
pub fn round3(ms: f64) -> f64 {
    (ms * 1000.0).round() / 1000.0
}
