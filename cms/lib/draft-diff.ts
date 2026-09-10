import { getPath } from '@/lib/content-path';

const SECTIONS: Array<{ path: string; label: string }> = [
  { path: 'site', label: 'Site' },
  { path: 'seo', label: 'SEO' },
  { path: 'pages.home', label: 'Home' },
  { path: 'pages.showcase', label: 'Showcase' },
  { path: 'pages.showcase2', label: 'Showcase 2' },
  { path: 'pages.reviews', label: 'Reviews' },
  { path: 'media', label: 'Media registry' },
];

export function changedSectionLabels(draft: unknown, published: unknown) {
  if (!draft || !published) return [];
  return SECTIONS.filter(({ path }) => JSON.stringify(getPath(draft, path)) !== JSON.stringify(getPath(published, path))).map(
    (item) => item.label
  );
}
