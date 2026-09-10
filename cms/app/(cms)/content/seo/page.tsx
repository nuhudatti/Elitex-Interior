'use client';

import { Field, MediaField, SaveBar } from '@/components/cms/fields';
import { useDraft } from '@/components/cms/DraftProvider';
import { useState } from 'react';

const PAGES = [
  { id: 'index', label: 'Home' },
  { id: 'project', label: 'project.html' },
  { id: 'project2', label: 'project2.html' },
  { id: 'reviews', label: 'Reviews' },
  { id: 'global', label: 'Global' },
];

export default function SeoPage() {
  const { content } = useDraft();
  const [tab, setTab] = useState('index');
  if (!content) return <p>Loading draft…</p>;
  const base = `seo.pages.${tab}.`;

  return (
    <>
      <div className="page-head">
        <div>
          <h1>SEO</h1>
          <p>Meta titles, descriptions, and social cards. Does not change public HTML templates.</p>
        </div>
      </div>
      <div className="tabs">
        {PAGES.map((page) => (
          <button key={page.id} className={`tab ${tab === page.id ? 'active' : ''}`} type="button" onClick={() => setTab(page.id)}>
            {page.label}
          </button>
        ))}
      </div>
      {tab === 'global' ? (
        <div className="card">
          <Field label="Site domain" path="site.domain" />
          <MediaField label="Favicon" path="seo.faviconUrl" kind="image" />
          <Field label="Enable LocalBusiness structured data" path="seo.structuredData.enabled" type="toggle" />
          <Field label="Business name" path="seo.structuredData.name" />
          <Field label="Price range" path="seo.structuredData.priceRange" />
          <Field label="Description" path="seo.structuredData.description" type="textarea" />
          <Field label="Area served" path="seo.structuredData.areaServed" />
        </div>
      ) : (
        <div className="card">
          <Field label="Meta title" path={`${base}title`} />
          <Field label="Meta description" path={`${base}description`} type="textarea" />
          <Field label="Keywords" path={`${base}keywords`} />
          <Field label="Canonical URL" path={`${base}canonical`} />
          <Field label="Robots" path={`${base}robots`} />
          <Field label="Share title" path={`${base}ogTitle`} />
          <Field label="Share description" path={`${base}ogDescription`} type="textarea" />
          <MediaField label="Share image" path={`${base}ogImage`} kind="image" />
        </div>
      )}
      <SaveBar />
    </>
  );
}
