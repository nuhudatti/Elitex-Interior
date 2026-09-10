'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { cmsJson } from './api';
import { isAudioUrl } from '@/lib/cloudinary-url';

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

export function useMediaLibrary(options?: {
  kind?: 'image' | 'video' | 'audio' | '';
  pageSize?: number;
}) {
  const kind = options?.kind || '';
  const pageSize = options?.pageSize || 48;
  const [rows, setRows] = useState<MediaRow[]>([]);
  const [q, setQ] = useState('');
  const [qDebounced, setQDebounced] = useState('');
  const [type, setType] = useState('');
  const [sort, setSort] = useState('newest');
  const [total, setTotal] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState('');
  const offsetRef = useRef(0);

  useEffect(() => {
    const timer = window.setTimeout(() => setQDebounced(q.trim()), 280);
    return () => window.clearTimeout(timer);
  }, [q]);

  const apiType =
    kind === 'image' ? 'image' : kind === 'video' || kind === 'audio' ? 'video' : type === 'image' || type === 'video' ? type : '';

  const load = useCallback(
    async (reset: boolean) => {
      if (reset) {
        setLoading(true);
        setError('');
        offsetRef.current = 0;
      } else {
        setLoadingMore(true);
      }
      const nextOffset = reset ? 0 : offsetRef.current;
      const params = new URLSearchParams({
        limit: String(pageSize),
        offset: String(nextOffset),
        sort,
      });
      if (qDebounced) params.set('q', qDebounced);
      if (apiType) params.set('type', apiType);
      const result = await cmsJson<{
        media?: MediaRow[];
        count?: number;
        total?: number;
        hasMore?: boolean;
      }>(`/api/cms/media?${params.toString()}`);
      if (!result.ok) {
        setError(result.json.error || 'The media library could not be loaded.');
        setLoading(false);
        setLoadingMore(false);
        return;
      }
      let next = result.json.media || [];
      if (kind === 'audio') next = next.filter((row) => isAudioUrl(row.secureUrl || row.url) || row.format === 'mp3');
      if (kind === 'video') next = next.filter((row) => !isAudioUrl(row.secureUrl || row.url) && row.format !== 'mp3');
      setRows((current) => (reset ? next : [...current, ...next]));
      setTotal(Number(result.json.total ?? result.json.count ?? next.length));
      offsetRef.current = nextOffset + next.length;
      setHasMore(Boolean(result.json.hasMore));
      setLoading(false);
      setLoadingMore(false);
    },
    [apiType, kind, pageSize, qDebounced, sort]
  );

  useEffect(() => {
    void load(true);
  }, [load]);

  return {
    rows,
    q,
    setQ,
    type,
    setType,
    sort,
    setSort,
    total,
    hasMore,
    loading,
    loadingMore,
    error,
    reload: () => load(true),
    loadMore: () => {
      if (!loading && !loadingMore && hasMore) void load(false);
    },
    kindLocked: Boolean(kind),
  };
}
