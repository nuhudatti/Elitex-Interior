import { prisma } from '@/lib/prisma';
import { jsonError, jsonOk, logSafe, publicDbError } from '@/lib/api';
import { writeAuditStandalone } from '@/lib/audit';
import { assertPasswordPolicy, hashPassword } from '@/lib/password';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * One-time owner seed. Credentials come from server env only, never from the request body.
 * Refuses to run once any user exists.
 */
export async function POST() {
  const email = String(process.env.CMS_BOOTSTRAP_ADMIN_EMAIL || '')
    .trim()
    .toLowerCase();
  const password = String(process.env.CMS_BOOTSTRAP_ADMIN_PASSWORD || '');

  if (!email || !password) {
    return jsonError(503, 'bootstrap_not_configured');
  }

  const policy = assertPasswordPolicy(password);
  if (policy) return jsonError(400, policy);

  try {
    const existing = await prisma.user.count();
    if (existing > 0) {
      return jsonError(409, 'already_initialized');
    }

    const hashed = await hashPassword(password);
    const user = await prisma.user.create({
      data: {
        email,
        name: 'Administrator',
        passwordHash: hashed.hash,
        passwordSalt: hashed.salt,
        role: 'owner',
      },
      select: { id: true, email: true, role: true },
    });

    await writeAuditStandalone(null, {
      action: 'bootstrap_admin',
      entity: 'User',
      entityId: user.id,
      detail: 'Created first administrator from env',
      metadata: { email: user.email },
    });

    return jsonOk({
      ok: true,
      created: true,
      userId: user.id,
      role: 'Administrator',
    });
  } catch (error) {
    logSafe('POST /api/auth/bootstrap', error);
    return jsonError(500, publicDbError(error));
  }
}
