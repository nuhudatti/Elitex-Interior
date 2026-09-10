import { jsonOk } from '@/lib/api';
import {
  clearAuthCookies,
  destroySessionByToken,
  readCookie,
  readUserSession,
  requireOrigin,
  SESSION_COOKIE,
} from '@/lib/auth';
import { writeAuditStandalone } from '@/lib/audit';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  const origin = requireOrigin(request);
  if (!origin.ok) return origin.response;

  const session = await readUserSession(request);
  const raw = readCookie(request, SESSION_COOKIE);
  if (raw) await destroySessionByToken(raw);

  if (session) {
    await writeAuditStandalone(session, {
      action: 'logout',
      entity: 'Session',
      entityId: session.sessionId,
      detail: 'Signed out',
    });
  }

  const response = jsonOk({ ok: true, loggedOut: true });
  clearAuthCookies(response, request);
  return response;
}
