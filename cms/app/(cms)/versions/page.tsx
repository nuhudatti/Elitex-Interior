'use client';

import { useEffect, useState } from 'react';
import { cmsJson } from '@/components/cms/api';
import { ConfirmDialog } from '@/components/cms/ConfirmDialog';
import { useToast } from '@/components/cms/Toast';
import { formatWhen } from '@/lib/format';
import { useDraft } from '@/components/cms/DraftProvider';

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
  content: { site?: { name?: string }; pages?: Record<string, unknown> };
};

export default function VersionsPage() {
  const { reload } = useDraft();
  const { push } = useToast();
  const [rows, setRows] = useState<VersionRow[]>([]);
  const [error, setError] = useState('');
  const [view, setView] = useState<VersionDetail | null>(null);
  const [restoreId, setRestoreId] = useState<string | null>(null);

  async function load() {
    const result = await cmsJson<{ versions?: VersionRow[] }>('/api/cms/versions');
    if (result.ok) setRows(result.json.versions || []);
    else setError(result.json.error || 'Version history could not be loaded.');
  }

  useEffect(() => {
    load().catch(() => setError('Version history could not be loaded.'));
  }, []);

  async function open(id: string) {
    const result = await cmsJson<{ version?: VersionDetail }>(`/api/cms/versions/${id}`);
    if (result.ok && result.json.version) setView(result.json.version);
    else setError(result.json.error || 'That version could not be opened.');
  }

  async function restore() {
    if (!restoreId) return;
    const result = await cmsJson(`/api/cms/versions/${restoreId}/restore`, { method: 'POST' });
    if (!result.ok) {
      setError(result.json.error || 'Restore could not be completed.');
      return;
    }
    setRestoreId(null);
    push('Version restored');
    await load();
    await reload();
  }

  return (
    <>
      {error ? <p className="err">{error}</p> : null}
      <div className="card" style={{ padding: 0 }}>
        <table className="table">
          <thead>
            <tr>
              <th>When</th>
              <th>State</th>
              <th>By</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row, index) => (
              <tr key={row.id}>
                <td>{formatWhen(row.createdAt)}</td>
                <td>
                  {index === 0 ? <span className="chip live">CURRENT LIVE</span> : <span className="chip">Older version</span>}
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
      {view ? (
        <div className="modal-backdrop" onClick={() => setView(null)}>
          <div className="modal" role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
            <h3>{view.label || 'Published snapshot'}</h3>
            <p className="hint">
              {formatWhen(view.createdAt)} · {view.createdBy?.name || view.createdBy?.email || 'system'}
            </p>
            <p>
              <b>{view.content.site?.name}</b>
            </p>
            <p className="hint">Pages: {Object.keys(view.content.pages || {}).join(', ')}</p>
            <button className="btn" type="button" onClick={() => setView(null)}>
              Close
            </button>
          </div>
        </div>
      ) : null}
      {restoreId ? (
        <ConfirmDialog
          title="Restore into the current draft?"
          body="This writes the snapshot into DRAFT only. The live content stays unchanged until you publish. History is kept."
          confirmLabel="Restore to draft"
          onCancel={() => setRestoreId(null)}
          onConfirm={restore}
        />
      ) : null}
    </>
  );
}
