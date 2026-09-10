import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { jsonError, jsonOk, logSafe, publicDbError } from '@/lib/api';
import { actorLabel, requireCmsAccess } from '@/lib/auth';
import { writeAuditStandalone } from '@/lib/audit';
import { parseContent, withTimestamp } from '@/lib/content';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const gate = await requireCmsAccess(request, { permission: 'content.read', csrf: false });
  if (!gate.ok) return gate.response;

  try {
    const draft = await prisma.contentDocument.findUnique({
      where: { key: 'draft' },
      select: { data: true, schemaVersion: true, updatedAt: true },
    });

    if (!draft) {
      return jsonError(404, 'draft_content_not_found');
    }

    const parsed = parseContent(draft.data);
    if (!parsed.ok) {
      return jsonError(500, 'draft_content_invalid');
    }

    return jsonOk({
      ok: true,
      content: parsed.data,
      source: 'neon',
      version: parsed.data.schemaVersion || draft.schemaVersion || 1,
      updatedAt: draft.updatedAt.toISOString(),
    });
  } catch (error) {
    logSafe('GET /api/cms/content/draft', error);
    return jsonError(500, publicDbError(error));
  }
}

export async function PUT(request: Request) {
  const gate = await requireCmsAccess(request, { permission: 'content.write' });
  if (!gate.ok) return gate.response;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return jsonError(400, 'invalid_json');
  }

  const payload =
    body && typeof body === 'object' && !Array.isArray(body) && 'content' in body
      ? (body as { content: unknown }).content
      : body;

  const parsed = parseContent(payload);
  if (!parsed.ok) {
    return jsonError(400, parsed.error);
  }

  const next = withTimestamp(parsed.data);

  try {
    const draft = await prisma.contentDocument.update({
      where: { key: 'draft' },
      data: {
        status: 'draft',
        schemaVersion: next.schemaVersion,
        data: next as Prisma.InputJsonValue,
      },
      select: { id: true, schemaVersion: true, updatedAt: true },
    });

    await writeAuditStandalone(gate.actor, {
      action: 'save_draft',
      entity: 'ContentDocument',
      entityId: draft.id,
      detail: 'Saved the draft. Live content was not changed.',
      metadata: { actor: actorLabel(gate.actor), schemaVersion: draft.schemaVersion },
    });

    return jsonOk({
      ok: true,
      saved: true,
      published: false,
      version: draft.schemaVersion,
      updatedAt: draft.updatedAt.toISOString(),
    });
  } catch (error) {
    logSafe('PUT /api/cms/content/draft', error);
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2025') {
      return jsonError(404, 'draft_content_not_found');
    }
    return jsonError(500, publicDbError(error));
  }
}
