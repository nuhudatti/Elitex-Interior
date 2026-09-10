'use client';

import { useMemo, useState } from 'react';
import { useDraft } from '@/components/cms/DraftProvider';
import type { ContentDocumentData } from '@/lib/content';
import { SaveBar } from '@/components/cms/fields';
import { MediaPicker } from '@/components/cms/MediaPicker';
import { MediaThumb } from '@/components/cms/MediaThumb';
import { ConfirmDialog } from '@/components/cms/ConfirmDialog';
import { CmsLink } from '@/components/cms/UnsavedNav';

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
  { id: 'showcase', label: 'Showcase', path: 'pages.showcase.details', preview: 'project.html' },
  { id: 'showcase2', label: 'Showcase 2', path: 'pages.showcase2.details', preview: 'project2.html' },
  { id: 'reviews', label: 'Reviews', path: 'pages.reviews.details', preview: 'reviews.html' },
] as const;

function getDetails(content: unknown, path: string): Record<string, Detail> {
  return (path.split('.').reduce<unknown>((acc, key) => (acc as Record<string, unknown> | undefined)?.[key], content) ||
    {}) as Record<string, Detail>;
}

function reorderMap(details: Record<string, Detail>, fromSlug: string, toSlug: string) {
  const keys = Object.keys(details);
  const from = keys.indexOf(fromSlug);
  const to = keys.indexOf(toSlug);
  if (from < 0 || to < 0 || from === to) return details;
  const nextKeys = [...keys];
  const [moved] = nextKeys.splice(from, 1);
  nextKeys.splice(to, 0, moved);
  const next: Record<string, Detail> = {};
  for (const key of nextKeys) next[key] = details[key];
  return next;
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
  const [formError, setFormError] = useState('');
  const [dragSlug, setDragSlug] = useState<string | null>(null);
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
    if (!editingSlug && !slug) {
      setFormError('Add a short name for this project.');
      return;
    }
    if (!String(form.title || '').trim()) {
      setFormError('Add a title.');
      return;
    }
    writeDetails({ ...details, [slug]: form });
    setFormError('');
    setEditingSlug(null);
    setDraftSlug('');
  }

  function duplicate(slug: string) {
    writeDetails({ ...details, [`${slug}-copy`]: { ...details[slug], title: `${details[slug].title || slug} copy` } });
  }

  function nudge(slug: string, dir: -1 | 1) {
    const index = slugs.indexOf(slug);
    const target = slugs[index + dir];
    if (!target) return;
    writeDetails(reorderMap(details, slug, target));
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
      <div className="row" style={{ marginBottom: 14 }}>
        <input
          className="input"
          placeholder="Search projects"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          aria-label="Search projects"
          style={{ flex: 1 }}
        />
        <CmsLink className="btn" href={`/preview?page=${map.preview}`}>
          Preview gallery
        </CmsLink>
      </div>
      {!slugs.length ? <p className="empty">No project stories here yet. Add one — it stays in the draft until you publish.</p> : null}
      <div className="cards-grid">
        {visible.map((slug) => {
          const index = slugs.indexOf(slug);
          return (
          <div
            className="visual-card"
            key={slug}
            onDragOver={(e) => e.preventDefault()}
            onDrop={() => {
              if (dragSlug) writeDetails(reorderMap(details, dragSlug, slug));
              setDragSlug(null);
            }}
          >
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
                  className="drag-handle"
                  type="button"
                  draggable
                  aria-label="Drag to reorder"
                  onDragStart={() => setDragSlug(slug)}
                  onDragEnd={() => setDragSlug(null)}
                >
                  ⋮⋮
                </button>
                <button className="btn btn-sm" type="button" disabled={index === 0} onClick={() => nudge(slug, -1)}>
                  Up
                </button>
                <button className="btn btn-sm" type="button" disabled={index === slugs.length - 1} onClick={() => nudge(slug, 1)}>
                  Down
                </button>
                <button
                  className="btn btn-sm"
                  type="button"
                  onClick={() => {
                    setFormError('');
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
          );
        })}
      </div>
      <button
        className="btn btn-primary"
        type="button"
        style={{ marginTop: 12 }}
        onClick={() => {
          setFormError('');
          setEditingSlug('');
          setDraftSlug('');
          setForm({});
        }}
      >
        Add project
      </button>
      {editingSlug !== null ? (
        <div className="modal-backdrop" onClick={() => setEditingSlug(null)}>
          <div className="modal" role="dialog" aria-modal="true" aria-labelledby="project-edit-title" onClick={(e) => e.stopPropagation()}>
            <h3 id="project-edit-title">{editingSlug ? `Edit ${form.title || editingSlug}` : 'New project'}</h3>
            {formError ? <p className="err">{formError}</p> : null}
            {!editingSlug ? (
              <div className="field">
                <label htmlFor="project-slug">Short name</label>
                <input id="project-slug" className="input" value={draftSlug} maxLength={80} onChange={(e) => setDraftSlug(e.target.value)} />
                <div className="hint">Used to connect this story to a gallery tile. Lowercase, no spaces.</div>
              </div>
            ) : null}
            <div className="field">
              <label htmlFor="project-title">Title</label>
              <input
                id="project-title"
                className="input"
                required
                maxLength={120}
                value={String(form.title || '')}
                onChange={(e) => setForm({ ...form, title: e.target.value })}
              />
            </div>
            <div className="grid cols-2">
              {(['scale', 'date', 'location'] as const).map((key) => (
                <div className="field" key={key}>
                  <label htmlFor={`project-${key}`}>{key === 'scale' ? 'Scale' : key === 'date' ? 'Date' : 'Location'}</label>
                  <input
                    id={`project-${key}`}
                    className="input"
                    maxLength={80}
                    value={String(form[key] || '')}
                    onChange={(e) => setForm({ ...form, [key]: e.target.value })}
                  />
                </div>
              ))}
            </div>
            <div className="field">
              <label htmlFor="project-desc">Description</label>
              <textarea
                id="project-desc"
                className="textarea"
                maxLength={4000}
                value={form.description || ''}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
              />
            </div>
            <div className="field">
              <label htmlFor="project-phil">Philosophy</label>
              <textarea
                id="project-phil"
                className="textarea"
                maxLength={4000}
                value={form.philosophy || ''}
                onChange={(e) => setForm({ ...form, philosophy: e.target.value })}
              />
            </div>
            <div className="field">
              <span className="label-text">Video</span>
              <div className="row">
                <MediaThumb url={form.video || ''} type="video" />
                <button className="btn btn-primary" type="button" onClick={() => setPicker('video')}>
                  {form.video ? 'Replace media' : 'Choose media'}
                </button>
                {form.video ? (
                  <button className="btn" type="button" onClick={() => setForm({ ...form, video: '' })}>
                    Remove
                  </button>
                ) : null}
              </div>
            </div>
            <div className="field">
              <span className="label-text">Image</span>
              <div className="row">
                <MediaThumb url={form.image || ''} type="image" />
                <button className="btn btn-primary" type="button" onClick={() => setPicker('image')}>
                  {form.image ? 'Replace media' : 'Choose media'}
                </button>
                {form.image ? (
                  <button className="btn" type="button" onClick={() => setForm({ ...form, image: '' })}>
                    Remove
                  </button>
                ) : null}
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
          body="Gallery tiles that still point at this story will no longer open it until you publish a replacement. The live site stays unchanged until you publish."
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
