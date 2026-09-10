'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { cmsJson } from './api';
import { uploadToCloudinary, type SignedParams, type UploadConfig } from './uploader';

export type QueueItem = {
  id: string;
  file: File;
  status: 'waiting' | 'uploading' | 'processing' | 'done' | 'error' | 'canceled';
  progress: number;
  error?: string;
};

function newId() {
  return `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
}

export function UploadQueue({
  onComplete,
  compact,
}: {
  onComplete?: () => void;
  compact?: boolean;
}) {
  const [config, setConfig] = useState<UploadConfig | null>(null);
  const [items, setItems] = useState<QueueItem[]>([]);
  const [hot, setHot] = useState(false);
  const controllers = useRef(new Map<string, AbortController>());
  const itemsRef = useRef<QueueItem[]>([]);
  const pumping = useRef(false);
  itemsRef.current = items;

  useEffect(() => {
    cmsJson<UploadConfig>('/api/cms/media/upload-config').then((result) => {
      if (result.ok) setConfig(result.json);
    });
  }, []);

  const overall = useMemo(() => {
    if (!items.length) return 0;
    return items.reduce((sum, item) => sum + item.progress, 0) / items.length;
  }, [items]);
  const active = items.filter((item) => item.status === 'uploading' || item.status === 'processing' || item.status === 'waiting');
  const failed = items.filter((item) => item.status === 'error');

  function patch(id: string, next: Partial<QueueItem>) {
    setItems((current) => current.map((item) => (item.id === id ? { ...item, ...next } : item)));
  }

  function addFiles(list: FileList | File[] | null) {
    if (!list?.length) return;
    const next = Array.from(list).map((file) => ({
      id: newId(),
      file,
      status: 'waiting' as const,
      progress: 0,
    }));
    setItems((current) => [...current, ...next]);
  }

  async function drain() {
    if (!config || pumping.current) return;
    pumping.current = true;
    try {
      for (;;) {
        const next = itemsRef.current.find((item) => item.status === 'waiting');
        if (!next) break;
        await uploadOne(next);
      }
      onComplete?.();
    } finally {
      pumping.current = false;
      if (itemsRef.current.some((item) => item.status === 'waiting')) void drain();
    }
  }

  useEffect(() => {
    if (config && items.some((item) => item.status === 'waiting')) void drain();
  }, [items, config]);

  async function uploadOne(item: QueueItem) {
    if (!config) return;
    if (config.mode === 'unavailable') {
      patch(item.id, {
        status: 'error',
        error: `Upload is not configured. Missing: ${config.missing.join(', ')}`,
      });
      return;
    }
    const controller = new AbortController();
    controllers.current.set(item.id, controller);
    patch(item.id, { status: 'uploading', progress: 0, error: undefined });
    try {
      let signed: SignedParams | null = null;
      if (config.mode === 'signed') {
        const sign = await cmsJson<SignedParams>('/api/cms/media/sign', {
          method: 'POST',
          body: JSON.stringify({ folder: config.folder }),
        });
        if (!sign.ok) throw new Error(sign.json.error || 'Could not start upload');
        signed = sign.json;
      }
      const asset = await uploadToCloudinary(item.file, config, signed, (ratio) => {
        patch(item.id, { progress: ratio, status: ratio >= 1 ? 'processing' : 'uploading' });
      }, controller.signal);
      if (!asset.secure_url || !asset.public_id) throw new Error('Upload failed. Retry this file.');
      patch(item.id, { status: 'processing', progress: 1 });
      const complete = await cmsJson('/api/cms/media/complete', {
        method: 'POST',
        body: JSON.stringify({ ...asset, name: item.file.name, cloudName: config.cloudName }),
      });
      if (!complete.ok) throw new Error(complete.json.error || 'The file uploaded, but could not be saved to the library.');
      patch(item.id, { status: 'done', progress: 1 });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Upload failed. Retry this file.';
      if (message === 'Upload canceled') patch(item.id, { status: 'canceled' });
      else patch(item.id, { status: 'error', error: message });
    } finally {
      controllers.current.delete(item.id);
    }
  }

  function cancel(id: string) {
    controllers.current.get(id)?.abort();
    patch(id, { status: 'canceled' });
  }

  function retry(item: QueueItem) {
    patch(item.id, { status: 'waiting', progress: 0, error: undefined });
  }

  const inputId = compact ? 'picker-files' : 'library-files';

  return (
    <div>
      {config?.mode === 'unavailable' ? (
        <div className="banner">
          Uploads are paused until Cloudinary is configured on the server. Missing: {(config.missing || []).join(', ')}.
        </div>
      ) : (
        <label
          className={`dropzone ${hot ? 'hot' : ''}`}
          onDragOver={(e) => {
            e.preventDefault();
            setHot(true);
          }}
          onDragLeave={() => setHot(false)}
          onDrop={(e) => {
            e.preventDefault();
            setHot(false);
            addFiles(e.dataTransfer.files);
          }}
        >
          <strong>Drag photos and videos here</strong>
          <p className="hint">or choose many files at once. Large videos upload in the background.</p>
          <span className="btn btn-primary" style={{ marginTop: 12 }}>
            Choose files
          </span>
          <input
            id={inputId}
            type="file"
            multiple
            accept="image/*,video/*,audio/*,.mov,.mp4,.m4v,.webm"
            className="sr-only"
            onChange={(e) => {
              addFiles(e.target.files);
              e.currentTarget.value = '';
            }}
          />
        </label>
      )}
      {items.length ? (
        <div className="queue">
          <div className="row" style={{ justifyContent: 'space-between' }}>
            <span>
              {active.length ? `Uploading ${items.filter((i) => i.status === 'done').length} of ${items.length}` : `${items.length} files`}
            </span>
            <div className="row">
              {failed.length ? (
                <button className="btn btn-sm" type="button" onClick={() => failed.forEach(retry)}>
                  Retry failed
                </button>
              ) : null}
              <button
                className="btn btn-sm"
                type="button"
                onClick={() => setItems((current) => current.filter((item) => item.status !== 'done' && item.status !== 'canceled'))}
              >
                Clear finished
              </button>
            </div>
          </div>
          <div className="progress" aria-hidden>
            <span style={{ width: `${Math.round(overall * 100)}%` }} />
          </div>
          {items.map((item) => (
            <div className="queue-item" key={item.id}>
              <div>
                <b>{item.file.name}</b>
                <div className="hint">
                  {item.status === 'waiting' && 'Waiting'}
                  {item.status === 'uploading' && `Uploading ${Math.round(item.progress * 100)}%`}
                  {item.status === 'processing' && 'Processing…'}
                  {item.status === 'done' && 'Ready'}
                  {item.status === 'canceled' && 'Canceled'}
                  {item.status === 'error' && (item.error || 'Upload failed. Retry this file.')}
                </div>
                {item.status === 'uploading' || item.status === 'processing' ? (
                  <div className="progress">
                    <span style={{ width: `${Math.round(item.progress * 100)}%` }} />
                  </div>
                ) : null}
              </div>
              <div className="row">
                {item.status === 'error' ? (
                  <button className="btn btn-sm" type="button" onClick={() => retry(item)}>
                    Retry
                  </button>
                ) : null}
                {item.status === 'waiting' || item.status === 'uploading' ? (
                  <button className="btn btn-sm" type="button" onClick={() => cancel(item.id)}>
                    Cancel
                  </button>
                ) : null}
              </div>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}
