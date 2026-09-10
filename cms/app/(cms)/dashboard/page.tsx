import { DashboardClient } from '@/components/cms/DashboardClient';
import { prisma } from '@/lib/prisma';
import { requireCmsSession } from '@/lib/cms-session';

export const dynamic = 'force-dynamic';

export default async function DashboardPage() {
  const session = await requireCmsSession();
  const isAdmin = session.user.role === 'owner';
  const [mediaCount, versionCount, userCount, recent] = await Promise.all([
    prisma.media.count(),
    prisma.contentVersion.count(),
    prisma.user.count(),
    isAdmin
      ? prisma.auditLog.findMany({
          orderBy: { createdAt: 'desc' },
          take: 8,
          select: {
            id: true,
            action: true,
            detail: true,
            createdAt: true,
            user: { select: { name: true, email: true } },
          },
        })
      : Promise.resolve(
          [] as Array<{
            id: string;
            action: string;
            detail: string | null;
            createdAt: Date;
            user: { name: string; email: string | null } | null;
          }>
        ),
  ]);

  return (
    <DashboardClient
      mediaCount={mediaCount}
      versionCount={versionCount}
      userCount={userCount}
      isAdmin={isAdmin}
      recent={recent.map((row) => ({
        id: row.id,
        action: row.action,
        detail: row.detail,
        createdAt: row.createdAt.toISOString(),
        who: row.user?.name || row.user?.email || 'system',
      }))}
    />
  );
}
