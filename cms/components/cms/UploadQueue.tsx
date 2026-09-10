'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { cmsJson } from './api';
import { uploadToCloudinary, type SignedParams, type UploadConfig } from './uploader';
import { formatBytes } from '@/lib/format';

export type QueueItem = {
  id: string;
  file: File;
  status: 'waiting' | 'uploading' | 'processing' | 'done' | 'error' | 'canceled';
  progress: number;
  error?: string;
  thumb?: string;
};

function newId() {
  return `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
}

function fileKey(file: File) {
  return `${file.name}:${file.size}:${file.lastModified}`;
}

function isAllowed(file: File) {
  const type = (file.type || '').toLowerCase();
  const name = file.name.toLowerCase();
  if (type.startsWith('image/') || type.startsWith('video/') || type.startsWith('audio/')) return true;
  return /\.(jpe?g|png|gif|webp|avif|svg|bmp|tiff?|mp4|mov|m4v|webm|avi|mkv|qt|mp3|wav|ogg|m4a)$/i.test(name);
}

function fileKind(file: File) {
  const type = (file.type || '').toLowerCase();
  const name = file.name.toLowerCase();
  if (type.startsWith('video') || /\.(mov|mp4|m4v|webm|avi|mkv)$/.test(name)) return 'Video';
  if (type.startsWith('audio') || /\.(mp3|wav|ogg|m4a)$/.test(name)) return 'Audio';
  return 'Image';
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

  useEffect(() => {
    return () => {
      itemsRef.current.forEach((item) => {
        if (item.thumb) URL.revokeObjectURL(item.thumb);
      });
    };
  }, []);

  const stats = useMemo(() => {
    const total = items.length;
    const completed = items.filter((item) => item.status === 'done').length;
    const uploading = items.filter((item) => item.status === 'uploading' || item.status === 'processing').length;
    const failed = items.filter((item) => item.status === 'error').length;
    const remaining = items.filter((item) => item.status === 'waiting').length;
    const overall = total ? items.reduce((sum, item) => sum + item.progress, 0) / total : 0;
    return { total, completed, uploading, failed, remaining, overall };
  }, [items]);

  function patch(id: string, next: Partial<QueueItem>) {
    setItems((current) => current.map((item) => (item.id === id ? { ...item, ...next } : item)));
  }

  function addFiles(list: FileList | File[] | null) {
    if (!list?.length) return;
    const activeKeys = new Set(
      itemsRef.current
        .filter((item) => item.status === 'waiting' || item.status === 'uploading' || item.status === 'processing' || item.status === 'done')
        .map((item) => fileKey(item.file))
    );
    const next: QueueItem[] = [];
    for (const file of Array.from(list)) {
      if (!isAllowed(file)) continue;
      const key = fileKey(file);
      if (activeKeys.has(key)) continue;
      activeKeys.add(key);
      next.push({
        id: newId(),
        file,
        status: 'waiting',
        progress: 0,
        thumb: file.type.startsWith('image/') ? URL.createObjectURL(file) : undefined,
      });
    }
    if (next.length) setItems((current) => [...current, ...next]);
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
      if (itemsRef.current.some((item) => item.status === 'done')) onComplete?.();
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
        error: 'Uploads are paused until Cloudinary is configured on the server.',
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
      const asset = await uploadToCloudinary(
        item.file,
        config,
        signed,
        (ratio) => {
          patch(item.id, { progress: ratio, status: ratio >= 1 ? 'processing' : 'uploading' });
        },
        controller.signal
      );
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

  function clearFinished() {
    setItems((current) => {
      current
        .filter((item) => item.status === 'done' || item.status === 'canceled')
        .forEach((item) => {
          if (item.thumb) URL.revokeObjectURL(item.thumb);
        });
      return current.filter((item) => item.status !== 'done' && item.status !== 'canceled');
    });
  }

  const inputId = compact ? 'picker-files' : 'library-files';
  const failed = items.filter((item) => item.status === 'error');

  return (
    <div>
      {config?.mode === 'unavailable' ? (
        <div className="banner">Uploads are paused until Cloudinary is configured on the server.</div>
      ) : (
        <label
          className={`dropzone ${hot ? 'hot' : ''} ${compact ? 'compact' : ''}`}
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
          <p className="hint">or choose many files at once. Large videos keep uploading in the background.</p>
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
              {stats.total} files · {stats.completed} ready · {stats.uploading} uploading · {stats.remaining} waiting
              {stats.failed ? ` · ${stats.failed} failed` : ''}
            </span>
            <div className="row">
              {failed.length ? (
                <button className="btn btn-sm" type="button" onClick={() => failed.forEach(retry)}>
                  Retry failed
                </button>
              ) : null}
              <button className="btn btn-sm" type="button" onClick={clearFinished}>
                Clear finished
              </button>
            </div>
          </div>
          <div className="progress" aria-label="Overall upload progress">
            <span style={{ width: `${Math.round(stats.overall * 100)}%` }} />
          </div>
          {items.map((item) => (
            <div className="queue-item" key={item.id}>
              {item.thumb ? (
                <img className="queue-thumb" alt="" src={item.thumb} />
              ) : (
                <div className="queue-thumb kind">{fileKind(item.file)}</div>
              )}
              <div>
                <b>{item.file.name}</b>
                <div className="hint">
                  {fileKind(item.file)} · {formatBytes(item.file.size)}
                  {' · '}
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
