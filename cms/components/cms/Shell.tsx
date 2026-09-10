'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';
import { cmsFetch } from './api';
import { ConfirmDialog } from './ConfirmDialog';
import { useDraft } from './DraftProvider';
import { formatWhen } from '@/lib/format';

type NavItem = { href: string; label: string; admin?: boolean; publish?: boolean };

const GROUPS: Array<{ label: string; items: NavItem[] }> = [
  { label: '', items: [{ href: '/dashboard', label: 'Dashboard' }] },
  {
    label: 'Content',
    items: [
      { href: '/content/home', label: 'Home' },
      { href: '/content/projects', label: 'Projects' },
      { href: '/content/reviews', label: 'Reviews' },
      { href: '/content/showcase', label: 'Showcase' },
      { href: '/content/showcase2', label: 'Showcase 2' },
      { href: '/content/site', label: 'Site' },
      { href: '/content/seo', label: 'SEO' },
    ],
  },
  { label: 'Media', items: [{ href: '/media', label: 'Media Library' }] },
  {
    label: 'Workflow',
    items: [
      { href: '/preview', label: 'Preview' },
      { href: '/versions', label: 'Versions' },
      { href: '/publish', label: 'Publish', publish: true },
    ],
  },
  {
    label: 'System',
    items: [
      { href: '/audit', label: 'Audit', admin: true },
      { href: '/users', label: 'Users', admin: true },
      { href: '/settings', label: 'Settings', admin: true },
    ],
  },
];

const TITLES: Record<string, { title: string; lede: string }> = {
  '/dashboard': { title: 'Dashboard', lede: 'The current state of the Elitex Interior website.' },
  '/content': { title: 'Content', lede: 'Choose what to edit.' },
  '/content/home': { title: 'Home', lede: 'The homepage on elitexinterior.com.' },
  '/content/projects': { title: 'Projects', lede: 'Project stories shown in gallery modals.' },
  '/content/reviews': { title: 'Reviews', lede: 'Client experiences on reviews.html.' },
  '/content/showcase': { title: 'Showcase', lede: 'Gallery on project.html.' },
  '/content/showcase2': { title: 'Showcase 2', lede: 'Gallery on project2.html.' },
  '/content/site': { title: 'Site', lede: 'Name, contact, and shared details.' },
  '/content/seo': { title: 'SEO', lede: 'Titles, descriptions, and share cards.' },
  '/media': { title: 'Media Library', lede: 'Photos and videos already on Cloudinary.' },
  '/preview': { title: 'Preview', lede: 'Draft only — this is not the live website.' },
  '/publish': { title: 'Publish', lede: 'Copy the saved draft to the live content source.' },
  '/versions': { title: 'Versions', lede: 'Every published snapshot is kept.' },
  '/audit': { title: 'Audit', lede: 'Who changed what, and when.' },
  '/users': { title: 'Users', lede: 'Administrators and editors.' },
  '/settings': { title: 'Settings', lede: 'Session and upload preferences. Secrets stay on the server.' },
};

