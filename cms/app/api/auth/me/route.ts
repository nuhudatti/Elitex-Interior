import { jsonError, jsonOk } from '@/lib/api';
import { readUserSession, sessionPayload } from '@/lib/auth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const session = await readUserSession(request);
  if (!session) {
    return jsonError(401, 'unauthorized');
  }
  return jsonOk(sessionPayload(session));
}
