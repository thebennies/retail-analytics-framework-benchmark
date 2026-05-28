/**
 * SQL loader — parses services/shared/queries.sql @name blocks into a Map.
 * Mirrors FastAPI queries.py and Axum queries.rs parse semantics.
 */
'use strict';

const fs = require('fs');

function loadQueries(filePath) {
  const text = fs.readFileSync(filePath, 'utf8');
  const markers = [];

  let offset = 0;
  for (const line of text.split('\n')) {
    const trimmed = line.trimStart();
    if (trimmed.startsWith('-- @name:')) {
      const name = trimmed.slice('-- @name:'.length).trim();
      if (!name || /\s/.test(name)) {
        throw new Error(`invalid @name marker at offset ${offset}: ${trimmed}`);
      }
      markers.push({ name, bodyStart: offset + line.length + 1, headerLineStart: offset });
    }
    offset += line.length + 1; // +1 for '\n'
  }

  if (markers.length === 0) {
    throw new Error('no -- @name: markers found in ' + filePath);
  }

  const queries = new Map();
  for (let i = 0; i < markers.length; i++) {
    const { name, bodyStart } = markers[i];
    const bodyEnd = i + 1 < markers.length ? markers[i + 1].headerLineStart : text.length;
    let sql = text.slice(bodyStart, bodyEnd).trim();
    // Remove trailing semicolons
    if (sql.endsWith(';')) {
      sql = sql.slice(0, -1).trimEnd();
    }
    if (queries.has(name)) {
      throw new Error('duplicate @name marker: ' + name);
    }
    queries.set(name, sql);
  }
  return queries;
}

module.exports = { loadQueries };
