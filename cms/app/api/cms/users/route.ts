import type { UserRole } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { jsonError, jsonOk, logSafe, publicDbError } from '@/lib/api';
import { actorLabel, requireCmsAccess } from '@/lib/auth';
import { writeAuditStandalone } from '@/lib/audit';
import { assertPasswordPolicy, hashPassword } from '@/lib/password';
import { publicUser, readPublishGrants, toAuthUser, writePublishGrants } from '@/lib/permissions';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const gate = await requireCmsAccess(request, { permission: 'users.manage', csrf: false });
  if (!gate.ok) return gate.response;

  try {
    const [users, grants] = await Promise.all([
      prisma.user.findMany({
        orderBy: { createdAt: 'asc' },
        select: { id: true, email: true, name: true, role: true, createdAt: true, updatedAt: true },
      }),
      readPublishGrants(),
    ]);
    return jsonOk({
      ok: true,
      users: await Promise.all(
        users.map(async (user) => ({
          ...publicUser(await toAuthUser(user, grants)),
          createdAt: user.createdAt.toISOString(),
          updatedAt: user.updatedAt.toISOString(),
        }))
      ),
    });
  } catch (error) {
    logSafe('GET /api/cms/users', error);
    return jsonError(500, publicDbError(error));
  }
}

export async function POST(request: Request) {
  const gate = await requireCmsAccess(request, { permission: 'users.manage' });
  if (!gate.ok) return gate.response;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return jsonError(400, 'invalid_json');
  }

  const input = body && typeof body === 'object' && !Array.isArray(body) ? (body as Record<string, unknown>) : {};
  const email = String(input.email || '')
    .trim()
    .toLowerCase();
  const name = String(input.name || '').trim();
  const password = String(input.password || '');
  const role = String(input.role || 'editor') as UserRole;
  const canPublish = Boolean(input.canPublish);

  if (!email || !name || !password) return jsonError(400, 'email_name_password_required');
  if (role !== 'owner' && role !== 'editor') return jsonError(400, 'invalid_role');
  const policy = assertPasswordPolicy(password);
  if (policy) return jsonError(400, policy);

  try {
    const hashed = await hashPassword(password);
    const user = await prisma.user.create({
      data: {
        email,
        name,
        passwordHash: hashed.hash,
        passwordSalt: hashed.salt,
        role,
      },
      select: { id: true, email: true, name: true, role: true },
    });

    const grants = await readPublishGrants();
    if (role === 'editor' && canPublish && !grants.includes(user.id)) {
      await writePublishGrants([...grants, user.id]);
    }

    await writeAuditStandalone(gate.actor, {
      action: 'create_user',
      entity: 'User',
      entityId: user.id,
      detail: `Created ${role === 'owner' ? 'Administrator' : 'Editor'}`,
      metadata: { actor: actorLabel(gate.actor), email: user.email, canPublish: role === 'owner' || canPublish },
    });

    return jsonOk({ ok: true, user: publicUser(await toAuthUser(user)) }, 201);
  } catch (error) {
    logSafe('POST /api/cms/users', error);
    return jsonError(500, publicDbError(error));
  }
}
