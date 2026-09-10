'use client';

import { useEffect, useState } from 'react';
import { cmsJson } from '@/components/cms/api';
import { MediaThumb, type MediaRow } from '@/components/cms/MediaPicker';
import { uploadToCloudinary, type UploadConfig, type SignedParams } from '@/components/cms/uploader';

export default function MediaPage() {
  const [rows, setRows] = useState<MediaRow[]>([]);
  const [config, setConfig] = useState<UploadConfig | null>(null);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [progress, setProgress] = useState<number | null>(null);
  const [q, setQ] = useState('');

  async function load() {
    const [media, upload] = await Promise.all([
      cmsJson<{ media?: MediaRow[]; count?: number }>('/api/cms/media'),
      cmsJson<UploadConfig>('/api/cms/media/upload-config'),
    ]);
    if (media.ok) setRows(media.json.media || []);
    else setError(media.json.error || 'Could not load media');
    if (upload.ok) setConfig(upload.json);
  }

  useEffect(() => {
    load().catch(() => setError('Could not load media'));
  }, []);

  async function onFiles(files: FileList | null) {
    if (!files?.length || !config) return;
    if (config.mode === 'unavailable') {
      setError(`Upload blocked. Add ${config.missing.join(', ')} in cms/.env and Vercel (server-only).`);
      return;
    }
    setError('');
    for (const file of Array.from(files)) {
      setProgress(0);
      setMessage(`Uploading ${file.name}`);
      let signed: SignedParams | null = null;
      if (config.mode === 'signed') {
        const sign = await cmsJson<SignedParams>('/api/cms/media/sign', {
          method: 'POST',
          body: JSON.stringify({ folder: config.folder }),
        });
        if (!sign.ok) {
          setError(sign.json.error || 'Could not sign upload');
          setProgress(null);
          return;
        }
        signed = sign.json;
      }
      try {
        const asset = await uploadToCloudinary(file, config, signed, (ratio) => setProgress(ratio));
        if (!asset.secure_url || !asset.public_id) throw new Error('Cloudinary did not return a valid asset');
        const complete = await cmsJson('/api/cms/media/complete', {
          method: 'POST',
          body: JSON.stringify({ ...asset, name: file.name, cloudName: config.cloudName }),
        });
        if (!complete.ok) throw new Error(complete.json.error || 'Neon save failed');
        setMessage(`Saved ${file.name} to Neon. Draft media registry updated. Published unchanged.`);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Upload failed');
        setProgress(null);
        return;
      }
    }
    setProgress(null);
    await load();
  }

  async function remove(row: MediaRow) {
    if (!window.confirm(`Remove ${row.originalFilename || row.url} from the CMS library? Live pages that still reference it will be checked first.`)) {
      return;
    }
    const result = await cmsJson(`/api/cms/media/${row.id}`, { method: 'DELETE' });
    if (result.response.status === 409) {
      const go = window.confirm('This asset is referenced by published content. Delete anyway? This can break a live page.');
      if (!go) return;
      const forced = await cmsJson(`/api/cms/media/${row.id}?force=1`, { method: 'DELETE' });
      if (!forced.ok) {
        setError(forced.json.error || 'Delete failed');
        return;
      }
    } else if (!result.ok) {
      setError(result.json.error || 'Delete failed');
      return;
    }
    await load();
  }

  const filtered = rows.filter((row) => {
    if (!q) return true;
    return `${row.originalFilename || ''} ${row.url}`.toLowerCase().includes(q.toLowerCase());
  });

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Media library</h1>
          <p>Neon holds metadata. Cloudinary holds files. The original imported set is kept.</p>
        </div>
        <label className="btn btn-primary">
          Upload
          <input
            type="file"
            multiple
            accept="image/*,video/*,audio/*,.mov,.mp4,.m4v,.webm"
            style={{ display: 'none' }}
            onChange={(e) => onFiles(e.target.files)}
          />
        </label>
      </div>
      {config?.mode === 'unavailable' ? (
        <div className="banner">
          Uploads are blocked until a Cloudinary credential exists. Add these server-only names in cms/.env and Vercel:{' '}
          {(config.missing || []).join(', ')}. Cloud name stays dpdmb5t1l. Do not paste values into chat.
        </div>
      ) : (
        <p className="hint">Upload mode: {config?.mode || '…'} · folder {config?.folder || 'elitex'}</p>
      )}
      {error ? <p className="err">{error}</p> : null}
      {message ? <p className="ok">{message}</p> : null}
      {progress != null ? <p>Upload {Math.round(progress * 100)}%</p> : null}
      <input className="input" placeholder="Search…" value={q} onChange={(e) => setQ(e.target.value)} style={{ marginBottom: 12 }} />
      <p className="hint">{filtered.length} assets</p>
      <div className="media-grid">
        {filtered.map((row) => (
          <div className="media-card" key={row.id}>
            <MediaThumb url={row.secureUrl || row.url} type={row.resourceType} />
            <div className="meta">
              {row.originalFilename || row.publicId || row.id}
              <div className="row" style={{ marginTop: 6 }}>
                <button className="btn btn-danger" type="button" onClick={() => remove(row)}>
                  Delete
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>
    </>
  );
}
