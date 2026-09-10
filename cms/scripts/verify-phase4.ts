/**
 * Phase 4: published Neon vs content.json, API fallback shape.
 */
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';

function loadLocalEnv() {
  const file = path.resolve(process.cwd(), '.env');
  if (!existsSync(file)) return;
  for (const line of readFileSync(file, 'utf8').split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const match = trimmed.match(/^([A-Z0-9_]+)\s*=\s*(.*)$/);
    if (!match || process.env[match[1]]) continue;
    let value = match[2].trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    process.env[match[1]] = value;
  }
}

loadLocalEnv();

const BASE = (process.env.CMS_BASE_URL || 'https://elitex-interior.vercel.app').replace(/\/$/, '');

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

async function main() {
  const file = path.resolve(process.cwd(), '..', 'content', 'content.json');
  const local = JSON.parse(readFileSync(file, 'utf8')) as {
    site?: { name?: string };
    pages?: Record<string, unknown>;
    seo?: unknown;
    media?: unknown[];
  };
  const response = await fetch(`${BASE}/api/content`, { cache: 'no-store' });
  const json = (await response.json()) as {
    ok?: boolean;
    content?: {
      site?: { name?: string };
      pages?: Record<string, unknown>;
      seo?: unknown;
      media?: unknown[];
    };
  };
  assert(response.ok && json.ok, 'GET /api/content failed');
  const content = json.content!;
  assert(content.site?.name === local.site?.name, 'site.name mismatch');
  assert(Boolean(content.pages?.home && content.pages?.showcase && content.pages?.showcase2 && content.pages?.reviews), 'pages missing');
  assert(Boolean(content.seo), 'seo missing');
  assert(Array.isArray(content.media) && content.media.length >= 115, 'media missing');
  const health = await fetch(`${BASE}/api/health`, { cache: 'no-store' }).then((r) => r.json()) as { mediaCount?: number };
  assert(Number(health.mediaCount) >= 115, 'health mediaCount');
  console.log(
    JSON.stringify(
      {
        ok: true,
        compared: ['site.name', 'pages.home', 'pages.showcase', 'pages.showcase2', 'pages.reviews', 'seo', 'media>=115'],
        fallback: 'content/content.json still in repo',
      },
      null,
      2
    )
  );
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
