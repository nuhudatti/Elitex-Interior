import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { Shell } from '@/components/cms/Shell';
import { hashToken } from '@/lib/auth';
import { publicRoleLabel } from '@/lib/permissions';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

export default async function CmsLayout({ children }: { children: React.ReactNode }) {
  const jar = await cookies();
  const raw = jar.get('elitex_session')?.value;
  if (!raw) redirect('/login');

  const session = await prisma.session.findUnique({
    where: { tokenHash: hashToken(raw) },
    include: { user: true },
  });
  if (!session || session.expiresAt.getTime() <= Date.now()) redirect('/login');

  return (
    <Shell userName={session.user.name} roleLabel={publicRoleLabel(session.user.role)}>
      {children}
    </Shell>
  );
}
