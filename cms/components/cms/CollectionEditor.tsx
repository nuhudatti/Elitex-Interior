'use client';

import { useState } from 'react';
import { useDraft } from './DraftProvider';
import { getPath, newId, type CollectionItem } from '@/lib/content-path';
import { MediaPicker } from './MediaPicker';
import { MediaThumb } from './MediaThumb';
import { ConfirmDialog } from './ConfirmDialog';

export type EditorField = {
  key: string;
  label: string;
  type?: 'text' | 'textarea' | 'number' | 'toggle' | 'select' | 'media';
  kind?: 'image' | 'video' | 'audio';
  options?: Array<string | { value: string; label: string }>;
  hint?: string;
  required?: boolean;
  min?: number;
  max?: number;
  maxLength?: number;
};

function LocalMedia({
  label,
  kind,
  value,
  onChange,
}: {
  label: string;
  kind?: 'image' | 'video' | 'audio';
  value: string;
  onChange: (url: string) => void;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div className="field">
      <span className="label-text">{label}</span>
      <div className="row">
        <MediaThumb url={value} type={kind} />
        <button className="btn btn-primary" type="button" onClick={() => setOpen(true)}>
          {value ? 'Replace media' : 'Choose media'}
        </button>
        {value ? (
          <button className="btn" type="button" onClick={() => onChange('')}>
            Remove
          </button>
        ) : null}
      </div>
      {open ? (
        <MediaPicker
          kind={kind}
          onClose={() => setOpen(false)}
          onPick={(url) => {
            onChange(url);
            setOpen(false);
          }}
        />
      ) : null}
    </div>
  );
}

