'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { cmsJson } from './api';
import { useToast } from './Toast';
import type { ContentDocumentData } from '@/lib/content';
import { setPath } from '@/lib/content-path';
import { changedSectionLabels } from '@/lib/draft-diff';
import { friendlyError } from '@/lib/friendly-error';

export type UserInfo = {
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
  unpublished: boolean;
  changedSections: string[];
  saving: boolean;
  publishing: boolean;
  loading: boolean;
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
  const { push } = useToast();
  const [content, setContent] = useState<ContentDocumentData | null>(null);
  const [published, setPublished] = useState<ContentDocumentData | null>(null);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [loading, setLoading] = useState(true);
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
      setError('');
    } else {
      setError(draft.json.error || 'The draft could not be loaded. Check your connection and try again.');
    }
    if (pub.ok && pub.json.content) {
      setPublished(pub.json.content);
      setPublishedUpdatedAt(pub.json.updatedAt || null);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    reload().catch(() => {
      setError('The draft could not be loaded. Check your connection and try again.');
      setLoading(false);
    });
  }, [reload]);

  useEffect(() => {
    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      if (!dirty) return;
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, [dirty]);

  const setField = useCallback((path: string, value: unknown) => {
    setContent((current) => (current ? setPath(current, path, value) : current));
    setDirty(true);
    setMessage('');
    setError('');
  }, []);

  const replaceContent = useCallback((next: ContentDocumentData) => {
    setContent(next);
    setDirty(true);
    setMessage('');
    setError('');
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
        const text = result.json.error || 'Your draft could not be saved. Check your connection and try again.';
        setError(text);
        push(text, 'error');
        return false;
      }
      setDirty(false);
      setError('');
      setDraftUpdatedAt(typeof result.json.updatedAt === 'string' ? result.json.updatedAt : null);
      setMessage(`Saved ${new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`);
      push('Draft saved');
      return true;
    } finally {
      setSaving(false);
    }
  }, [content, push]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 's') {
        event.preventDefault();
        if (dirty && !saving) void saveDraft();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [dirty, saving, saveDraft]);

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
        const text =
          result.response.status === 403
            ? "You don't have permission to publish changes."
            : friendlyError(result.json.error, 'Changes could not be published.');
        setError(text);
        push(text, 'error');
        return false;
      }
      setMessage('Changes published');
      push('Changes published');
      await reload();
      return true;
    } finally {
      setPublishing(false);
    }
  }, [dirty, push, reload, saveDraft]);

  const changedSections = useMemo(() => changedSectionLabels(content, published), [content, published]);
  const unpublished = changedSections.length > 0;

  const value = useMemo(
    () => ({
      content,
      published,
      dirty,
      unpublished,
      changedSections,
      saving,
      publishing,
      loading,
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
      unpublished,
      changedSections,
      saving,
      publishing,
      loading,
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
