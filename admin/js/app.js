/* ==========================================================================
   Elitex CMS — application controller
   Login flow, routing, sidebar, topbar, command palette, keyboard shortcuts,
   notifications and the live-preview sync channel.
   ========================================================================== */
(function (CMS) {
  'use strict';

  var $ = CMS.$, $$ = CMS.$$, esc = CMS.esc;

  var App = {
    current: 'dashboard',
    previewFrame: null,
    notifications: [],

    NAV: [
      { section: 'Overview' },
      { id: 'dashboard' },
      { section: 'Content' },
      { id: 'home' },
      { id: 'showcase' },
      { id: 'showcase2' },
      { id: 'projects' },
      { id: 'reviews' },
      { section: 'Site' },
      { id: 'media' },
      { id: 'seo' },
      { id: 'forms' },
      { section: 'System' },
      { id: 'preview' },
      { id: 'publish' },
      { id: 'backup' },
      { id: 'audit' },
      { id: 'settings' }
    ],

    /* ---------------- boot ---------------- */
    boot: function () {
      if (!CMS.auth.hasUsers()) {
        App.showSetup();
      } else {
        App.showLogin();
      }
    },

    showSetup: function () {
      $('#loginTitle').textContent = 'Create your owner account';
      $('#loginSub').textContent = 'First time here — choose a name and a strong password.';
      $('#loginBtn').textContent = 'Create account';
      $('#loginName').style.display = '';
      $('#loginScreen').style.display = 'flex';
      $('#loginForm').onsubmit = function (e) {
        e.preventDefault();
        var name = $('#loginName').value.trim() || 'Owner';
        var pass = $('#loginPass').value;
        if (pass.length < 8) { $('#loginErr').textContent = 'Password must be at least 8 characters.'; return; }
        CMS.auth.createUser(name, pass, 'owner').then(function () {
          return CMS.auth.login(name, pass);
        }).then(function () {
          CMS.store.audit('setup', 'Owner account created');
          App.enter();
        });
      };
    },

    showLogin: function () {
      $('#loginTitle').textContent = 'Welcome back';
      $('#loginSub').textContent = 'Sign in to manage your website.';
      $('#loginBtn').textContent = 'Sign in';
      $('#loginName').style.display = CMS.auth.users.length > 1 ? '' : 'none';
      if (CMS.auth.users.length === 1) $('#loginName').value = CMS.auth.users[0].name;
      $('#loginScreen').style.display = 'flex';
      $('#loginForm').onsubmit = function (e) {
        e.preventDefault();
        var name = $('#loginName').value.trim() || (CMS.auth.users[0] || {}).name;
        var pass = $('#loginPass').value;
        $('#loginBtn').disabled = true;
        CMS.auth.login(name, pass).then(function (ok) {
          $('#loginBtn').disabled = false;
          if (ok) {
            CMS.store.audit('login', name + ' signed in');
            App.enter();
          } else {
            $('#loginErr').textContent = 'Wrong name or password.';
            $('#loginPass').value = '';
            $('#loginPass').focus();
          }
        });
      };
    },

    enter: function () {
      $('#loginScreen').style.display = 'none';
      $('#shell').classList.add('active');
      App.buildNav();
      App.bindChrome();
      App.bindShortcuts();
      App.watchSession();
      App.go('dashboard');
      $('#userAvatar').textContent = (CMS.auth.current.name || '?').slice(0, 1).toUpperCase();
      App.notify('Signed in as ' + CMS.auth.current.name + ' (' + CMS.auth.current.role + ')');
    },

    /* ---------------- navigation ---------------- */
    buildNav: function () {
      var host = $('#navScroll');
      host.innerHTML = App.NAV.map(function (n) {
        if (n.section) return '<div class="nav-section">' + esc(n.section) + '</div>';
        var v = CMS.views[n.id];
        if (v.perm && !CMS.auth.can(v.perm)) return '';
        return '<button class="nav-item" data-view="' + n.id + '"><i class="fas ' + v.icon + '"></i>' + esc(v.title) + '</button>';
      }).join('');
      $$('.nav-item', host).forEach(function (btn) {
        btn.addEventListener('click', function () {
          App.go(btn.dataset.view);
          $('#sidebar').classList.remove('open');
          $('#scrim').classList.remove('show');
        });
      });
    },

    go: function (viewId) {
      var view = CMS.views[viewId];
      if (!view) return;
      if (view.perm && !CMS.auth.can(view.perm)) {
        CMS.toast('Your role does not have access to this area', 'error');
        return;
      }
      App.current = viewId;
      $$('.nav-item').forEach(function (b) { b.classList.toggle('active', b.dataset.view === viewId); });
      var host = $('#viewHost');
      host.innerHTML = '<div class="view active"></div>';
      view.render(host.firstElementChild);
      $('#content').scrollTop = 0;
      CMS.auth.touch();
    },

    rerender: function () { App.go(App.current); },

    /* ---------------- chrome (topbar etc.) ---------------- */
    bindChrome: function () {
      $('#hamburger').addEventListener('click', function () {
        $('#sidebar').classList.add('open');
        $('#scrim').classList.add('show');
      });
      $('#scrim').addEventListener('click', function () {
        $('#sidebar').classList.remove('open');
        $('#scrim').classList.remove('show');
      });

      $('#searchBox').addEventListener('click', App.openPalette);

      $('#notifBtn').addEventListener('click', function (e) {
        e.stopPropagation();
        $('#notifPanel').classList.toggle('show');
        $('#notifDot').classList.remove('show');
      });
      document.addEventListener('click', function (e) {
        if (!e.target.closest('#notifPanel') && !e.target.closest('#notifBtn')) {
          $('#notifPanel').classList.remove('show');
        }
      });
      $('#notifClear').addEventListener('click', function () {
        App.notifications = [];
        App.renderNotifs();
      });

      $('#userAvatar').addEventListener('click', function () {
        CMS.modal({
          title: 'Account',
          bodyHtml: '<div style="display:flex;align-items:center;gap:14px;margin-bottom:16px">' +
            '<div class="avatar" style="width:44px;height:44px;font-size:16px">' + esc((CMS.auth.current.name || '?').slice(0, 1).toUpperCase()) + '</div>' +
            '<div><b>' + esc(CMS.auth.current.name) + '</b><div class="sub" style="color:var(--text-3);font-size:12px">Role: ' + esc(CMS.auth.current.role) + '</div></div></div>' +
            '<button class="btn" id="acLogout" style="width:100%;justify-content:center"><i class="fas fa-arrow-right-from-bracket"></i> Sign out</button>',
          okLabel: 'Close', cancelLabel: null,
          onOpen: function (body) {
            $('#acLogout', body).addEventListener('click', function () {
              CMS.store.audit('logout', CMS.auth.current.name + ' signed out');
              CMS.auth.logout();
              location.reload();
            });
          }
        });
      });

      /* dirty pill + live preview push on every draft change */
      document.addEventListener('cms:change', function () {
        $('#dirtyPill').classList.toggle('show', CMS.store.isDirty());
        App.pushPreview();
      });
      $('#dirtyPill').addEventListener('click', function () { App.go('publish'); });
      $('#dirtyPill').style.cursor = 'pointer';
      $('#dirtyPill').classList.toggle('show', CMS.store.isDirty());

      window.addEventListener('message', function (e) {
        if (e.data && e.data.type === 'cms:ready') App.pushPreview();
      });

      /* warn before closing with unsaved published changes is unnecessary (draft persists) */
    },

    pushPreview: CMS.debounce(function () {
      if (App.previewFrame && App.previewFrame.contentWindow) {
        try { App.previewFrame.contentWindow.postMessage({ type: 'cms:content', content: CMS.store.draft }, '*'); } catch (e) {}
      }
    }, 120),

    /* ---------------- notifications ---------------- */
    notify: function (text) {
      App.notifications.unshift({ text: text, ts: new Date().toISOString() });
      App.notifications = App.notifications.slice(0, 30);
      App.renderNotifs();
      $('#notifDot').classList.add('show');
    },

    renderNotifs: function () {
      var list = $('#notifList');
      list.innerHTML = App.notifications.length ? App.notifications.map(function (n) {
        return '<div class="notif-item"><i class="fas fa-bell"></i><div>' + esc(n.text) + '<time>' + CMS.fmtAgo(n.ts) + '</time></div></div>';
      }).join('') : '<div class="notif-empty">No notifications</div>';
    },

    /* ---------------- command palette ---------------- */
    paletteIndex: 0,

    paletteCommands: function () {
      var cmds = [];
      App.NAV.forEach(function (n) {
        if (n.section) return;
        var v = CMS.views[n.id];
        if (v.perm && !CMS.auth.can(v.perm)) return;
        cmds.push({ label: 'Go to ' + v.title, icon: v.icon, run: function () { App.go(n.id); } });
      });
      cmds.push(
        { label: 'Publish to live site…', icon: 'fa-rocket', run: function () { App.go('publish'); } },
        { label: 'Take snapshot', icon: 'fa-camera', run: function () { CMS.store.snapshot('Quick snapshot'); CMS.toast('Snapshot saved', 'success'); } },
        { label: 'Download backup', icon: 'fa-download', run: function () { App.go('backup'); } },
        { label: 'Open live site', icon: 'fa-arrow-up-right-from-square', run: function () { window.open('../index.html', '_blank'); } },
        { label: 'Sign out', icon: 'fa-arrow-right-from-bracket', run: function () { CMS.auth.logout(); location.reload(); } }
      );
      return cmds;
    },

    openPalette: function () {
      var backdrop = $('#paletteBackdrop');
      var input = $('#paletteInput');
      backdrop.classList.add('show');
      input.value = '';
      App.renderPalette('');
      setTimeout(function () { input.focus(); }, 40);
    },

    closePalette: function () { $('#paletteBackdrop').classList.remove('show'); },

    renderPalette: function (q) {
      var cmds = App.paletteCommands().filter(function (c) {
        return !q || c.label.toLowerCase().indexOf(q.toLowerCase()) !== -1;
      });
      App._paletteCmds = cmds;
      App.paletteIndex = 0;
      var list = $('#paletteList');
      list.innerHTML = cmds.length ? cmds.map(function (c, i) {
        return '<div class="palette-item' + (i === 0 ? ' active' : '') + '" data-i="' + i + '"><i class="fas ' + c.icon + '"></i>' + esc(c.label) + '</div>';
      }).join('') : '<div class="palette-empty">No matches</div>';
      $$('.palette-item', list).forEach(function (item) {
        item.addEventListener('click', function () {
          App.closePalette();
          cmds[parseInt(item.dataset.i, 10)].run();
        });
      });
    },

    /* ---------------- keyboard shortcuts ---------------- */
    bindShortcuts: function () {
      var input = $('#paletteInput');
      input.addEventListener('input', function () { App.renderPalette(input.value); });
      input.addEventListener('keydown', function (e) {
        var cmds = App._paletteCmds || [];
        if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
          e.preventDefault();
          App.paletteIndex = (App.paletteIndex + (e.key === 'ArrowDown' ? 1 : -1) + cmds.length) % Math.max(cmds.length, 1);
          $$('.palette-item').forEach(function (it, i) { it.classList.toggle('active', i === App.paletteIndex); });
        } else if (e.key === 'Enter' && cmds[App.paletteIndex]) {
          App.closePalette();
          cmds[App.paletteIndex].run();
        } else if (e.key === 'Escape') {
          App.closePalette();
        }
      });
      $('#paletteBackdrop').addEventListener('click', function (e) {
        if (e.target === this) App.closePalette();
      });

      var gPressed = false, gTimer = null;
      document.addEventListener('keydown', function (e) {
        var inField = /INPUT|TEXTAREA|SELECT/.test((e.target.tagName || '')) || e.target.isContentEditable;

        /* Cmd/Ctrl+K — palette */
        if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
          e.preventDefault();
          App.openPalette();
          return;
        }
        /* Cmd/Ctrl+S — snapshot (drafts autosave anyway) */
        if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 's') {
          e.preventDefault();
          CMS.store.snapshot('Manual save (Ctrl+S)');
          CMS.toast('Draft saved & snapshot taken', 'success');
          return;
        }
        /* Cmd/Ctrl+Shift+P — publish view */
        if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.key.toLowerCase() === 'p') {
          e.preventDefault();
          App.go('publish');
          return;
        }
        if (e.key === 'Escape') {
          CMS.closeModal();
          App.closePalette();
          return;
        }
        if (inField) return;

        /* g-then-key navigation */
        if (e.key.toLowerCase() === 'g') {
          gPressed = true;
          clearTimeout(gTimer);
          gTimer = setTimeout(function () { gPressed = false; }, 900);
          return;
        }
        if (gPressed) {
          var map = { d: 'dashboard', h: 'home', m: 'media', r: 'reviews', p: 'preview', u: 'publish', s: 'seo', t: 'settings', a: 'audit', j: 'projects' };
          var target = map[e.key.toLowerCase()];
          if (target) { e.preventDefault(); App.go(target); }
          gPressed = false;
        }
      });
    },

    /* ---------------- session watchdog ---------------- */
    watchSession: function () {
      ['click', 'keydown', 'mousemove'].forEach(function (ev) {
        document.addEventListener(ev, CMS.debounce(function () { CMS.auth.touch(); }, 5000), { passive: true });
      });
      setInterval(function () {
        if (CMS.auth.current && !CMS.auth.sessionValid()) {
          CMS.toast('Session expired — please sign in again', 'error');
          CMS.auth.logout();
          setTimeout(function () { location.reload(); }, 1200);
        }
      }, 30000);
    }
  };

  CMS.app = App;

  /* ---------------- start ---------------- */
  document.addEventListener('DOMContentLoaded', function () {
    CMS.store.load()
      .then(function () { App.boot(); })
      .catch(function (err) {
        $('#loginScreen').style.display = 'flex';
        $('#loginTitle').textContent = 'Cannot load content';
        $('#loginSub').textContent = err.message + ' — the admin needs to be served over HTTP (not opened as a file). Run a local server or open it on your live site.';
        $('#loginForm').style.display = 'none';
      });
  });
})(window.CMS);
