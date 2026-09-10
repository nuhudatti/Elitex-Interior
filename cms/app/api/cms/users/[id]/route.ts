import type { UserRole } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { jsonError, jsonOk, logSafe, publicDbError } from '@/lib/api';
import { actorLabel, destroyUserSessions, requireCmsAccess } from '@/lib/auth';
import { writeAuditStandalone } from '@/lib/audit';
import { assertPasswordPolicy, hashPassword } from '@/lib/password';
import { publicUser, readPublishGrants, toAuthUser, writePublishGrants } from '@/lib/permissions';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  const gate = await requireCmsAccess(request, { permission: 'users.manage' });
  if (!gate.ok) return gate.response;

  const { id } = await context.params;
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return jsonError(400, 'invalid_json');
  }

  const input = body && typeof body === 'object' && !Array.isArray(body) ? (body as Record<string, unknown>) : {};

  try {
    const existing = await prisma.user.findUnique({ where: { id } });
    if (!existing) return jsonError(404, 'user_not_found');

    const data: {
      name?: string;
      email?: string;
      role?: UserRole;
      passwordHash?: string;
      passwordSalt?: string;
    } = {};

    if (typeof input.name === 'string' && input.name.trim()) data.name = input.name.trim();
    if (typeof input.email === 'string' && input.email.trim()) {
      data.email = input.email.trim().toLowerCase();
    }
    if (input.role === 'owner' || input.role === 'editor') data.role = input.role;

    if (typeof input.password === 'string' && input.password) {
      const policy = assertPasswordPolicy(input.password);
      if (policy) return jsonError(400, policy);
      const hashed = await hashPassword(input.password);
      data.passwordHash = hashed.hash;
      data.passwordSalt = hashed.salt;
    }

    const user = await prisma.user.update({
      where: { id },
      data,
      select: { id: true, email: true, name: true, role: true },
    });

    if (typeof input.canPublish === 'boolean' && user.role === 'editor') {
      const grants = await readPublishGrants();
      const next = input.canPublish ? [...grants, user.id] : grants.filter((item) => item !== user.id);
      await writePublishGrants(next);
    }

    if (data.passwordHash) {
      await destroyUserSessions(id);
    }

    await writeAuditStandalone(gate.actor, {
      action: 'update_user',
      entity: 'User',
      entityId: user.id,
      detail: 'Updated user',
      metadata: { actor: actorLabel(gate.actor), passwordRotated: Boolean(data.passwordHash) },
    });

    return jsonOk({ ok: true, user: publicUser(await toAuthUser(user)) });
  } catch (error) {
    logSafe('PATCH /api/cms/users/[id]', error);
    return jsonError(500, publicDbError(error));
  }
}

export async function DELETE(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  const gate = await requireCmsAccess(request, { permission: 'users.manage' });
  if (!gate.ok) return gate.response;

  const { id } = await context.params;
  if (gate.actor.kind === 'user' && gate.actor.user.id === id) {
    return jsonError(400, 'cannot_delete_self');
  }

  try {
    const owners = await prisma.user.count({ where: { role: 'owner' } });
    const target = await prisma.user.findUnique({ where: { id } });
    if (!target) return jsonError(404, 'user_not_found');
    if (target.role === 'owner' && owners <= 1) {
      return jsonError(400, 'cannot_delete_last_administrator');
    }

    await prisma.user.delete({ where: { id } });
    const grants = await readPublishGrants();
    if (grants.includes(id)) await writePublishGrants(grants.filter((item) => item !== id));

    await writeAuditStandalone(gate.actor, {
      action: 'delete_user',
      entity: 'User',
      entityId: id,
      detail: 'Deleted user',
      metadata: { actor: actorLabel(gate.actor), email: target.email },
    });

    return jsonOk({ ok: true, deleted: true });
  } catch (error) {
    logSafe('DELETE /api/cms/users/[id]', error);
    return jsonError(500, publicDbError(error));
  }
}
