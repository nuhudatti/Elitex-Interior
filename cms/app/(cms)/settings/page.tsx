'use client';

import { FormEvent, useEffect, useState } from 'react';
import { cmsJson } from '@/components/cms/api';
import { useToast } from '@/components/cms/Toast';

type Settings = {
  sessionTimeout?: number;
  previewPage?: string;
  cldCloudName?: string;
  cldFolder?: string;
  cldPreset?: string;
};

export default function SettingsPage() {
  const { push } = useToast();
  const [settings, setSettings] = useState<Settings>({});
  const [error, setError] = useState('');

  useEffect(() => {
    cmsJson<{ settings?: Settings }>('/api/cms/settings')
      .then((result) => {
        if (result.ok) setSettings(result.json.settings || {});
        else setError(result.json.error || "You don't have permission to change settings.");
      })
      .catch(() => setError('Settings could not be loaded.'));
  }, []);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    const result = await cmsJson('/api/cms/settings', {
      method: 'PUT',
      body: JSON.stringify(settings),
    });
    if (!result.ok) {
      setError(result.json.error || 'Settings could not be saved.');
      return;
    }
    push('Settings saved');
  }

  return (
    <>
      {error ? <p className="err">{error}</p> : null}
      <form className="card" onSubmit={onSubmit}>
        <h3>Session</h3>
        <div className="field">
          <label htmlFor="timeout">Sign-out after idle (minutes)</label>
          <input
            id="timeout"
            className="input"
            type="number"
            min={5}
            max={1440}
            value={Number(settings.sessionTimeout || 720)}
            onChange={(e) => setSettings({ ...settings, sessionTimeout: Number(e.target.value) })}
          />
        </div>
        <div className="field">
          <label htmlFor="preview-page">Default preview page</label>
          <select
            id="preview-page"
            className="select"
            value={String(settings.previewPage || 'index.html')}
            onChange={(e) => setSettings({ ...settings, previewPage: e.target.value })}
          >
            <option value="index.html">Home</option>
            <option value="project.html">Showcase</option>
            <option value="project2.html">Showcase 2</option>
            <option value="reviews.html">Reviews</option>
          </select>
        </div>
        <h3>Uploads</h3>
        <p className="hint">These names are not secrets. API keys stay in server environment variables.</p>
        <div className="field">
          <label htmlFor="cld">Cloudinary cloud name</label>
          <input
            id="cld"
            className="input"
            value={String(settings.cldCloudName || 'dpdmb5t1l')}
            onChange={(e) => setSettings({ ...settings, cldCloudName: e.target.value })}
          />
        </div>
        <div className="field">
          <label htmlFor="folder">Default folder</label>
          <input
            id="folder"
            className="input"
            value={String(settings.cldFolder || 'elitex')}
            onChange={(e) => setSettings({ ...settings, cldFolder: e.target.value })}
          />
        </div>
        <div className="field">
          <label htmlFor="preset">Unsigned upload preset (optional)</label>
          <input
            id="preset"
            className="input"
            value={String(settings.cldPreset || '')}
            onChange={(e) => setSettings({ ...settings, cldPreset: e.target.value })}
          />
        </div>
        <button className="btn btn-primary" type="submit">
          Save settings
        </button>
      </form>
    </>
  );
}
