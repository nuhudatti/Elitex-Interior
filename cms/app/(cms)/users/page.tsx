'use client';

import { FormEvent, useEffect, useState } from 'react';
import { cmsJson } from '@/components/cms/api';

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
  const [users, setUsers] = useState<CmsUser[]>([]);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [form, setForm] = useState({ email: '', name: '', password: '', role: 'editor', canPublish: false });

  async function load() {
    const result = await cmsJson<{ users?: CmsUser[] }>('/api/cms/users');
    if (result.ok) setUsers(result.json.users || []);
    else setError(result.json.error || 'Could not load users');
  }

  useEffect(() => {
    load().catch(() => setError('Could not load users'));
  }, []);

  async function onCreate(event: FormEvent) {
    event.preventDefault();
    const result = await cmsJson('/api/cms/users', {
      method: 'POST',
      body: JSON.stringify(form),
    });
    if (!result.ok) {
      setError(result.json.error || 'Create failed');
      return;
    }
    setMessage('User created');
    setForm({ email: '', name: '', password: '', role: 'editor', canPublish: false });
    await load();
  }

  async function togglePublish(user: CmsUser) {
    if (user.role === 'owner') return;
    const result = await cmsJson(`/api/cms/users/${user.id}`, {
      method: 'PATCH',
      body: JSON.stringify({ canPublish: !user.canPublishGrant }),
    });
    if (!result.ok) {
      setError(result.json.error || 'Update failed');
      return;
    }
    await load();
  }

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Users</h1>
          <p>Administrators manage accounts. Editors need an explicit publish grant.</p>
        </div>
      </div>
      {error ? <p className="err">{error}</p> : null}
      {message ? <p className="ok">{message}</p> : null}
      <div className="card" style={{ padding: 0 }}>
        <table className="table">
          <thead>
            <tr>
              <th>Name</th>
              <th>Email</th>
              <th>Role</th>
              <th>Publish</th>
            </tr>
          </thead>
          <tbody>
            {users.map((user) => (
              <tr key={user.id}>
                <td>{user.name}</td>
                <td>{user.email}</td>
                <td>{user.roleLabel}</td>
                <td>
                  {user.role === 'owner' ? (
                    'Always'
                  ) : (
                    <button className="btn" type="button" onClick={() => togglePublish(user)}>
                      {user.canPublishGrant ? 'Granted' : 'Not granted'}
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <form className="card" onSubmit={onCreate}>
        <h3>Add user</h3>
        <div className="field">
          <label>Name</label>
          <input className="input" required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
        </div>
        <div className="field">
          <label>Email</label>
          <input className="input" type="email" required value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
        </div>
        <div className="field">
          <label>Password (12+ characters)</label>
          <input className="input" type="password" required value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} />
        </div>
        <div className="field">
          <label>Role</label>
          <select className="select" value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })}>
            <option value="editor">Editor</option>
            <option value="owner">Administrator</option>
          </select>
        </div>
        <div className="field" style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
          <input
            type="checkbox"
            checked={form.canPublish}
            onChange={(e) => setForm({ ...form, canPublish: e.target.checked })}
          />
          <label style={{ margin: 0 }}>Grant publish (editors only)</label>
        </div>
        <button className="btn btn-primary" type="submit">
          Create user
        </button>
      </form>
    </>
  );
}
