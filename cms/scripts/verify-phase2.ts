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
  pathName: string,
  opts?: { key?: boolean; body?: unknown }
) {
  const endpoint = `${method} ${pathName}`;
  const headers: Record<string, string> = { Accept: 'application/json' };
  if (opts?.key) headers['x-cms-key'] = KEY;
  if (opts?.body !== undefined) headers['Content-Type'] = 'application/json';

  const response = await fetch(BASE + pathName, {
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
    throw new Error(`${endpoint} returned non-JSON (${response.status})`);
  }

  if (opts?.key && response.status === 401) {
    throw new Error(`${endpoint} authentication failed (401)`);
  }
  if (opts?.key && response.status === 503 && json.error === 'cms_secret_not_configured') {
    throw new Error(`${endpoint} server CMS_API_SECRET is not configured (503)`);
  }

  return { endpoint, status: response.status, json };
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function siteName(doc: ContentDoc | undefined) {
  return (doc?.site || {}).name;
}

async function main() {
  const results: string[] = [];

  const health = await req('GET', '/api/health');
  const db = (health.json.db || {}) as Record<string, unknown>;
  const healthContent = (health.json.content || {}) as Record<string, unknown>;
  assert(health.status === 200 && health.json.ok === true, `${health.endpoint} failed`);
  assert(db.connected === true, `${health.endpoint} not connected`);
  assert(db.neon === true, `${health.endpoint} neon is not true`);
  assert(db.schemaReady === true, `${health.endpoint} schemaReady is not true`);
  assert(healthContent.published, `${health.endpoint} published missing`);
  assert(healthContent.draft, `${health.endpoint} draft missing`);
  assert(health.json.mediaCount === 115, `${health.endpoint} mediaCount=${String(health.json.mediaCount)}`);
  results.push(`${health.endpoint} ok`);

  const published = await req('GET', '/api/content');
  assert(published.status === 200 && published.json.ok === true, `${published.endpoint} failed`);
  assert(published.json.source === 'neon', `${published.endpoint} source is not neon`);
  const originalPublished = published.json.content as ContentDoc;
  assert(originalPublished.schemaVersion === 1, `${published.endpoint} schemaVersion`);
  assert(siteName(originalPublished) === 'Elitex Interior', `${published.endpoint} site.name`);
  assert(originalPublished.pages?.home && originalPublished.pages?.reviews, `${published.endpoint} pages missing`);
  assert(Array.isArray(originalPublished.media) && originalPublished.media.length === 115, `${published.endpoint} media length`);
  results.push(`${published.endpoint} matches imported structure`);

  const media = await req('GET', '/api/media');
  assert(media.status === 200 && media.json.ok === true, `${media.endpoint} failed`);
  assert(media.json.count === 115, `${media.endpoint} count=${String(media.json.count)}`);
  results.push(`${media.endpoint} count=115`);

  const noKey = await req('GET', '/api/cms/content/draft');
  assert(
    noKey.status === 401 || noKey.status === 503,
    `${noKey.endpoint} without key expected 401 or 503, got ${noKey.status}`
  );
  results.push(`${noKey.endpoint} without key => ${noKey.status}`);

  if (!KEY) {
    throw new Error('CMS_API_SECRET is missing. Add it to cms/.env. The value is not printed.');
  }

  const draftRead = await req('GET', '/api/cms/content/draft', { key: true });
  assert(draftRead.status === 200 && draftRead.json.ok === true, `${draftRead.endpoint} failed (${draftRead.status})`);
  const originalDraft = draftRead.json.content as ContentDoc;
  results.push(`${draftRead.endpoint} ok`);

  const marker = `phase2-verify-${Date.now()}`;
  const mutated = {
    ...originalDraft,
    site: { ...(originalDraft.site || {}), name: marker },
  };

  const saved = await req('PUT', '/api/cms/content/draft', { key: true, body: { content: mutated } });
  assert(saved.status === 200 && saved.json.ok === true, `${saved.endpoint} failed (${saved.status})`);
  assert(saved.json.published === false, `${saved.endpoint} must not publish`);
  results.push(`${saved.endpoint} saved, published=false`);

  const publishedAfterDraft = await req('GET', '/api/content');
  assert(publishedAfterDraft.status === 200, `${publishedAfterDraft.endpoint} failed after draft save`);
  assert(siteName(publishedAfterDraft.json.content as ContentDoc) === siteName(originalPublished), 'draft isolation failed: published changed');
  results.push('draft isolation: GET /api/content unchanged');

  const draftAfter = await req('GET', '/api/cms/content/draft', { key: true });
  assert(draftAfter.status === 200, `${draftAfter.endpoint} failed after save`);
  assert(siteName(draftAfter.json.content as ContentDoc) === marker, `${draftAfter.endpoint} temporary change missing`);
  results.push(`${draftAfter.endpoint} has temporary change`);

  const publishedResult = await req('POST', '/api/cms/content/publish', { key: true });
  assert(publishedResult.status === 200 && publishedResult.json.ok === true, `${publishedResult.endpoint} failed (${publishedResult.status})`);
  assert(publishedResult.json.published === true, `${publishedResult.endpoint} published flag`);
  assert(typeof publishedResult.json.versionId === 'string', `${publishedResult.endpoint} versionId missing`);
  assert(typeof publishedResult.json.auditId === 'string', `${publishedResult.endpoint} auditId missing`);
  assert(publishedResult.json.actor === 'system/phase-2', `${publishedResult.endpoint} actor must be system/phase-2`);
  results.push(`${publishedResult.endpoint} created ContentVersion and AuditLog`);

  const publishedAfter = await req('GET', '/api/content');
  assert(siteName(publishedAfter.json.content as ContentDoc) === marker, `${publishedAfter.endpoint} did not receive published draft`);
  results.push('publish copied draft to GET /api/content');

  const restoreDraft = await req('PUT', '/api/cms/content/draft', { key: true, body: { content: originalPublished } });
  assert(restoreDraft.status === 200 && restoreDraft.json.ok === true, `${restoreDraft.endpoint} restore save failed`);
  const restorePublish = await req('POST', '/api/cms/content/publish', { key: true });
  assert(restorePublish.status === 200 && restorePublish.json.ok === true, `${restorePublish.endpoint} restore publish failed`);
  const restoreOriginalDraft = await req('PUT', '/api/cms/content/draft', { key: true, body: { content: originalDraft } });
  assert(restoreOriginalDraft.status === 200 && restoreOriginalDraft.json.ok === true, `${restoreOriginalDraft.endpoint} draft restore failed`);

  const restoredPublished = await req('GET', '/api/content');
  assert(siteName(restoredPublished.json.content as ContentDoc) === siteName(originalPublished), 'published content was not restored');
  const restoredDraft = await req('GET', '/api/cms/content/draft', { key: true });
  assert(siteName(restoredDraft.json.content as ContentDoc) === siteName(originalDraft), 'draft content was not restored');
  results.push('restored original published and draft');

  const healthAfter = await req('GET', '/api/health');
  const dbAfter = (healthAfter.json.db || {}) as Record<string, unknown>;
  assert(healthAfter.status === 200 && healthAfter.json.ok === true, `${healthAfter.endpoint} failed after restore`);
  assert(dbAfter.connected === true && dbAfter.neon === true && dbAfter.schemaReady === true, `${healthAfter.endpoint} no longer healthy`);
  assert(healthAfter.json.mediaCount === 115, `${healthAfter.endpoint} mediaCount=${String(healthAfter.json.mediaCount)}`);
  results.push(`${healthAfter.endpoint} healthy; mediaCount=115`);

  console.log(
    JSON.stringify(
      {
        ok: true,
        base: BASE,
        secretLoaded: true,
        cmsWriteTests: 'ran_and_restored',
        results,
        health: healthAfter.json,
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
