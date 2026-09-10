import { requireAdministrator } from '@/lib/cms-session';

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  await requireAdministrator();
  return children;
}
