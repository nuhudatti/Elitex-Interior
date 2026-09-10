'use client';

import { useState } from 'react';
import { useDraft } from './DraftProvider';
import { getPath } from '@/lib/content-path';
import { MediaPicker } from './MediaPicker';
import { MediaThumb } from './MediaPicker';

export function Field({
  label,
  path,
  hint,
  type = 'text',
}: {
  label: string;
  path: string;
  hint?: string;
  type?: 'text' | 'textarea' | 'number' | 'toggle';
}) {
  const { content, setField } = useDraft();
  const value = getPath(content, path);
  if (type === 'toggle') {
    return (
      <div className="field" style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
        <input
          type="checkbox"
          checked={value !== false}
          onChange={(e) => setField(path, e.target.checked)}
        />
        <label style={{ margin: 0 }}>{label}</label>
      </div>
    );
  }
  if (type === 'textarea') {
    return (
      <div className="field">
        <label>{label}</label>
        <textarea className="textarea" value={String(value ?? '')} onChange={(e) => setField(path, e.target.value)} />
        {hint ? <div className="hint">{hint}</div> : null}
      </div>
    );
  }
  return (
    <div className="field">
      <label>{label}</label>
      <input
        className="input"
        type={type === 'number' ? 'number' : 'text'}
        value={String(value ?? '')}
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
  return (
    <div className="field">
      <label>{label}</label>
      <select className="select" value={value} onChange={(e) => setField(path, e.target.value)}>
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
  const value = String(getPath(content, path) ?? '');
  return (
    <div className="field">
      <label>{label}</label>
      <div className="row">
        <MediaThumb url={value} type={kind} />
        <input className="input" style={{ flex: 1 }} value={value} onChange={(e) => setField(path, e.target.value)} />
        <button className="btn" type="button" onClick={() => setOpen(true)}>
          Library
        </button>
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
    </div>
  );
}

export function SaveBar() {
  const { dirty, saving, publishing, saveDraft, publish, error, message, user } = useDraft();
  return (
    <div className="sticky-actions">
      {error ? <span className="err">{error}</span> : null}
      {message ? <span className="ok">{message}</span> : null}
      <button className="btn" type="button" disabled={!dirty || saving} onClick={() => saveDraft()}>
        {saving ? 'Saving…' : 'Save draft'}
      </button>
      {user?.canPublish ? (
        <button className="btn btn-primary" type="button" disabled={publishing} onClick={() => publish()}>
          {publishing ? 'Publishing…' : 'Publish'}
        </button>
      ) : null}
    </div>
  );
}
