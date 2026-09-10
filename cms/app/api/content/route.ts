import { prisma } from '@/lib/prisma';
import { jsonError, jsonOk, logSafe, publicCors, publicDbError } from '@/lib/api';
import { parseContent } from '@/lib/content';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export function OPTIONS() {
  return publicCors(jsonOk({ ok: true }));
}

export async function GET() {
  try {
    const published = await prisma.contentDocument.findUnique({
      where: { key: 'published' },
      select: { data: true, schemaVersion: true, updatedAt: true },
    });

    if (!published) {
      return publicCors(jsonError(404, 'published_content_not_found'));
    }

    const parsed = parseContent(published.data);
    if (!parsed.ok) {
      return publicCors(jsonError(500, 'published_content_invalid'));
    }

    return publicCors(
      jsonOk({
        ok: true,
        content: parsed.data,
        source: 'neon',
        version: parsed.data.schemaVersion || published.schemaVersion || 1,
        updatedAt: published.updatedAt.toISOString(),
      })
    );
  } catch (error) {
    logSafe('GET /api/content', error);
    return publicCors(jsonError(500, publicDbError(error)));
  }
}
