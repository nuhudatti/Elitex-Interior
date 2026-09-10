'use client';

import { useEffect, useState } from 'react';
import { cmsJson } from '@/components/cms/api';
import { ConfirmDialog } from '@/components/cms/ConfirmDialog';
import { useToast } from '@/components/cms/Toast';
import { formatWhen } from '@/lib/format';
import { useDraft } from '@/components/cms/DraftProvider';
import { useModalA11y } from '@/components/cms/useModalA11y';

type VersionRow = {
  id: string;
  label: string | null;
  createdAt: string;
  documentId?: string | null;
  createdBy: { email?: string | null; name?: string | null } | null;
};

type VersionDetail = {
  id: string;
  label: string | null;
  createdAt: string;
  createdBy: { email?: string | null; name?: string | null } | null;
  summary?: { siteName?: string; pages?: string[] };
};

function ViewModal({ view, onClose }: { view: VersionDetail; onClose: () => void }) {
  const ref = useModalA11y(onClose);
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div ref={ref} className="modal" role="dialog" aria-modal="true" aria-labelledby="version-title" onClick={(e) => e.stopPropagation()}>
        <h3 id="version-title">{view.label || 'Published snapshot'}</h3>
        <p className="hint">
          {formatWhen(view.createdAt)} · {view.createdBy?.name || view.createdBy?.email || 'system'}
        </p>
        <p>
          <b>{view.summary?.siteName || 'Elitex Interior'}</b>
        </p>
        <p className="hint">Pages included: {(view.summary?.pages || []).join(', ') || 'Home and related pages'}</p>
        <p className="hint">Restoring writes this snapshot into the draft. The live website does not change until you publish.</p>
        <button className="btn" type="button" onClick={onClose}>
          Close
        </button>
      </div>
    </div>
  );
}

export default function VersionsPage() {
  const { reload } = useDraft();
  const { push } = useToast();
  const [rows, setRows] = useState<VersionRow[]>([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<VersionDetail | null>(null);
  const [restoreId, setRestoreId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function load() {
    const result = await cmsJson<{ versions?: VersionRow[] }>('/api/cms/versions');
    if (result.ok) setRows(result.json.versions || []);
    else setError(result.json.error || 'Version history could not be loaded.');
    setLoading(false);
  }

  useEffect(() => {
    load().catch(() => {
      setError('Version history could not be loaded.');
      setLoading(false);
    });
  }, []);

  async function open(id: string) {
    const result = await cmsJson<{ version?: VersionDetail }>(`/api/cms/versions/${id}`);
    if (result.ok && result.json.version) setView(result.json.version);
    else setError(result.json.error || 'That version could not be opened.');
  }

  async function restore() {
    if (!restoreId) return;
    setBusy(true);
    const result = await cmsJson(`/api/cms/versions/${restoreId}/restore`, { method: 'POST' });
    setBusy(false);
    if (!result.ok) {
      setError(result.json.error || 'Restore could not be completed.');
      push(result.json.error || 'Restore could not be completed.', 'error');
      return;
    }
    setRestoreId(null);
    push('Version restored to the draft');
    await load();
    await reload();
  }

  if (loading) return <div className="skeleton" style={{ height: 220 }} />;

  return (
    <>
      {error ? <p className="err">{error}</p> : null}
      {!rows.length ? (
        <p className="empty">No published versions yet. Publish the draft to create the first snapshot.</p>
      ) : (
        <div className="card" style={{ padding: 0 }}>
          <table className="table">
            <thead>
              <tr>
                <th>When</th>
                <th>Version</th>
                <th>By</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row, index) => (
                <tr key={row.id}>
                  <td>{formatWhen(row.createdAt)}</td>
                  <td>
                    {index === 0 ? <span className="chip live">Current live</span> : <span className="chip">Version {rows.length - index}</span>}
                    <div className="hint">{row.label || 'Published snapshot'}</div>
                  </td>
                  <td>{row.createdBy?.name || row.createdBy?.email || 'system'}</td>
                  <td>
                    <div className="row">
                      <button className="btn btn-sm" type="button" onClick={() => open(row.id)}>
                        View
                      </button>
                      <button className="btn btn-sm" type="button" onClick={() => setRestoreId(row.id)}>
                        Restore
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {view ? <ViewModal view={view} onClose={() => setView(null)} /> : null}
      {restoreId ? (
        <ConfirmDialog
          title="Restore into the current draft?"
          body="This writes the snapshot into the draft only. The live website stays unchanged until you publish. History is kept."
          confirmLabel="Restore to draft"
          busy={busy}
          onCancel={() => setRestoreId(null)}
          onConfirm={restore}
        />
      ) : null}
    </>
  );
}
