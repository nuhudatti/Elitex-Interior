'use client';

import { Field, MediaField, SaveBar } from '@/components/cms/fields';
import { useDraft } from '@/components/cms/DraftProvider';
import { getPath } from '@/lib/content-path';
import { cldImage } from '@/lib/cloudinary-url';
import { useState } from 'react';

const PAGES = [
  { id: 'index', label: 'Home' },
  { id: 'project', label: 'Showcase' },
  { id: 'project2', label: 'Showcase 2' },
  { id: 'reviews', label: 'Reviews' },
  { id: 'global', label: 'Global' },
];

export default function SeoPage() {
  const { content, loading } = useDraft();
  const [tab, setTab] = useState('index');
  if (loading || !content) return <div className="skeleton" style={{ height: 180 }} />;
  const base = `seo.pages.${tab}.`;
  const title = String(getPath(content, `${base}title`) || '');
  const description = String(getPath(content, `${base}description`) || '');
  const canonical = String(getPath(content, `${base}canonical`) || '');
  const ogTitle = String(getPath(content, `${base}ogTitle`) || title);
  const ogDescription = String(getPath(content, `${base}ogDescription`) || description);
  const ogImage = String(getPath(content, `${base}ogImage`) || '');

  return (
    <>
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
        <>
          <div className="grid cols-2">
            <div className="serp">
              <div className="hint">Search preview</div>
              <div className="serp-url">{canonical || 'https://elitexinterior.com/'}</div>
              <div className="serp-title">{title || 'Page title'}</div>
              <div className="serp-desc">{description || 'Meta description'}</div>
            </div>
            <div className="og-card">
              <div className="hint">Share preview</div>
              {ogImage ? <img alt="" src={cldImage(ogImage.startsWith('http') ? ogImage : '', 640) || ogImage} /> : null}
              <b>{ogTitle || 'Share title'}</b>
              <p className="hint">{ogDescription}</p>
            </div>
          </div>
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
        </>
      )}
      <SaveBar />
    </>
  );
}
