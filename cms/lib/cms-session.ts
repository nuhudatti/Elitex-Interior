import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { hashToken } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { publicRoleLabel, toAuthUser } from '@/lib/permissions';

export async function getCmsSession() {
  const jar = await cookies();
  const raw = jar.get('elitex_session')?.value;
  if (!raw) return null;
  const session = await prisma.session.findUnique({
    where: { tokenHash: hashToken(raw) },
    include: { user: true },
  });
  if (!session || session.expiresAt.getTime() <= Date.now()) return null;
  return session;
}

export async function requireCmsSession() {
  const session = await getCmsSession();
  if (!session) redirect('/login');
  return session;
}

export async function requireAdministrator() {
  const session = await requireCmsSession();
  if (session.user.role !== 'owner') redirect('/dashboard');
  return session;
}

export async function cmsShellUser() {
  const session = await requireCmsSession();
  const auth = await toAuthUser(session.user);
  return {
    id: session.user.id,
    name: session.user.name,
    email: session.user.email,
    role: session.user.role,
    roleLabel: publicRoleLabel(session.user.role),
    canPublish: auth.canPublish,
    isAdmin: session.user.role === 'owner',
  };
}

export type CmsShellUser = Awaited<ReturnType<typeof cmsShellUser>>;
