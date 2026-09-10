'use client';

import { useState } from 'react';
import { ConfirmDialog } from '@/components/cms/ConfirmDialog';
import { kindOf } from '@/components/cms/MediaPicker';
import { MediaLightbox, MediaThumb } from '@/components/cms/MediaThumb';
import { UploadQueue } from '@/components/cms/UploadQueue';
import { useToast } from '@/components/cms/Toast';
import { useMediaLibrary, type MediaRow } from '@/components/cms/useMediaLibrary';
import { cmsJson } from '@/components/cms/api';
import { useModalA11y } from '@/components/cms/useModalA11y';
import { formatBytes, formatDims, formatWhen } from '@/lib/format';
import { cldPoster, cldVideo } from '@/lib/cloudinary-url';

function DetailModal({
  detail,
  onClose,
  onDelete,
}: {
  detail: MediaRow;
  onClose: () => void;
  onDelete: () => void;
}) {
  const ref = useModalA11y(onClose);
  const [preview, setPreview] = useState(false);
  const url = detail.secureUrl || detail.url;
  const typeName = kindOf(detail);
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div ref={ref} className="modal" role="dialog" aria-modal="true" aria-labelledby="media-detail-title" onClick={(e) => e.stopPropagation()}>
        <button className="thumb-open" type="button" onClick={() => setPreview(true)} aria-label="Enlarge preview">
          <MediaThumb url={url} type={typeName} large />
        </button>
        <h3 id="media-detail-title">{detail.originalFilename || 'Media'}</h3>
        <p className="hint">
          {typeName} · {formatDims(detail.width, detail.height)} · {formatBytes(detail.bytes)} · added {formatWhen(detail.createdAt)}
        </p>
        {typeName === 'video' ? (
          <video
            className="preview-media-lg"
            controls
            playsInline
            poster={cldPoster(url, 960) || undefined}
            src={cldVideo(url)}
            style={{ marginTop: 12 }}
          />
        ) : null}
        <details>
          <summary className="hint">Technical details</summary>
          <p className="hint">Public ID: {detail.publicId || '—'}</p>
          <p className="hint">Folder: {detail.folder || 'elitex'}</p>
        </details>
        <div className="row" style={{ marginTop: 16, justifyContent: 'flex-end' }}>
          <button className="btn" type="button" onClick={onClose}>
            Close
          </button>
          <button className="btn btn-danger" type="button" onClick={onDelete}>
            Delete
          </button>
        </div>
      </div>
      {preview ? <MediaLightbox url={url} type={typeName} onClose={() => setPreview(false)} /> : null}
    </div>
  );
}

