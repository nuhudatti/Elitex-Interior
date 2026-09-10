'use client';

import Link from 'next/link';
import { useDraft } from '@/components/cms/DraftProvider';
import { SaveBar } from '@/components/cms/fields';

const SECTIONS = [
  { href: '/content/home', label: 'Home', detail: 'Hero, about, services, gallery, and contact' },
  { href: '/content/projects', label: 'Projects', detail: 'Stories behind gallery tiles' },
  { href: '/content/reviews', label: 'Reviews', detail: 'Client cards and video testimonials' },
  { href: '/content/showcase', label: 'Showcase', detail: 'project.html gallery' },
  { href: '/content/showcase2', label: 'Showcase 2', detail: 'project2.html gallery' },
  { href: '/content/site', label: 'Site', detail: 'Name, contact, social, and stats' },
  { href: '/content/seo', label: 'SEO', detail: 'Titles, descriptions, and share cards' },
];

export default function ContentPage() {
  const { content, loading } = useDraft();
  if (loading || !content) return <div className="skeleton" style={{ height: 180 }} />;

  return (
    <>
      <div className="grid cols-2">
        {SECTIONS.map((section) => (
          <Link key={section.href} href={section.href} className="card card-link">
            <h3>{section.label}</h3>
            <p className="hint">{section.detail}</p>
          </Link>
        ))}
      </div>
      <SaveBar />
    </>
  );
}
