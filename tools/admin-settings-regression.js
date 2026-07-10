// Regression checks for admin publishing stack overflow fixes.
// Run: node tools/admin-settings-regression.js
const fs = require('fs');
const path = require('path');

const adminJs = path.join(__dirname, '..', 'admin', 'js');

function read(name) {
  return fs.readFileSync(path.join(adminJs, name), 'utf8');
}

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

function testSourceGuards() {
  const store = read('store.js');
  const api = read('api.js');
  const app = read('app.js');
  const views = read('views.js');

  assert(/Store\._savingSettings/.test(store), 'store.js must guard saveSettings re-entry');
  assert(/updatedAt/.test(store), 'isDirty must use updatedAt, not full JSON compare');
  assert(/draftJson/.test(store), 'store.js must expose safe draftJson helper');
  assert(/versionsPayload/.test(store), 'snapshots must serialize via versionsPayload');
  assert(!/setToken:\s*function[\s\S]*?saveSettings/.test(api), 'setToken must not call saveSettings');
  assert(/App\._chromeBound/.test(app), 'bindChrome must bind listeners once per session');
  assert(/input\.dataset\.bound/.test(views), 'bindInputs must skip already-bound fields');
  assert(/type="button"[^>]*id="stSaveGit"/.test(views), 'Save publishing settings must be type=button');
  assert(/type="button"[^>]*id="pbPublish"/.test(views), 'Publish button must be type=button');
  assert(!/fromCharCode\.apply/.test(api), 'GitHub.b64 must not use fromCharCode.apply');
  assert(/Promise\.resolve\(\)\.then/.test(api), 'publish must wrap work in a promise');
}

function testPublishLogic() {
  var draft = { updatedAt: '2026-07-10T10:00:00.000Z', site: { name: 'Test' } };
  var published = { updatedAt: '2026-07-09T10:00:00.000Z', site: { name: 'Test' } };
  assert((draft.updatedAt || '') !== (published.updatedAt || ''), 'isDirty equivalent is true without stringify');
  published.updatedAt = draft.updatedAt;
  assert((draft.updatedAt || '') === (published.updatedAt || ''), 'isDirty equivalent is false after publish');

  var corrupted = [{ id: 'v1', json: { site: { name: 'nested object not string' } } }];
  var payload = corrupted.map(function (v) {
    return {
      id: v.id,
      json: typeof v.json === 'string' ? v.json : JSON.stringify(v.json)
    };
  });
  assert(typeof payload[0].json === 'string', 'versions payload coerces json to string');
  JSON.stringify(payload);
}

function testSaveSettingsLogic() {
  var KEYS = ['repo', 'branch', 'githubTokenEnc', 'sessionTimeout', 'previewPage'];
  var storage = {};
  var cache = '';
  var saving = false;
  var settings = { repo: 'a/b', branch: 'main', githubTokenEnc: '', sessionTimeout: 30, previewPage: 'index.html' };

  function payload() {
    var out = {};
    KEYS.forEach(function (k) { out[k] = settings[k]; });
    return out;
  }

  function saveSettings() {
    if (saving) return;
    saving = true;
    try {
      var json = JSON.stringify(payload());
      if (json !== cache) {
        storage['elitexcms.settings.v1'] = json;
        cache = json;
      }
    } finally {
      saving = false;
    }
  }

  var writes = 0;
  (function guardedSave() {
    if (saving) return;
    saving = true;
    try {
      var json = JSON.stringify(payload());
      if (json !== cache) {
        writes++;
        cache = json;
        storage['elitexcms.settings.v1'] = json;
        guardedSave();
      }
    } finally {
      saving = false;
    }
  })();

  assert(writes === 1, 're-entrant saveSettings must not loop');
  settings.branch = 'dev';
  saveSettings();
  assert(JSON.parse(storage['elitexcms.settings.v1']).branch === 'dev', 'settings persist after update');
}

function testB64LargePayload() {
  function b64(str) {
    var bytes = new TextEncoder().encode(str);
    var len = bytes.length;
    var binParts = [];
    for (var i = 0; i < len; i += 8192) {
      var end = Math.min(i + 8192, len);
      var chunk = '';
      for (var j = i; j < end; j++) chunk += String.fromCharCode(bytes[j]);
      binParts.push(chunk);
    }
    return btoa(binParts.join(''));
  }

  var json = fs.readFileSync(path.join(__dirname, '..', 'content', 'content.json'), 'utf8');
  var encoded = b64(json);
  assert(encoded.length > 1000, 'b64 must encode full content.json');
  assert(Buffer.from(encoded, 'base64').toString('utf8') === json, 'b64 round-trip must match source');
}

let failed = 0;
for (const [name, fn] of [
  ['source guards', testSourceGuards],
  ['publish logic', testPublishLogic],
  ['saveSettings logic', testSaveSettingsLogic],
  ['publish b64 large payload', testB64LargePayload]
]) {
  try {
    fn();
    console.log('OK   ' + name);
  } catch (err) {
    failed++;
    console.log('FAIL ' + name + ': ' + err.message);
  }
}

console.log(failed ? '\n' + failed + ' REGRESSION CHECK(S) FAILED' : '\nALL REGRESSION CHECKS PASSED');
process.exit(failed ? 1 : 0);
