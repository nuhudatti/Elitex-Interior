'use client';

import { useState } from 'react';
import { ConfirmDialog } from '@/components/cms/ConfirmDialog';
import { useDraft } from '@/components/cms/DraftProvider';
import { formatWhen } from '@/lib/format';
import Link from 'next/link';

export default function PublishPage() {
  const {
    dirty,
    unpublished,
    changedSections,
    publish,
    publishing,
    saveDraft,
    saving,
    error,
    message,
    user,
    draftUpdatedAt,
    publishedUpdatedAt,
  } = useDraft();
  const [confirm, setConfirm] = useState(false);

  return (
    <>
      <div className="card">
        <p>
          <b>Live content</b> last published {formatWhen(publishedUpdatedAt)}
        </p>
        <p>
          <b>Draft</b> last saved {formatWhen(draftUpdatedAt)}
        </p>
        <p className="hint">
          {dirty
            ? 'You still have unsaved edits. Save the draft first.'
            : unpublished
              ? `Ready to publish: ${changedSections.join(', ') || 'draft changes'}.`
              : 'Nothing waiting. The live content already matches this draft.'}
        </p>
        {error ? <p className="err">{error}</p> : null}
        {message ? <p className="ok">{message}</p> : null}
        <div className="row" style={{ marginTop: 16 }}>
          <Link className="btn" href="/preview">
            Preview draft
          </Link>
          <button className="btn" type="button" disabled={!dirty || saving} onClick={() => saveDraft()}>
            {saving ? 'Saving…' : 'Save draft only'}
          </button>
          {user?.canPublish ? (
            <button className="btn btn-primary" type="button" disabled={publishing || (!dirty && !unpublished)} onClick={() => setConfirm(true)}>
              Publish changes
            </button>
          ) : (
            <p className="hint">You don't have permission to publish changes.</p>
          )}
        </div>
      </div>
      {confirm ? (
        <ConfirmDialog
          title="Publish to the live content source?"
          body="You are about to publish the current draft to the live content source in Neon. The public website files are not switched in this phase."
          confirmLabel="Publish changes"
          busy={publishing}
          onCancel={() => setConfirm(false)}
          onConfirm={async () => {
            const ok = await publish();
            if (ok) setConfirm(false);
          }}
        />
      ) : null}
    </>
  );
}
