'use client';

import { Field, MediaField, SaveBar } from '@/components/cms/fields';
import { CollectionEditor } from '@/components/cms/CollectionEditor';
import { useDraft } from '@/components/cms/DraftProvider';

export function ShowcaseEditor({ pageKey, fileName }: { pageKey: 'showcase' | 'showcase2'; fileName: string }) {
  const { content, loading } = useDraft();
  if (loading || !content) return <div className="skeleton" style={{ height: 180 }} />;

  return (
    <>
      <p className="hint" style={{ marginTop: -8, marginBottom: 16 }}>
        {fileName} — visual gallery, then project stories in Projects.
      </p>
      <div className="card">
        <Field label="Hero title" path={`pages.${pageKey}.hero.title`} hint="Use <br> for a line break" />
        <Field label="Hero subtitle" path={`pages.${pageKey}.hero.subtitle`} type="textarea" />
        <Field label="Button 1" path={`pages.${pageKey}.hero.ctaPrimary`} />
        <Field label="Button 2" path={`pages.${pageKey}.hero.ctaSecondary`} />
        <Field label="Grid heading" path={`pages.${pageKey}.gridHeading`} />
        <Field label="Show philosophy" path={`pages.${pageKey}.philosophy.visible`} type="toggle" />
        <Field label="Philosophy heading" path={`pages.${pageKey}.philosophy.heading`} />
        <Field label="Philosophy text" path={`pages.${pageKey}.philosophy.text`} type="textarea" />
        <Field label="Background audio enabled" path={`pages.${pageKey}.audio.enabled`} type="toggle" />
        <MediaField label="Audio file" path={`pages.${pageKey}.audio.src`} kind="audio" />
      </div>
      <CollectionEditor
        path={`pages.${pageKey}.items`}
        prefix="sc"
        addLabel="Add gallery item"
        variant="cards"
        titleOf={(i) => String(i.title || i.projectSlug || '(untitled)')}
        subtitleOf={(i) => `${i.mediaType || ''} · ${i.category || ''}`}
        fields={[
          { key: 'title', label: 'Overlay title' },
          { key: 'subtitle', label: 'Overlay subtitle' },
          { key: 'mediaType', label: 'Media type', type: 'select', options: ['video', 'image'] },
          { key: 'src', label: 'Media file', type: 'media' },
          { key: 'category', label: 'Category', type: 'select', options: ['luxury', 'residential', 'commercial'] },
          { key: 'projectSlug', label: 'Project details slug' },
          { key: 'alt', label: 'Alt text' },
        ]}
        newItem={() => ({ mediaType: 'image', category: 'luxury', lazy: true, status: 'published' })}
      />
      <SaveBar />
    </>
  );
}
