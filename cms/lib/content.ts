/**
 * content.json shape used by js/site.js:
 * schemaVersion, updatedAt, site, seo, pages, media
 * The API stores and returns this object as-is.
 */

export type ContentDocumentData = {
  schemaVersion: number;
  updatedAt?: string;
  site: Record<string, unknown>;
  pages: Record<string, unknown>;
  seo?: unknown;
  media?: unknown[];
  [key: string]: unknown;
};

export function parseContent(
  input: unknown
): { ok: true; data: ContentDocumentData } | { ok: false; error: string } {
  if (input == null || typeof input !== 'object' || Array.isArray(input)) {
    return { ok: false, error: 'content must be an object' };
  }

  const raw = input as Record<string, unknown>;
  const schemaVersion = Number(raw.schemaVersion ?? 1);
  if (!Number.isInteger(schemaVersion) || schemaVersion < 1) {
    return { ok: false, error: 'schemaVersion must be a positive integer' };
  }

  if (!raw.site || typeof raw.site !== 'object' || Array.isArray(raw.site)) {
    return { ok: false, error: 'content.site must be an object' };
  }

  if (!raw.pages || typeof raw.pages !== 'object' || Array.isArray(raw.pages)) {
    return { ok: false, error: 'content.pages must be an object' };
  }

  if (raw.media != null && !Array.isArray(raw.media)) {
    return { ok: false, error: 'content.media must be an array when present' };
  }

  return { ok: true, data: raw as ContentDocumentData };
}

export function withTimestamp(data: ContentDocumentData): ContentDocumentData {
  return {
    ...data,
    schemaVersion: Number(data.schemaVersion) || 1,
    updatedAt: new Date().toISOString(),
  };
}
