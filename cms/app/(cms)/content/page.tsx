'use client';

import { useDraft } from '@/components/cms/DraftProvider';
import { SaveBar } from '@/components/cms/fields';
import { CmsLink } from '@/components/cms/UnsavedNav';

const SECTIONS = [
  { href: '/content/home', label: 'Home', detail: 'Hero, about, services, gallery, and contact' },
  { href: '/content/projects', label: 'Projects', detail: 'Stories behind gallery tiles' },
  { href: '/content/reviews', label: 'Reviews', detail: 'Client cards and video testimonials' },
  { href: '/content/showcase', label: 'Showcase', detail: 'project.html gallery' },
  { href: '/content/showcase2', label: 'Showcase 2', detail: 'Gallery on project2.html' },
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
          <CmsLink key={section.href} href={section.href} className="card card-link">
            <h3>{section.label}</h3>
            <p className="hint">{section.detail}</p>
          </CmsLink>
        ))}
      </div>
      <SaveBar />
    </>
  );
}
