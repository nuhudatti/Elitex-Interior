'use client';

import { useDraft } from '@/components/cms/DraftProvider';
import { formatWhen } from '@/lib/format';
import { auditActionLabel } from '@/lib/audit-labels';
import { CmsLink } from '@/components/cms/UnsavedNav';

export function DashboardClient({
  mediaCount,
  versionCount,
  userCount,
  recent,
  isAdmin,
}: {
  mediaCount: number;
  versionCount: number;
  userCount: number;
  isAdmin: boolean;
  recent: Array<{ id: string; action: string; detail?: string | null; createdAt: string; who: string }>;
}) {
  const { dirty, unpublished, changedSections, draftUpdatedAt, publishedUpdatedAt, loading, user } = useDraft();
  const waiting = changedSections.length;

  return (
    <>
      {dirty ? (
        <div className="banner danger">
          <strong>Unsaved changes.</strong> Stay on this page and save the draft before leaving.
        </div>
      ) : unpublished ? (
        <div className="banner">
          <strong>Draft changes.</strong> {waiting} section{waiting === 1 ? '' : 's'} waiting to be published
          {changedSections.length ? `: ${changedSections.join(', ')}` : ''}.
          <div className="row" style={{ marginTop: 10 }}>
            <CmsLink className="btn" href="/content">
              Review changes
            </CmsLink>
            <CmsLink className="btn" href="/preview">
              Preview
            </CmsLink>
            {user?.canPublish ? (
              <CmsLink className="btn btn-primary" href="/publish">
                Publish
              </CmsLink>
            ) : null}
          </div>
        </div>
      ) : (
        <div className="banner ok">The saved draft matches the live website content.</div>
      )}

      <div className="grid cols-4">
        <div className="card stat">
          <div className="num">{loading ? '…' : unpublished ? 'Draft' : 'Live'}</div>
          <div className="lbl">Website state</div>
        </div>
        <div className="card stat">
          <div className="num">{mediaCount}</div>
          <div className="lbl">Media files</div>
        </div>
        <div className="card stat">
          <div className="num">{versionCount}</div>
          <div className="lbl">Published versions</div>
        </div>
        <div className="card stat">
          <div className="num">{formatWhen(publishedUpdatedAt)}</div>
          <div className="lbl">Last published</div>
        </div>
      </div>

      <div className="grid cols-2">
        <div className="card">
          <h3>Last edited</h3>
          <p className="hint">Draft {formatWhen(draftUpdatedAt)}</p>
          <p className="hint">Published {formatWhen(publishedUpdatedAt)}</p>
        </div>
        <div className="card">
          <h3>Quick actions</h3>
          <div className="row" style={{ marginTop: 10 }}>
            <CmsLink className="btn" href="/content/home">
              Edit Home
            </CmsLink>
            <CmsLink className="btn" href="/content/projects">
              Add project
            </CmsLink>
            <CmsLink className="btn" href="/content/reviews">
              Add review
            </CmsLink>
            <CmsLink className="btn" href="/media">
              Upload media
            </CmsLink>
            <CmsLink className="btn" href="/preview">
              Preview
            </CmsLink>
            {user?.canPublish ? (
              <CmsLink className="btn btn-primary" href="/publish">
                Publish
              </CmsLink>
            ) : null}
          </div>
        </div>
      </div>

      {isAdmin ? (
        <div className="card">
          <h3>Recent activity</h3>
          {recent.length ? (
            <table className="table">
              <tbody>
                {recent.map((row) => (
                  <tr key={row.id}>
                    <td>{formatWhen(row.createdAt)}</td>
                    <td>{row.who}</td>
                    <td>{auditActionLabel(row.action)}</td>
                    <td>{row.detail}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <p className="hint">No activity yet.</p>
          )}
        </div>
      ) : (
        <p className="hint">{userCount} people can access this CMS.</p>
      )}
    </>
  );
}
