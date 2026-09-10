'use client';

import { FormEvent, useEffect, useState } from 'react';
import { cmsJson } from '@/components/cms/api';
import { ConfirmDialog } from '@/components/cms/ConfirmDialog';
import { useToast } from '@/components/cms/Toast';

type CmsUser = {
  id: string;
  email?: string | null;
  name: string;
  role: string;
  roleLabel: string;
  canPublish: boolean;
  canPublishGrant: boolean;
};

export default function UsersPage() {
  const { push } = useToast();
  const [users, setUsers] = useState<CmsUser[]>([]);
  const [error, setError] = useState('');
  const [form, setForm] = useState({ email: '', name: '', password: '', role: 'editor', canPublish: false });
  const [removeId, setRemoveId] = useState<string | null>(null);

  async function load() {
    const result = await cmsJson<{ users?: CmsUser[] }>('/api/cms/users');
    if (result.ok) setUsers(result.json.users || []);
    else setError(result.json.error || "You don't have permission to manage users.");
  }

  useEffect(() => {
    load().catch(() => setError('Users could not be loaded.'));
  }, []);

  async function onCreate(event: FormEvent) {
    event.preventDefault();
    const result = await cmsJson('/api/cms/users', { method: 'POST', body: JSON.stringify(form) });
    if (!result.ok) {
      setError(result.json.error || 'That person could not be added.');
      return;
    }
    setForm({ email: '', name: '', password: '', role: 'editor', canPublish: false });
    push('Editor added');
    await load();
  }

  async function togglePublish(user: CmsUser) {
    if (user.role === 'owner') return;
    const result = await cmsJson(`/api/cms/users/${user.id}`, {
      method: 'PATCH',
      body: JSON.stringify({ canPublish: !user.canPublishGrant }),
    });
    if (!result.ok) {
      setError(result.json.error || 'That permission could not be updated.');
      return;
    }
    await load();
  }

  async function remove() {
    if (!removeId) return;
    const result = await cmsJson(`/api/cms/users/${removeId}`, { method: 'DELETE' });
    if (!result.ok) {
      setError(result.json.error || 'That person could not be removed.');
      return;
    }
    setRemoveId(null);
    push('User removed');
    await load();
  }

  return (
    <>
      {error ? <p className="err">{error}</p> : null}
      <div className="card" style={{ padding: 0 }}>
        <table className="table">
          <thead>
            <tr>
              <th>Name</th>
              <th>Email</th>
              <th>Role</th>
              <th>Publish</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {users.map((user) => (
              <tr key={user.id}>
                <td>{user.name}</td>
                <td>{user.email}</td>
                <td>
                  <span className="chip">{user.roleLabel}</span>
                </td>
                <td>
                  {user.role === 'owner' ? (
                    'Always'
                  ) : (
                    <button className="btn btn-sm" type="button" onClick={() => togglePublish(user)}>
                      {user.canPublishGrant ? 'Granted' : 'Not granted'}
                    </button>
                  )}
                </td>
                <td>
                  {user.role === 'editor' ? (
                    <button className="btn btn-sm btn-danger" type="button" onClick={() => setRemoveId(user.id)}>
                      Remove
                    </button>
                  ) : null}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <form className="card" onSubmit={onCreate}>
        <h3>Add an Editor</h3>
        <div className="field">
          <label htmlFor="new-name">Name</label>
          <input id="new-name" className="input" required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
        </div>
        <div className="field">
          <label htmlFor="new-email">Email</label>
          <input id="new-email" className="input" type="email" required value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
        </div>
        <div className="field">
          <label htmlFor="new-pass">Password (12+ characters)</label>
          <input
            id="new-pass"
            className="input"
            type="password"
            required
            minLength={12}
            value={form.password}
            onChange={(e) => setForm({ ...form, password: e.target.value })}
          />
        </div>
        <div className="field">
          <label htmlFor="new-role">Role</label>
          <select id="new-role" className="select" value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })}>
            <option value="editor">Editor</option>
            <option value="owner">Administrator</option>
          </select>
        </div>
        <div className="field" style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
          <input type="checkbox" checked={form.canPublish} onChange={(e) => setForm({ ...form, canPublish: e.target.checked })} />
          <label style={{ margin: 0 }}>Allow this Editor to publish</label>
        </div>
        <button className="btn btn-primary" type="submit">
          Create
        </button>
      </form>
      {removeId ? (
        <ConfirmDialog
          title="Remove this person?"
          body="They will no longer be able to sign in. Content history is kept."
          confirmLabel="Remove"
          danger
          onCancel={() => setRemoveId(null)}
          onConfirm={remove}
        />
      ) : null}
    </>
  );
}
