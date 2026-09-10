/**
 * Phase 3B: draft editor isolation, publish, version, restore, audit.
 * Restores published + draft afterward. Does not print secrets.
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

const BASE = (process.env.CMS_BASE_URL || 'http://localhost:3001').replace(/\/$/, '');
const EMAIL = process.env.CMS_BOOTSTRAP_ADMIN_EMAIL || '';
const PASSWORD = process.env.CMS_BOOTSTRAP_ADMIN_PASSWORD || '';

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function cookieJar(previous: string, response: Response) {
  const next = new Map<string, string>();
  for (const part of previous.split(/;\s*/)) {
    const eq = part.indexOf('=');
    if (eq > 0) next.set(part.slice(0, eq), part.slice(eq + 1));
  }
  for (const raw of response.headers.getSetCookie?.() || []) {
    const pair = raw.split(';')[0];
    const eq = pair.indexOf('=');
    if (eq > 0) next.set(pair.slice(0, eq), pair.slice(eq + 1));
  }
  return [...next.entries()].map(([k, v]) => `${k}=${v}`).join('; ');
}

async function req(method: string, pathName: string, opts?: { cookie?: string; csrf?: string; body?: unknown }) {
  const headers: Record<string, string> = { Accept: 'application/json', Origin: BASE };
  if (opts?.cookie) headers.cookie = opts.cookie;
  if (opts?.csrf) headers['x-csrf-token'] = opts.csrf;
  if (opts?.body !== undefined) headers['Content-Type'] = 'application/json';
  const response = await fetch(BASE + pathName, {
    method,
    headers,
    body: opts?.body !== undefined ? JSON.stringify(opts.body) : undefined,
    cache: 'no-store',
  });
  const json = (await response.json()) as Record<string, unknown>;
  return { status: response.status, json, cookie: cookieJar(opts?.cookie || '', response) };
}

function csrfFromCookie(cookie: string) {
  const part = cookie.split(/;\s*/).find((item) => item.startsWith('elitex_csrf='));
  return part ? decodeURIComponent(part.slice('elitex_csrf='.length)) : '';
}

function siteName(doc: unknown) {
  return ((doc as { site?: { name?: string } } | undefined)?.site || {}).name;
}

async function main() {
  const results: string[] = [];
  if (!EMAIL || !PASSWORD) throw new Error('Bootstrap admin env names missing (values not printed).');

  const health = await req('GET', '/api/health');
  assert(health.json.mediaCount === 115, `mediaCount=${String(health.json.mediaCount)}`);
  results.push('health mediaCount=115');

  const login = await req('POST', '/api/auth/login', { body: { email: EMAIL, password: PASSWORD } });
  assert(login.status === 200, `login ${login.status}`);
  const cookie = login.cookie;
  const csrf = csrfFromCookie(cookie);

  const published = await req('GET', '/api/content');
  const originalPublished = published.json.content as { site?: { name?: string }; pages?: Record<string, unknown> };
  const draftRead = await req('GET', '/api/cms/content/draft', { cookie });
  const originalDraft = draftRead.json.content as Record<string, unknown>;
  assert(draftRead.status === 200, 'draft load failed');
  assert(originalPublished.pages?.home && originalPublished.pages?.reviews, 'pages missing');

  const marker = `phase3b-${Date.now()}`;
  const mutated = {
    ...originalDraft,
    site: { ...((originalDraft.site as object) || {}), name: marker },
  };
  const saved = await req('PUT', '/api/cms/content/draft', { cookie, csrf, body: { content: mutated } });
  assert(saved.status === 200 && saved.json.published === false, 'save published unexpectedly');
  const afterSave = await req('GET', '/api/content');
  assert(siteName(afterSave.json.content) === siteName(originalPublished), 'draft leaked to public');
  results.push('draft isolation ok');

  const publishedResult = await req('POST', '/api/cms/content/publish', { cookie, csrf });
  assert(publishedResult.status === 200 && publishedResult.json.published === true, 'publish failed');
  assert(typeof publishedResult.json.versionId === 'string', 'versionId missing');
  assert(typeof publishedResult.json.auditId === 'string', 'auditId missing');
  const afterPublish = await req('GET', '/api/content');
  assert(siteName(afterPublish.json.content) === marker, 'publish did not update public');
  results.push('publish + version + audit ok');

  const versions = await req('GET', '/api/cms/versions', { cookie });
  const list = (versions.json.versions || []) as Array<{ id: string }>;
  assert(list.length > 0, 'versions empty');
  const restore = await req('POST', `/api/cms/versions/${list[0].id}/restore`, { cookie, csrf });
  assert(restore.json.published === false, 'restore published');
  const publicAfterRestore = await req('GET', '/api/content');
  assert(siteName(publicAfterRestore.json.content) === marker, 'restore changed public');
  results.push('restore wrote draft only');

  const putPub = await req('PUT', '/api/cms/content/draft', { cookie, csrf, body: { content: originalPublished } });
  assert(putPub.status === 200, 'restore save failed');
  const pubAgain = await req('POST', '/api/cms/content/publish', { cookie, csrf });
  assert(pubAgain.status === 200, 'restore publish failed');
  await req('PUT', '/api/cms/content/draft', { cookie, csrf, body: { content: originalDraft } });
  const restored = await req('GET', '/api/content');
  assert(siteName(restored.json.content) === siteName(originalPublished), 'published not restored');
  results.push('original published restored');

  await req('POST', '/api/auth/logout', { cookie, csrf });
  console.log(JSON.stringify({ ok: true, base: BASE, results }, null, 2));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
