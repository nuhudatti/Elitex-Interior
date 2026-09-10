import { prisma } from '@/lib/prisma';
import { jsonError, jsonOk, logSafe, publicDbError } from '@/lib/api';
import { requireCmsAccess } from '@/lib/auth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const gate = await requireCmsAccess(request, { permission: 'versions.read', csrf: false });
  if (!gate.ok) return gate.response;

  try {
    const url = new URL(request.url);
    const take = Math.min(Number(url.searchParams.get('limit') || 50), 100);
    const rows = await prisma.contentVersion.findMany({
      orderBy: { createdAt: 'desc' },
      take,
      select: {
        id: true,
        label: true,
        createdAt: true,
        documentId: true,
        createdBy: { select: { id: true, email: true, name: true, role: true } },
      },
    });

    return jsonOk({
      ok: true,
      versions: rows.map((row) => ({
        id: row.id,
        label: row.label,
        createdAt: row.createdAt.toISOString(),
        documentId: row.documentId,
        createdBy: row.createdBy,
      })),
    });
  } catch (error) {
    logSafe('GET /api/cms/versions', error);
    return jsonError(500, publicDbError(error));
  }
}
