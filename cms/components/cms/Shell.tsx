'use client';

import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useMemo, useRef, useState } from 'react';
import { cmsFetch } from './api';
import { ConfirmDialog } from './ConfirmDialog';
import { useDraft } from './DraftProvider';
import { CmsLink, useUnsavedNav } from './UnsavedNav';
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
  '/publish': { title: 'Publish', lede: 'Copy the saved draft to the live website content.' },
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
  const { go } = useUnsavedNav();
  const { dirty, saving, saveDraft, unpublished, changedSections, draftUpdatedAt, message, error } = useDraft();
  const [collapsed, setCollapsed] = useState(false);
  const [navOpen, setNavOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [logoutConfirm, setLogoutConfirm] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setCollapsed(window.localStorage.getItem('elitex_cms_nav_collapsed') === '1');
  }, []);

  useEffect(() => {
    setNavOpen(false);
    setMenuOpen(false);
  }, [pathname]);

  useEffect(() => {
    if (!menuOpen) return;
    function onDoc(event: MouseEvent) {
      if (menuRef.current && event.target instanceof Node && !menuRef.current.contains(event.target)) {
        setMenuOpen(false);
      }
    }
    function onKey(event: KeyboardEvent) {
      if (event.key === 'Escape') setMenuOpen(false);
    }
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDoc);
      document.removeEventListener('keydown', onKey);
    };
  }, [menuOpen]);

  const meta = useMemo(() => {
    const exact = TITLES[pathname];
    if (exact) return exact;
    const found = Object.entries(TITLES).find(([href]) => href !== '/' && pathname.startsWith(href));
    return found?.[1] || { title: 'CMS', lede: '' };
  }, [pathname]);

  const crumbs = useMemo(() => {
    const items: Array<{ href?: string; label: string }> = [{ href: '/dashboard', label: 'CMS' }];
    if (pathname.startsWith('/content') && pathname !== '/content') {
      items.push({ href: '/content', label: 'Content' });
    }
    if (pathname !== '/dashboard') items.push({ label: meta.title });
    return items;
  }, [meta.title, pathname]);

  function toggleCollapsed() {
    const next = !collapsed;
    setCollapsed(next);
    window.localStorage.setItem('elitex_cms_nav_collapsed', next ? '1' : '0');
  }

  async function logout() {
    await cmsFetch('/api/auth/logout', { method: 'POST' });
    router.replace('/login');
    router.refresh();
  }

  const status = saving
    ? { cls: 'saving', text: 'Saving…' }
    : error && dirty
      ? { cls: 'failed', text: 'Save failed' }
      : dirty
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
              {items.map((item) => {
                const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
                return (
                  <CmsLink key={item.href} href={item.href} className={active ? 'active' : ''}>
                    <span className="nav-text">{item.label}</span>
                  </CmsLink>
                );
              })}
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
              <nav className="crumbs" aria-label="Breadcrumb">
                {crumbs.map((crumb, index) => (
                  <span key={`${crumb.label}-${index}`}>
                    {index > 0 ? <span className="crumbs-sep">/</span> : null}
                    {crumb.href && index < crumbs.length - 1 ? (
                      <button className="crumb-link" type="button" onClick={() => go(crumb.href!)}>
                        {crumb.label}
                      </button>
                    ) : (
                      <span>{crumb.label}</span>
                    )}
                  </span>
                ))}
              </nav>
              <h1>{meta.title}</h1>
              {meta.lede ? <p className="lede">{meta.lede}</p> : null}
            </div>
          </div>
          <div className="row">
            <span className={`status-pill ${status.cls}`} aria-live="polite">
              {status.text}
            </span>
            <button className="btn" type="button" disabled={!dirty || saving} onClick={() => saveDraft()}>
              {saving ? 'Saving…' : error && dirty ? 'Retry save' : 'Save draft'}
            </button>
            <CmsLink href="/preview" className="btn">
              Preview
            </CmsLink>
            {canPublish ? (
              <CmsLink href="/publish" className="btn btn-primary">
                Publish
              </CmsLink>
            ) : null}
            <div className="user-menu" ref={menuRef}>
              <button
                className="btn btn-ghost"
                type="button"
                onClick={() => setMenuOpen((open) => !open)}
                aria-expanded={menuOpen}
                aria-haspopup="menu"
              >
                {userName}
              </button>
              {menuOpen ? (
                <div className="menu" role="menu">
                  <div className="hint" style={{ padding: '6px 8px' }}>
                    {roleLabel}
                  </div>
                  <button
                    className="nav-link btn-ghost"
                    type="button"
                    role="menuitem"
                    onClick={() => (dirty ? setLogoutConfirm(true) : logout())}
                    style={{ width: '100%' }}
                  >
                    Sign out
                  </button>
                </div>
              ) : null}
            </div>
          </div>
        </header>
        <main className="main" id="main">
          {error && !dirty ? <p className="err">{error}</p> : null}
          {children}
        </main>
      </div>
      {logoutConfirm ? (
        <ConfirmDialog
          title="Sign out with unsaved changes?"
          body="Your unsaved edits will be lost. Save the draft first if you want to keep them."
          confirmLabel="Sign out"
          danger
          onCancel={() => setLogoutConfirm(false)}
          onConfirm={() => {
            setLogoutConfirm(false);
            void logout();
          }}
        />
      ) : null}
    </div>
  );
}
