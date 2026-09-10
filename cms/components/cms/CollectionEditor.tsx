'use client';

import { useState } from 'react';
import { useDraft } from './DraftProvider';
import { getPath, newId, type CollectionItem } from '@/lib/content-path';
import { MediaPicker } from './MediaPicker';
import { MediaThumb } from './MediaPicker';

export type EditorField = {
  key: string;
  label: string;
  type?: 'text' | 'textarea' | 'number' | 'toggle' | 'select' | 'media';
  kind?: 'image' | 'video' | 'audio';
  options?: Array<string | { value: string; label: string }>;
  hint?: string;
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
      <label>{label}</label>
      <div className="row">
        <MediaThumb url={value} type={kind} />
        <input className="input" style={{ flex: 1 }} value={value} onChange={(e) => onChange(e.target.value)} />
        <button className="btn" type="button" onClick={() => setOpen(true)}>
          Library
        </button>
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
}: {
  path: string;
  prefix: string;
  fields: EditorField[];
  titleOf: (item: CollectionItem) => string;
  subtitleOf?: (item: CollectionItem) => string;
  addLabel: string;
  newItem?: () => CollectionItem;
}) {
  const { content, replaceContent } = useDraft();
  const [editing, setEditing] = useState<CollectionItem | null>(null);
  const list = (getPath(content, path) as CollectionItem[] | undefined) || [];
  const sorted = [...list].sort((a, b) => Number(a.order || 0) - Number(b.order || 0));

  function write(nextList: CollectionItem[]) {
    if (!content) return;
    const parts = path.split('.');
    const clone = structuredClone(content) as Record<string, unknown>;
    let cur: Record<string, unknown> = clone;
    for (let i = 0; i < parts.length - 1; i += 1) {
      cur = cur[parts[i]] as Record<string, unknown>;
    }
    cur[parts[parts.length - 1]] = nextList;
    replaceContent(clone as typeof content);
  }

  function saveItem(item: CollectionItem) {
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
    setEditing(null);
  }

  return (
    <div>
      <div className="collection">
        {sorted.map((item) => (
          <div className="item-row" key={String(item.id)}>
            <MediaThumb url={String(item.src || item.avatar || item.videoSrc || '')} />
            <div>
              <b>{titleOf(item) || 'Untitled'}</b>
              <span>{subtitleOf?.(item) || ''}</span>
            </div>
            <span className={`chip ${item.status || 'published'}`}>{String(item.status || 'published')}</span>
            <div className="row">
              <button className="btn" type="button" onClick={() => setEditing({ ...item })}>
                Edit
              </button>
              <button
                className="btn"
                type="button"
                onClick={() =>
                  write(
                    list.map((row) =>
                      row.id === item.id ? { ...row, status: row.status === 'published' ? 'draft' : 'published' } : row
                    )
                  )
                }
              >
                Status
              </button>
              <button className="btn btn-danger" type="button" onClick={() => write(list.filter((row) => row.id !== item.id))}>
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
        onClick={() => setEditing({ ...(newItem?.() || {}), id: newId(prefix), status: 'published' })}
      >
        {addLabel}
      </button>
      {editing ? (
        <div className="modal-backdrop" onClick={() => setEditing(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h3>{list.some((row) => row.id === editing.id) ? 'Edit item' : 'New item'}</h3>
            {fields.map((field) => {
              if (field.type === 'media') {
                return (
                  <LocalMedia
                    key={field.key}
                    label={field.label}
                    kind={field.kind}
                    value={String(editing[field.key] ?? '')}
                    onChange={(url) => setEditing({ ...editing, [field.key]: url })}
                  />
                );
              }
              if (field.type === 'select') {
                return (
                  <div className="field" key={field.key}>
                    <label>{field.label}</label>
                    <select
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
                      type="checkbox"
                      checked={Boolean(editing[field.key])}
                      onChange={(e) => setEditing({ ...editing, [field.key]: e.target.checked })}
                    />
                    <label style={{ margin: 0 }}>{field.label}</label>
                  </div>
                );
              }
              if (field.type === 'textarea') {
                return (
                  <div className="field" key={field.key}>
                    <label>{field.label}</label>
                    <textarea
                      className="textarea"
                      value={String(editing[field.key] ?? '')}
                      onChange={(e) => setEditing({ ...editing, [field.key]: e.target.value })}
                    />
                  </div>
                );
              }
              return (
                <div className="field" key={field.key}>
                  <label>{field.label}</label>
                  <input
                    className="input"
                    type={field.type === 'number' ? 'number' : 'text'}
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
    </div>
  );
}