export function CollectionEditor({
  path,
  prefix,
  fields,
  titleOf,
  subtitleOf,
  addLabel,
  newItem,
  variant = 'list',
  mediaKey,
}: {
  path: string;
  prefix: string;
  fields: EditorField[];
  titleOf: (item: CollectionItem) => string;
  subtitleOf?: (item: CollectionItem) => string;
  addLabel: string;
  newItem?: () => CollectionItem;
  variant?: 'list' | 'cards';
  mediaKey?: string;
}) {
  const { content, replaceContent } = useDraft();
  const [editing, setEditing] = useState<CollectionItem | null>(null);
  const [removeId, setRemoveId] = useState<string | null>(null);
  const [q, setQ] = useState('');
  const [dragId, setDragId] = useState<string | null>(null);
  const [formError, setFormError] = useState('');
  const list = (getPath(content, path) as CollectionItem[] | undefined) || [];
  const sorted = [...list].sort((a, b) => Number(a.order || 0) - Number(b.order || 0));
  const visible = q
    ? sorted.filter((item) => `${titleOf(item)} ${subtitleOf?.(item) || ''}`.toLowerCase().includes(q.toLowerCase()))
    : sorted;

  function write(nextList: CollectionItem[]) {
    if (!content) return;
    const ordered = nextList.map((item, index) => ({ ...item, order: index + 1 }));
    const parts = path.split('.');
    const clone = structuredClone(content) as Record<string, unknown>;
    let cur: Record<string, unknown> = clone;
    for (let i = 0; i < parts.length - 1; i += 1) {
      cur = cur[parts[i]] as Record<string, unknown>;
    }
    cur[parts[parts.length - 1]] = ordered;
    replaceContent(clone as typeof content);
  }

  function saveItem(item: CollectionItem) {
    const missing = fields.find((field) => {
      const required = field.required || field.key === 'title' || field.key === 'name';
      if (!required) return false;
      return !String(item[field.key] ?? '').trim();
    });
    if (missing) {
      setFormError(`${missing.label} is required.`);
      return;
    }
    const next = list.some((row) => row.id === item.id)
      ? list.map((row) => (row.id === item.id ? item : row))
      : [
          ...list,
          {
            ...item,
            id: item.id || newId(prefix),
            status: item.status || 'published',
            order: list.length + 1,
          },
        ];
    write(next);
    setFormError('');
    setEditing(null);
  }

  function duplicate(item: CollectionItem) {
    write([
      ...list,
      {
        ...item,
        id: newId(prefix),
        title: item.title ? `${item.title} copy` : item.title,
        order: list.length + 1,
      },
    ]);
  }

  function move(fromId: string, toId: string) {
    const next = [...sorted];
    const from = next.findIndex((item) => item.id === fromId);
    const to = next.findIndex((item) => item.id === toId);
    if (from < 0 || to < 0 || from === to) return;
    const [row] = next.splice(from, 1);
    next.splice(to, 0, row);
    write(next);
  }

  function nudge(id: string, dir: -1 | 1) {
    const from = sorted.findIndex((item) => item.id === id);
    const to = from + dir;
    if (from < 0 || to < 0 || to >= sorted.length) return;
    move(String(sorted[from].id), String(sorted[to].id));
  }

  const cover = (item: CollectionItem) =>
    String(item[mediaKey || ''] || item.src || item.avatar || item.videoSrc || item.video || item.image || '');

  return (
    <div>
      {sorted.length > 8 ? (
        <div className="field">
          <label htmlFor={`search-${prefix}`}>Search</label>
          <input
            id={`search-${prefix}`}
            className="input"
            placeholder="Search"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            style={{ marginBottom: 12 }}
          />
        </div>
      ) : null}
      {!sorted.length ? <p className="empty">{addLabel} to get started. Changes stay in the draft until you publish.</p> : null}
      <div className={variant === 'cards' ? 'cards-grid' : 'collection'}>
        {visible.map((item) => {
          const index = sorted.findIndex((row) => row.id === item.id);
          return (
          <div
            className={variant === 'cards' ? 'visual-card' : 'item-row has-handle'}
            key={String(item.id)}
            onDragOver={(e) => e.preventDefault()}
            onDrop={() => {
              if (dragId) move(dragId, String(item.id));
              setDragId(null);
            }}
          >
            {variant === 'cards' ? (
              <>
                <div className="cover">
                  <MediaThumb url={cover(item)} large />
                </div>
                <div className="pad">
                  <b>{titleOf(item) || 'Untitled'}</b>
                  <span>{subtitleOf?.(item) || ''}</span>
                  <div className="row" style={{ marginTop: 8 }}>
                    <button
                      className="drag-handle"
                      type="button"
                      draggable
                      aria-label="Drag to reorder"
                      onDragStart={() => setDragId(String(item.id))}
                      onDragEnd={() => setDragId(null)}
                    >
                      ⋮⋮
                    </button>
                    <button className="btn btn-sm" type="button" disabled={index === 0} onClick={() => nudge(String(item.id), -1)}>
                      Up
                    </button>
                    <button
                      className="btn btn-sm"
                      type="button"
                      disabled={index === sorted.length - 1}
                      onClick={() => nudge(String(item.id), 1)}
                    >
                      Down
                    </button>
                    <span className={`chip ${item.status || 'published'}`}>{String(item.status || 'published')}</span>
                    <button className="btn btn-sm" type="button" onClick={() => setEditing({ ...item })}>
                      Edit
                    </button>
                    <button className="btn btn-sm" type="button" onClick={() => duplicate(item)}>
                      Duplicate
                    </button>
                    <button className="btn btn-sm btn-danger" type="button" onClick={() => setRemoveId(String(item.id))}>
                      Delete
                    </button>
                  </div>
                </div>
              </>
            ) : (
              <>
                <button
                  className="drag-handle"
                  type="button"
                  draggable
                  aria-label="Drag to reorder"
                  onDragStart={() => setDragId(String(item.id))}
                  onDragEnd={() => setDragId(null)}
                >
                  ⋮⋮
                </button>
                <MediaThumb url={cover(item)} />
                <div>
                  <b>{titleOf(item) || 'Untitled'}</b>
                  <span>{subtitleOf?.(item) || ''}</span>
                </div>
                <div className="row">
                  <button className="btn btn-sm" type="button" disabled={index === 0} onClick={() => nudge(String(item.id), -1)}>
                    Up
                  </button>
                  <button
                    className="btn btn-sm"
                    type="button"
                    disabled={index === sorted.length - 1}
                    onClick={() => nudge(String(item.id), 1)}
                  >
                    Down
                  </button>
                  <span className={`chip ${item.status || 'published'}`}>{String(item.status || 'published')}</span>
                  <button className="btn btn-sm" type="button" onClick={() => setEditing({ ...item })}>
                    Edit
                  </button>
                  <button className="btn btn-sm" type="button" onClick={() => duplicate(item)}>
                    Duplicate
                  </button>
                  <button
                    className="btn btn-sm"
                    type="button"
                    onClick={() =>
                      write(
                        list.map((row) =>
                          row.id === item.id ? { ...row, status: row.status === 'published' ? 'hidden' : 'published' } : row
                        )
                      )
                    }
                  >
                    {item.status === 'hidden' ? 'Show' : 'Hide'}
                  </button>
                  <button className="btn btn-sm btn-danger" type="button" onClick={() => setRemoveId(String(item.id))}>
                    Delete
                  </button>
                </div>
              </>
            )}
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
          setEditing({ ...(newItem?.() || {}), id: newId(prefix), status: 'published' });
        }}
      >
        {addLabel}
      </button>
      {editing ? (
        <div className="modal-backdrop" onClick={() => setEditing(null)}>
          <div
            className="modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby={`${prefix}-edit-title`}
            onClick={(e) => e.stopPropagation()}
          >
            <h3 id={`${prefix}-edit-title`}>{list.some((row) => row.id === editing.id) ? 'Edit' : 'New'}</h3>
            {formError ? <p className="err">{formError}</p> : null}
            {fields.map((field) => {
              const id = `${prefix}-${editing.id}-${field.key}`;
              if (field.type === 'media') {
                const mediaKind =
                  field.kind || (String(editing.mediaType || '') === 'video' ? 'video' : String(editing.mediaType || '') === 'image' ? 'image' : field.kind);
                return (
                  <LocalMedia
                    key={field.key}
                    label={field.label}
                    kind={mediaKind}
                    value={String(editing[field.key] ?? '')}
                    onChange={(url) => setEditing({ ...editing, [field.key]: url })}
                  />
                );
              }
              if (field.type === 'select') {
                return (
                  <div className="field" key={field.key}>
                    <label htmlFor={id}>{field.label}</label>
                    <select
                      id={id}
                      className="select"
                      value={String(editing[field.key] ?? '')}
                      onChange={(e) => setEditing({ ...editing, [field.key]: e.target.value })}
                    >
                      {(field.options || []).map((option) => {
                        const val = typeof option === 'string' ? option : option.value;
                        const label = typeof option === 'string' ? option : option.label;
                        return (
                          <option key={val} value={val}>
                            {label}
                          </option>
                        );
                      })}
                    </select>
                  </div>
                );
              }
              if (field.type === 'toggle') {
                return (
                  <div className="field" key={field.key} style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                    <input
                      id={id}
                      type="checkbox"
                      checked={Boolean(editing[field.key])}
                      onChange={(e) => setEditing({ ...editing, [field.key]: e.target.checked })}
                    />
                    <label htmlFor={id} style={{ margin: 0 }}>
                      {field.label}
                    </label>
                  </div>
                );
              }
              if (field.type === 'textarea') {
                return (
                  <div className="field" key={field.key}>
                    <label htmlFor={id}>{field.label}</label>
                    <textarea
                      id={id}
                      className="textarea"
                      maxLength={field.maxLength || 4000}
                      value={String(editing[field.key] ?? '')}
                      onChange={(e) => setEditing({ ...editing, [field.key]: e.target.value })}
                    />
                  </div>
                );
              }
              return (
                <div className="field" key={field.key}>
                  <label htmlFor={id}>{field.label}</label>
                  <input
                    id={id}
                    className="input"
                    type={field.type === 'number' ? 'number' : 'text'}
                    min={field.min}
                    max={field.max}
                    maxLength={field.type === 'number' ? undefined : field.maxLength || 180}
                    value={String(editing[field.key] ?? '')}
                    onChange={(e) =>
                      setEditing({
                        ...editing,
                        [field.key]: field.type === 'number' ? Number(e.target.value) : e.target.value,
                      })
                    }
                  />
                  {field.hint ? <div className="hint">{field.hint}</div> : null}
                </div>
              );
            })}
            <div className="row" style={{ justifyContent: 'flex-end' }}>
              <button className="btn" type="button" onClick={() => setEditing(null)}>
                Cancel
              </button>
              <button className="btn btn-primary" type="button" onClick={() => saveItem(editing)}>
                Save to draft
              </button>
            </div>
          </div>
        </div>
      ) : null}
      {removeId ? (
        <ConfirmDialog
          title="Remove this item?"
          body="It will be removed from the draft. The live site stays unchanged until you publish."
          confirmLabel="Remove"
          danger
          onCancel={() => setRemoveId(null)}
          onConfirm={() => {
            write(list.filter((row) => row.id !== removeId));
            setRemoveId(null);
          }}
        />
      ) : null}
    </div>
  );
}
