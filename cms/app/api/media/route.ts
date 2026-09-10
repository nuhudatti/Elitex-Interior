import { prisma } from '@/lib/prisma';
import { jsonError, jsonOk, logSafe, publicCors, publicDbError } from '@/lib/api';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export function OPTIONS(request: Request) {
  return publicCors(jsonOk({ ok: true }), request);
}

export async function GET(request: Request) {
  try {
    const rows = await prisma.media.findMany({
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        legacyId: true,
        publicId: true,
        cloudName: true,
        resourceType: true,
        url: true,
        secureUrl: true,
        format: true,
        width: true,
        height: true,
        bytes: true,
        folder: true,
        originalFilename: true,
        source: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    return publicCors(
      jsonOk({
        ok: true,
        count: rows.length,
        media: rows.map((row) => ({
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
        })),
      }),
      request
    );
  } catch (error) {
    logSafe('GET /api/media', error);
    return publicCors(jsonError(500, publicDbError(error)), request);
  }
}
