import { prisma } from '@/lib/prisma';
import { jsonError, jsonOk, logSafe, publicDbError } from '@/lib/api';
import { requireCmsAccess } from '@/lib/auth';
import { parseContent } from '@/lib/content';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  const gate = await requireCmsAccess(request, { permission: 'versions.read', csrf: false });
  if (!gate.ok) return gate.response;

  const { id } = await context.params;
  try {
    const row = await prisma.contentVersion.findUnique({
      where: { id },
      select: {
        id: true,
        label: true,
        data: true,
        createdAt: true,
        createdBy: { select: { id: true, email: true, name: true } },
      },
    });
    if (!row) return jsonError(404, 'version_not_found');
    const parsed = parseContent(row.data);
    if (!parsed.ok) return jsonError(500, 'version_content_invalid');

    return jsonOk({
      ok: true,
      version: {
        id: row.id,
        label: row.label,
        createdAt: row.createdAt.toISOString(),
        createdBy: row.createdBy,
        summary: {
          siteName: (parsed.data.site as { name?: string } | undefined)?.name || 'Elitex Interior',
          pages: Object.keys(parsed.data.pages || {}),
        },
      },
    });
  } catch (error) {
    logSafe('GET /api/cms/versions/[id]', error);
    return jsonError(500, publicDbError(error));
  }
}
