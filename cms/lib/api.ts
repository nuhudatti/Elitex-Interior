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

export function publicCors(response: NextResponse) {
  response.headers.set('Access-Control-Allow-Origin', '*');
  response.headers.set('Access-Control-Allow-Methods', 'GET, OPTIONS');
  response.headers.set('Access-Control-Allow-Headers', 'Content-Type');
  return response;
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
