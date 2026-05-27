//! Loads services/shared/queries.sql at startup, parses `-- @name: <slug>`
//! blocks into a HashMap. Identical splitting/trimming to queries.py.

use anyhow::{anyhow, Context, Result};
use std::collections::HashMap;
use std::fs;
use std::path::Path;

#[derive(Debug)]
pub struct QueryStore {
    inner: HashMap<String, String>,
}

impl QueryStore {
    pub fn load_from_path<P: AsRef<Path>>(path: P) -> Result<Self> {
        let path = path.as_ref();
        let text = fs::read_to_string(path)
            .with_context(|| format!("reading queries file at {}", path.display()))?;
        Self::parse(&text)
    }

    fn parse(text: &str) -> Result<Self> {
        let mut markers: Vec<(String, usize, usize)> = Vec::new();
        let mut cursor = 0usize;
        for line in text.split_inclusive('\n') {
            let line_start = cursor;
            cursor += line.len();
            let trimmed = line.trim_end_matches('\n').trim_end_matches('\r');
            if let Some(name) = parse_name_marker(trimmed) {
                markers.push((name, cursor, line_start));
            }
        }
        if markers.is_empty() {
            return Err(anyhow!("no `-- @name: <slug>` markers found"));
        }

        let mut inner: HashMap<String, String> = HashMap::with_capacity(markers.len());
        for i in 0..markers.len() {
            let (name, body_start, _) = &markers[i];
            let body_end = if i + 1 < markers.len() {
                markers[i + 1].2
            } else {
                text.len()
            };
            let mut sql = text[*body_start..body_end].trim().to_string();
            if sql.ends_with(';') {
                sql.truncate(sql.len() - 1);
                sql = sql.trim_end().to_string();
            }
            if inner.insert(name.clone(), sql).is_some() {
                return Err(anyhow!("duplicate @name marker: {}", name));
            }
        }
        Ok(Self { inner })
    }

    pub fn get(&self, name: &str) -> Result<&str> {
        self.inner
            .get(name)
            .map(|s| s.as_str())
            .ok_or_else(|| anyhow!("query `{}` not found in queries.sql", name))
    }
}

fn parse_name_marker(line: &str) -> Option<String> {
    let line = line.trim_start();
    let rest = line.strip_prefix('--')?.trim_start();
    let rest = rest.strip_prefix("@name:")?;
    let name = rest.trim();
    if name.is_empty() || name.contains(char::is_whitespace) {
        return None;
    }
    Some(name.to_string())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_two_blocks() {
        let s = "-- @name: a\nSELECT 1;\n-- @name: b\nSELECT 2";
        let qs = QueryStore::parse(s).unwrap();
        assert_eq!(qs.get("a").unwrap(), "SELECT 1");
        assert_eq!(qs.get("b").unwrap(), "SELECT 2");
    }

    #[test]
    fn rejects_duplicate_names() {
        let s = "-- @name: a\nSELECT 1\n-- @name: a\nSELECT 2";
        assert!(QueryStore::parse(s).is_err());
    }
}
