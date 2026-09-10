import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { jsonError, jsonOk, logSafe, publicDbError } from '@/lib/api';
import { actorLabel, actorUserId, requireCmsAccess } from '@/lib/auth';
import { writeAudit } from '@/lib/audit';
import { parseContent, withTimestamp } from '@/lib/content';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  const gate = await requireCmsAccess(request, { permission: 'content.publish' });
  if (!gate.ok) return gate.response;

  try {
    const draft = await prisma.contentDocument.findUnique({
      where: { key: 'draft' },
    });

    if (!draft) {
      return jsonError(404, 'draft_content_not_found');
    }

    const parsed = parseContent(draft.data);
    if (!parsed.ok) {
      return jsonError(400, parsed.error);
    }

    const next = withTimestamp(parsed.data);
    const actor = actorLabel(gate.actor);

    const result = await prisma.$transaction(async (tx) => {
      const published = await tx.contentDocument.upsert({
        where: { key: 'published' },
        create: {
          key: 'published',
          status: 'published',
          schemaVersion: next.schemaVersion,
          data: next as Prisma.InputJsonValue,
        },
        update: {
          status: 'published',
          schemaVersion: next.schemaVersion,
          data: next as Prisma.InputJsonValue,
        },
      });

      const version = await tx.contentVersion.create({
        data: {
          documentId: published.id,
          label: 'Published',
          data: next as Prisma.InputJsonValue,
          createdById: actorUserId(gate.actor),
        },
        select: { id: true, createdAt: true },
      });

      const audit = await writeAudit(tx, gate.actor, {
        action: 'publish',
        entity: 'ContentDocument',
        entityId: published.id,
        detail: 'Published draft to published ContentDocument',
        metadata: {
          actor,
          versionId: version.id,
          schemaVersion: next.schemaVersion,
        },
      });

      return { published, version, audit };
    });

    return jsonOk({
      ok: true,
      published: true,
      version: result.published.schemaVersion,
      publishedId: result.published.id,
      versionId: result.version.id,
      auditId: result.audit.id,
      actor,
      updatedAt: result.published.updatedAt.toISOString(),
    });
  } catch (error) {
    logSafe('POST /api/cms/content/publish', error);
    return jsonError(500, publicDbError(error));
  }
}
