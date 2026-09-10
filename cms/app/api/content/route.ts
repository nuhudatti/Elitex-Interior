import { prisma } from '@/lib/prisma';
import { jsonError, jsonOk, logSafe, publicCors, publicDbError } from '@/lib/api';
import { parseContent } from '@/lib/content';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export function OPTIONS(request: Request) {
  return publicCors(jsonOk({ ok: true }), request);
}

/** Public published content only. Never returns the draft document. */
export async function GET(request: Request) {
  try {
    const published = await prisma.contentDocument.findUnique({
      where: { key: 'published' },
      select: { data: true, schemaVersion: true, updatedAt: true },
    });

    if (!published) {
      return publicCors(jsonError(404, 'published_content_not_found'), request);
    }

    const parsed = parseContent(published.data);
    if (!parsed.ok) {
      return publicCors(jsonError(500, 'published_content_invalid'), request);
    }

    return publicCors(
      jsonOk({
        ok: true,
        content: parsed.data,
        source: 'neon',
        document: 'published',
        version: parsed.data.schemaVersion || published.schemaVersion || 1,
        updatedAt: published.updatedAt.toISOString(),
      }),
      request
    );
  } catch (error) {
    logSafe('GET /api/content', error);
    return publicCors(jsonError(500, publicDbError(error)), request);
  }
}
