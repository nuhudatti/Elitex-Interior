'use client';

import { useEffect, useRef, useState } from 'react';
import { DraftProvider, useDraft } from '@/components/cms/DraftProvider';

const PAGES = [
  { file: 'index.html', label: 'Home' },
  { file: 'project.html', label: 'project.html' },
  { file: 'project2.html', label: 'project2.html' },
  { file: 'reviews.html', label: 'reviews.html' },
];

function PreviewInner() {
  const { content } = useDraft();
  const [page, setPage] = useState('index.html');
  const frame = useRef<HTMLIFrameElement>(null);

  useEffect(() => {
    const iframe = frame.current;
    if (!iframe || !content) return;
    const send = () => {
      try {
        iframe.contentWindow?.postMessage({ type: 'cms:content', content }, '*');
      } catch {
        /* cross-origin until load */
      }
    };
    iframe.addEventListener('load', send);
    send();
    return () => iframe.removeEventListener('load', send);
  }, [content, page]);

  if (!content) return <p>Loading draft…</p>;

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Preview</h1>
          <p>Draft only. This does not change GET /api/content or the live site.</p>
        </div>
      </div>
      <div className="row" style={{ marginBottom: 12 }}>
        <select className="select" value={page} onChange={(e) => setPage(e.target.value)} style={{ maxWidth: 240 }}>
          {PAGES.map((item) => (
            <option key={item.file} value={item.file}>
              {item.label}
            </option>
          ))}
        </select>
      </div>
      <iframe
        ref={frame}
        className="preview-frame"
        title="Draft preview"
        src={`https://elitexinterior.com/${page}?cmsPreview=1`}
      />
    </>
  );
}

export default function PreviewPage() {
  return (
    <DraftProvider>
      <PreviewInner />
    </DraftProvider>
  );
}
