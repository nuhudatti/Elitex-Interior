'use client';

import { DraftProvider, useDraft } from '@/components/cms/DraftProvider';

function PublishInner() {
  const { dirty, publish, publishing, saveDraft, saving, error, message, user, draftUpdatedAt, publishedUpdatedAt } = useDraft();

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Publish</h1>
          <p>Publishing copies the Neon draft to the published document, writes a ContentVersion, and an AuditLog with your login.</p>
        </div>
      </div>
      <div className="card">
        <p>
          <b>{dirty ? 'Unsaved draft changes' : 'Draft is saved'}</b>
        </p>
        <p className="hint">Draft {draftUpdatedAt || '—'} · Published {publishedUpdatedAt || '—'}</p>
        {error ? <p className="err">{error}</p> : null}
        {message ? <p className="ok">{message}</p> : null}
        <div className="row">
          <button className="btn" type="button" disabled={!dirty || saving} onClick={() => saveDraft()}>
            Save draft only
          </button>
          {user?.canPublish ? (
            <button className="btn btn-primary" type="button" disabled={publishing} onClick={() => publish()}>
              {publishing ? 'Publishing…' : 'Publish to Neon'}
            </button>
          ) : (
            <p className="hint">Your role cannot publish. Ask an administrator for an explicit grant.</p>
          )}
        </div>
      </div>
    </>
  );
}

export default function PublishPage() {
  return (
    <DraftProvider>
      <PublishInner />
    </DraftProvider>
  );
}
