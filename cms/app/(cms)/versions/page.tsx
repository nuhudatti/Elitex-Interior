'use client';

import { useEffect, useState } from 'react';
import { cmsJson } from '@/components/cms/api';

type VersionRow = {
  id: string;
  label: string | null;
  createdAt: string;
  createdBy: { email?: string | null; name?: string | null } | null;
};

export default function VersionsPage() {
  const [rows, setRows] = useState<VersionRow[]>([]);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  async function load() {
    const result = await cmsJson<{ versions?: VersionRow[] }>('/api/cms/versions');
    if (result.ok) setRows(result.json.versions || []);
    else setError(result.json.error || 'Could not load versions');
  }

  useEffect(() => {
    load().catch(() => setError('Could not load versions'));
  }, []);

  async function restore(id: string) {
    if (!window.confirm('Restore this version into DRAFT? Published stays unchanged until you publish. History is kept.')) {
      return;
    }
    const result = await cmsJson(`/api/cms/versions/${id}/restore`, { method: 'POST' });
    if (!result.ok) {
      setError(result.json.error || 'Restore failed');
      return;
    }
    setMessage('Restored into draft. Published was not changed.');
    await load();
  }

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Version history</h1>
          <p>Every publish is kept. Restore writes draft only.</p>
        </div>
      </div>
      {error ? <p className="err">{error}</p> : null}
      {message ? <p className="ok">{message}</p> : null}
      <div className="card" style={{ padding: 0 }}>
        <table className="table">
          <thead>
            <tr>
              <th>When</th>
              <th>Label</th>
              <th>By</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id}>
                <td>{new Date(row.createdAt).toLocaleString()}</td>
                <td>{row.label || 'Published'}</td>
                <td>{row.createdBy?.email || row.createdBy?.name || 'system'}</td>
                <td>
                  <button className="btn" type="button" onClick={() => restore(row.id)}>
                    Restore to draft
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
