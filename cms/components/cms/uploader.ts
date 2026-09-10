'use client';

const CHUNK = 6 * 1024 * 1024;
const MAX_TRIES = 4;

export type UploadConfig = {
  mode: 'signed' | 'unsigned' | 'unavailable';
  cloudName: string;
  folder: string;
  uploadPreset: string;
  missing: string[];
};

export type SignedParams = {
  apiKey: string;
  timestamp: number;
  signature: string;
  folder: string;
  cloudName: string;
};

function resourceTypeOf(file: File) {
  const name = file.name.toLowerCase();
  const type = (file.type || '').toLowerCase();
  if (type.startsWith('audio') || /\.(mp3|wav|ogg|m4a)$/.test(name)) return 'video';
  if (type.startsWith('video') || /\.(mov|mp4|m4v|webm|avi|mkv|qt)$/.test(name)) return 'video';
  return 'image';
}

function parseCldError(xhr: XMLHttpRequest) {
  let msg = '';
  try {
    msg = (JSON.parse(xhr.responseText).error || {}).message || '';
  } catch {
    msg = '';
  }
  if (!msg && xhr.status) msg = `Upload failed (${xhr.status})`;
  if (/preset/i.test(msg)) return 'Upload preset not found.';
  if (!msg || xhr.status === 0) return 'Network error during upload. Keep this tab open and retry.';
  return msg;
}

function postChunk(
  url: string,
  form: FormData,
  headers: Record<string, string>,
  onProgress: (loaded: number, total: number) => void,
  timeoutMs: number,
  signal?: AbortSignal
) {
  return new Promise<Record<string, unknown>>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', url);
    Object.entries(headers).forEach(([key, value]) => xhr.setRequestHeader(key, value));
    xhr.timeout = timeoutMs || 0;
    const abort = () => {
      xhr.abort();
      reject(new Error('Upload canceled'));
    };
    if (signal) {
      if (signal.aborted) {
        abort();
        return;
      }
      signal.addEventListener('abort', abort, { once: true });
    }
    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable) onProgress(event.loaded, event.total);
    };
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        try {
          resolve(JSON.parse(xhr.responseText || '{}'));
        } catch {
          reject(new Error('Cloudinary returned an invalid response'));
        }
      } else {
        reject(new Error(parseCldError(xhr)));
      }
    };
    xhr.onerror = () => reject(new Error(parseCldError(xhr)));
    xhr.ontimeout = () => reject(new Error('Upload timed out. Keep this tab open and retry.'));
    xhr.onabort = () => reject(new Error('Upload canceled'));
    xhr.send(form);
  });
}

async function withRetries<T>(fn: () => Promise<T>) {
  let attempt = 0;
  for (;;) {
    try {
      return await fn();
    } catch (error) {
      const message = error instanceof Error ? error.message : '';
      const fatal = /preset not found|not configured|invalid|canceled/i.test(message);
      attempt += 1;
      if (fatal || attempt >= MAX_TRIES) throw error;
      await new Promise((resolve) => setTimeout(resolve, Math.min(1500 * attempt, 6000)));
    }
  }
}

export async function uploadToCloudinary(
  file: File,
  config: UploadConfig,
  signed: SignedParams | null,
  onProgress: (ratio: number) => void,
  signal?: AbortSignal
) {
  if (config.mode === 'unavailable') {
    throw new Error(`Cloudinary upload is not configured. Missing: ${config.missing.join(', ')}`);
  }
  const rtype = resourceTypeOf(file);
  const url = `https://api.cloudinary.com/v1_1/${encodeURIComponent(config.cloudName)}/${rtype}/upload`;
  const uid = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`.slice(0, 20);
  const total = file.size || 0;
  const folder = signed?.folder || config.folder;

  const sendRange = async (start: number): Promise<Record<string, unknown>> => {
    const end = Math.min(start + CHUNK, total) - 1;
    const last = !total || end >= total - 1;
    const headers: Record<string, string> = {};
    if (total > CHUNK) {
      headers['X-Unique-Upload-Id'] = uid;
      headers['Content-Range'] = `bytes ${start}-${end}/${total}`;
    }
    const res = await withRetries(async () => {
      const blob = total ? file.slice(start, end + 1) : file;
      const form = new FormData();
      form.append('file', blob, file.name || 'upload');
      form.append('folder', folder);
      if (config.mode === 'unsigned') {
        form.append('upload_preset', config.uploadPreset);
      } else if (signed) {
        form.append('api_key', signed.apiKey);
        form.append('timestamp', String(signed.timestamp));
        form.append('signature', signed.signature);
      }
      return postChunk(
        url,
        form,
        headers,
        (loaded) => onProgress(Math.min((start + loaded) / (total || 1), 0.99)),
        last && rtype === 'video' ? 12 * 60 * 1000 : 0,
        signal
      );
    });
    if (!last && total > CHUNK) return sendRange(end + 1);
    onProgress(1);
    if (res.error) throw new Error(String((res.error as { message?: string }).message || 'Cloudinary error'));
    if (!res.secure_url && res.public_id) {
      res.secure_url = `https://res.cloudinary.com/${config.cloudName}/${rtype}/upload/${res.public_id}`;
    }
    if (!res.secure_url) throw new Error('Upload finished but Cloudinary did not return a URL.');
    return res;
  };

  return sendRange(0);
}
