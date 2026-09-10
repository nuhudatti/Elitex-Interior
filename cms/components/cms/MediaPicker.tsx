'use client';

import { useState } from 'react';
import { MediaThumb } from './MediaThumb';
import { UploadQueue } from './UploadQueue';
import { isAudioUrl, isVideoUrl } from '@/lib/cloudinary-url';
import { useMediaLibrary, type MediaRow } from './useMediaLibrary';
import { useModalA11y } from './useModalA11y';

export type { MediaRow };

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
  const ref = useModalA11y(onClose);
  const library = useMediaLibrary({ kind, pageSize: 48 });
  const [selected, setSelected] = useState<MediaRow[]>([]);

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
      <div ref={ref} className="modal wide" role="dialog" aria-modal="true" aria-labelledby="picker-title" onClick={(e) => e.stopPropagation()}>
        <h2 id="picker-title">Choose media</h2>
        <UploadQueue compact onComplete={() => library.reload()} />
        <div className="row" style={{ marginBottom: 12 }}>
          <input
            className="input"
            placeholder="Search by name"
            value={library.q}
            onChange={(e) => library.setQ(e.target.value)}
            aria-label="Search media"
            style={{ flex: 1 }}
          />
          {library.kindLocked ? null : (
            <select className="select" value={library.type} onChange={(e) => library.setType(e.target.value)} aria-label="Filter type" style={{ maxWidth: 140 }}>
              <option value="">All</option>
              <option value="image">Images</option>
              <option value="video">Videos</option>
            </select>
          )}
        </div>
        {library.error ? <p className="err">{library.error}</p> : null}
        {library.loading ? (
          <div className="media-grid" style={{ marginTop: 12 }}>
            {Array.from({ length: 8 }).map((_, index) => (
              <div key={index} className="skeleton" style={{ height: 148 }} />
            ))}
          </div>
        ) : library.rows.length ? (
          <div className="media-grid" style={{ marginTop: 12 }}>
            {library.rows.map((row) => {
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
        ) : (
          <p className="empty">No matching files. Upload above or try another search.</p>
        )}
        {library.hasMore ? (
          <button className="btn" type="button" style={{ marginTop: 12 }} disabled={library.loadingMore} onClick={library.loadMore}>
            {library.loadingMore ? 'Loading…' : 'Load more'}
          </button>
        ) : null}
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
