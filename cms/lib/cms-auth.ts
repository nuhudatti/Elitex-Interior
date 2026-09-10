import { jsonError } from '@/lib/api';
import { machineKeyOk, requireCmsAccess } from '@/lib/auth';
import type { Permission } from '@/lib/permissions';

/** Machine-key helper kept for scripts. Human CMS writes must use requireCmsAccess. */
export function requireCmsKey(request: Request) {
  const key = machineKeyOk(request);
  if (key.ok) return { ok: true as const };
  if (!key.configured) {
    return { ok: false as const, response: jsonError(503, 'cms_secret_not_configured') };
  }
  return { ok: false as const, response: jsonError(401, 'unauthorized') };
}

export function requireWriteAccess(request: Request, permission: Permission) {
  return requireCmsAccess(request, { permission, csrf: true });
}
