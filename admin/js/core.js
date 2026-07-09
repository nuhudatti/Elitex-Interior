/* ==========================================================================
   Elitex CMS — core utilities (DOM, toasts, modals, misc helpers)
   ========================================================================== */
window.CMS = window.CMS || {};

(function (CMS) {
  'use strict';

  /* ---------- DOM ---------- */
  CMS.$ = function (sel, root) { return (root || document).querySelector(sel); };
  CMS.$$ = function (sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); };

  CMS.esc = function (s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  };

  CMS.el = function (html) {
    var t = document.createElement('template');
    t.innerHTML = html.trim();
    return t.content.firstElementChild;
  };

  CMS.uid = function (prefix) {
    return (prefix || 'id') + '_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  };

  CMS.debounce = function (fn, ms) {
    var t;
    return function () {
      var args = arguments, self = this;
      clearTimeout(t);
      t = setTimeout(function () { fn.apply(self, args); }, ms);
    };
  };

  CMS.fmtTime = function (iso) {
    try {
      var d = new Date(iso);
      return d.toLocaleDateString() + ' ' + d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    } catch (e) { return iso; }
  };

  CMS.fmtAgo = function (iso) {
    var s = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
    if (s < 60) return 'just now';
    if (s < 3600) return Math.floor(s / 60) + 'm ago';
    if (s < 86400) return Math.floor(s / 3600) + 'h ago';
    return Math.floor(s / 86400) + 'd ago';
  };

  /* deep get/set by dot path */
  CMS.get = function (obj, path) {
    return path.split('.').reduce(function (o, k) { return (o == null) ? undefined : o[k]; }, obj);
  };
  CMS.set = function (obj, path, value) {
    var keys = path.split('.');
    var last = keys.pop();
    var target = keys.reduce(function (o, k) {
      if (o[k] == null || typeof o[k] !== 'object') o[k] = {};
      return o[k];
    }, obj);
    target[last] = value;
  };

  CMS.clone = function (obj) { return JSON.parse(JSON.stringify(obj)); };

  /* ---------- Cloudinary URL helpers (shared with public runtime) ---------- */
  var CLD_RE = /(https?:\/\/res\.cloudinary\.com\/[^/]+\/(image|video)\/upload\/)(.*)$/;
  CMS.thumb = function (url, w) {
    var m = CLD_RE.exec(url || '');
    if (!m) return url;
    if (m[2] === 'image') return m[1] + 'f_auto,q_auto,c_fill,w_' + (w || 200) + ',h_' + Math.round((w || 200) * 0.75) + '/' + m[3];
    var rest = m[3].replace(/\.(mp4|mov|webm|mp3)(\?.*)?$/i, '.jpg');
    return m[1] + 'so_0,f_auto,q_auto,c_fill,w_' + (w || 200) + ',h_' + Math.round((w || 200) * 0.75) + '/' + rest;
  };
  CMS.isVideoUrl = function (url) { return /\.(mp4|mov|webm)(\?|$)/i.test(url || ''); };

  /* ---------- Toasts ---------- */
  CMS.toast = function (msg, type) {
    type = type || 'info';
    var stack = CMS.$('#toastStack');
    var icons = { success: 'fa-circle-check', error: 'fa-circle-exclamation', info: 'fa-circle-info' };
    var t = CMS.el('<div class="toast ' + type + '"><i class="fas ' + icons[type] + '"></i><span>' + CMS.esc(msg) + '</span></div>');
    stack.appendChild(t);
    setTimeout(function () {
      t.classList.add('out');
      setTimeout(function () { t.remove(); }, 300);
    }, 3400);
  };

  /* ---------- Modal (stackable: a picker can open on top of an editor) ---------- */
  var modalStack = [];

  CMS.modal = function (opts) {
    /* opts: {title, bodyHtml, wide, okLabel, cancelLabel, danger, onOpen(bodyEl), validate(bodyEl)->bool} */
    return new Promise(function (resolve) {
      var backdrop = CMS.el(
        '<div class="modal-backdrop show">' +
        '<div class="modal' + (opts.wide ? ' wide' : '') + '" role="dialog" aria-modal="true">' +
        '<div class="modal-head"><h3></h3><button class="icon-btn" data-x aria-label="Close"><i class="fas fa-xmark"></i></button></div>' +
        '<div class="modal-body"></div>' +
        '<div class="modal-foot"><button class="btn btn-ghost" data-cancel>Cancel</button><button class="btn btn-primary" data-ok>Save</button></div>' +
        '</div></div>');
      backdrop.querySelector('h3').textContent = opts.title || '';
      var body = backdrop.querySelector('.modal-body');
      body.innerHTML = opts.bodyHtml || '';
      var ok = backdrop.querySelector('[data-ok]');
      var cancel = backdrop.querySelector('[data-cancel]');
      ok.textContent = opts.okLabel || 'Save';
      ok.className = 'btn ' + (opts.danger ? 'btn-danger' : 'btn-primary');
      if (opts.cancelLabel === null) cancel.style.display = 'none';
      else cancel.textContent = opts.cancelLabel || 'Cancel';

      document.body.appendChild(backdrop);
      var entry = {
        settled: false,
        settle: function (result) {
          if (entry.settled) return;
          entry.settled = true;
          var i = modalStack.indexOf(entry);
          if (i !== -1) modalStack.splice(i, 1);
          backdrop.remove();
          resolve(result);
        }
      };
      modalStack.push(entry);

      ok.onclick = function () {
        if (opts.validate && !opts.validate(body)) return;
        entry.settle({ ok: true, body: body });
      };
      cancel.onclick = function () { entry.settle({ ok: false }); };
      backdrop.querySelector('[data-x]').onclick = function () { entry.settle({ ok: false }); };

      if (opts.onOpen) opts.onOpen(body);
      var first = body.querySelector('input, textarea, select');
      if (first) setTimeout(function () { first.focus(); }, 60);
    });
  };

  /* Closes only the top-most modal, so an editor underneath survives. */
  CMS.closeModal = function () {
    var top = modalStack[modalStack.length - 1];
    if (top) top.settle({ ok: false });
  };

  CMS.confirm = function (title, message, okLabel) {
    return CMS.modal({
      title: title,
      bodyHtml: '<p style="color:var(--text-2);line-height:1.6">' + CMS.esc(message) + '</p>',
      okLabel: okLabel || 'Delete',
      danger: true
    }).then(function (r) { return r.ok; });
  };

  CMS.prompt = function (title, label, value) {
    return CMS.modal({
      title: title,
      bodyHtml: '<div class="field"><label>' + CMS.esc(label) + '</label><input class="input" id="promptInput" value="' + CMS.esc(value || '') + '"></div>',
      okLabel: 'OK'
    }).then(function (r) {
      return r.ok ? CMS.$('#promptInput', r.body).value : null;
    });
  };

  /* form field builders */
  CMS.fText = function (label, path, value, hint) {
    return '<div class="field"><label>' + CMS.esc(label) + '</label>' +
      '<input class="input" data-path="' + CMS.esc(path) + '" value="' + CMS.esc(value == null ? '' : value) + '">' +
      (hint ? '<div class="hint">' + CMS.esc(hint) + '</div>' : '') + '</div>';
  };
  CMS.fArea = function (label, path, value, rows, hint) {
    return '<div class="field"><label>' + CMS.esc(label) + '</label>' +
      '<textarea class="input" rows="' + (rows || 3) + '" data-path="' + CMS.esc(path) + '">' + CMS.esc(value == null ? '' : value) + '</textarea>' +
      (hint ? '<div class="hint">' + CMS.esc(hint) + '</div>' : '') + '</div>';
  };
  CMS.fToggle = function (label, path, checked) {
    return '<div class="field" style="display:flex;align-items:center;gap:12px">' +
      '<label class="switch"><input type="checkbox" data-path="' + CMS.esc(path) + '" data-type="bool"' + (checked ? ' checked' : '') + '><span class="track"></span></label>' +
      '<label style="margin:0">' + CMS.esc(label) + '</label></div>';
  };
})(window.CMS);
