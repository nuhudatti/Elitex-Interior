import { timingSafeEqual } from 'node:crypto';
import { jsonError } from '@/lib/api';

export function requireCmsKey(request: Request) {
  const expected = process.env.CMS_API_SECRET || '';
  if (!expected) {
    return { ok: false as const, response: jsonError(503, 'cms_secret_not_configured') };
  }

  const provided = request.headers.get('x-cms-key') || '';
  const left = Buffer.from(provided);
  const right = Buffer.from(expected);
  if (left.length !== right.length || !timingSafeEqual(left, right)) {
    return { ok: false as const, response: jsonError(401, 'unauthorized') };
  }

  return { ok: true as const };
}
