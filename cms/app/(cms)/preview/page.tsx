'use client';

import { useEffect, useRef, useState } from 'react';
import { useDraft } from '@/components/cms/DraftProvider';
import { SaveBar } from '@/components/cms/fields';
import { cmsJson } from '@/components/cms/api';

const PAGES = [
  { file: 'index.html', label: 'Home' },
  { file: 'project.html', label: 'Showcase' },
  { file: 'project2.html', label: 'Showcase 2' },
  { file: 'reviews.html', label: 'Reviews' },
];

export default function PreviewPage() {
  const { content, loading } = useDraft();
  const [page, setPage] = useState('index.html');
  const frame = useRef<HTMLIFrameElement>(null);

  useEffect(() => {
    const query = new URLSearchParams(window.location.search).get('page');
    if (query && PAGES.some((item) => item.file === query)) {
      setPage(query);
      return;
    }
    const stored = window.localStorage.getItem('elitex_cms_preview_page');
    if (stored && PAGES.some((item) => item.file === stored)) {
      setPage(stored);
    }
    cmsJson<{ settings?: { previewPage?: string } }>('/api/cms/settings').then((result) => {
      if (!result.ok || query) return;
      const next = result.json.settings?.previewPage;
      if (next && PAGES.some((item) => item.file === next) && !stored) setPage(next);
    });
  }, []);

  useEffect(() => {
    window.localStorage.setItem('elitex_cms_preview_page', page);
  }, [page]);

  useEffect(() => {
    const iframe = frame.current;
    if (!iframe || !content) return;
    const send = () => {
      try {
        iframe.contentWindow?.postMessage({ type: 'cms:content', content }, '*');
      } catch {
        /* wait for load */
      }
    };
    iframe.addEventListener('load', send);
    send();
    return () => iframe.removeEventListener('load', send);
  }, [content, page]);

  if (loading || !content) return <div className="skeleton" style={{ height: 240 }} />;

  return (
    <>
      <div className="row" style={{ marginBottom: 12 }}>
        <label htmlFor="preview-page-select" className="sr-only">
          Preview page
        </label>
        <select
          id="preview-page-select"
          className="select"
          value={page}
          onChange={(e) => setPage(e.target.value)}
          style={{ maxWidth: 240 }}
        >
          {PAGES.map((item) => (
            <option key={item.file} value={item.file}>
              {item.label}
            </option>
          ))}
        </select>
      </div>
      <div className="preview-wrap">
        <div className="preview-banner">DRAFT PREVIEW — NOT LIVE</div>
        <iframe
          ref={frame}
          className="preview-frame"
          title="Draft preview"
          src={`https://elitexinterior.com/${page}?cmsPreview=1`}
        />
      </div>
      <SaveBar />
    </>
  );
}
