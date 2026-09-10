'use client';

import { useEffect, useRef, useState } from 'react';
import { useDraft } from '@/components/cms/DraftProvider';
import { SaveBar } from '@/components/cms/fields';

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
        <select className="select" value={page} onChange={(e) => setPage(e.target.value)} style={{ maxWidth: 240 }}>
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
