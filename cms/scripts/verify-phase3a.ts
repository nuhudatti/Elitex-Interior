/**
 * Phase 3A auth verification against a running CMS (local or CMS_BASE_URL).
 * Does not print passwords or secrets.
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
const KEY = process.env.CMS_API_SECRET || '';

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function cookieJar(previous: string, response: Response) {
  const next = new Map<string, string>();
  for (const part of previous.split(/;\s*/)) {
    const eq = part.indexOf('=');
    if (eq > 0) next.set(part.slice(0, eq), part.slice(eq + 1));
  }
  const setCookies = response.headers.getSetCookie?.() || [];
  for (const raw of setCookies) {
    const pair = raw.split(';')[0];
    const eq = pair.indexOf('=');
    if (eq > 0) next.set(pair.slice(0, eq), pair.slice(eq + 1));
  }
  return [...next.entries()].map(([k, v]) => `${k}=${v}`).join('; ');
}

async function req(
  method: string,
  pathName: string,
  opts?: { cookie?: string; key?: boolean; body?: unknown; csrf?: string }
) {
  const headers: Record<string, string> = { Accept: 'application/json', Origin: BASE };
  if (opts?.cookie) headers.cookie = opts.cookie;
  if (opts?.key) headers['x-cms-key'] = KEY;
  if (opts?.csrf) headers['x-csrf-token'] = opts.csrf;
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
    throw new Error(`${method} ${pathName} non-JSON (${response.status})`);
  }
  return { status: response.status, json, cookie: cookieJar(opts?.cookie || '', response), response };
}

function csrfFromCookie(cookie: string) {
  const part = cookie.split(/;\s*/).find((item) => item.startsWith('elitex_csrf='));
  return part ? decodeURIComponent(part.slice('elitex_csrf='.length)) : '';
}

