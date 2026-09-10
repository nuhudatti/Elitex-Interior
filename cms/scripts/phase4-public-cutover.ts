/**
 * Phase 4 cutover: prove draft isolation, restore Elitex Interior if needed.
 * Does not print secrets. Does not re-import content.json. Does not touch media rows.
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
const EMAIL = process.env.CMS_BOOTSTRAP_ADMIN_EMAIL || '';
const PASSWORD = process.env.CMS_BOOTSTRAP_ADMIN_PASSWORD || '';
const EXPECTED = 'Elitex Interior';

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

function csrfFromCookie(cookie: string) {
  const part = cookie.split(/;\s*/).find((item) => item.startsWith('elitex_csrf='));
  return part ? decodeURIComponent(part.slice('elitex_csrf='.length)) : '';
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

function siteName(doc: unknown) {
  const content = doc && typeof doc === 'object' ? (doc as { site?: { name?: string } }) : {};
  return content.site?.name || '';
}

async function main() {
  assert(EMAIL && PASSWORD, 'Bootstrap admin env names missing (values not printed).');

  const before = await req('GET', '/api/content');
  assert(before.status === 200 && before.json.ok === true, `public content ${before.status}`);
  const publicNameBefore = siteName(before.json.content);
  const publicUpdatedBefore = String(before.json.updatedAt || '');
  const marker = `phase4-isolation-${Date.now()}`;

  const login = await req('POST', '/api/auth/login', { body: { email: EMAIL, password: PASSWORD } });
  assert(login.status === 200, `login ${login.status}`);
  const cookie = login.cookie;
  const csrf = csrfFromCookie(cookie);

  const draftRes = await req('GET', '/api/cms/content/draft', { cookie });
  assert(draftRes.status === 200, `draft ${draftRes.status}`);
  const originalDraft = draftRes.json.content as Record<string, unknown>;
  const isolated = { ...originalDraft, site: { ...((originalDraft.site as Record<string, unknown>) || {}), name: EXPECTED }, _phase4Isolation: marker };

  const saved = await req('PUT', '/api/cms/content/draft', { cookie, csrf, body: { content: isolated } });
  assert(saved.status === 200 && saved.json.ok === true, `save draft ${saved.status}`);
  assert(saved.json.published === false, 'saving draft published unexpectedly');

  const afterDraft = await req('GET', '/api/content');
  assert(afterDraft.status === 200, `public after draft ${afterDraft.status}`);
  assert(siteName(afterDraft.json.content) === publicNameBefore, 'DRAFT ISOLATION FAILED: public site.name changed before publish');
  assert(String(afterDraft.json.updatedAt || '') === publicUpdatedBefore, 'DRAFT ISOLATION FAILED: published updatedAt changed before publish');
  const publicDoc = afterDraft.json.content as Record<string, unknown>;
  assert(publicDoc._phase4Isolation !== marker, 'DRAFT ISOLATION FAILED: draft-only marker leaked to public API');

  const restored = { ...originalDraft, site: { ...((originalDraft.site as Record<string, unknown>) || {}), name: EXPECTED } };
  delete (restored as { _phase4Isolation?: string })._phase4Isolation;
  const restore = await req('PUT', '/api/cms/content/draft', { cookie, csrf, body: { content: restored } });
  assert(restore.status === 200, `restore draft ${restore.status}`);

  let publishedRan = false;
  if (publicNameBefore !== EXPECTED) {
    const published = await req('POST', '/api/cms/content/publish', { cookie, csrf });
    assert(published.status === 200 && published.json.ok === true, `publish ${published.status} ${String(published.json.error || '')}`);
    publishedRan = true;
  }

  const after = await req('GET', '/api/content');
  assert(after.status === 200, `public after ${after.status}`);
  assert(siteName(after.json.content) === EXPECTED, `public site.name=${siteName(after.json.content)}`);
  assert(!(after.json.content as Record<string, unknown>)._phase4Isolation, 'isolation marker remained on published document');

  const health = await req('GET', '/api/health');
  await req('POST', '/api/auth/logout', { cookie, csrf });

  console.log(
    JSON.stringify(
      {
        ok: true,
        isolation: 'passed',
        published: publishedRan,
        publicName: EXPECTED,
        mediaCount: health.json.mediaCount,
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
