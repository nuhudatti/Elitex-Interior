import { prisma } from '@/lib/prisma';
import { jsonError, jsonOk, logSafe, publicDbError } from '@/lib/api';
import { requireCmsAccess } from '@/lib/auth';
import { parseContent } from '@/lib/content';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Authenticated draft preview. Never used by GET /api/content. */
export async function GET(request: Request) {
  const gate = await requireCmsAccess(request, { permission: 'content.read', csrf: false });
  if (!gate.ok) return gate.response;

  try {
    const [draft, published] = await Promise.all([
      prisma.contentDocument.findUnique({
        where: { key: 'draft' },
        select: { data: true, updatedAt: true },
      }),
      prisma.contentDocument.findUnique({
        where: { key: 'published' },
        select: { updatedAt: true },
      }),
    ]);

    if (!draft) return jsonError(404, 'draft_content_not_found');
    const parsed = parseContent(draft.data);
    if (!parsed.ok) return jsonError(500, 'draft_content_invalid');

    return jsonOk({
      ok: true,
      content: parsed.data,
      source: 'neon-draft',
      public: false,
      draftUpdatedAt: draft.updatedAt.toISOString(),
      publishedUpdatedAt: published?.updatedAt.toISOString() ?? null,
    });
  } catch (error) {
    logSafe('GET /api/cms/content/preview', error);
    return jsonError(500, publicDbError(error));
  }
}