async function main() {
  const results: string[] = [];

  const health = await req('GET', '/api/health');
  const db = (health.json.db || {}) as Record<string, unknown>;
  assert(health.status === 200 && health.json.ok === true, 'health failed');
  assert(db.connected === true && db.neon === true && db.schemaReady === true, 'health db flags');
  assert(health.json.mediaCount === 115, `mediaCount=${String(health.json.mediaCount)}`);
  results.push('health ok, mediaCount=115');

  const unauthDraft = await req('GET', '/api/cms/content/draft');
  assert(unauthDraft.status === 401 || unauthDraft.status === 503, `unauth draft ${unauthDraft.status}`);
  results.push(`unauthenticated draft => ${unauthDraft.status}`);

  const unauthWrite = await req('PUT', '/api/cms/content/draft', { body: { content: { schemaVersion: 1, site: {}, pages: {} } } });
  assert(unauthWrite.status === 401 || unauthWrite.status === 503, `unauth write ${unauthWrite.status}`);
  results.push(`unauthenticated write => ${unauthWrite.status}`);

  const badLogin = await req('POST', '/api/auth/login', {
    body: { email: 'nobody@example.com', password: 'definitely-wrong-password' },
  });
  assert(badLogin.status === 401, `invalid login ${badLogin.status}`);
  results.push('invalid login rejected');

  if (!EMAIL || !PASSWORD) {
    throw new Error('CMS_BOOTSTRAP_ADMIN_EMAIL / CMS_BOOTSTRAP_ADMIN_PASSWORD missing (values not printed).');
  }

  const login = await req('POST', '/api/auth/login', { body: { email: EMAIL, password: PASSWORD } });
  assert(login.status === 200 && login.json.ok === true, `login failed ${login.status}`);
  const cookie = login.cookie;
  const csrf = csrfFromCookie(cookie);
  assert(cookie.includes('elitex_session='), 'session cookie missing');
  assert(Boolean(csrf), 'csrf cookie missing');
  const sessionHeader =
    (login.response.headers.getSetCookie?.() || []).find((item) =>
      item.toLowerCase().startsWith('elitex_session=')
    ) || '';
  assert(/httponly/i.test(sessionHeader), 'session cookie not HttpOnly');
  assert(/secure/i.test(sessionHeader), 'session cookie not Secure');
  assert(/samesite=lax/i.test(sessionHeader), 'session cookie not SameSite=Lax');
  results.push('valid login set HttpOnly Secure SameSite=Lax session cookie');

  const me = await req('GET', '/api/auth/me', { cookie });
  assert(me.status === 200, `me ${me.status}`);
  const user = (me.json.user || {}) as Record<string, unknown>;
  assert(user.role === 'owner', 'bootstrap user is not administrator');
  results.push('GET /api/auth/me ok');

  const draft = await req('GET', '/api/cms/content/draft', { cookie });
  assert(draft.status === 200, `session draft ${draft.status}`);
  results.push('session can read draft');

  const editorEmail = `editor.phase3a.${Date.now()}@elitex.local`;
  const editorPass = `Editor-${Date.now()}-verify-pass`;
  const created = await req('POST', '/api/cms/users', {
    cookie,
    csrf,
    body: {
      email: editorEmail,
      name: `Editor ${Date.now()}`,
      password: editorPass,
      role: 'editor',
      canPublish: false,
    },
  });
  assert(created.status === 201 || created.status === 200, `create editor ${created.status} ${String(created.json.error)}`);
  const editorUser = (created.json.user || {}) as { id?: string };
  assert(typeof editorUser.id === 'string', 'editor id missing');
  results.push('administrator created editor');

  const editorLogin = await req('POST', '/api/auth/login', {
    body: { email: editorEmail, password: editorPass },
  });
  assert(editorLogin.status === 200, `editor login ${editorLogin.status}`);
  const editorCookie = editorLogin.cookie;
  const editorCsrf = csrfFromCookie(editorCookie);

  const denied = await req('POST', '/api/cms/content/publish', { cookie: editorCookie, csrf: editorCsrf });
  assert(denied.status === 403, `editor publish ${denied.status}`);
  results.push('editor without canPublish denied publish');

  const auditDenied = await req('GET', '/api/cms/audit', { cookie: editorCookie });
  assert(auditDenied.status === 403, `editor audit ${auditDenied.status}`);
  results.push('editor denied audit log');

  const expire = await req('POST', '/api/auth/session/expire', { cookie, csrf });
  assert(expire.status === 200, `expire ${expire.status}`);
  const expiredMe = await req('GET', '/api/auth/me', { cookie });
  assert(expiredMe.status === 401, `expired session ${expiredMe.status}`);
  results.push('expired session rejected');

  const relogin = await req('POST', '/api/auth/login', { body: { email: EMAIL, password: PASSWORD } });
  assert(
    relogin.status === 200,
    `relogin failed ${relogin.status} ${String(relogin.json.error || '')}`
  );
  const adminCookie = relogin.cookie;
  const adminCsrf = csrfFromCookie(adminCookie);

  const del = await req('DELETE', `/api/cms/users/${editorUser.id}`, { cookie: adminCookie, csrf: adminCsrf });
  assert(del.status === 200, `delete editor ${del.status}`);
  results.push('test editor removed');

  const logout = await req('POST', '/api/auth/logout', { cookie: adminCookie, csrf: adminCsrf });
  assert(logout.status === 200, `logout ${logout.status}`);
  const afterLogout = await req('GET', '/api/auth/me', { cookie: adminCookie });
  assert(afterLogout.status === 401, `after logout ${afterLogout.status}`);
  results.push('logout cleared session');

  if (KEY) {
    const machine = await req('GET', '/api/cms/content/draft', { key: true });
    assert(machine.status === 200, `machine key draft ${machine.status}`);
    results.push('machine x-cms-key still works for automation');
  }

  const healthAfter = await req('GET', '/api/health');
  assert(healthAfter.json.mediaCount === 115, 'mediaCount changed');
  results.push('health still 115 media');

  console.log(JSON.stringify({ ok: true, base: BASE, results }, null, 2));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
