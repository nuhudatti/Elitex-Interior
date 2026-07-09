/* ==========================================================================
   Elitex CMS — content store
   --------------------------------------------------------------------------
   • published : content.json as currently deployed
   • draft     : working copy (persisted to localStorage, drives live preview)
   • versions  : local snapshots for one-click restore
   • audit     : action log
   Emits 'cms:change' on every draft mutation so views & preview stay live.
   ========================================================================== */
(function (CMS) {
  'use strict';

  var DRAFT_KEY = 'elitexcms.draft.v1';
  var VERSIONS_KEY = 'elitexcms.versions.v1';
  var AUDIT_KEY = 'elitexcms.audit.v1';
  var SETTINGS_KEY = 'elitexcms.settings.v1';

  var Store = {
    published: null,
    draft: null,
    settings: {
      repo: 'nuhudatti/Elitex-Interior',
      branch: 'main',
      githubTokenEnc: '',
      sessionTimeout: 30,
      previewPage: 'index.html'
    },

    /* ---------- boot ---------- */
    load: function () {
      try {
        var s = JSON.parse(localStorage.getItem(SETTINGS_KEY) || 'null');
        if (s) Object.assign(Store.settings, s);
      } catch (e) {}
      CMS.auth.timeoutMinutes = Store.settings.sessionTimeout || 30;

      return fetch('../content/content.json', { cache: 'no-cache' })
        .then(function (r) {
          if (!r.ok) throw new Error('content.json not found (' + r.status + ')');
          return r.json();
        })
        .then(function (json) {
          Store.published = json;
          var draft = null;
          try { draft = JSON.parse(localStorage.getItem(DRAFT_KEY) || 'null'); } catch (e) {}
          Store.draft = draft || CMS.clone(json);
        });
    },

    saveSettings: function () {
      localStorage.setItem(SETTINGS_KEY, JSON.stringify(Store.settings));
      CMS.auth.timeoutMinutes = Store.settings.sessionTimeout || 30;
    },

    /* ---------- draft mutations ---------- */
    isDirty: function () {
      return JSON.stringify(Store.draft) !== JSON.stringify(Store.published);
    },

    persistDraft: CMS.debounce(function () {
      try {
        Store.draft.updatedAt = new Date().toISOString();
        localStorage.setItem(DRAFT_KEY, JSON.stringify(Store.draft));
      } catch (e) {
        CMS.toast('Draft too large for local storage', 'error');
      }
    }, 300),

    change: function (opts) {
      Store.persistDraft();
      document.dispatchEvent(new CustomEvent('cms:change', { detail: opts || {} }));
    },

    set: function (path, value) {
      CMS.set(Store.draft, path, value);
      Store.change({ path: path });
    },

    get: function (path) { return CMS.get(Store.draft, path); },

    discardDraft: function () {
      Store.draft = CMS.clone(Store.published);
      localStorage.setItem(DRAFT_KEY, JSON.stringify(Store.draft));
      document.dispatchEvent(new CustomEvent('cms:change', { detail: { reset: true } }));
    },

    markPublished: function () {
      Store.published = CMS.clone(Store.draft);
      document.dispatchEvent(new CustomEvent('cms:change', { detail: { published: true } }));
    },

    /* ---------- collections (lists with order/status) ---------- */
    list: function (path) {
      var arr = CMS.get(Store.draft, path);
      if (!Array.isArray(arr)) { arr = []; CMS.set(Store.draft, path, arr); }
      return arr;
    },

    addItem: function (path, item, prefix) {
      var arr = Store.list(path);
      item.id = item.id || CMS.uid(prefix || 'it');
      item.status = item.status || 'draft';
      item.order = arr.length ? Math.max.apply(null, arr.map(function (i) { return i.order || 0; })) + 1 : 1;
      arr.push(item);
      Store.change({ path: path });
      Store.audit('create', path + ' → ' + (item.title || item.name || item.label || item.id));
      return item;
    },

    updateItem: function (path, id, patch) {
      var arr = Store.list(path);
      var it = arr.find(function (i) { return i.id === id; });
      if (it) {
        Object.assign(it, patch);
        Store.change({ path: path });
      }
      return it;
    },

    removeItem: function (path, id) {
      var arr = Store.list(path);
      var idx = arr.findIndex(function (i) { return i.id === id; });
      if (idx !== -1) {
        var removed = arr.splice(idx, 1)[0];
        Store.change({ path: path });
        Store.audit('delete', path + ' → ' + (removed.title || removed.name || removed.label || removed.id));
      }
    },

    duplicateItem: function (path, id, prefix) {
      var arr = Store.list(path);
      var it = arr.find(function (i) { return i.id === id; });
      if (!it) return null;
      var copy = CMS.clone(it);
      copy.id = CMS.uid(prefix || 'it');
      copy.status = 'draft';
      if (copy.title) copy.title += ' (copy)';
      else if (copy.name) copy.name += ' (copy)';
      copy.order = (it.order || 0) + 0.5;
      arr.push(copy);
      Store.normalizeOrder(path);
      Store.change({ path: path });
      Store.audit('duplicate', path + ' → ' + (it.title || it.name || it.id));
      return copy;
    },

    moveItem: function (path, id, beforeId) {
      var arr = Store.list(path);
      arr.sort(function (a, b) { return (a.order || 0) - (b.order || 0); });
      var from = arr.findIndex(function (i) { return i.id === id; });
      if (from === -1) return;
      var item = arr.splice(from, 1)[0];
      var to = beforeId ? arr.findIndex(function (i) { return i.id === beforeId; }) : arr.length;
      if (to === -1) to = arr.length;
      arr.splice(to, 0, item);
      arr.forEach(function (i, idx) { i.order = idx + 1; });
      Store.change({ path: path });
    },

    normalizeOrder: function (path) {
      var arr = Store.list(path);
      arr.sort(function (a, b) { return (a.order || 0) - (b.order || 0); });
      arr.forEach(function (i, idx) { i.order = idx + 1; });
    },

    /* ---------- versions ---------- */
    versions: function () {
      try { return JSON.parse(localStorage.getItem(VERSIONS_KEY) || '[]'); }
      catch (e) { return []; }
    },

    snapshot: function (label) {
      var list = Store.versions();
      list.unshift({
        id: CMS.uid('ver'),
        ts: new Date().toISOString(),
        label: label || 'Manual snapshot',
        by: (CMS.auth.current || {}).name || 'unknown',
        json: JSON.stringify(Store.draft)
      });
      while (list.length > 8) list.pop();
      try { localStorage.setItem(VERSIONS_KEY, JSON.stringify(list)); }
      catch (e) {
        /* storage quota: drop oldest snapshots until it fits */
        while (list.length > 1) {
          list.pop();
          try { localStorage.setItem(VERSIONS_KEY, JSON.stringify(list)); return; } catch (e2) {}
        }
      }
    },

    restoreVersion: function (id) {
      var v = Store.versions().find(function (x) { return x.id === id; });
      if (!v) return false;
      Store.draft = JSON.parse(v.json);
      localStorage.setItem(DRAFT_KEY, v.json);
      document.dispatchEvent(new CustomEvent('cms:change', { detail: { reset: true } }));
      Store.audit('restore', 'Restored version from ' + CMS.fmtTime(v.ts));
      return true;
    },

    deleteVersion: function (id) {
      var list = Store.versions().filter(function (x) { return x.id !== id; });
      localStorage.setItem(VERSIONS_KEY, JSON.stringify(list));
    },

    /* ---------- audit log ---------- */
    auditLog: function () {
      try { return JSON.parse(localStorage.getItem(AUDIT_KEY) || '[]'); }
      catch (e) { return []; }
    },

    audit: function (action, detail) {
      var list = Store.auditLog();
      list.unshift({
        ts: new Date().toISOString(),
        user: (CMS.auth.current || {}).name || 'system',
        action: action,
        detail: detail || ''
      });
      while (list.length > 300) list.pop();
      localStorage.setItem(AUDIT_KEY, JSON.stringify(list));
      document.dispatchEvent(new CustomEvent('cms:audit'));
    },

    /* ---------- media registry helpers ---------- */
    addMedia: function (entry) {
      entry.id = entry.id || CMS.uid('md');
      entry.addedAt = new Date().toISOString();
      Store.draft.media.unshift(entry);
      Store.change({ path: 'media' });
      return entry;
    },

    /* replace a media URL everywhere in the draft (deep) */
    replaceUrl: function (oldUrl, newUrl) {
      var count = 0;
      var walk = function (node) {
        if (Array.isArray(node)) { node.forEach(walk); return; }
        if (node && typeof node === 'object') {
          Object.keys(node).forEach(function (k) {
            if (typeof node[k] === 'string' && node[k].indexOf(oldUrl) !== -1) {
              node[k] = node[k].split(oldUrl).join(newUrl);
              count++;
            } else {
              walk(node[k]);
            }
          });
        }
      };
      walk(Store.draft);
      if (count) Store.change({ path: 'media' });
      return count;
    },

    usageCount: function (url) {
      var count = 0;
      var walk = function (node, inMedia) {
        if (Array.isArray(node)) { node.forEach(function (n) { walk(n, inMedia); }); return; }
        if (node && typeof node === 'object') {
          Object.keys(node).forEach(function (k) {
            if (typeof node[k] === 'string' && node[k] === url) count++;
            else walk(node[k], inMedia);
          });
        }
      };
      walk(Store.draft.pages, false);
      walk(Store.draft.site, false);
      return count;
    }
  };

  CMS.store = Store;
})(window.CMS);
