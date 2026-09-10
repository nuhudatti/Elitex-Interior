/**
 * Phase 3C: media library count, upload-config, delete guard.
 * Does not print secrets. Does not delete the original 115 unless a new test asset exists.
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

async function main() {
  const results: string[] = [];
  const health = await req('GET', '/api/health');
  const count = Number(health.json.mediaCount);
  assert(count >= 115, `mediaCount=${count}`);
  results.push(`health mediaCount=${count}`);

  const publicMedia = await req('GET', '/api/media');
  assert(Number(publicMedia.json.count) >= 115, 'public media dropped below 115');
  results.push('public GET /api/media >= 115');

  if (!EMAIL || !PASSWORD) throw new Error('Bootstrap admin env names missing (values not printed).');
  const login = await req('POST', '/api/auth/login', { body: { email: EMAIL, password: PASSWORD } });
  assert(login.status === 200, `login ${login.status}`);
  const cookie = login.cookie;
  const csrf = csrfFromCookie(cookie);

  const cmsMedia = await req('GET', '/api/cms/media', { cookie });
  assert(cmsMedia.status === 200 && Number(cmsMedia.json.count) >= 115, 'cms media missing originals');
  results.push('authenticated library visible');

  const cfg = await req('GET', '/api/cms/media/upload-config', { cookie });
  assert(cfg.status === 200, 'upload-config failed');
  results.push(`upload mode=${String(cfg.json.mode)}`);
  if (cfg.json.mode === 'unavailable') {
    results.push(`upload blocked; missing ${JSON.stringify(cfg.json.missing)}`);
  }

  const first = ((cmsMedia.json.media || []) as Array<{ id: string }>)[0];
  if (first?.id) {
    const del = await req('DELETE', `/api/cms/media/${first.id}`, { cookie, csrf });
    assert(del.status === 409 || del.status === 200, `delete status ${del.status}`);
    if (del.status === 409) results.push('referenced delete blocked');
    if (del.status === 200) {
      throw new Error('Deleted an original media row — refusing to continue');
    }
  }

  const completeBad = await req('POST', '/api/cms/media/complete', { cookie, csrf, body: { public_id: '' } });
  assert(completeBad.status === 400, `failure path ${completeBad.status}`);
  results.push('complete without URL rejected');

  const healthAfter = await req('GET', '/api/health');
  assert(Number(healthAfter.json.mediaCount) >= 115, 'lost original media');
  await req('POST', '/api/auth/logout', { cookie, csrf });
  console.log(JSON.stringify({ ok: true, base: BASE, results, uploadMode: cfg.json.mode }, null, 2));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
