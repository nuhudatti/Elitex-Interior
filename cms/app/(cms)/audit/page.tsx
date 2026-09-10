'use client';

import { useEffect, useState } from 'react';
import { cmsJson } from '@/components/cms/api';

type Entry = {
  id: string;
  action: string;
  entity: string;
  detail?: string | null;
  createdAt: string;
  user: { email?: string | null; name?: string | null } | null;
};

export default function AuditPage() {
  const [rows, setRows] = useState<Entry[]>([]);
  const [error, setError] = useState('');

  useEffect(() => {
    cmsJson<{ entries?: Entry[] }>('/api/cms/audit')
      .then((result) => {
        if (result.ok) setRows(result.json.entries || []);
        else setError(result.json.error || 'Could not load audit log');
      })
      .catch(() => setError('Could not load audit log'));
  }, []);

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Audit log</h1>
          <p>Server-side history in Neon. Administrators only.</p>
        </div>
      </div>
      {error ? <p className="err">{error}</p> : null}
      <div className="card" style={{ padding: 0 }}>
        <table className="table">
          <thead>
            <tr>
              <th>When</th>
              <th>User</th>
              <th>Action</th>
              <th>Detail</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id}>
                <td>{new Date(row.createdAt).toLocaleString()}</td>
                <td>{row.user?.email || row.user?.name || 'system'}</td>
                <td>{row.action}</td>
                <td>{row.detail}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
