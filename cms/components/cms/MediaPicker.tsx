'use client';

import { useEffect, useMemo, useState } from 'react';
import { cmsJson } from './api';
import { MediaThumb } from './MediaThumb';
import { UploadQueue } from './UploadQueue';
import { isAudioUrl, isVideoUrl } from '@/lib/cloudinary-url';

export type MediaRow = {
  id: string;
  url: string;
  secureUrl?: string | null;
  publicId?: string | null;
  originalFilename?: string | null;
  resourceType: string;
  folder?: string | null;
  format?: string | null;
  width?: number | null;
  height?: number | null;
  bytes?: number | null;
  createdAt?: string;
  updatedAt?: string;
};

export { MediaThumb };

export function kindOf(row: MediaRow) {
  const url = row.secureUrl || row.url;
  if (isAudioUrl(url) || row.format === 'mp3') return 'audio';
  if (row.resourceType === 'video' || isVideoUrl(url)) return 'video';
  return 'image';
}

export function MediaPicker({
  kind,
  multi,
  onClose,
  onPick,
  onPickMany,
}: {
  kind?: 'image' | 'video' | 'audio' | '';
  multi?: boolean;
  onClose: () => void;
  onPick: (url: string, row: MediaRow) => void;
  onPickMany?: (rows: MediaRow[]) => void;
}) {
  const [rows, setRows] = useState<MediaRow[]>([]);
  const [q, setQ] = useState('');
  const [selected, setSelected] = useState<MediaRow[]>([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  async function load() {
    const result = await cmsJson<{ media?: MediaRow[] }>('/api/cms/media');
    if (result.ok) setRows(result.json.media || []);
    else setError(result.json.error || 'The media library could not be loaded.');
    setLoading(false);
  }

  useEffect(() => {
    load().catch(() => {
      setError('The media library could not be loaded.');
      setLoading(false);
    });
  }, []);

  const filtered = useMemo(
    () =>
      rows.filter((row) => {
        const type = kindOf(row);
        if (kind && type !== kind) return false;
        if (q && !`${row.originalFilename || ''} ${row.publicId || ''} ${row.url}`.toLowerCase().includes(q.toLowerCase())) {
          return false;
        }
        return true;
      }),
    [kind, q, rows]
  );

  function toggle(row: MediaRow) {
    if (!multi) {
      setSelected([row]);
      return;
    }
    setSelected((current) => (current.some((item) => item.id === row.id) ? current.filter((item) => item.id !== row.id) : [...current, row]));
  }

  function useSelected() {
    if (!selected.length) return;
    if (multi && onPickMany) onPickMany(selected);
    else onPick(selected[0].secureUrl || selected[0].url, selected[0]);
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal wide" role="dialog" aria-modal="true" aria-labelledby="picker-title" onClick={(e) => e.stopPropagation()}>
        <h2 id="picker-title">Choose media</h2>
        <UploadQueue compact onComplete={() => load()} />
        <input className="input" placeholder="Search filename or public ID" value={q} onChange={(e) => setQ(e.target.value)} />
        {error ? <p className="err">{error}</p> : null}
        {loading ? <div className="skeleton" style={{ height: 120, marginTop: 12 }} /> : null}
        <div className="media-grid" style={{ marginTop: 12 }}>
          {filtered.map((row) => {
            const url = row.secureUrl || row.url;
            const type = kindOf(row);
            const isOn = selected.some((item) => item.id === row.id);
            return (
              <button
                type="button"
                key={row.id}
                className={`media-card ${isOn ? 'selected' : ''}`}
                onClick={() => toggle(row)}
                onDoubleClick={() => onPick(url, row)}
              >
                <MediaThumb url={url} type={type} large />
                <div className="meta">
                  {row.originalFilename || row.publicId || row.id}
                  <br />
                  {type}
                </div>
              </button>
            );
          })}
        </div>
        <div className="row" style={{ marginTop: 14, justifyContent: 'flex-end' }}>
          <button className="btn" type="button" onClick={onClose}>
            Cancel
          </button>
          <button className="btn btn-primary" type="button" disabled={!selected.length} onClick={useSelected}>
            Use selected media
          </button>
        </div>
      </div>
    </div>
  );
}
