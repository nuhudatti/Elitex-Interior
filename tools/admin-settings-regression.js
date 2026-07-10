// Regression: publishing settings save must not recurse or duplicate listeners.
// Run: node tools/admin-settings-regression.js
const fs = require('fs');
const path = require('path');
const http = require('http');
const vm = require('vm');

const root = path.join(__dirname, '..');
const adminJs = path.join(root, 'admin', 'js');

function createDom() {
  const listeners = new Map();
  const elements = new Map();
  let idSeq = 0;

  function ensure(id) {
    if (!elements.has(id)) {
      elements.set(id, {
        id,
        tagName: 'DIV',
        type: '',
        value: '',
        checked: false,
        style: {},
        classList: {
          _c: new Set(),
          add: function (c) { this._c.add(c); },
          remove: function (c) { this._c.delete(c); },
          toggle: function (c, force) {
            if (force === true) this._c.add(c);
            else if (force === false) this._c.delete(c);
            else if (this._c.has(c)) this._c.delete(c);
            else this._c.add(c);
          }
        },
        dataset: {},
        innerHTML: '',
        textContent: '',
        disabled: false,
        children: [],
        parent: null,
        firstElementChild: null,
        contentWindow: null,
        appendChild(child) {
          child.parent = this;
          this.children.push(child);
          this.firstElementChild = this.children[0] || null;
        },
        remove() {},
        querySelector(sel) { return document.querySelector(sel, this); },
        querySelectorAll(sel) { return document.querySelectorAll(sel, this); },
        addEventListener(type, fn) {
          const key = this.id + '::' + type;
          if (!listeners.has(key)) listeners.set(key, []);
          listeners.get(key).push(fn);
        },
        click() {
          fire(this, 'click');
        }
      });
    }
    return elements.get(id);
  }

  function fire(el, type) {
    const key = el.id + '::' + type;
    (listeners.get(key) || []).slice().forEach(function (fn) { fn({ target: el, preventDefault: function () {} }); });
  }

  const document = {
    body: ensure('body'),
    addEventListener(type, fn) {
      const key = 'document::' + type;
      if (!listeners.has(key)) listeners.set(key, []);
      listeners.get(key).push(fn);
    },
    dispatchEvent(ev) {
      const key = 'document::' + ev.type;
      (listeners.get(key) || []).slice().forEach(function (fn) { fn(ev); });
    },
    querySelector(sel, rootEl) {
      rootEl = rootEl || document;
      if (sel === '#loginScreen') return ensure('loginScreen');
      if (sel === '#shell') return ensure('shell');
      if (sel === '#viewHost') return ensure('viewHost');
      if (sel === '#toastStack') return ensure('toastStack');
      if (sel === '#dirtyPill') return ensure('dirtyPill');
      if (sel === '#notifDot') return ensure('notifDot');
      if (sel.startsWith('#') && rootEl !== document) {
        const id = sel.slice(1);
        const found = elements.get(id);
        if (found && (found === rootEl || isDescendant(rootEl, found))) return found;
      }
      return null;
    },
    querySelectorAll(sel, rootEl) {
      rootEl = rootEl || document;
      if (sel === '[data-path]') {
        return rootEl.children.filter(function (c) { return c.dataset && c.dataset.path; });
      }
      if (sel === '.nav-item') return [];
      return [];
    }
  };

  function isDescendant(ancestor, node) {
    while (node) {
      if (node === ancestor) return true;
      node = node.parent;
    }
    return false;
  }

  const window = {
    CMS: {},
    document: document,
    addEventListener(type, fn) { document.addEventListener(type, fn); },
    postMessage: function () {},
    location: { reload: function () {} },
    parent: { postMessage: function () {} },
    open: function () {}
  };

  return { window, document, ensure, fire, listeners };
}

function loadScripts(ctx) {
  const order = ['core.js', 'auth.js', 'store.js', 'api.js', 'views.js', 'app.js'];
  for (const file of order) {
    const code = fs.readFileSync(path.join(adminJs, file), 'utf8');
    vm.runInContext(code, ctx, { filename: file });
  }
}

