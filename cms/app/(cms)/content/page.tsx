'use client';

import Link from 'next/link';
import { useDraft } from '@/components/cms/DraftProvider';
import { SaveBar } from '@/components/cms/fields';

const SECTIONS = [
  { href: '/content/site', label: 'Site info', detail: 'Name, contact, social, stats, integrations' },
  { href: '/content/home', label: 'Homepage', detail: 'index.html' },
  { href: '/content/showcase', label: 'Showcase', detail: 'project.html' },
  { href: '/content/showcase2', label: 'Showcase 2', detail: 'project2.html' },
  { href: '/content/reviews', label: 'Reviews', detail: 'reviews.html' },
  { href: '/content/projects', label: 'Project details', detail: 'Modals linked from gallery tiles' },
  { href: '/content/seo', label: 'SEO', detail: 'Titles, descriptions, Open Graph' },
];

function Overview() {
  const { content, draftUpdatedAt, publishedUpdatedAt } = useDraft();
  if (!content) return <p>Loading draft from Neon…</p>;
  return (
    <>
      <div className="page-head">
        <div>
          <h1>Content</h1>
          <p>Edit the real content.json shape. Save draft never publishes.</p>
        </div>
      </div>
      <p className="hint">Draft {draftUpdatedAt || '—'} · Published {publishedUpdatedAt || '—'}</p>
      <div className="grid cols-2">
        {SECTIONS.map((section) => (
          <Link key={section.href} href={section.href} className="card" style={{ color: 'inherit' }}>
            <h3>{section.label}</h3>
            <p className="hint">{section.detail}</p>
          </Link>
        ))}
      </div>
      <SaveBar />
    </>
  );
}

export default function ContentPage() {
  return <Overview />;
}
