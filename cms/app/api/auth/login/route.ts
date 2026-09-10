import { prisma } from '@/lib/prisma';
import { jsonError, jsonOk, logSafe, publicDbError } from '@/lib/api';
import {
  applyAuthCookies,
  createSession,
  requireOrigin,
  sessionPayload,
} from '@/lib/auth';
import { writeAuditStandalone } from '@/lib/audit';
import { verifyPassword } from '@/lib/password';
import { toAuthUser } from '@/lib/permissions';
import { clientKey, rateLimit } from '@/lib/rate-limit';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  const origin = requireOrigin(request);
  if (!origin.ok) return origin.response;

  const limited = rateLimit(`login:${clientKey(request)}`, 8, 15 * 60 * 1000);
  if (!limited.ok) {
    return jsonError(429, 'too_many_attempts');
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return jsonError(400, 'invalid_json');
  }

  const email =
    body && typeof body === 'object' && !Array.isArray(body)
      ? String((body as { email?: unknown }).email || '')
          .trim()
          .toLowerCase()
      : '';
  const password =
    body && typeof body === 'object' && !Array.isArray(body)
      ? String((body as { password?: unknown }).password || '')
      : '';

  if (!email || !password) {
    return jsonError(400, 'email_and_password_required');
  }

  try {
    const user = await prisma.user.findFirst({
      where: { email },
    });

    const valid =
      user &&
      user.passwordSalt &&
      (await verifyPassword(password, user.passwordHash, user.passwordSalt));

    if (!user || !valid) {
      await writeAuditStandalone(null, {
        action: 'login_failed',
        entity: 'User',
        detail: 'Invalid login attempt',
        metadata: { email },
      });
      return jsonError(401, 'invalid_credentials');
    }

    const created = await createSession(user.id);
    const actor = {
      kind: 'user' as const,
      user: await toAuthUser(user),
      sessionId: created.session.id,
      rawToken: created.rawToken,
      csrfToken: created.csrfToken,
    };

    await writeAuditStandalone(actor, {
      action: 'login',
      entity: 'Session',
      entityId: created.session.id,
      detail: 'Signed in',
    });

    const response = jsonOk(sessionPayload(actor));
    applyAuthCookies(response, request, created.rawToken);
    return response;
  } catch (error) {
    logSafe('POST /api/auth/login', error);
    return jsonError(500, publicDbError(error));
  }
}
