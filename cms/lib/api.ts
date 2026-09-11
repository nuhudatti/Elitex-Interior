import { NextResponse } from 'next/server';

export const ACTOR_PHASE2 = 'system/phase-2';

export function jsonOk(body: Record<string, unknown>, status = 200) {
  return NextResponse.json(body, {
    status,
    headers: { 'Cache-Control': 'no-store' },
  });
}

export function jsonError(status: number, error: string, extra?: Record<string, unknown>) {
  return NextResponse.json(
    { ok: false, error, ...extra },
    { status, headers: { 'Cache-Control': 'no-store' } }
  );
}

const PUBLIC_SITE_ORIGINS = new Set([
  'https://elitexinterior.com',
  'https://www.elitexinterior.com',
]);

function extraPublicSiteOrigins() {
  const raw = process.env.CMS_PUBLIC_SITE_ORIGINS || '';
  return raw
    .split(',')
    .map((item) => item.trim().replace(/\/$/, ''))
    .filter(Boolean);
}

export function isPublicSiteOrigin(origin: string) {
  if (!origin) return false;
  if (PUBLIC_SITE_ORIGINS.has(origin)) return true;
  if (/^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin)) return true;
  return extraPublicSiteOrigins().includes(origin);
}

function applyPublicCors(response: NextResponse, request: Request | undefined, methods: string) {
  const origin = request?.headers.get('origin') || '';
  if (origin && isPublicSiteOrigin(origin)) {
    response.headers.set('Access-Control-Allow-Origin', origin);
    response.headers.set('Vary', 'Origin');
  }
  response.headers.set('Access-Control-Allow-Methods', methods);
  response.headers.set('Access-Control-Allow-Headers', 'Content-Type');
  response.headers.set('Access-Control-Max-Age', '86400');
  return response;
}

/** CORS for public GET APIs only. Reflects allowed browser origins; never used for credentialed CMS routes. */
export function publicCors(response: NextResponse, request?: Request) {
  return applyPublicCors(response, request, 'GET, OPTIONS');
}

/** CORS for public read/write APIs such as client reviews. */
export function publicWriteCors(response: NextResponse, request?: Request) {
  return applyPublicCors(response, request, 'GET, POST, OPTIONS');
}

export function publicDbError(error: unknown): string {
  if (!(error instanceof Error)) return 'database_unreachable';
  const message = error.message.toLowerCase();
  if (message.includes('environment variable not found')) return 'missing_database_url';
  if (message.includes("can't reach") || message.includes('p1001')) return 'host_unreachable';
  if (message.includes('authentication') || message.includes('p1000')) return 'auth_failed';
  if (message.includes('does not exist') || message.includes('p2021')) return 'schema_missing';
  return 'database_unreachable';
}

export function logSafe(scope: string, error: unknown) {
  const name = error instanceof Error ? error.name : 'Error';
  console.error(`[${scope}] ${name}`);
}
