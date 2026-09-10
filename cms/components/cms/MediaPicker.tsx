'use client';

import { useEffect, useMemo, useState } from 'react';
import { cmsJson } from './api';
import { cldImage, cldPoster, isAudioUrl, isVideoUrl } from '@/lib/cloudinary-url';

export type MediaRow = {
  id: string;
  url: string;
  secureUrl?: string | null;
  publicId?: string | null;
  originalFilename?: string | null;
  resourceType: string;
  folder?: string | null;
  format?: string | null;
};

function kindOf(row: MediaRow) {
  const url = row.secureUrl || row.url;
  if (isAudioUrl(url) || row.format === 'mp3') return 'audio';
  if (row.resourceType === 'video' || isVideoUrl(url)) return 'video';
  return 'image';
}

export function MediaThumb({ url, type }: { url: string; type?: string }) {
  if (!url) return <div className="thumb" />;
  if (type === 'audio' || isAudioUrl(url)) return <div className="thumb" />;
  if (type === 'video' || isVideoUrl(url)) {
    const poster = cldPoster(url, 160);
    return poster ? <img className="thumb" alt="" src={poster} /> : <div className="thumb" />;
  }
  return <img className="thumb" alt="" src={cldImage(url, 160)} />;
}

export function MediaPicker({
  kind,
  onClose,
  onPick,
}: {
  kind?: 'image' | 'video' | 'audio' | '';
  onClose: () => void;
  onPick: (url: string, row: MediaRow) => void;
}) {
  const [rows, setRows] = useState<MediaRow[]>([]);
  const [q, setQ] = useState('');
  const [selected, setSelected] = useState<MediaRow | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    cmsJson<{ media?: MediaRow[] }>('/api/cms/media')
      .then((result) => {
        if (result.ok) setRows(result.json.media || []);
        else setError(result.json.error || 'Could not load media');
      })
      .catch(() => setError('Could not load media'));
  }, []);

  const filtered = useMemo(
    () =>
      rows.filter((row) => {
        const type = kindOf(row);
        if (kind && type !== kind) return false;
        if (q && !`${row.originalFilename || ''} ${row.url}`.toLowerCase().includes(q.toLowerCase())) return false;
        return true;
      }),
    [kind, q, rows]
  );

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h3>Choose from library</h3>
        <p className="hint">Neon metadata for the existing Cloudinary assets. Nothing is uploaded until you publish a selected URL into the draft.</p>
        <input className="input" placeholder="Search…" value={q} onChange={(e) => setQ(e.target.value)} />
        {error ? <p className="err">{error}</p> : null}
        <div className="media-grid" style={{ marginTop: 12 }}>
          {filtered.map((row) => {
            const url = row.secureUrl || row.url;
            const type = kindOf(row);
            return (
              <button
                type="button"
                key={row.id}
                className={`media-card ${selected?.id === row.id ? 'selected' : ''}`}
                onClick={() => setSelected(row)}
                onDoubleClick={() => onPick(url, row)}
              >
                <MediaThumb url={url} type={type} />
                <div className="meta">
                  {row.originalFilename || row.id}
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
          <button
            className="btn btn-primary"
            type="button"
            disabled={!selected}
            onClick={() => selected && onPick(selected.secureUrl || selected.url, selected)}
          >
            Use selected
          </button>
        </div>
      </div>
    </div>
  );
}
