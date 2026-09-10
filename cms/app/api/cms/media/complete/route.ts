import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { jsonError, jsonOk, logSafe, publicDbError } from '@/lib/api';
import { actorLabel, requireCmsAccess } from '@/lib/auth';
import { writeAuditStandalone } from '@/lib/audit';
import { deliveryUrl } from '@/lib/cloudinary';
import { newId } from '@/lib/content-path';
import { parseContent } from '@/lib/content';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  const gate = await requireCmsAccess(request, { permission: 'media.write' });
  if (!gate.ok) return gate.response;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return jsonError(400, 'invalid_json');
  }

  const input = body && typeof body === 'object' && !Array.isArray(body) ? (body as Record<string, unknown>) : {};
  const publicId = String(input.public_id || input.publicId || '').trim();
  const resourceTypeRaw = String(input.resource_type || input.resourceType || 'image');
  const resourceType = resourceTypeRaw === 'video' ? 'video' : 'image';
  const cloudName = String(input.cloudName || process.env.CLOUDINARY_CLOUD_NAME || 'dpdmb5t1l');
  const format = input.format ? String(input.format) : null;
  const url = String(input.secure_url || input.secureUrl || input.url || '').trim();
  const finalUrl = url || (publicId ? deliveryUrl(cloudName, resourceType, publicId, format) : '');

  if (!publicId || !finalUrl) {
    return jsonError(400, 'cloudinary_asset_incomplete');
  }

  try {
    const existing =
      (await prisma.media.findUnique({ where: { url: finalUrl } })) ||
      (publicId ? await prisma.media.findFirst({ where: { publicId, cloudName } }) : null);

    const payload = {
      publicId,
      cloudName,
      resourceType,
      url: finalUrl,
      secureUrl: finalUrl,
      format,
      width: Number(input.width) || null,
      height: Number(input.height) || null,
      bytes: Number(input.bytes) || null,
      folder: input.folder ? String(input.folder) : null,
      originalFilename: input.original_filename ? String(input.original_filename) : String(input.name || '') || null,
      source: 'cloudinary',
    };

    const row = existing
      ? await prisma.media.update({
          where: { id: existing.id },
          data: {
            publicId,
            secureUrl: finalUrl,
            format,
            width: payload.width,
            height: payload.height,
            bytes: payload.bytes,
            folder: payload.folder,
            originalFilename: payload.originalFilename || undefined,
            resourceType,
          },
        })
      : await prisma.media.create({
          data: {
            legacyId: newId('m'),
            ...payload,
          },
        });

    const draft = await prisma.contentDocument.findUnique({ where: { key: 'draft' } });
    if (draft) {
      const parsed = parseContent(draft.data);
      if (parsed.ok) {
        const media = Array.isArray(parsed.data.media) ? [...parsed.data.media] : [];
        const already = media.some((item) => item && typeof item === 'object' && (item as { url?: string }).url === finalUrl);
        if (!already) {
          media.push({
            id: row.legacyId || row.id,
            url: finalUrl,
            name: row.originalFilename || publicId,
            type: resourceType === 'video' ? (/\.(mp3|wav|ogg|m4a)$/i.test(finalUrl) ? 'audio' : 'video') : 'image',
            source: 'cloudinary',
            folder: row.folder || 'elitex',
            addedAt: new Date().toISOString(),
          });
          await prisma.contentDocument.update({
            where: { key: 'draft' },
            data: { data: { ...parsed.data, media } as Prisma.InputJsonValue },
          });
        }
      }
    }

    await writeAuditStandalone(gate.actor, {
      action: 'media_complete',
      entity: 'Media',
      entityId: row.id,
      detail: 'Added to the media library',
      metadata: { actor: actorLabel(gate.actor), publicId, url: finalUrl },
    });

    return jsonOk({
      ok: true,
      saved: true,
      created: !existing,
      published: false,
      media: {
        id: row.id,
        url: row.url,
        publicId: row.publicId,
        resourceType: row.resourceType,
      },
    });
  } catch (error) {
    logSafe('POST /api/cms/media/complete', error);
    return jsonError(500, publicDbError(error));
  }
}
