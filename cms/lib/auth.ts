import { createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import type { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { ACTOR_PHASE2, jsonError } from '@/lib/api';
import {
  hasPermission,
  toAuthUser,
  type AuthUser,
  type Permission,
  publicUser,
} from '@/lib/permissions';

export const SESSION_COOKIE = 'elitex_session';
export const CSRF_COOKIE = 'elitex_csrf';
export const SESSION_TTL_SECONDS = 12 * 60 * 60;
const IDLE_REFRESH_MS = 60 * 1000;

export type SessionActor =
  | {
      kind: 'user';
      user: AuthUser;
      sessionId: string;
      rawToken: string;
      csrfToken: string;
    }
  | {
      kind: 'machine';
      label: string;
    };

function hmacSecret() {
  return process.env.CMS_API_SECRET || '';
}

export function isHttps(request: Request) {
  const forwarded = request.headers.get('x-forwarded-proto');
  if (forwarded) return forwarded.split(',')[0].trim() === 'https';
  return new URL(request.url).protocol === 'https:';
}

export function readCookie(request: Request, name: string) {
  const header = request.headers.get('cookie') || '';
  const parts = header.split(/;\s*/);
  for (const part of parts) {
    const eq = part.indexOf('=');
    if (eq === -1) continue;
    if (part.slice(0, eq) === name) {
      try {
        return decodeURIComponent(part.slice(eq + 1));
      } catch {
        return part.slice(eq + 1);
      }
    }
  }
  return '';
}

export function hashToken(raw: string) {
  return createHash('sha256').update(raw).digest('hex');
}

export function csrfFromSessionToken(rawToken: string) {
  const secret = hmacSecret();
  if (!secret) return '';
  return createHmac('sha256', secret).update(`csrf:${rawToken}`).digest('base64url');
}

export function newSessionToken() {
  return randomBytes(32).toString('base64url');
}

export function applyAuthCookies(
  response: NextResponse,
  request: Request,
  rawToken: string,
  maxAge = SESSION_TTL_SECONDS
) {
  const secure = isHttps(request);
  const csrf = csrfFromSessionToken(rawToken);
  response.cookies.set(SESSION_COOKIE, rawToken, {
    httpOnly: true,
    secure,
    sameSite: 'lax',
    path: '/',
    maxAge,
  });
  response.cookies.set(CSRF_COOKIE, csrf, {
    httpOnly: false,
    secure,
    sameSite: 'lax',
    path: '/',
    maxAge,
  });
}

export function clearAuthCookies(response: NextResponse, request: Request) {
  const secure = isHttps(request);
  response.cookies.set(SESSION_COOKIE, '', {
    httpOnly: true,
    secure,
    sameSite: 'lax',
    path: '/',
    maxAge: 0,
  });
  response.cookies.set(CSRF_COOKIE, '', {
    httpOnly: false,
    secure,
    sameSite: 'lax',
    path: '/',
    maxAge: 0,
  });
}

function allowedOrigins(request: Request) {
  const url = new URL(request.url);
  const set = new Set<string>([`${url.protocol}//${url.host}`, 'https://elitex-interior.vercel.app']);
  const extra = process.env.CMS_PUBLIC_ORIGIN;
  if (extra) set.add(extra.replace(/\/$/, ''));
  return set;
}

export function originAllowed(request: Request) {
  const origin = request.headers.get('origin');
  if (!origin) return true;
  return allowedOrigins(request).has(origin);
}

export function requireOrigin(request: Request) {
  if (originAllowed(request)) return { ok: true as const };
  return { ok: false as const, response: jsonError(403, 'csrf_origin') };
}

export function requireCsrf(request: Request, rawToken: string) {
  const expected = csrfFromSessionToken(rawToken);
  const provided = request.headers.get('x-csrf-token') || readCookie(request, CSRF_COOKIE);
  if (!expected || !provided) {
    return { ok: false as const, response: jsonError(403, 'csrf_required') };
  }
  const left = Buffer.from(provided);
  const right = Buffer.from(expected);
  if (left.length !== right.length || !timingSafeEqual(left, right)) {
    return { ok: false as const, response: jsonError(403, 'csrf_invalid') };
  }
  return { ok: true as const };
}

function isMutating(request: Request) {
  return !['GET', 'HEAD', 'OPTIONS'].includes(request.method.toUpperCase());
}

export async function idleTimeoutMinutes() {
  try {
    const row = await prisma.siteSetting.findUnique({
      where: { key: 'sessionTimeout' },
      select: { value: true },
    });
    const value = Number(row?.value);
    if (Number.isFinite(value) && value >= 5 && value <= 24 * 60) return value;
  } catch {
    /* schema or DB issue — use default */
  }
  return 12 * 60;
}

export async function createSession(userId: string) {
  const rawToken = newSessionToken();
  const expiresAt = new Date(Date.now() + SESSION_TTL_SECONDS * 1000);
  const session = await prisma.session.create({
    data: {
      userId,
      tokenHash: hashToken(rawToken),
      expiresAt,
    },
  });
  return { rawToken, session, csrfToken: csrfFromSessionToken(rawToken) };
}

export async function destroySessionByToken(rawToken: string) {
  if (!rawToken) return;
  await prisma.session.deleteMany({ where: { tokenHash: hashToken(rawToken) } });
}

export async function destroyUserSessions(userId: string) {
  await prisma.session.deleteMany({ where: { userId } });
}

export async function readUserSession(request: Request): Promise<Extract<SessionActor, { kind: 'user' }> | null> {
  const rawToken = readCookie(request, SESSION_COOKIE);
  if (!rawToken) return null;

  const row = await prisma.session.findUnique({
    where: { tokenHash: hashToken(rawToken) },
    include: { user: true },
  });
  if (!row) return null;

  const now = Date.now();
  if (row.expiresAt.getTime() <= now) {
    await prisma.session.delete({ where: { id: row.id } }).catch(() => undefined);
    return null;
  }

  const idleMinutes = await idleTimeoutMinutes();
  if (now - row.lastSeenAt.getTime() > idleMinutes * 60 * 1000) {
    await prisma.session.delete({ where: { id: row.id } }).catch(() => undefined);
    return null;
  }

  if (now - row.lastSeenAt.getTime() > IDLE_REFRESH_MS) {
    await prisma.session
      .update({
        where: { id: row.id },
        data: { lastSeenAt: new Date() },
      })
      .catch(() => undefined);
  }

  return {
    kind: 'user',
    user: await toAuthUser(row.user),
    sessionId: row.id,
    rawToken,
    csrfToken: csrfFromSessionToken(rawToken),
  };
}

function timingSafeMatch(provided: string, expected: string) {
  const left = Buffer.from(provided);
  const right = Buffer.from(expected);
  if (left.length !== right.length) return false;
  return timingSafeEqual(left, right);
}

export function machineKeyOk(request: Request) {
  const expected = process.env.CMS_API_SECRET || '';
  if (!expected) return { ok: false as const, configured: false };
  const provided = request.headers.get('x-cms-key') || '';
  if (!provided) return { ok: false as const, configured: true };
  if (!timingSafeMatch(provided, expected)) return { ok: false as const, configured: true };
  return { ok: true as const, configured: true };
}

/**
 * Human sessions always win over x-cms-key so a logged-in editor cannot
 * escalate by also sending the machine key. Machine key is automation only.
 */
export async function requireCmsAccess(
  request: Request,
  opts?: { permission?: Permission; csrf?: boolean }
) {
  const session = await readUserSession(request);
  if (session) {
    if (opts?.csrf !== false && isMutating(request)) {
      const origin = requireOrigin(request);
      if (!origin.ok) return origin;
      const csrf = requireCsrf(request, session.rawToken);
      if (!csrf.ok) return csrf;
    }
    if (opts?.permission && !hasPermission(session.user, opts.permission)) {
      return { ok: false as const, response: jsonError(403, 'forbidden') };
    }
    return { ok: true as const, actor: session };
  }

  const key = machineKeyOk(request);
  if (key.ok) {
    return {
      ok: true as const,
      actor: { kind: 'machine' as const, label: ACTOR_PHASE2 },
    };
  }
  if (!key.configured) {
    return { ok: false as const, response: jsonError(503, 'cms_secret_not_configured') };
  }
  return { ok: false as const, response: jsonError(401, 'unauthorized') };
}

export function actorUserId(actor: SessionActor) {
  return actor.kind === 'user' ? actor.user.id : null;
}

export function actorLabel(actor: SessionActor) {
  if (actor.kind === 'machine') return actor.label;
  return actor.user.email || actor.user.name;
}

export function sessionPayload(actor: Extract<SessionActor, { kind: 'user' }>) {
  return {
    ok: true,
    user: publicUser(actor.user),
    csrfToken: actor.csrfToken,
  };
}
