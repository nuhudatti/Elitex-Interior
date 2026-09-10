/**
 * Phase 2 live API verification.
 * Public reads do not need a key. Draft/publish need x-cms-key = CMS_API_SECRET.
 * Restores published + draft after the isolation/publish checks.
 */
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';

function loadLocalEnv() {
  const file = path.resolve(process.cwd(), '.env');
  if (!existsSync(file)) return;
  for (const line of readFileSync(file, 'utf8').split(/\r?\n/)) {
    const match = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (!match || process.env[match[1]]) continue;
    process.env[match[1]] = match[2].replace(/^['"]|['"]$/g, '');
  }
}

loadLocalEnv();

const BASE = (process.env.CMS_BASE_URL || 'https://elitex-interior.vercel.app').replace(/\/$/, '');
const KEY = process.env.CMS_API_SECRET || '';

type ContentDoc = {
  schemaVersion?: number;
  site?: { name?: string };
  pages?: Record<string, unknown>;
  media?: unknown[];
  [key: string]: unknown;
};

async function req(
  method: string,
  path: string,
  opts?: { key?: boolean; body?: unknown }
) {
  const headers: Record<string, string> = { Accept: 'application/json' };
  if (opts?.key) headers['x-cms-key'] = KEY;
  if (opts?.body !== undefined) headers['Content-Type'] = 'application/json';

  const response = await fetch(BASE + path, {
    method,
    headers,
    body: opts?.body !== undefined ? JSON.stringify(opts.body) : undefined,
    cache: 'no-store',
  });
  const text = await response.text();
  let json: Record<string, unknown> = {};
  try {
    json = JSON.parse(text) as Record<string, unknown>;
  } catch {
    throw new Error(`${method} ${path} returned non-JSON (${response.status})`);
  }
  return { status: response.status, json };
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

async function main() {
  const results: string[] = [];

  const health = await req('GET', '/api/health');
  const db = (health.json.db || {}) as Record<string, unknown>;
  const healthContent = (health.json.content || {}) as Record<string, unknown>;
  assert(health.status === 200 && health.json.ok === true, 'health failed');
  assert(db.connected === true, 'health not connected');
  assert(db.neon === true, 'health neon is not true');
  assert(db.schemaReady === true, 'health schemaReady is not true');
  assert(healthContent.published, 'health published missing');
  assert(healthContent.draft, 'health draft missing');
  assert(health.json.mediaCount === 115, `health mediaCount=${String(health.json.mediaCount)}`);
  results.push('GET /api/health ok');

  const published = await req('GET', '/api/content');
  assert(published.status === 200 && published.json.ok === true, 'GET /api/content failed');
  assert(published.json.source === 'neon', 'published source is not neon');
  const publishedContent = published.json.content as ContentDoc;
  assert(publishedContent.schemaVersion === 1, 'published schemaVersion');
  assert(publishedContent.site?.name === 'Elitex Interior', 'published site.name');
  assert(publishedContent.pages?.home && publishedContent.pages?.reviews, 'published pages missing');
  assert(Array.isArray(publishedContent.media) && publishedContent.media.length === 115, 'published media length');
  results.push('GET /api/content matches imported structure');

  const media = await req('GET', '/api/media');
  assert(media.status === 200 && media.json.ok === true, 'GET /api/media failed');
  assert(media.json.count === 115, `media count=${String(media.json.count)}`);
  results.push('GET /api/media count=115');

  const noKey = await req('GET', '/api/cms/content/draft');
  assert(noKey.status === 401 || noKey.status === 503, `draft without key status=${noKey.status}`);
  results.push(`GET /api/cms/content/draft without key => ${noKey.status}`);

  if (!KEY) {
    console.log(JSON.stringify({ ok: true, base: BASE, cmsWriteTests: 'skipped_no_CMS_API_SECRET', results }, null, 2));
    return;
  }

  const draftRead = await req('GET', '/api/cms/content/draft', { key: true });
  assert(draftRead.status === 200 && draftRead.json.ok === true, 'GET draft failed');
  const originalDraft = draftRead.json.content as ContentDoc;
  const originalPublished = publishedContent;
  results.push('GET /api/cms/content/draft ok');

  const marker = `phase2-verify-${Date.now()}`;
  const mutated = {
    ...originalDraft,
    site: { ...(originalDraft.site || {}), name: marker },
  };

  const saved = await req('PUT', '/api/cms/content/draft', { key: true, body: { content: mutated } });
  assert(saved.status === 200 && saved.json.ok === true, 'PUT draft failed');
  assert(saved.json.published === false, 'PUT draft must not publish');
  results.push('PUT /api/cms/content/draft saved, not published');

  const publishedAfterDraft = await req('GET', '/api/content');
  const publishedName = ((publishedAfterDraft.json.content as ContentDoc).site || {}).name;
  assert(publishedName === 'Elitex Interior', 'draft change leaked into published');
  results.push('draft isolation: published unchanged');

  const draftAfter = await req('GET', '/api/cms/content/draft', { key: true });
  assert(((draftAfter.json.content as ContentDoc).site || {}).name === marker, 'draft name was not updated');

  const publishedWrite = await req('POST', '/api/content');
  assert(publishedWrite.status === 405 || publishedWrite.status === 400 || publishedWrite.status === 404, 'public content must not accept writes');

  const published_ = await req('POST', '/api/cms/content/publish', { key: true });
  assert(published_.status === 200 && published_.json.ok === true, 'POST publish failed');
  assert(published_.json.published === true, 'publish flag');
  assert(typeof published_.json.versionId === 'string', 'versionId missing');
  assert(typeof published_.json.auditId === 'string', 'auditId missing');
  assert(published_.json.actor === 'system/phase-2', 'actor must be system/phase-2');
  results.push('POST /api/cms/content/publish created version and audit');

  const publishedAfter = await req('GET', '/api/content');
  assert(((publishedAfter.json.content as ContentDoc).site || {}).name === marker, 'publish did not copy draft to published');
  results.push('publish copied draft to published');

  await req('PUT', '/api/cms/content/draft', { key: true, body: { content: originalPublished } });
  const restore = await req('POST', '/api/cms/content/publish', { key: true });
  assert(restore.status === 200 && restore.json.ok === true, 'restore publish failed');

  const restored = await req('GET', '/api/content');
  assert(((restored.json.content as ContentDoc).site || {}).name === 'Elitex Interior', 'failed to restore published name');
  const healthAfter = await req('GET', '/api/health');
  assert(healthAfter.json.mediaCount === 115, 'media count changed');
  results.push('restored published content; mediaCount still 115');

  console.log(JSON.stringify({ ok: true, base: BASE, cmsWriteTests: 'ran_and_restored', results }, null, 2));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
