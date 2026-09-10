import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { jsonError, jsonOk, logSafe, publicDbError } from '@/lib/api';
import { actorLabel, requireCmsAccess } from '@/lib/auth';
import { writeAuditStandalone } from '@/lib/audit';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const ALLOWED = new Set(['sessionTimeout', 'previewPage', 'cldCloudName', 'cldFolder', 'cldPreset']);

function settingValue(raw: Prisma.JsonValue) {
  return raw;
}

export async function GET(request: Request) {
  const gate = await requireCmsAccess(request, { permission: 'settings.read', csrf: false });
  if (!gate.ok) return gate.response;

  try {
    const rows = await prisma.siteSetting.findMany();
    const settings: Record<string, unknown> = {};
    for (const row of rows) {
      if (!ALLOWED.has(row.key)) continue;
      settings[row.key] = settingValue(row.value);
    }
    return jsonOk({ ok: true, settings });
  } catch (error) {
    logSafe('GET /api/cms/settings', error);
    return jsonError(500, publicDbError(error));
  }
}

export async function PUT(request: Request) {
  const gate = await requireCmsAccess(request, { permission: 'settings.write' });
  if (!gate.ok) return gate.response;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return jsonError(400, 'invalid_json');
  }

  const input = body && typeof body === 'object' && !Array.isArray(body) ? (body as Record<string, unknown>) : {};
  const entries = Object.entries(input);
  if (!entries.length) return jsonError(400, 'no_settings');

  for (const [key] of entries) {
    if (!ALLOWED.has(key)) return jsonError(400, 'setting_not_allowed');
  }

  try {
    for (const [key, value] of entries) {
      await prisma.siteSetting.upsert({
        where: { key },
        create: { key, value: value as Prisma.InputJsonValue },
        update: { value: value as Prisma.InputJsonValue },
      });
    }

    await writeAuditStandalone(gate.actor, {
      action: 'update_settings',
      entity: 'SiteSetting',
      detail: 'Updated safe site settings',
      metadata: { actor: actorLabel(gate.actor), keys: entries.map(([key]) => key) },
    });

    return jsonOk({ ok: true, saved: true, published: false });
  } catch (error) {
    logSafe('PUT /api/cms/settings', error);
    return jsonError(500, publicDbError(error));
  }
}
