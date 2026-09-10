import { prisma } from '@/lib/prisma';
import { jsonError, jsonOk } from '@/lib/api';
import { readUserSession, requireCsrf, requireOrigin } from '@/lib/auth';
import { writeAuditStandalone } from '@/lib/audit';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Marks the current session expired without clearing the cookie (next request is 401). */
export async function POST(request: Request) {
  const origin = requireOrigin(request);
  if (!origin.ok) return origin.response;

  const session = await readUserSession(request);
  if (!session) return jsonError(401, 'unauthorized');
  const csrf = requireCsrf(request, session.rawToken);
  if (!csrf.ok) return csrf.response;

  await prisma.session.update({
    where: { id: session.sessionId },
    data: { expiresAt: new Date(Date.now() - 1000) },
  });

  await writeAuditStandalone(session, {
    action: 'session_expired',
    entity: 'Session',
    entityId: session.sessionId,
    detail: 'Session marked expired',
  });

  return jsonOk({ ok: true, expired: true });
}
