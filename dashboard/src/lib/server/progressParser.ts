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

import { readFileSync } from 'node:fs';

export function tailLogFile(path: string, n: number): string[] {
  try {
    const content = readFileSync(path, 'utf8');
    const lines = content.split('\n').filter(Boolean);
    return lines.slice(-n);
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
