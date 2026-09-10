'use client';

import { useState } from 'react';
import { Field, SaveBar } from '@/components/cms/fields';
import { CollectionEditor } from '@/components/cms/CollectionEditor';
import { useDraft } from '@/components/cms/DraftProvider';

export default function ReviewsPage() {
  const { content } = useDraft();
  const [tab, setTab] = useState('cards');
  if (!content) return <p>Loading draft…</p>;

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Reviews page</h1>
          <p>reviews.html — cards, videos, hero stats, and the submit form.</p>
        </div>
      </div>
      <div className="tabs">
        {[
          ['cards', 'Review cards'],
          ['videos', 'Video testimonials'],
          ['hero', 'Hero & stats'],
          ['form', 'Submit form'],
        ].map(([id, label]) => (
          <button key={id} className={`tab ${tab === id ? 'active' : ''}`} type="button" onClick={() => setTab(id)}>
            {label}
          </button>
        ))}
      </div>
      {tab === 'cards' ? (
        <>
          <div className="card">
            <Field label="Heading" path="pages.reviews.cardsHeading" />
            <Field label="Subtitle" path="pages.reviews.cardsSubtitle" />
          </div>
          <CollectionEditor
            path="pages.reviews.cards"
            prefix="rv"
            addLabel="Add review"
            titleOf={(i) => String(i.name || '')}
            subtitleOf={(i) => String(i.company || '')}
            fields={[
              { key: 'name', label: 'Client name' },
              { key: 'position', label: 'Position' },
              { key: 'company', label: 'Company' },
              { key: 'location', label: 'Location' },
              { key: 'avatar', label: 'Photo', type: 'media', kind: 'image' },
              { key: 'rating', label: 'Rating (1–5)', type: 'number' },
              { key: 'text', label: 'Review text', type: 'textarea' },
              { key: 'projectSlug', label: 'Linked project slug' },
              { key: 'showViewProject', label: 'Show View Project', type: 'toggle' },
              { key: 'featured', label: 'Featured', type: 'toggle' },
            ]}
            newItem={() => ({ rating: 5, showViewProject: false, featured: false, location: 'Abuja, Nigeria' })}
          />
        </>
      ) : null}
      {tab === 'videos' ? (
        <>
          <div className="card">
            <Field label="Heading" path="pages.reviews.videoHeading" />
            <Field label="Subtitle" path="pages.reviews.videoSubtitle" />
          </div>
          <CollectionEditor
            path="pages.reviews.videoTestimonials"
            prefix="vt"
            addLabel="Add video testimonial"
            titleOf={(i) => String(i.title || '')}
            subtitleOf={(i) => String(i.subtitle || '')}
            fields={[
              { key: 'title', label: 'Title' },
              { key: 'subtitle', label: 'Subtitle' },
              { key: 'src', label: 'Video', type: 'media', kind: 'video' },
            ]}
          />
        </>
      ) : null}
      {tab === 'hero' ? (
        <>
          <div className="card">
            <Field label="Title (white)" path="pages.reviews.hero.titlePrefix" />
            <Field label="Title (gold)" path="pages.reviews.hero.titleHighlight" />
            <Field label="Subtitle" path="pages.reviews.hero.subtitle" type="textarea" />
          </div>
          <CollectionEditor
            path="pages.reviews.stats"
            prefix="rs"
            addLabel="Add stat"
            titleOf={(i) => `${i.target || ''}${i.suffix || ''} — ${i.label || ''}`}
            fields={[
              { key: 'target', label: 'Number' },
              { key: 'suffix', label: 'Suffix' },
              { key: 'label', label: 'Label' },
            ]}
          />
        </>
      ) : null}
      {tab === 'form' ? (
        <div className="card">
          <Field label="Show submit form" path="pages.reviews.submitForm.visible" type="toggle" />
          <Field label="Heading" path="pages.reviews.submitForm.heading" />
          <Field label="Subtitle" path="pages.reviews.submitForm.subtitle" type="textarea" />
          <Field label="Submit label" path="pages.reviews.submitForm.submitLabel" />
        </div>
      ) : null}
      <SaveBar />
    </>
  );
}
