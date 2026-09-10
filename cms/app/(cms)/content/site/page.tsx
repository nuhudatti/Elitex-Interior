'use client';

import { useState } from 'react';
import { Field, SaveBar } from '@/components/cms/fields';
import { CollectionEditor } from '@/components/cms/CollectionEditor';
import { useDraft } from '@/components/cms/DraftProvider';

export default function SitePage() {
  const { content } = useDraft();
  const [tab, setTab] = useState('identity');
  if (!content) return <p>Loading draft…</p>;

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Site info</h1>
          <p>Shared across every public page. Saved as draft until you publish.</p>
        </div>
      </div>
      <div className="tabs">
        {[
          ['identity', 'Identity'],
          ['contact', 'Contact'],
          ['social', 'Social'],
          ['stats', 'Stats'],
          ['integrations', 'Integrations'],
        ].map(([id, label]) => (
          <button key={id} className={`tab ${tab === id ? 'active' : ''}`} type="button" onClick={() => setTab(id)}>
            {label}
          </button>
        ))}
      </div>
      {tab === 'identity' ? (
        <div className="card">
          <Field label="Site name" path="site.name" />
          <Field label="Domain" path="site.domain" hint="Used for canonical URLs and structured data" />
        </div>
      ) : null}
      {tab === 'contact' ? (
        <div className="card">
          <Field label="Phone" path="site.contact.phone" />
          <Field label="WhatsApp number (international, no +)" path="site.contact.whatsappNumber" />
          <Field label="WhatsApp message" path="site.contact.whatsappMessage" type="textarea" />
          <Field label="Email" path="site.contact.email" />
          <Field label="Address" path="site.contact.address" type="textarea" />
          <Field label="Google Maps embed URL" path="site.contact.mapEmbedSrc" type="textarea" />
        </div>
      ) : null}
      {tab === 'social' ? (
        <CollectionEditor
          path="site.social"
          prefix="soc"
          addLabel="Add social link"
          titleOf={(i) => String(i.platform || '')}
          subtitleOf={(i) => String(i.url || '')}
          fields={[
            { key: 'platform', label: 'Platform' },
            { key: 'url', label: 'URL' },
            { key: 'icon', label: 'Icon class', hint: 'e.g. fab fa-instagram' },
          ]}
        />
      ) : null}
      {tab === 'stats' ? (
        <CollectionEditor
          path="site.stats"
          prefix="st"
          addLabel="Add stat"
          titleOf={(i) => `${i.value || ''}${i.suffix || ''} — ${i.label || ''}`}
          fields={[
            { key: 'value', label: 'Number' },
            { key: 'suffix', label: 'Suffix' },
            { key: 'label', label: 'Label' },
          ]}
        />
      ) : null}
      {tab === 'integrations' ? (
        <div className="card">
          <Field label="Formspree contact" path="site.integrations.formspreeContact" />
          <Field label="Formspree newsletter" path="site.integrations.formspreeNewsletter" />
          <Field label="Formspree review" path="site.integrations.formspreeReview" />
          <Field label="Tawk.to enabled" path="site.integrations.tawkToEnabled" type="toggle" />
          <Field label="Tawk.to widget ID" path="site.integrations.tawkToId" />
          <Field label="Cloudinary cloud name" path="site.integrations.cloudinary.cloudName" />
          <Field
            label="Unsigned upload preset"
            path="site.integrations.cloudinary.uploadPreset"
            hint="Preset name only, not a secret. Leave empty if server-side signed upload is used."
          />
          <Field label="Default Cloudinary folder" path="site.integrations.cloudinary.defaultFolder" />
        </div>
      ) : null}
      <SaveBar />
    </>
  );
}
