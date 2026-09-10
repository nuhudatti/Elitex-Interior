'use client';

import { useMemo, useState } from 'react';
import { useDraft } from '@/components/cms/DraftProvider';
import type { ContentDocumentData } from '@/lib/content';
import { SaveBar } from '@/components/cms/fields';
import { MediaPicker } from '@/components/cms/MediaPicker';
import { MediaThumb } from '@/components/cms/MediaThumb';
import { ConfirmDialog } from '@/components/cms/ConfirmDialog';

type Detail = {
  title?: string;
  description?: string;
  scale?: string;
  date?: string;
  location?: string;
  philosophy?: string;
  video?: string;
  image?: string;
};

const MAPS = [
  { id: 'showcase', label: 'Showcase', path: 'pages.showcase.details' },
  { id: 'showcase2', label: 'Showcase 2', path: 'pages.showcase2.details' },
  { id: 'reviews', label: 'Reviews', path: 'pages.reviews.details' },
] as const;

function getDetails(content: unknown, path: string): Record<string, Detail> {
  return (path.split('.').reduce<unknown>((acc, key) => (acc as Record<string, unknown> | undefined)?.[key], content) ||
    {}) as Record<string, Detail>;
}

export default function ProjectsPage() {
  const { content, replaceContent, loading } = useDraft();
  const [mapId, setMapId] = useState<(typeof MAPS)[number]['id']>('showcase');
  const [editingSlug, setEditingSlug] = useState<string | null>(null);
  const [draftSlug, setDraftSlug] = useState('');
  const [form, setForm] = useState<Detail>({});
  const [picker, setPicker] = useState<'video' | 'image' | null>(null);
  const [q, setQ] = useState('');
  const [removeSlug, setRemoveSlug] = useState<string | null>(null);
  const map = MAPS.find((item) => item.id === mapId)!;
  const details = content ? getDetails(content, map.path) : {};
  const slugs = Object.keys(details);
  const visible = useMemo(() => {
    const term = q.toLowerCase();
    return slugs.filter((slug) => `${slug} ${details[slug]?.title || ''} ${details[slug]?.location || ''}`.toLowerCase().includes(term));
  }, [details, q, slugs]);

  if (loading || !content) return <div className="skeleton" style={{ height: 180 }} />;

  function writeDetails(next: Record<string, Detail>) {
    const clone = structuredClone(content) as Record<string, unknown>;
    const pages = clone.pages as Record<string, Record<string, unknown>>;
    if (map.id === 'reviews') pages.reviews.details = next;
    else pages[map.id].details = next;
    replaceContent(clone as ContentDocumentData);
  }

  function save() {
    const slug = (editingSlug || draftSlug).trim().toLowerCase().replace(/[^a-z0-9-]/g, '-');
    if (!slug) return;
    writeDetails({ ...details, [slug]: form });
    setEditingSlug(null);
    setDraftSlug('');
  }

  function duplicate(slug: string) {
    writeDetails({ ...details, [`${slug}-copy`]: { ...details[slug], title: `${details[slug].title || slug} copy` } });
  }

  return (
    <>
      <div className="tabs">
        {MAPS.map((item) => (
          <button key={item.id} className={`tab ${mapId === item.id ? 'active' : ''}`} type="button" onClick={() => setMapId(item.id)}>
            {item.label}
          </button>
        ))}
      </div>
      <input className="input" placeholder="Search projects" value={q} onChange={(e) => setQ(e.target.value)} style={{ marginBottom: 14 }} />
      <div className="cards-grid">
        {visible.map((slug) => (
          <div className="visual-card" key={slug}>
            <div className="cover">
              <MediaThumb url={details[slug].video || details[slug].image || ''} large />
            </div>
            <div className="pad">
              <b>{details[slug].title || slug}</b>
              <span>
                {details[slug].location || slug}
                {details[slug].date ? ` · ${details[slug].date}` : ''}
              </span>
              <div className="row" style={{ marginTop: 8 }}>
                <button
                  className="btn btn-sm"
                  type="button"
                  onClick={() => {
                    setEditingSlug(slug);
                    setForm({ ...details[slug] });
                  }}
                >
                  Edit
                </button>
                <button className="btn btn-sm" type="button" onClick={() => duplicate(slug)}>
                  Duplicate
                </button>
                <button className="btn btn-sm btn-danger" type="button" onClick={() => setRemoveSlug(slug)}>
                  Delete
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>
      <button
        className="btn btn-primary"
        type="button"
        style={{ marginTop: 12 }}
        onClick={() => {
          setEditingSlug('');
          setDraftSlug('');
          setForm({});
        }}
      >
        New Project
      </button>
      {editingSlug !== null ? (
        <div className="modal-backdrop" onClick={() => setEditingSlug(null)}>
          <div className="modal" role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
            <h3>{editingSlug ? `Edit ${editingSlug}` : 'New project'}</h3>
            {!editingSlug ? (
              <div className="field">
                <label>Slug</label>
                <input className="input" value={draftSlug} onChange={(e) => setDraftSlug(e.target.value)} />
                <div className="hint">Used by gallery tiles as projectSlug. Keep it short, lowercase, no spaces.</div>
              </div>
            ) : null}
            <div className="field">
              <label>Title</label>
              <input className="input" value={String(form.title || '')} onChange={(e) => setForm({ ...form, title: e.target.value })} />
            </div>
            <div className="grid cols-2">
              {(['scale', 'date', 'location'] as const).map((key) => (
                <div className="field" key={key}>
                  <label>{key === 'scale' ? 'Scale' : key === 'date' ? 'Date' : 'Location'}</label>
                  <input className="input" value={String(form[key] || '')} onChange={(e) => setForm({ ...form, [key]: e.target.value })} />
                </div>
              ))}
            </div>
            <div className="field">
              <label>Description</label>
              <textarea className="textarea" value={form.description || ''} onChange={(e) => setForm({ ...form, description: e.target.value })} />
            </div>
            <div className="field">
              <label>Philosophy</label>
              <textarea className="textarea" value={form.philosophy || ''} onChange={(e) => setForm({ ...form, philosophy: e.target.value })} />
            </div>
            <div className="field">
              <label>Video</label>
              <div className="row">
                <MediaThumb url={form.video || ''} type="video" />
                <button className="btn btn-primary" type="button" onClick={() => setPicker('video')}>
                  Choose media
                </button>
              </div>
            </div>
            <div className="field">
              <label>Image</label>
              <div className="row">
                <MediaThumb url={form.image || ''} type="image" />
                <button className="btn btn-primary" type="button" onClick={() => setPicker('image')}>
                  Choose media
                </button>
              </div>
            </div>
            <div className="row" style={{ justifyContent: 'flex-end' }}>
              <button className="btn" type="button" onClick={() => setEditingSlug(null)}>
                Cancel
              </button>
              <button className="btn btn-primary" type="button" onClick={save}>
                Save to draft
              </button>
            </div>
          </div>
        </div>
      ) : null}
      {picker ? (
        <MediaPicker
          kind={picker}
          onClose={() => setPicker(null)}
          onPick={(url) => {
            setForm({ ...form, [picker]: url });
            setPicker(null);
          }}
        />
      ) : null}
      {removeSlug ? (
        <ConfirmDialog
          title="Remove this project story?"
          body="Gallery tiles that still point at this slug will no longer open a story until you publish a replacement."
          confirmLabel="Remove"
          danger
          onCancel={() => setRemoveSlug(null)}
          onConfirm={() => {
            const next = { ...details };
            delete next[removeSlug];
            writeDetails(next);
            setRemoveSlug(null);
          }}
        />
      ) : null}
      <SaveBar />
    </>
  );
}
