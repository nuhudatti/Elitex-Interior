import { prisma } from '@/lib/prisma';
import { jsonError, jsonOk, logSafe, publicDbError } from '@/lib/api';
import { requireCmsAccess } from '@/lib/auth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const gate = await requireCmsAccess(request, { permission: 'media.read', csrf: false });
  if (!gate.ok) return gate.response;

  try {
    const url = new URL(request.url);
    const type = url.searchParams.get('type') || '';
    const q = (url.searchParams.get('q') || '').trim().toLowerCase();

    const rows = await prisma.media.findMany({
      orderBy: { createdAt: 'desc' },
      where: type ? { resourceType: type } : undefined,
    });

    const media = rows
      .filter((row) => {
        if (!q) return true;
        const hay = `${row.originalFilename || ''} ${row.publicId || ''} ${row.folder || ''} ${row.url}`.toLowerCase();
        return hay.includes(q);
      })
      .map((row) => ({
        id: row.id,
        legacyId: row.legacyId,
        publicId: row.publicId,
        cloudName: row.cloudName,
        resourceType: row.resourceType,
        url: row.url,
        secureUrl: row.secureUrl,
        format: row.format,
        width: row.width,
        height: row.height,
        bytes: row.bytes,
        folder: row.folder,
        originalFilename: row.originalFilename,
        source: row.source,
        createdAt: row.createdAt.toISOString(),
        updatedAt: row.updatedAt.toISOString(),
      }));

    return jsonOk({ ok: true, count: media.length, media });
  } catch (error) {
    logSafe('GET /api/cms/media', error);
    return jsonError(500, publicDbError(error));
  }
}
