'use client';

import { useState } from 'react';
import { useDraft } from '@/components/cms/DraftProvider';
import { SaveBar } from '@/components/cms/fields';
import { MediaPicker } from '@/components/cms/MediaPicker';
import { MediaThumb } from '@/components/cms/MediaPicker';

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
  { id: 'showcase', label: 'project.html', path: 'pages.showcase.details' },
  { id: 'showcase2', label: 'project2.html', path: 'pages.showcase2.details' },
  { id: 'reviews', label: 'reviews.html', path: 'pages.reviews.details' },
] as const;

function getDetails(content: unknown, path: string): Record<string, Detail> {
  return (path.split('.').reduce<unknown>((acc, key) => (acc as Record<string, unknown> | undefined)?.[key], content) ||
    {}) as Record<string, Detail>;
}

export default function ProjectsPage() {
  const { content, replaceContent } = useDraft();
  const [mapId, setMapId] = useState<(typeof MAPS)[number]['id']>('showcase');
  const [editingSlug, setEditingSlug] = useState<string | null>(null);
  const [draftSlug, setDraftSlug] = useState('');
  const [form, setForm] = useState<Detail>({});
  const [picker, setPicker] = useState<'video' | 'image' | null>(null);
  if (!content) return <p>Loading draft…</p>;

  const map = MAPS.find((item) => item.id === mapId)!;
  const details = getDetails(content, map.path);
  const slugs = Object.keys(details);

  function writeDetails(next: Record<string, Detail>) {
    if (!content) return;
    const clone = structuredClone(content) as Record<string, unknown>;
    const pages = clone.pages as Record<string, Record<string, unknown>>;
    if (map.id === 'reviews') pages.reviews.details = next;
    else pages[map.id].details = next;
    replaceContent(clone as typeof content);
  }

  function save() {
    const slug = (editingSlug || draftSlug).trim().toLowerCase().replace(/[^a-z0-9-]/g, '-');
    if (!slug) return;
    writeDetails({ ...details, [slug]: form });
    setEditingSlug(null);
    setDraftSlug('');
  }

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Project details</h1>
          <p>Modal content linked from gallery tiles and “View Project”.</p>
        </div>
      </div>
      <div className="tabs">
        {MAPS.map((item) => (
          <button key={item.id} className={`tab ${mapId === item.id ? 'active' : ''}`} type="button" onClick={() => setMapId(item.id)}>
            {item.label}
          </button>
        ))}
      </div>
      <div className="collection">
        {slugs.map((slug) => (
          <div className="item-row" key={slug}>
            <MediaThumb url={details[slug].video || details[slug].image || ''} />
            <div>
              <b>{details[slug].title || slug}</b>
              <span>slug: {slug}</span>
            </div>
            <span />
            <div className="row">
              <button
                className="btn"
                type="button"
                onClick={() => {
                  setEditingSlug(slug);
                  setForm({ ...details[slug] });
                }}
              >
                Edit
              </button>
              <button
                className="btn btn-danger"
                type="button"
                onClick={() => {
                  const next = { ...details };
                  delete next[slug];
                  writeDetails(next);
                }}
              >
                Delete
              </button>
            </div>
          </div>
        ))}
      </div>
      <button
        className="btn"
        type="button"
        style={{ marginTop: 12 }}
        onClick={() => {
          setEditingSlug('');
          setDraftSlug('');
          setForm({});
        }}
      >
        Add project
      </button>
      {editingSlug !== null ? (
        <div className="modal-backdrop" onClick={() => setEditingSlug(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h3>{editingSlug ? `Edit ${editingSlug}` : 'New project'}</h3>
            {!editingSlug ? (
              <div className="field">
                <label>Slug</label>
                <input className="input" value={draftSlug} onChange={(e) => setDraftSlug(e.target.value)} />
              </div>
            ) : null}
            {(['title', 'scale', 'date', 'location'] as const).map((key) => (
              <div className="field" key={key}>
                <label>{key}</label>
                <input className="input" value={String(form[key] || '')} onChange={(e) => setForm({ ...form, [key]: e.target.value })} />
              </div>
            ))}
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
                <input className="input" style={{ flex: 1 }} value={form.video || ''} onChange={(e) => setForm({ ...form, video: e.target.value })} />
                <button className="btn" type="button" onClick={() => setPicker('video')}>
                  Library
                </button>
              </div>
            </div>
            <div className="field">
              <label>Image</label>
              <div className="row">
                <MediaThumb url={form.image || ''} type="image" />
                <input className="input" style={{ flex: 1 }} value={form.image || ''} onChange={(e) => setForm({ ...form, image: e.target.value })} />
                <button className="btn" type="button" onClick={() => setPicker('image')}>
                  Library
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
      <SaveBar />
    </>
  );
}
