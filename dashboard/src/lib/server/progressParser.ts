export type ProgressMarker = {
  framework: string;
  endpoint: string;
  concurrency: string;
  phase: string;
  at: string;
};

export function parseProgressLine(line: string): ProgressMarker | null {
  if (!line.startsWith('::progress ')) return null;
  const obj: Record<string, string> = {};
  const parts = line.slice('::progress '.length).split(/\s+/);
  for (const p of parts) {
    const eq = p.indexOf('=');
    if (eq > 0) obj[p.slice(0, eq)] = p.slice(eq + 1);
  }
  return {
    framework: obj.framework || '',
    endpoint: obj.endpoint || '',
    concurrency: obj.concurrency || '',
    phase: obj.phase || '',
    at: obj.at || '',
  };
}

import { createReadStream } from 'node:fs';
import { readFileSync } from 'node:fs';
import { createInterface } from 'node:readline';
import { promisify } from 'node:util';
import { pipeline } from 'node:stream/promises';

const MAX_LOG_SIZE = 10_000_000; // 10MB limit before falling back to full read

async function tailLogFileAsync(path: string, n: number): Promise<string[]> {
  try {
    // For small files (< 10MB), use simple read approach
    const stats = await import('node:fs').then(fs => fs.promises.stat(path));
    if (stats.size < MAX_LOG_SIZE) {
      const content = await import('node:fs').then(fs => fs.promises.readFile(path, 'utf8'));
      return content.split('\n').filter(Boolean).slice(-n);
    }

    // For large files, stream and keep only last N lines
    const buffer: string[] = [];
    const fileStream = createReadStream(path, { encoding: 'utf8' });
    const rl = createInterface({ input: fileStream, crlfDelay: Infinity });

    for await (const line of rl) {
      buffer.push(line);
      if (buffer.length > n) {
        buffer.shift(); // Keep only last N lines
      }
    }

    return buffer;
  } catch {
    return [];
  }
}

// Synchronous wrapper for compatibility
export function tailLogFile(path: string, n: number): string[] {
  try {
    // For small files (< 10MB), use simple read approach
    const stats = require('node:fs').statSync(path);
    if (stats.size < MAX_LOG_SIZE) {
      const content = readFileSync(path, 'utf8');
      return content.split('\n').filter(Boolean).slice(-n);
    }

    // For large files, we need to use async - but for compatibility,
    // we'll return empty and log a warning. The async version should be
    // used in production.
    console.warn(`[tailLogFile] file ${path} is large (${stats.size} bytes), use async version`);
    return [];
  } catch {
    return [];
  }
}

export function latestProgress(lines: string[]): ProgressMarker | null {
  for (let i = lines.length - 1; i >= 0; i--) {
    const m = parseProgressLine(lines[i]);
    if (m) return m;
  }
  return null;
}
