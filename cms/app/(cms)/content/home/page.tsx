'use client';

import { useState } from 'react';
import { Field, MediaField, SaveBar } from '@/components/cms/fields';
import { CollectionEditor } from '@/components/cms/CollectionEditor';
import { useDraft } from '@/components/cms/DraftProvider';

const TABS = [
  ['hero', 'Hero'],
  ['about', 'About'],
  ['services', 'Services'],
  ['portfolio', 'Portfolio'],
  ['process', 'Process'],
  ['testimonials', 'Testimonials'],
  ['cta', 'Reviews CTA'],
  ['contact', 'Contact'],
  ['footer', 'Footer'],
  ['nav', 'Navigation'],
];

export default function HomeEditor() {
  const { content, loading } = useDraft();
  const [tab, setTab] = useState('hero');
  if (loading || !content) return <div className="skeleton" style={{ height: 180 }} />;
  const hero = (content.pages?.home as { hero?: Record<string, string> } | undefined)?.hero || {};

  return (
    <>
      <div className="tabs">
        {TABS.map(([id, label]) => (
          <button key={id} className={`tab ${tab === id ? 'active' : ''}`} type="button" onClick={() => setTab(id)}>
            {label}
          </button>
        ))}
      </div>
      {tab === 'hero' ? (
        <div className="card">
          <div className="hero-preview">
            <div className="eyebrow">{String(hero.scrollHint || '')}</div>
            <h2>{String(hero.title || '')}</h2>
            <p>
              {String(hero.taglinePrefix || '')}
              <em>{String(hero.taglineHighlight || '')}</em>
            </p>
            <p className="hint">{String(hero.subtitle || '')}</p>
          </div>
          <Field label="Main title" path="pages.home.hero.title" />
          <Field label="Tagline (before highlight)" path="pages.home.hero.taglinePrefix" />
          <Field label="Tagline highlight" path="pages.home.hero.taglineHighlight" />
          <Field label="Subtitle" path="pages.home.hero.subtitle" type="textarea" />
          <Field label="Primary button label" path="pages.home.hero.ctaPrimary.label" />
          <Field label="Primary button link" path="pages.home.hero.ctaPrimary.href" />
          <Field label="Secondary button label" path="pages.home.hero.ctaSecondary.label" />
          <Field label="Secondary button link" path="pages.home.hero.ctaSecondary.href" />
          <Field label="Scroll hint" path="pages.home.hero.scrollHint" />
        </div>
      ) : null}
      {tab === 'about' ? (
        <div className="card">
          <Field label="Section visible" path="pages.home.about.visible" type="toggle" />
          <Field label="Heading" path="pages.home.about.heading" />
          <Field label="Paragraph 1" path="pages.home.about.paragraphs.0" type="textarea" />
          <Field label="Paragraph 2" path="pages.home.about.paragraphs.1" type="textarea" />
          <Field label="Button label" path="pages.home.about.cta.label" />
          <Field label="Button link" path="pages.home.about.cta.href" />
          <MediaField label="Section video" path="pages.home.about.videoSrc" kind="video" />
        </div>
      ) : null}
      {tab === 'services' ? (
        <>
          <div className="card">
            <Field label="Section visible" path="pages.home.services.visible" type="toggle" />
            <Field label="Heading" path="pages.home.services.heading" />
            <Field label="Subtitle" path="pages.home.services.subtitle" />
          </div>
          <CollectionEditor
            path="pages.home.services.items"
            prefix="sv"
            addLabel="Add service"
            titleOf={(i) => String(i.title || '')}
            subtitleOf={(i) => String(i.description || '')}
            fields={[
              { key: 'title', label: 'Service name' },
              { key: 'icon', label: 'Icon class' },
              { key: 'description', label: 'Description', type: 'textarea' },
            ]}
            newItem={() => ({ icon: 'fa-solid fa-star' })}
          />
        </>
      ) : null}
      {tab === 'portfolio' ? (
        <>
          <div className="card">
            <Field label="Section visible" path="pages.home.portfolio.visible" type="toggle" />
            <Field label="Heading" path="pages.home.portfolio.heading" />
            <Field label="Subtitle" path="pages.home.portfolio.subtitle" />
            <Field label="View all label" path="pages.home.portfolio.viewAll.label" />
            <Field label="View all link" path="pages.home.portfolio.viewAll.href" />
          </div>
          <CollectionEditor
            path="pages.home.portfolio.items"
            prefix="pf"
            addLabel="Add gallery item"
            variant="cards"
            titleOf={(i) => String(i.title || '(no title)')}
            subtitleOf={(i) => `${i.mediaType || ''} · ${i.size || ''}`}
            fields={[
              { key: 'title', label: 'Title' },
              { key: 'subtitle', label: 'Subtitle' },
              { key: 'mediaType', label: 'Media type', type: 'select', options: ['image', 'video'] },
              { key: 'src', label: 'Media file', type: 'media' },
              {
                key: 'size',
                label: 'Tile size',
                type: 'select',
                options: [
                  { value: 'normal', label: 'Normal' },
                  { value: 'wide', label: 'Wide' },
                  { value: 'tall', label: 'Tall' },
                  { value: 'large', label: 'Large' },
                ],
              },
              { key: 'alt', label: 'Alt text' },
            ]}
            newItem={() => ({ mediaType: 'image', size: 'normal', status: 'published' })}
          />
        </>
      ) : null}
      {tab === 'process' ? (
        <>
          <div className="card">
            <Field label="Section visible" path="pages.home.process.visible" type="toggle" />
            <Field label="Heading" path="pages.home.process.heading" />
            <Field label="Subtitle" path="pages.home.process.subtitle" />
          </div>
          <CollectionEditor
            path="pages.home.process.steps"
            prefix="pr"
            addLabel="Add step"
            titleOf={(i) => String(i.title || '')}
            subtitleOf={(i) => String(i.description || '')}
            fields={[
              { key: 'title', label: 'Step title' },
              { key: 'description', label: 'Description', type: 'textarea' },
            ]}
          />
        </>
      ) : null}
      {tab === 'testimonials' ? (
        <>
          <div className="card">
            <Field label="Section visible" path="pages.home.testimonials.visible" type="toggle" />
            <Field label="Heading" path="pages.home.testimonials.heading" />
            <Field label="Subtitle" path="pages.home.testimonials.subtitle" />
          </div>
          <CollectionEditor
            path="pages.home.testimonials.slides"
            prefix="ts"
            addLabel="Add testimonial"
            titleOf={(i) => String(i.name || '')}
            subtitleOf={(i) => String(i.quote || '')}
            fields={[
              { key: 'name', label: 'Client name' },
              { key: 'location', label: 'Location / role' },
              { key: 'avatar', label: 'Photo', type: 'media', kind: 'image' },
              { key: 'quote', label: 'Quote', type: 'textarea' },
            ]}
          />
        </>
      ) : null}
      {tab === 'cta' ? (
        <>
          <div className="card">
            <Field label="Section visible" path="pages.home.reviewsCta.visible" type="toggle" />
            <Field label="Heading" path="pages.home.reviewsCta.heading" />
            <Field label="Subtitle" path="pages.home.reviewsCta.subtitle" type="textarea" />
            <Field label="Button label" path="pages.home.reviewsCta.cta.label" />
            <Field label="Button link" path="pages.home.reviewsCta.cta.href" />
          </div>
          <h3>Trust badges</h3>
          <CollectionEditor
            path="pages.home.reviewsCta.badges"
            prefix="bd"
            addLabel="Add badge"
            titleOf={(i) => String(i.label || '')}
            fields={[
              { key: 'label', label: 'Badge text' },
              { key: 'icon', label: 'Icon class' },
            ]}
          />
        </>
      ) : null}
      {tab === 'contact' ? (
        <>
          <div className="card">
            <Field label="Section visible" path="pages.home.contactSection.visible" type="toggle" />
            <Field label="Heading" path="pages.home.contactSection.heading" />
            <Field label="Subtitle" path="pages.home.contactSection.subtitle" type="textarea" />
            <Field label="Address label" path="pages.home.contactSection.addressLabel" />
            <Field label="Phone label" path="pages.home.contactSection.phoneLabel" />
            <Field label="Submit label" path="pages.home.contactSection.form.submitLabel" />
            <Field label="Success message" path="pages.home.contactSection.form.successMessage" />
          </div>
          <CollectionEditor
            path="pages.home.contactSection.form.projectTypes"
            prefix="pt"
            addLabel="Add option"
            titleOf={(i) => String(i.label || '')}
            fields={[
              { key: 'label', label: 'Label' },
              { key: 'value', label: 'Value' },
            ]}
          />
        </>
      ) : null}
      {tab === 'footer' ? (
        <>
          <div className="card">
            <Field label="Brand name" path="pages.home.footer.brandName" />
            <Field label="Blurb" path="pages.home.footer.blurb" type="textarea" />
            <Field label="Copyright" path="pages.home.footer.copyright" />
            <Field label="Show newsletter" path="pages.home.footer.newsletter.visible" type="toggle" />
            <Field label="Newsletter title" path="pages.home.footer.newsletter.title" />
            <Field label="Placeholder" path="pages.home.footer.newsletter.placeholder" />
            <Field label="Newsletter text" path="pages.home.footer.newsletter.text" />
            <Field label="Success message" path="pages.home.footer.newsletter.successMessage" />
          </div>
          <CollectionEditor
            path="pages.home.footer.quickLinks"
            prefix="ql"
            addLabel="Add link"
            titleOf={(i) => String(i.label || '')}
            subtitleOf={(i) => String(i.href || '')}
            fields={[
              { key: 'label', label: 'Label' },
              { key: 'href', label: 'Link' },
            ]}
          />
        </>
      ) : null}
      {tab === 'nav' ? (
        <>
          <div className="card">
            <Field label="Logo text" path="pages.home.nav.logoText" />
            <Field label="CTA label" path="pages.home.nav.cta.label" />
            <Field label="CTA link" path="pages.home.nav.cta.href" />
          </div>
          <CollectionEditor
            path="pages.home.nav.links"
            prefix="nv"
            addLabel="Add menu link"
            titleOf={(i) => String(i.label || '')}
            subtitleOf={(i) => String(i.href || '')}
            fields={[
              { key: 'label', label: 'Label' },
              { key: 'href', label: 'Link' },
            ]}
          />
        </>
      ) : null}
      <SaveBar />
    </>
  );
}