function runTests() {
  const dom = createDom();
  const storage = {};
  const session = {};

  dom.window.localStorage = {
    getItem(k) { return storage[k] == null ? null : storage[k]; },
    setItem(k, v) {
      if (storage.__depth > 50) throw new RangeError('Maximum call stack size exceeded (localStorage loop)');
      storage.__depth = (storage.__depth || 0) + 1;
      try { storage[k] = String(v); }
      finally { storage.__depth--; }
    },
    removeItem(k) { delete storage[k]; }
  };
  dom.window.sessionStorage = {
    getItem(k) { return session[k] == null ? null : session[k]; },
    setItem(k, v) { session[k] = String(v); },
    removeItem(k) { delete session[k]; }
  };

  dom.window.crypto = {
    getRandomValues(arr) {
      for (let i = 0; i < arr.length; i++) arr[i] = i + 1;
      return arr;
    },
    subtle: {
      importKey: () => Promise.resolve({}),
      deriveBits: () => Promise.resolve(new ArrayBuffer(32)),
      encrypt: () => Promise.resolve(new ArrayBuffer(16)),
      decrypt: () => Promise.resolve(new TextEncoder().encode('ghp_testtoken'))
    }
  };
  dom.window.TextEncoder = TextEncoder;
  dom.window.TextDecoder = TextDecoder;
  dom.window.fetch = () => Promise.resolve({
    ok: true,
    json: () => Promise.resolve(JSON.parse(fs.readFileSync(path.join(root, 'content/content.json'), 'utf8')))
  });
  dom.window.btoa = (s) => Buffer.from(s, 'binary').toString('base64');

  const ctx = vm.createContext(dom.window);
  loadScripts(ctx);

  const CMS = dom.window.CMS;
  let fails = 0;

  function assert(cond, msg) {
    if (!cond) { console.log('FAIL ' + msg); fails++; return; }
    console.log('OK   ' + msg);
  }

  return CMS.store.load().then(function () {
    return CMS.auth.createUser('Owner', 'password123', 'owner');
  }).then(function () {
    return CMS.auth.login('Owner', 'password123');
  }).then(function () {
    CMS.app.enter();

    const host = dom.ensure('viewHost');
    host.firstElementChild = dom.ensure('viewPane');
    CMS.views.settings.render(host.firstElementChild);

    const saveBtn = dom.ensure('stSaveGit');
    const repo = dom.ensure('stRepo');
    const branch = dom.ensure('stBranch');
    const token = dom.ensure('stToken');
    repo.value = 'owner/test-repo';
    branch.value = 'main';
    token.value = 'ghp_testtoken123';

    let saveSettingsCalls = 0;
    const origSave = CMS.store.saveSettings;
    CMS.store.saveSettings = function () {
      saveSettingsCalls++;
      if (saveSettingsCalls > 10) throw new RangeError('Maximum call stack size exceeded (saveSettings loop)');
      return origSave.apply(this, arguments);
    };

    saveBtn.click();

    return Promise.resolve().then(function () { return new Promise(function (r) { setTimeout(r, 50); }); });
  }).then(function () {
    const saved = JSON.parse(storage['elitexcms.settings.v1'] || 'null');
    assert(saved && saved.repo === 'owner/test-repo', 'settings persist repo after save');
    assert(saved && saved.branch === 'main', 'settings persist branch after save');
    assert(saved && saved.githubTokenEnc, 'encrypted token persisted');

    // Re-render settings (simulate navigation) and ensure single listener per button
    const host = dom.ensure('viewHost');
    CMS.views.settings.render(host.firstElementChild);
    const saveBtn = dom.ensure('stSaveGit');
    let clicks = 0;
    const origSave2 = CMS.store.saveSettings;
    CMS.store.saveSettings = function () {
      clicks++;
      return origSave2.apply(this, arguments);
    };
    saveBtn.click();
    assert(clicks === 1, 'save click triggers saveSettings exactly once per handler');

    // Test connection path should not recurse
    const testBtn = dom.ensure('stTestGit');
    CMS.github.api = function () { return Promise.resolve({ full_name: 'owner/test-repo' }); };
    testBtn.click();
    assert(true, 'test connection click did not throw');

    console.log(fails ? '\n' + fails + ' REGRESSION CHECK(S) FAILED' : '\nALL REGRESSION CHECKS PASSED');
    process.exit(fails ? 1 : 0);
  }).catch(function (err) {
    console.log('FAIL unexpected error: ' + err.stack);
    process.exit(1);
  });
}

runTests();
