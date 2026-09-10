'use client';

import { FormEvent, useEffect, useState } from 'react';
import { cmsJson } from '@/components/cms/api';

type Settings = {
  sessionTimeout?: number;
  previewPage?: string;
  cldCloudName?: string;
  cldFolder?: string;
  cldPreset?: string;
};

export default function SettingsPage() {
  const [settings, setSettings] = useState<Settings>({});
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  useEffect(() => {
    cmsJson<{ settings?: Settings }>('/api/cms/settings')
      .then((result) => {
        if (result.ok) setSettings(result.json.settings || {});
        else setError(result.json.error || 'Could not load settings');
      })
      .catch(() => setError('Could not load settings'));
  }, []);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    const result = await cmsJson('/api/cms/settings', {
      method: 'PUT',
      body: JSON.stringify(settings),
    });
    if (!result.ok) {
      setError(result.json.error || 'Save failed');
      return;
    }
    setMessage('Settings saved. This does not publish website content.');
  }

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Settings</h1>
          <p>Safe CMS settings only. Cloudinary API secret is never stored here.</p>
        </div>
      </div>
      {error ? <p className="err">{error}</p> : null}
      {message ? <p className="ok">{message}</p> : null}
      <form className="card" onSubmit={onSubmit}>
        <div className="field">
          <label>Session timeout (minutes)</label>
          <input
            className="input"
            type="number"
            min={5}
            max={1440}
            value={Number(settings.sessionTimeout || 720)}
            onChange={(e) => setSettings({ ...settings, sessionTimeout: Number(e.target.value) })}
          />
        </div>
        <div className="field">
          <label>Cloudinary cloud name</label>
          <input
            className="input"
            value={String(settings.cldCloudName || 'dpdmb5t1l')}
            onChange={(e) => setSettings({ ...settings, cldCloudName: e.target.value })}
          />
        </div>
        <div className="field">
          <label>Default folder</label>
          <input
            className="input"
            value={String(settings.cldFolder || 'elitex')}
            onChange={(e) => setSettings({ ...settings, cldFolder: e.target.value })}
          />
        </div>
        <div className="field">
          <label>Unsigned upload preset (name only)</label>
          <input
            className="input"
            value={String(settings.cldPreset || '')}
            onChange={(e) => setSettings({ ...settings, cldPreset: e.target.value })}
          />
          <div className="hint">Not a secret. Leave empty if you will use signed server-side uploads.</div>
        </div>
        <button className="btn btn-primary" type="submit">
          Save settings
        </button>
      </form>
    </>
  );
}
