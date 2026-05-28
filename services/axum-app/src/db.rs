//! Pool init + PgRow -> serde_json::Value conversion.

use anyhow::{anyhow, Context, Result};
use bigdecimal::{BigDecimal, ToPrimitive};
use chrono::{DateTime, NaiveDate, NaiveDateTime, NaiveTime, SecondsFormat, Utc};
use serde_json::{Map, Value};
use sqlx::postgres::{PgPool, PgPoolOptions, PgRow};
use sqlx::{Column, Row, TypeInfo};
use std::time::Duration;

pub async fn init_pool(database_url: &str, max_connections: u32) -> Result<PgPool> {
    // Assert pool config is valid (fixes M-19: min must be <= max)
    assert!(max_connections >= 5, "POOL_MAX ({max_connections}) must be >= min_connections (5)");
    PgPoolOptions::new()
        .max_connections(max_connections)
        .min_connections(5)
        .acquire_timeout(Duration::from_secs(30))
        .test_before_acquire(false)
        .connect(database_url)
        .await
        .context("connecting to database")
}

pub fn rows_to_json(rows: &[PgRow]) -> Result<Vec<Value>> {
    rows.iter().map(row_to_json).collect()
}

fn row_to_json(row: &PgRow) -> Result<Value> {
    let mut map: Map<String, Value> = Map::with_capacity(row.columns().len());
    for col in row.columns() {
        let name = col.name();
        let v = column_to_json(row, col)
            .with_context(|| format!("converting column `{}`", name))?;
        map.insert(name.to_string(), v);
    }
    Ok(Value::Object(map))
}

fn column_to_json(row: &PgRow, col: &sqlx::postgres::PgColumn) -> Result<Value> {
    let i = col.ordinal();
    let type_name = col.type_info().name();

    macro_rules! try_opt {
        ($ty:ty) => {{
            let v: Option<$ty> = row
                .try_get(i)
                .map_err(|e| anyhow!("sqlx try_get({}): {}", type_name, e))?;
            v
        }};
    }

    let value = match type_name {
        "INT2" => try_opt!(i16).map(|v| Value::from(v as i64)).unwrap_or(Value::Null),
        "INT4" => try_opt!(i32).map(|v| Value::from(v as i64)).unwrap_or(Value::Null),
        "INT8" => try_opt!(i64).map(Value::from).unwrap_or(Value::Null),

        "FLOAT4" => try_opt!(f32)
            .and_then(|v| serde_json::Number::from_f64(v as f64).map(Value::Number))
            .unwrap_or(Value::Null),
        "FLOAT8" => try_opt!(f64)
            .and_then(|v| serde_json::Number::from_f64(v).map(Value::Number))
            .unwrap_or(Value::Null),

        "NUMERIC" => {
            let v: Option<BigDecimal> = row
                .try_get(i)
                .map_err(|e| anyhow!("sqlx try_get(NUMERIC): {}", e))?;
            match v {
                None => Value::Null,
                Some(bd) => {
                    let f = bd
                        .to_f64()
                        .ok_or_else(|| anyhow!("BigDecimal {} did not fit in f64", bd))?;
                    serde_json::Number::from_f64(f)
                        .map(Value::Number)
                        .unwrap_or(Value::Null)
                }
            }
        }

        "BOOL" => try_opt!(bool).map(Value::Bool).unwrap_or(Value::Null),

        "TEXT" | "VARCHAR" | "BPCHAR" | "NAME" | "UUID" => {
            try_opt!(String).map(Value::String).unwrap_or(Value::Null)
        }

        "DATE" => try_opt!(NaiveDate)
            .map(|d| Value::String(d.format("%Y-%m-%d").to_string()))
            .unwrap_or(Value::Null),

        "TIME" => try_opt!(NaiveTime)
            .map(|t| Value::String(t.format("%H:%M:%S").to_string()))
            .unwrap_or(Value::Null),

        "TIMESTAMP" => try_opt!(NaiveDateTime)
            .map(|d| Value::String(d.format("%Y-%m-%dT%H:%M:%S%.6f").to_string()))
            .unwrap_or(Value::Null),

        "TIMESTAMPTZ" => try_opt!(DateTime<Utc>)
            .map(|d| Value::String(d.to_rfc3339_opts(SecondsFormat::Micros, true)))
            .unwrap_or(Value::Null),

        other => {
            return Err(anyhow!(
                "unsupported column type `{}` (column {} index {})",
                other, col.name(), i
            ));
        }
    };

    Ok(value)
}
