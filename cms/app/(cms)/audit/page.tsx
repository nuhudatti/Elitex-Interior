'use client';

import { useEffect, useMemo, useState } from 'react';
import { cmsJson } from '@/components/cms/api';
import { formatWhen } from '@/lib/format';

type Entry = {
  id: string;
  action: string;
  entity: string;
  entityId?: string | null;
  detail?: string | null;
  createdAt: string;
  user: { email?: string | null; name?: string | null } | null;
};

export default function AuditPage() {
  const [rows, setRows] = useState<Entry[]>([]);
  const [error, setError] = useState('');
  const [q, setQ] = useState('');
  const [visible, setVisible] = useState(40);

  useEffect(() => {
    cmsJson<{ entries?: Entry[] }>('/api/cms/audit?limit=300')
      .then((result) => {
        if (result.ok) setRows(result.json.entries || []);
        else setError(result.json.error || "You don't have permission to view the audit log.");
      })
      .catch(() => setError('The audit log could not be loaded.'));
  }, []);

  const filtered = useMemo(() => {
    const term = q.toLowerCase();
    if (!term) return rows;
    return rows.filter((row) =>
      `${row.action} ${row.entity} ${row.detail || ''} ${row.user?.name || ''} ${row.user?.email || ''}`.toLowerCase().includes(term)
    );
  }, [q, rows]);

  return (
    <>
      <input className="input" placeholder="Search action, person, or detail" value={q} onChange={(e) => setQ(e.target.value)} style={{ marginBottom: 14 }} />
      {error ? <p className="err">{error}</p> : null}
      <div className="card" style={{ padding: 0 }}>
        <table className="table">
          <thead>
            <tr>
              <th>When</th>
              <th>Person</th>
              <th>Action</th>
              <th>Target</th>
              <th>Detail</th>
            </tr>
          </thead>
          <tbody>
            {filtered.slice(0, visible).map((row) => (
              <tr key={row.id}>
                <td>{formatWhen(row.createdAt)}</td>
                <td>{row.user?.name || row.user?.email || 'system'}</td>
                <td>{row.action}</td>
                <td>
                  {row.entity}
                  {row.entityId ? ` · ${row.entityId.slice(0, 8)}` : ''}
                </td>
                <td>{row.detail}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {visible < filtered.length ? (
        <button className="btn" type="button" onClick={() => setVisible((n) => n + 40)}>
          Load more
        </button>
      ) : null}
    </>
  );
}
