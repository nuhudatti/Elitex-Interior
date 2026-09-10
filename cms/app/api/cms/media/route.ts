import { prisma } from '@/lib/prisma';
import { jsonError, jsonOk, logSafe, publicDbError } from '@/lib/api';
import { requireCmsAccess } from '@/lib/auth';
import type { Prisma } from '@prisma/client';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function mapRow(row: {
  id: string;
  legacyId: string | null;
  publicId: string | null;
  cloudName: string;
  resourceType: string;
  url: string;
  secureUrl: string | null;
  format: string | null;
  width: number | null;
  height: number | null;
  bytes: number | null;
  folder: string | null;
  originalFilename: string | null;
  source: string;
  createdAt: Date;
  updatedAt: Date;
}) {
  return {
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
  };
}

export async function GET(request: Request) {
  const gate = await requireCmsAccess(request, { permission: 'media.read', csrf: false });
  if (!gate.ok) return gate.response;

  try {
    const url = new URL(request.url);
    const type = url.searchParams.get('type') || '';
    const q = (url.searchParams.get('q') || '').trim();
    const sort = url.searchParams.get('sort') || 'newest';
    const limit = Math.min(Math.max(Number(url.searchParams.get('limit') || 48), 1), 200);
    const offset = Math.max(Number(url.searchParams.get('offset') || 0), 0);

    const where: Prisma.MediaWhereInput = {};
    if (type === 'image' || type === 'video') where.resourceType = type;
    if (q) {
      where.OR = [
        { originalFilename: { contains: q, mode: 'insensitive' } },
        { publicId: { contains: q, mode: 'insensitive' } },
        { folder: { contains: q, mode: 'insensitive' } },
      ];
    }

    const orderBy: Prisma.MediaOrderByWithRelationInput[] =
      sort === 'oldest'
        ? [{ createdAt: 'asc' }]
        : sort === 'name'
          ? [{ originalFilename: { sort: 'asc', nulls: 'last' } }, { createdAt: 'desc' }]
          : [{ createdAt: 'desc' }];

    const [total, rows] = await Promise.all([
      prisma.media.count({ where }),
      prisma.media.findMany({ where, orderBy, skip: offset, take: limit }),
    ]);

    return jsonOk({
      ok: true,
      count: total,
      total,
      limit,
      offset,
      hasMore: offset + rows.length < total,
      media: rows.map(mapRow),
    });
  } catch (error) {
    logSafe('GET /api/cms/media', error);
    return jsonError(500, publicDbError(error));
  }
}
