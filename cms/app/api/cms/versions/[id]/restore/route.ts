import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { jsonError, jsonOk, logSafe, publicDbError } from '@/lib/api';
import { actorLabel, requireCmsAccess } from '@/lib/auth';
import { writeAuditStandalone } from '@/lib/audit';
import { parseContent, withTimestamp } from '@/lib/content';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Restore writes DRAFT only. History is kept. Published is unchanged until Publish. */
export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  const gate = await requireCmsAccess(request, { permission: 'versions.restore' });
  if (!gate.ok) return gate.response;

  const { id } = await context.params;

  try {
    const version = await prisma.contentVersion.findUnique({ where: { id } });
    if (!version) return jsonError(404, 'version_not_found');

    const parsed = parseContent(version.data);
    if (!parsed.ok) return jsonError(400, parsed.error);

    const next = withTimestamp(parsed.data);
    const draft = await prisma.contentDocument.update({
      where: { key: 'draft' },
      data: {
        status: 'draft',
        schemaVersion: next.schemaVersion,
        data: next as Prisma.InputJsonValue,
      },
      select: { id: true, updatedAt: true, schemaVersion: true },
    });

    await writeAuditStandalone(gate.actor, {
      action: 'restore_version',
      entity: 'ContentVersion',
      entityId: version.id,
      detail: 'Restored version into draft (published unchanged)',
      metadata: {
        actor: actorLabel(gate.actor),
        versionId: version.id,
        published: false,
      },
    });

    return jsonOk({
      ok: true,
      restored: true,
      published: false,
      versionId: version.id,
      draftUpdatedAt: draft.updatedAt.toISOString(),
    });
  } catch (error) {
    logSafe('POST /api/cms/versions/[id]/restore', error);
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2025') {
      return jsonError(404, 'draft_content_not_found');
    }
    return jsonError(500, publicDbError(error));
  }
}
