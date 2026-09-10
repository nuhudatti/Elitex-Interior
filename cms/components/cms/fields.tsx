'use client';

import { useState } from 'react';
import { useDraft } from './DraftProvider';
import { getPath } from '@/lib/content-path';
import { MediaPicker } from './MediaPicker';
import { MediaThumb, MediaLightbox } from './MediaThumb';
import { CmsLink } from './UnsavedNav';

function fieldId(path: string) {
  return `f-${path.replace(/[^a-zA-Z0-9]+/g, '-')}`;
}

export function Field({
  label,
  path,
  hint,
  type = 'text',
  maxLength,
}: {
  label: string;
  path: string;
  hint?: string;
  type?: 'text' | 'textarea' | 'number' | 'toggle';
  maxLength?: number;
}) {
  const { content, setField } = useDraft();
  const value = getPath(content, path);
  const id = fieldId(path);
  if (type === 'toggle') {
    return (
      <div className="field" style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
        <input id={id} type="checkbox" checked={value !== false} onChange={(e) => setField(path, e.target.checked)} />
        <label htmlFor={id} style={{ margin: 0 }}>
          {label}
        </label>
      </div>
    );
  }
  if (type === 'textarea') {
    return (
      <div className="field">
        <label htmlFor={id}>{label}</label>
        <textarea
          id={id}
          className="textarea"
          value={String(value ?? '')}
          maxLength={maxLength || 4000}
          onChange={(e) => setField(path, e.target.value)}
        />
        {hint ? <div className="hint">{hint}</div> : null}
      </div>
    );
  }
  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      <input
        id={id}
        className="input"
        type={type === 'number' ? 'number' : 'text'}
        value={String(value ?? '')}
        maxLength={type === 'number' ? undefined : maxLength || 180}
        onChange={(e) => setField(path, type === 'number' ? Number(e.target.value) : e.target.value)}
      />
      {hint ? <div className="hint">{hint}</div> : null}
    </div>
  );
}

export function SelectField({
  label,
  path,
  options,
}: {
  label: string;
  path: string;
  options: Array<string | { value: string; label: string }>;
}) {
  const { content, setField } = useDraft();
  const value = String(getPath(content, path) ?? '');
  const id = fieldId(path);
  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      <select id={id} className="select" value={value} onChange={(e) => setField(path, e.target.value)}>
        {options.map((option) => {
          const val = typeof option === 'string' ? option : option.value;
          const labelText = typeof option === 'string' ? option : option.label;
          return (
            <option key={val} value={val}>
              {labelText}
            </option>
          );
        })}
      </select>
    </div>
  );
}

export function MediaField({
  label,
  path,
  kind,
  hint,
}: {
  label: string;
  path: string;
  kind?: 'image' | 'video' | 'audio';
  hint?: string;
}) {
  const { content, setField } = useDraft();
  const [open, setOpen] = useState(false);
  const [preview, setPreview] = useState(false);
  const value = String(getPath(content, path) ?? '');
  return (
    <div className="field">
      <span className="label-text">{label}</span>
      <div className="row">
        <button className="thumb-open" type="button" onClick={() => value && setPreview(true)} disabled={!value} aria-label={value ? `Preview ${label}` : `${label} empty`}>
          <MediaThumb url={value} type={kind} />
        </button>
        <button className="btn btn-primary" type="button" onClick={() => setOpen(true)}>
          {value ? 'Replace media' : 'Choose media'}
        </button>
        {value ? (
          <button className="btn" type="button" onClick={() => setField(path, '')}>
            Remove
          </button>
        ) : null}
      </div>
      {hint ? <div className="hint">{hint}</div> : null}
      {open ? (
        <MediaPicker
          kind={kind}
          onClose={() => setOpen(false)}
          onPick={(url) => {
            setField(path, url);
            setOpen(false);
          }}
        />
      ) : null}
      {preview && value ? <MediaLightbox url={value} type={kind} onClose={() => setPreview(false)} /> : null}
    </div>
  );
}

export function SaveBar() {
  const { dirty, saving, saveDraft, error, message, user } = useDraft();
  return (
    <div className="sticky-actions">
      {error ? <span className="err">{error}</span> : null}
      {message && !error ? <span className="ok">{message}</span> : null}
      {saving ? <span className="status-pill saving">Saving…</span> : null}
      {dirty && !saving && !error ? <span className="status-pill unsaved">Unsaved changes</span> : null}
      {error && dirty && !saving ? <span className="status-pill failed">Save failed</span> : null}
      <CmsLink className="btn" href="/preview">
        Preview
      </CmsLink>
      <button className="btn btn-primary" type="button" disabled={!dirty || saving} onClick={() => saveDraft()}>
        {saving ? 'Saving…' : error && dirty ? 'Retry save' : 'Save draft'}
      </button>
      {user?.canPublish ? (
        <CmsLink className="btn" href="/publish">
          Publish
        </CmsLink>
      ) : null}
    </div>
  );
}