export function Shell({
  children,
  userName,
  roleLabel,
  canPublish,
  isAdmin,
}: {
  children: React.ReactNode;
  userName: string;
  roleLabel: string;
  canPublish: boolean;
  isAdmin: boolean;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const { dirty, saving, saveDraft, unpublished, changedSections, draftUpdatedAt, message } = useDraft();
  const [collapsed, setCollapsed] = useState(false);
  const [navOpen, setNavOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [pendingHref, setPendingHref] = useState<string | null>(null);

  useEffect(() => {
    setCollapsed(window.localStorage.getItem('elitex_cms_nav_collapsed') === '1');
  }, []);

  useEffect(() => {
    setNavOpen(false);
    setMenuOpen(false);
  }, [pathname]);

  const meta = useMemo(() => {
    const exact = TITLES[pathname];
    if (exact) return exact;
    const found = Object.entries(TITLES).find(([href]) => href !== '/' && pathname.startsWith(href));
    return found?.[1] || { title: 'CMS', lede: '' };
  }, [pathname]);

  function toggleCollapsed() {
    const next = !collapsed;
    setCollapsed(next);
    window.localStorage.setItem('elitex_cms_nav_collapsed', next ? '1' : '0');
  }

  function go(href: string) {
    if (dirty && href !== pathname) {
      setPendingHref(href);
      return;
    }
    router.push(href);
  }

  async function logout() {
    await cmsFetch('/api/auth/logout', { method: 'POST' });
    router.replace('/login');
    router.refresh();
  }

  const status = dirty
    ? { cls: 'unsaved', text: 'Unsaved changes' }
    : unpublished
      ? { cls: 'unsaved', text: `${changedSections.length} section${changedSections.length === 1 ? '' : 's'} waiting to publish` }
      : { cls: 'saved', text: message || `Saved ${formatWhen(draftUpdatedAt)}` };

  return (
    <div className={`shell${collapsed ? ' collapsed' : ''}${navOpen ? ' nav-open' : ''}`}>
      <a className="skip-link" href="#main">
        Skip to content
      </a>
      <button className="scrim" type="button" aria-label="Close menu" onClick={() => setNavOpen(false)} />
      <aside className="sidebar" aria-label="CMS">
        <div className="brand">
          <div className="wordmark">
            <div className="eyebrow">Elitex Interior</div>
            <h2>CMS</h2>
          </div>
          <button className="icon-btn collapse-toggle" type="button" onClick={toggleCollapsed} aria-label={collapsed ? 'Expand menu' : 'Collapse menu'}>
            {collapsed ? '›' : '‹'}
          </button>
        </div>
        {GROUPS.map((group) => {
          const items = group.items.filter((item) => {
            if (item.admin && !isAdmin) return false;
            if (item.publish && !canPublish) return false;
            return true;
          });
          if (!items.length) return null;
          return (
            <div className="nav-group" key={group.label || 'root'}>
              {group.label ? <div className="nav-group-label">{group.label}</div> : null}
              {items.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  className={pathname === item.href || pathname.startsWith(`${item.href}/`) ? 'active' : ''}
                  onClick={(event) => {
                    if (!dirty) return;
                    event.preventDefault();
                    go(item.href);
                  }}
                >
                  <span className="nav-text">{item.label}</span>
                </Link>
              ))}
            </div>
          );
        })}
        <div className="grow" />
        <div className="sidebar-user">
          <strong>{userName}</strong>
          <br />
          <span>{roleLabel}</span>
        </div>
      </aside>
      <div className="workspace">
        <header className="topbar">
          <div className="row">
            <button className="icon-btn menu-toggle" type="button" aria-label="Open menu" onClick={() => setNavOpen(true)}>
              Menu
            </button>
            <div>
              <h1>{meta.title}</h1>
              {meta.lede ? <p className="lede">{meta.lede}</p> : null}
            </div>
          </div>
          <div className="row">
            <span className={`status-pill ${status.cls}`}>{status.text}</span>
            <button className="btn" type="button" disabled={!dirty || saving} onClick={() => saveDraft()}>
              {saving ? 'Saving…' : 'Save draft'}
            </button>
            <div className="user-menu">
              <button className="btn btn-ghost" type="button" onClick={() => setMenuOpen((open) => !open)} aria-expanded={menuOpen}>
                {userName}
              </button>
              {menuOpen ? (
                <div className="menu">
                  <div className="hint" style={{ padding: '6px 8px' }}>
                    {roleLabel}
                  </div>
                  <button className="nav-link btn-ghost" type="button" onClick={logout} style={{ width: '100%' }}>
                    Sign out
                  </button>
                </div>
              ) : null}
            </div>
          </div>
        </header>
        <main className="main" id="main">
          {children}
        </main>
      </div>
      {pendingHref ? (
        <ConfirmDialog
          title="Unsaved changes"
          body="You have edits that have not been saved to the draft. Leave without saving, or stay and save first."
          confirmLabel="Leave without saving"
          danger
          onCancel={() => setPendingHref(null)}
          onConfirm={() => {
            const href = pendingHref;
            setPendingHref(null);
            router.push(href);
          }}
        />
      ) : null}
    </div>
  );
}
