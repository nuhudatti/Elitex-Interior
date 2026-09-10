'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { cmsJson } from './api';
import type { ContentDocumentData } from '@/lib/content';
import { setPath } from '@/lib/content-path';

type UserInfo = {
  id: string;
  name: string;
  email?: string | null;
  role: string;
  roleLabel: string;
  canPublish: boolean;
};

type DraftContextValue = {
  content: ContentDocumentData | null;
  published: ContentDocumentData | null;
  dirty: boolean;
  saving: boolean;
  publishing: boolean;
  error: string;
  message: string;
  user: UserInfo | null;
  draftUpdatedAt: string | null;
  publishedUpdatedAt: string | null;
  setField: (path: string, value: unknown) => void;
  replaceContent: (next: ContentDocumentData) => void;
  saveDraft: () => Promise<boolean>;
  publish: () => Promise<boolean>;
  reload: () => Promise<void>;
};

const DraftContext = createContext<DraftContextValue | null>(null);

export function DraftProvider({ children }: { children: React.ReactNode }) {
  const [content, setContent] = useState<ContentDocumentData | null>(null);
  const [published, setPublished] = useState<ContentDocumentData | null>(null);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [user, setUser] = useState<UserInfo | null>(null);
  const [draftUpdatedAt, setDraftUpdatedAt] = useState<string | null>(null);
  const [publishedUpdatedAt, setPublishedUpdatedAt] = useState<string | null>(null);

  const reload = useCallback(async () => {
    const [me, draft, pub] = await Promise.all([
      cmsJson<{ user?: UserInfo }>('/api/auth/me'),
      cmsJson<{ content?: ContentDocumentData; updatedAt?: string }>('/api/cms/content/draft'),
      cmsJson<{ content?: ContentDocumentData; updatedAt?: string }>('/api/content'),
    ]);
    if (me.json.user) setUser(me.json.user);
    if (draft.ok && draft.json.content) {
      setContent(draft.json.content);
      setDraftUpdatedAt(draft.json.updatedAt || null);
      setDirty(false);
    } else {
      setError(draft.json.error || 'Could not load draft');
    }
    if (pub.ok && pub.json.content) {
      setPublished(pub.json.content);
      setPublishedUpdatedAt(pub.json.updatedAt || null);
    }
  }, []);

  useEffect(() => {
    reload().catch(() => setError('Could not load draft'));
  }, [reload]);

  const setField = useCallback((path: string, value: unknown) => {
    setContent((current) => (current ? setPath(current, path, value) : current));
    setDirty(true);
    setMessage('');
  }, []);

  const replaceContent = useCallback((next: ContentDocumentData) => {
    setContent(next);
    setDirty(true);
    setMessage('');
  }, []);

  const saveDraft = useCallback(async () => {
    if (!content) return false;
    setSaving(true);
    setError('');
    try {
      const result = await cmsJson('/api/cms/content/draft', {
        method: 'PUT',
        body: JSON.stringify({ content }),
      });
      if (!result.ok) {
        setError(result.json.error || 'Save failed');
        return false;
      }
      setDirty(false);
      setDraftUpdatedAt(typeof result.json.updatedAt === 'string' ? result.json.updatedAt : null);
      setMessage('Draft saved. Published site unchanged.');
      return true;
    } finally {
      setSaving(false);
    }
  }, [content]);

  const publish = useCallback(async () => {
    setPublishing(true);
    setError('');
    try {
      if (dirty) {
        const saved = await saveDraft();
        if (!saved) return false;
      }
      const result = await cmsJson('/api/cms/content/publish', { method: 'POST' });
      if (!result.ok) {
        setError(result.json.error === 'forbidden' ? 'Publish requires an administrator or an explicit grant.' : result.json.error || 'Publish failed');
        return false;
      }
      setMessage('Published. Public GET /api/content now matches this draft.');
      await reload();
      return true;
    } finally {
      setPublishing(false);
    }
  }, [dirty, reload, saveDraft]);

  const value = useMemo(
    () => ({
      content,
      published,
      dirty,
      saving,
      publishing,
      error,
      message,
      user,
      draftUpdatedAt,
      publishedUpdatedAt,
      setField,
      replaceContent,
      saveDraft,
      publish,
      reload,
    }),
    [
      content,
      published,
      dirty,
      saving,
      publishing,
      error,
      message,
      user,
      draftUpdatedAt,
      publishedUpdatedAt,
      setField,
      replaceContent,
      saveDraft,
      publish,
      reload,
    ]
  );

  return <DraftContext.Provider value={value}>{children}</DraftContext.Provider>;
}

export function useDraft() {
  const ctx = useContext(DraftContext);
  if (!ctx) throw new Error('useDraft must be used inside DraftProvider');
  return ctx;
}
