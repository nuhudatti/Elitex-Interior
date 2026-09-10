import { jsonError, jsonOk, logSafe, publicDbError } from '@/lib/api';
import { requireCmsAccess } from '@/lib/auth';
import { readCloudinaryConfig } from '@/lib/cloudinary';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const gate = await requireCmsAccess(request, { permission: 'media.read', csrf: false });
  if (!gate.ok) return gate.response;

  try {
    const config = await readCloudinaryConfig();
    return jsonOk({
      ok: true,
      ...config,
    });
  } catch (error) {
    logSafe('GET /api/cms/media/upload-config', error);
    return jsonError(500, publicDbError(error));
  }
}