export default function MediaPage() {
  const { push } = useToast();
  const library = useMediaLibrary({ pageSize: 48 });
  const [view, setView] = useState<'grid' | 'list'>('grid');
  const [selected, setSelected] = useState<string[]>([]);
  const [detail, setDetail] = useState<MediaRow | null>(null);
  const [remove, setRemove] = useState<{ ids: string[]; force?: boolean; referenced?: boolean } | null>(null);
  const [busy, setBusy] = useState(false);

  function toggle(id: string) {
    setSelected((current) => (current.includes(id) ? current.filter((item) => item !== id) : [...current, id]));
  }

  async function copyUrls() {
    const urls = library.rows.filter((row) => selected.includes(row.id)).map((row) => row.secureUrl || row.url);
    await navigator.clipboard.writeText(urls.join('\n'));
    push('Copied media references');
  }

  async function deleteIds(ids: string[], force = false) {
    setBusy(true);
    try {
      for (const id of ids) {
        const result = await cmsJson(`/api/cms/media/${id}${force ? '?force=1' : ''}`, { method: 'DELETE' });
        if (result.response.status === 409 && !force) {
          setRemove({ ids, referenced: true });
          return;
        }
        if (!result.ok) {
          push(result.json.error || 'That file could not be removed.', 'error');
          return;
        }
      }
      setRemove(null);
      setSelected([]);
      setDetail(null);
      push('Media removed from the library');
      await library.reload();
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <UploadQueue onComplete={() => library.reload()} />
      <div className="row" style={{ marginBottom: 14 }}>
        <input
          className="input"
          placeholder="Search by name"
          value={library.q}
          onChange={(e) => library.setQ(e.target.value)}
          aria-label="Search media"
          style={{ flex: 1 }}
        />
        <select className="select" value={library.type} onChange={(e) => library.setType(e.target.value)} aria-label="Filter type" style={{ maxWidth: 140 }}>
          <option value="">All</option>
          <option value="image">Images</option>
          <option value="video">Videos</option>
        </select>
        <select className="select" value={library.sort} onChange={(e) => library.setSort(e.target.value)} aria-label="Sort media" style={{ maxWidth: 150 }}>
          <option value="newest">Newest</option>
          <option value="oldest">Oldest</option>
          <option value="name">Name</option>
        </select>
        <button className="btn" type="button" onClick={() => setView(view === 'grid' ? 'list' : 'grid')}>
          {view === 'grid' ? 'List' : 'Grid'}
        </button>
      </div>
      {library.error ? <p className="err">{library.error}</p> : null}
      <p className="hint">
        {library.loading ? 'Loading library…' : `${library.total} files`} · existing Cloudinary library is kept · new uploads are added only after they succeed
      </p>
      {selected.length ? (
        <div className="bulk-bar">
          <span>{selected.length} items selected</span>
          <div className="row">
            <button className="btn btn-sm" type="button" onClick={() => setSelected(library.rows.map((row) => row.id))}>
              Select all loaded
            </button>
            <button className="btn btn-sm" type="button" onClick={() => setSelected([])}>
              Clear selection
            </button>
            <button className="btn btn-sm" type="button" onClick={copyUrls}>
              Copy references
            </button>
            <button className="btn btn-sm btn-danger" type="button" onClick={() => setRemove({ ids: selected })}>
              Delete
            </button>
          </div>
        </div>
      ) : null}
      {library.loading ? (
        <div className="media-grid">
          {Array.from({ length: 12 }).map((_, index) => (
            <div key={index} className="skeleton" style={{ height: 168 }} />
          ))}
        </div>
      ) : library.rows.length ? (
        <div className={view === 'grid' ? 'media-grid' : 'collection'}>
          {library.rows.map((row) => {
            const url = row.secureUrl || row.url;
            const typeName = kindOf(row);
            const on = selected.includes(row.id);
            return view === 'grid' ? (
              <button
                type="button"
                key={row.id}
                className={`media-card ${on ? 'selected' : ''}`}
                onClick={(event) => {
                  if (event.shiftKey || event.metaKey || event.ctrlKey) toggle(row.id);
                  else setDetail(row);
                }}
              >
                <MediaThumb url={url} type={typeName} large />
                <div className="meta">
                  <input
                    type="checkbox"
                    checked={on}
                    onChange={() => toggle(row.id)}
                    onClick={(e) => e.stopPropagation()}
                    aria-label={`Select ${row.originalFilename || row.id}`}
                  />{' '}
                  {row.originalFilename || row.publicId || row.id}
                </div>
              </button>
            ) : (
              <div className="item-row" key={row.id}>
                <MediaThumb url={url} type={typeName} />
                <div>
                  <b>{row.originalFilename || row.publicId}</b>
                  <span>
                    {typeName} · {formatDims(row.width, row.height)} · {formatBytes(row.bytes)}
                  </span>
                </div>
                <div className="row">
                  <input type="checkbox" checked={on} onChange={() => toggle(row.id)} aria-label={`Select ${row.originalFilename || row.id}`} />
                  <button className="btn btn-sm" type="button" onClick={() => setDetail(row)}>
                    Details
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <p className="empty">No files match this search. Upload above or clear the filters.</p>
      )}
      {library.hasMore ? (
        <button className="btn" type="button" style={{ marginTop: 16 }} disabled={library.loadingMore} onClick={library.loadMore}>
          {library.loadingMore ? 'Loading…' : 'Load more'}
        </button>
      ) : null}
      {detail ? (
        <DetailModal
          detail={detail}
          onClose={() => setDetail(null)}
          onDelete={() => setRemove({ ids: [detail.id] })}
        />
      ) : null}
      {remove ? (
        <ConfirmDialog
          title={remove.referenced ? 'This file is used on the live site' : 'Remove from the library?'}
          body={
            remove.referenced
              ? 'Deleting it can leave a broken image or video on the published website. Continue only if you accept that.'
              : 'The Cloudinary file may also be deleted. The live site is checked for references first.'
          }
          confirmLabel={remove.referenced ? 'Delete anyway' : 'Delete'}
          danger
          busy={busy}
          onCancel={() => setRemove(null)}
          onConfirm={() => deleteIds(remove.ids, Boolean(remove.referenced))}
        />
      ) : null}
    </>
  );
}
