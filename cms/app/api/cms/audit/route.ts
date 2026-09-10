import { prisma } from '@/lib/prisma';
import { jsonError, jsonOk, logSafe, publicDbError } from '@/lib/api';
import { requireCmsAccess } from '@/lib/auth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const gate = await requireCmsAccess(request, { permission: 'audit.read', csrf: false });
  if (!gate.ok) return gate.response;

  try {
    const url = new URL(request.url);
    const take = Math.min(Number(url.searchParams.get('limit') || 100), 300);
    const rows = await prisma.auditLog.findMany({
      orderBy: { createdAt: 'desc' },
      take,
      select: {
        id: true,
        action: true,
        entity: true,
        entityId: true,
        detail: true,
        createdAt: true,
        user: { select: { id: true, email: true, name: true, role: true } },
      },
    });

    return jsonOk({
      ok: true,
      entries: rows.map((row) => ({
        id: row.id,
        action: row.action,
        entity: row.entity,
        entityId: row.entityId,
        detail: row.detail,
        createdAt: row.createdAt.toISOString(),
        user: row.user,
      })),
    });
  } catch (error) {
    logSafe('GET /api/cms/audit', error);
    return jsonError(500, publicDbError(error));
  }
}
