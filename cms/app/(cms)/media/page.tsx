'use client';

import { useEffect, useMemo, useState } from 'react';
import { cmsJson } from '@/components/cms/api';
import { ConfirmDialog } from '@/components/cms/ConfirmDialog';
import { kindOf, type MediaRow } from '@/components/cms/MediaPicker';
import { MediaThumb } from '@/components/cms/MediaThumb';
import { UploadQueue } from '@/components/cms/UploadQueue';
import { useToast } from '@/components/cms/Toast';
import { formatBytes, formatDims, formatWhen } from '@/lib/format';

const PAGE_SIZE = 48;

export default function MediaPage() {
  const { push } = useToast();
  const [rows, setRows] = useState<MediaRow[]>([]);
  const [error, setError] = useState('');
  const [q, setQ] = useState('');
  const [type, setType] = useState('');
  const [sort, setSort] = useState('newest');
  const [view, setView] = useState<'grid' | 'list'>('grid');
  const [selected, setSelected] = useState<string[]>([]);
  const [detail, setDetail] = useState<MediaRow | null>(null);
  const [remove, setRemove] = useState<{ ids: string[]; force?: boolean; referenced?: boolean } | null>(null);
  const [visible, setVisible] = useState(PAGE_SIZE);

  async function load() {
    const media = await cmsJson<{ media?: MediaRow[] }>('/api/cms/media');
    if (media.ok) setRows(media.json.media || []);
    else setError(media.json.error || 'The media library could not be loaded.');
  }

  useEffect(() => {
    load().catch(() => setError('The media library could not be loaded.'));
  }, []);

  const filtered = useMemo(() => {
    const next = rows.filter((row) => {
      const kind = kindOf(row);
      if (type && kind !== type) return false;
      if (q && !`${row.originalFilename || ''} ${row.publicId || ''} ${row.url}`.toLowerCase().includes(q.toLowerCase())) {
        return false;
      }
      return true;
    });
    next.sort((a, b) => {
      if (sort === 'name') return String(a.originalFilename || '').localeCompare(String(b.originalFilename || ''));
      if (sort === 'oldest') return String(a.createdAt || '').localeCompare(String(b.createdAt || ''));
      return String(b.createdAt || '').localeCompare(String(a.createdAt || ''));
    });
    return next;
  }, [q, rows, sort, type]);

  const page = filtered.slice(0, visible);

  function toggle(id: string) {
    setSelected((current) => (current.includes(id) ? current.filter((item) => item !== id) : [...current, id]));
  }

  async function copyUrls() {
    const urls = rows.filter((row) => selected.includes(row.id)).map((row) => row.secureUrl || row.url);
    await navigator.clipboard.writeText(urls.join('\n'));
    push('Copied media references');
  }

  async function deleteIds(ids: string[], force = false) {
    for (const id of ids) {
      const result = await cmsJson(`/api/cms/media/${id}${force ? '?force=1' : ''}`, { method: 'DELETE' });
      if (result.response.status === 409 && !force) {
        setRemove({ ids, referenced: true });
        return;
      }
      if (!result.ok) {
        setError(result.json.error || 'That file could not be removed.');
        return;
      }
    }
    setRemove(null);
    setSelected([]);
    setDetail(null);
    push('Media removed from the library');
    await load();
  }

  return (
    <>
      <UploadQueue onComplete={() => load()} />
      <div className="row" style={{ marginBottom: 14 }}>
        <input className="input" placeholder="Search filename or public ID" value={q} onChange={(e) => setQ(e.target.value)} style={{ flex: 1 }} />
        <select className="select" value={type} onChange={(e) => setType(e.target.value)} style={{ maxWidth: 140 }}>
          <option value="">All types</option>
          <option value="image">Images</option>
          <option value="video">Videos</option>
          <option value="audio">Audio</option>
        </select>
        <select className="select" value={sort} onChange={(e) => setSort(e.target.value)} style={{ maxWidth: 150 }}>
          <option value="newest">Newest</option>
          <option value="oldest">Oldest</option>
          <option value="name">Name</option>
        </select>
        <button className="btn" type="button" onClick={() => setView(view === 'grid' ? 'list' : 'grid')}>
          {view === 'grid' ? 'List' : 'Grid'}
        </button>
      </div>
      {error ? <p className="err">{error}</p> : null}
      <p className="hint">
        {filtered.length} files · existing Cloudinary library is kept · new uploads are added only after they succeed
      </p>
      {selected.length ? (
        <div className="bulk-bar">
          <span>{selected.length} items selected</span>
          <div className="row">
            <button className="btn btn-sm" type="button" onClick={() => setSelected(filtered.map((row) => row.id))}>
              Select all
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
      <div className={view === 'grid' ? 'media-grid' : 'collection'}>
        {page.map((row) => {
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
                <input type="checkbox" checked={on} onChange={() => toggle(row.id)} />
                <button className="btn btn-sm" type="button" onClick={() => setDetail(row)}>
                  Details
                </button>
              </div>
            </div>
          );
        })}
      </div>
      {visible < filtered.length ? (
        <button className="btn" type="button" style={{ marginTop: 16 }} onClick={() => setVisible((n) => n + PAGE_SIZE)}>
          Load more
        </button>
      ) : null}
      {detail ? (
        <div className="modal-backdrop" onClick={() => setDetail(null)}>
          <div className="modal" role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
            <MediaThumb url={detail.secureUrl || detail.url} type={kindOf(detail)} large />
            <h3>{detail.originalFilename || 'Media'}</h3>
            <p className="hint">
              {kindOf(detail)} · {formatDims(detail.width, detail.height)} · {formatBytes(detail.bytes)} · added{' '}
              {formatWhen(detail.createdAt)}
            </p>
            <details>
              <summary className="hint">Technical details</summary>
              <p className="hint">Public ID: {detail.publicId || '—'}</p>
              <p className="hint">Folder: {detail.folder || 'elitex'}</p>
              <p className="hint">{detail.secureUrl || detail.url}</p>
            </details>
            <div className="row" style={{ marginTop: 16, justifyContent: 'flex-end' }}>
              <button className="btn" type="button" onClick={() => setDetail(null)}>
                Close
              </button>
              <button
                className="btn btn-danger"
                type="button"
                onClick={() => setRemove({ ids: [detail.id] })}
              >
                Delete
              </button>
            </div>
          </div>
        </div>
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
          onCancel={() => setRemove(null)}
          onConfirm={() => deleteIds(remove.ids, Boolean(remove.referenced))}
        />
      ) : null}
    </>
  );
}
