import { prisma } from '@/lib/prisma';
import { jsonError, jsonOk, logSafe, publicDbError } from '@/lib/api';
import { actorLabel, requireCmsAccess } from '@/lib/auth';
import { writeAuditStandalone } from '@/lib/audit';
import { findMediaReferences } from '@/lib/media-refs';
import { parseContent } from '@/lib/content';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

async function destroyCloudinary(publicId: string, resourceType: string, cloudName: string) {
  const apiKey = process.env.CLOUDINARY_API_KEY?.trim();
  const apiSecret = process.env.CLOUDINARY_API_SECRET?.trim();
  if (!apiKey || !apiSecret || !publicId) return { attempted: false, deleted: false };
  const endpoint = `https://api.cloudinary.com/v1_1/${encodeURIComponent(cloudName)}/${resourceType}/destroy`;
  const body = new URLSearchParams({ public_id: publicId, api_key: apiKey });
  const timestamp = Math.floor(Date.now() / 1000);
  const { signCloudinaryParams } = await import('@/lib/cloudinary');
  body.set('timestamp', String(timestamp));
  body.set('signature', signCloudinaryParams({ public_id: publicId, timestamp }, apiSecret));
  const response = await fetch(endpoint, { method: 'POST', body });
  const json = (await response.json().catch(() => ({}))) as { result?: string };
  return { attempted: true, deleted: json.result === 'ok' || json.result === 'not found' };
}

export async function DELETE(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  const gate = await requireCmsAccess(request, { permission: 'media.write' });
  if (!gate.ok) return gate.response;

  const { id } = await context.params;
  const force = new URL(request.url).searchParams.get('force') === '1';

  try {
    const row = await prisma.media.findUnique({ where: { id } });
    if (!row) return jsonError(404, 'media_not_found');

    const published = await prisma.contentDocument.findUnique({ where: { key: 'published' } });
    const parsed = published ? parseContent(published.data) : null;
    const refs = parsed?.ok ? findMediaReferences(parsed.data, row.url) : [];
    const liveRefs = refs.filter((path) => !path.startsWith('media['));

    if (liveRefs.length && !force) {
      return jsonError(409, 'media_referenced_by_published', {
        references: liveRefs.slice(0, 20),
        hint: 'This asset is used on the live site. Pass force=1 only if you accept broken media.',
      });
    }

    const cloud = await destroyCloudinary(row.publicId || '', row.resourceType, row.cloudName);
    await prisma.media.delete({ where: { id } });

    await writeAuditStandalone(gate.actor, {
      action: 'media_delete',
      entity: 'Media',
      entityId: id,
      detail: liveRefs.length ? 'Deleted referenced media with force' : 'Deleted media',
      metadata: {
        actor: actorLabel(gate.actor),
        url: row.url,
        cloudinaryDestroy: cloud,
        references: liveRefs,
      },
    });

    return jsonOk({
      ok: true,
      deleted: true,
      cloudinary: cloud,
      hadPublishedReferences: liveRefs.length > 0,
    });
  } catch (error) {
    logSafe('DELETE /api/cms/media/[id]', error);
    return jsonError(500, publicDbError(error));
  }
}
