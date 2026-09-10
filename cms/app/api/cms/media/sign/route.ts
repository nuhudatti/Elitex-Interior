import { jsonError, jsonOk, logSafe, publicDbError } from '@/lib/api';
import { requireCmsAccess } from '@/lib/auth';
import { readCloudinaryConfig, signCloudinaryParams } from '@/lib/cloudinary';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  const gate = await requireCmsAccess(request, { permission: 'media.write' });
  if (!gate.ok) return gate.response;

  const apiKey = process.env.CLOUDINARY_API_KEY?.trim() || '';
  const apiSecret = process.env.CLOUDINARY_API_SECRET?.trim() || '';
  if (!apiKey || !apiSecret) {
    return jsonError(503, 'cloudinary_signed_upload_not_configured', {
      missing: ['CLOUDINARY_API_KEY', 'CLOUDINARY_API_SECRET'].filter(
        (name) => !process.env[name]?.trim()
      ),
    });
  }

  try {
    const config = await readCloudinaryConfig();
    let folder = config.folder;
    try {
      const body = (await request.json()) as { folder?: string };
      if (body.folder) folder = String(body.folder);
    } catch {
      /* empty body is fine */
    }
    const timestamp = Math.floor(Date.now() / 1000);
    const params: Record<string, string | number> = { timestamp, folder };
    const signature = signCloudinaryParams(params, apiSecret);
    return jsonOk({
      ok: true,
      cloudName: config.cloudName,
      apiKey,
      timestamp,
      signature,
      folder,
    });
  } catch (error) {
    logSafe('POST /api/cms/media/sign', error);
    return jsonError(500, publicDbError(error));
  }
}
