'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { cmsFetch } from './api';

const LINKS = [
  { href: '/dashboard', label: 'Dashboard' },
  { href: '/content', label: 'Content' },
  { href: '/preview', label: 'Preview' },
  { href: '/publish', label: 'Publish' },
  { href: '/versions', label: 'Versions' },
  { href: '/media', label: 'Media' },
  { href: '/audit', label: 'Audit', admin: true },
  { href: '/settings', label: 'Settings', admin: true },
  { href: '/users', label: 'Users', admin: true },
];

export function Shell({
  children,
  userName,
  roleLabel,
}: {
  children: React.ReactNode;
  userName: string;
  roleLabel: string;
}) {
  const pathname = usePathname();
  const router = useRouter();

  async function logout() {
    await cmsFetch('/api/auth/logout', { method: 'POST' });
    router.replace('/login');
    router.refresh();
  }

  return (
    <div className="shell">
      <aside className="nav">
        <div className="brand">
          <div className="eyebrow">Elitex Interior</div>
          <h2>CMS</h2>
        </div>
        {LINKS.filter((link) => !link.admin || roleLabel === 'Administrator').map((link) => (
          <Link key={link.href} href={link.href} className={pathname.startsWith(link.href) ? 'active' : ''}>
            {link.label}
          </Link>
        ))}
        <div className="grow" />
        <div className="hint" style={{ padding: '8px 12px' }}>
          {userName}
          <br />
          {roleLabel}
        </div>
        <button className="linkish" type="button" onClick={logout}>
          Sign out
        </button>
      </aside>
      <main className="main">{children}</main>
    </div>
  );
}
