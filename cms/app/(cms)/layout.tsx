import { CmsApp } from '@/components/cms/CmsApp';
import { cmsShellUser } from '@/lib/cms-session';

export const dynamic = 'force-dynamic';

export default async function CmsLayout({ children }: { children: React.ReactNode }) {
  const user = await cmsShellUser();
  return (
    <CmsApp userName={user.name} roleLabel={user.roleLabel} canPublish={user.canPublish} isAdmin={user.isAdmin}>
      {children}
    </CmsApp>
  );
}
