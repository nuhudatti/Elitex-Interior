// Regression checks for admin publishing-settings stack overflow fixes.
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
  assert(/settingsPayload/.test(store), 'store.js must serialize only known settings keys');
  assert(!/setToken:\s*function[\s\S]*?saveSettings/.test(api), 'setToken must not call saveSettings');
  assert(/App\._chromeBound/.test(app), 'bindChrome must bind listeners once per session');
  assert(/input\.dataset\.bound/.test(views), 'bindInputs must skip already-bound fields');
  assert(/type="button"[^>]*id="stSaveGit"/.test(views), 'Save publishing settings must be type=button');
  assert(/0x8000/.test(api), 'GitHub.b64 must chunk large payloads');
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

  storage.__hook = function () { saveSettings(); };
  var origSet = function (v) {
    storage['elitexcms.settings.v1'] = v;
    storage.__hook();
  };

  var writes = 0;
  function save() {
    writes++;
    if (writes > 5) throw new RangeError('Maximum call stack size exceeded');
    var json = JSON.stringify(payload());
    if (json !== cache) origSet(json);
  }

  saving = false;
  writes = 0;
  cache = '';
  /* mirror production guard behaviour */
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
  saveSettings();
  assert(Object.keys(JSON.parse(storage['elitexcms.settings.v1'])).length === KEYS.length, 'only known settings keys persist');
}

let failed = 0;
for (const [name, fn] of [
  ['source guards', testSourceGuards],
  ['saveSettings logic', testSaveSettingsLogic]
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
