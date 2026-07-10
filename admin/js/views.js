/* ==========================================================================
   Elitex CMS — dashboard views
   Every screen is a render(el) function registered in CMS.views.
   Inputs with [data-path] auto-bind to the draft store (instant live preview).
   ========================================================================== */
(function (CMS) {
  'use strict';

  var $ = CMS.$, $$ = CMS.$$, esc = CMS.esc, store = null;

  /* ------------------------------------------------------------------ */
  /* Shared building blocks                                              */
  /* ------------------------------------------------------------------ */

  function bindInputs(root) {
    $$('[data-path]', root).forEach(function (input) {
      if (input.dataset.bound === '1') return;
      input.dataset.bound = '1';
      var handler = function () {
        var value;
        if (input.dataset.type === 'bool') value = input.checked;
        else if (input.dataset.type === 'number') value = parseFloat(input.value) || 0;
        else value = input.value;
        CMS.store.set(input.dataset.path, value);
      };
      input.addEventListener(input.tagName === 'SELECT' || input.type === 'checkbox' ? 'change' : 'input', handler);
    });
  }

  function statusChip(status) {
    var labels = { published: 'Published', draft: 'Draft', hidden: 'Hidden' };
    return '<span class="chip ' + esc(status) + '">' + (labels[status] || status) + '</span>';
  }

  function thumbHtml(it) {
    var src = it.src || it.avatar || it.videoSrc || '';
    if (src && /res\.cloudinary\.com/.test(src)) {
      return '<img class="item-thumb" loading="lazy" src="' + esc(CMS.thumb(src, 160)) + '" alt="">';
    }
    if (src && !CMS.isVideoUrl(src)) {
      return '<img class="item-thumb" loading="lazy" src="../' + esc(src.replace(/^\.\//, '')) + '" alt="">';
    }
    var icon = CMS.isVideoUrl(src) ? 'fa-film' : (it.icon ? it.icon.split(' ').pop() : 'fa-shapes');
    return '<div class="item-thumb icon"><i class="fas ' + esc(icon) + '"></i></div>';
  }

  function mediaPreviewHtml(v) {
    if (!v) return '<div class="preview icon"><i class="fas fa-image"></i></div>';
    var isCld = /res\.cloudinary\.com/.test(v);
    if (/\.(mp3|wav|ogg)(\?|$)/i.test(v)) return '<div class="preview icon"><i class="fas fa-music"></i></div>';
    if (CMS.isVideoUrl(v) && !isCld) return '<div class="preview icon"><i class="fas fa-film"></i></div>';
    return '<img class="preview" src="' + esc(isCld ? CMS.thumb(v, 200) : '../' + v.replace(/^\.\//, '')) + '" onerror="this.style.opacity=.2">';
  }

  /* modal field builders for collection item editing */
  function itemFieldHtml(f, value) {
    var v = value == null ? '' : value;
    if (f.type === 'textarea') {
      return '<div class="field"><label>' + esc(f.label) + '</label><textarea class="input" rows="' + (f.rows || 3) + '" data-key="' + f.key + '">' + esc(v) + '</textarea>' + (f.hint ? '<div class="hint">' + esc(f.hint) + '</div>' : '') + '</div>';
    }
    if (f.type === 'select') {
      return '<div class="field"><label>' + esc(f.label) + '</label><select class="input" data-key="' + f.key + '">' +
        f.options.map(function (o) {
          var val = typeof o === 'string' ? o : o.value;
          var lbl = typeof o === 'string' ? o : o.label;
          return '<option value="' + esc(val) + '"' + (val === v ? ' selected' : '') + '>' + esc(lbl) + '</option>';
        }).join('') + '</select></div>';
    }
    if (f.type === 'media') {
      var kindLbl = { image: 'image', video: 'video', audio: 'audio file' }[f.kind] || 'image or video';
      return '<div class="field"><label>' + esc(f.label) + '</label>' +
        '<div class="media-pick" data-media-kind="' + esc(f.kind || '') + '">' + mediaPreviewHtml(v) +
        '<input class="input" data-key="' + f.key + '" value="' + esc(v) + '" placeholder="Upload or choose a ' + kindLbl + '…">' +
        '<button type="button" class="btn btn-sm btn-primary" data-upload="' + f.key + '" title="Upload a ' + kindLbl + ' from this device"><i class="fas fa-arrow-up-from-bracket"></i> Upload</button>' +
        '<button type="button" class="btn btn-sm" data-browse="' + f.key + '" title="Choose from what you already uploaded"><i class="fas fa-photo-film"></i> Library</button>' +
        '</div>' + (f.hint ? '<div class="hint">' + esc(f.hint) + '</div>' : '') + '</div>';
    }
    if (f.type === 'number') {
      return '<div class="field"><label>' + esc(f.label) + '</label><input type="number" class="input" data-key="' + f.key + '" value="' + esc(v) + '"' + (f.min != null ? ' min="' + f.min + '"' : '') + (f.max != null ? ' max="' + f.max + '"' : '') + '></div>';
    }
    if (f.type === 'toggle') {
      return '<div class="field" style="display:flex;align-items:center;gap:12px"><label class="switch"><input type="checkbox" data-key="' + f.key + '"' + (value ? ' checked' : '') + '><span class="track"></span></label><label style="margin:0">' + esc(f.label) + '</label></div>';
    }
    return '<div class="field"><label>' + esc(f.label) + '</label><input class="input" data-key="' + f.key + '" value="' + esc(v) + '"' + (f.placeholder ? ' placeholder="' + esc(f.placeholder) + '"' : '') + '>' + (f.hint ? '<div class="hint">' + esc(f.hint) + '</div>' : '') + '</div>';
  }

  function readItemFields(body, fields) {
    var patch = {};
    fields.forEach(function (f) {
      var input = body.querySelector('[data-key="' + f.key + '"]');
      if (!input) return;
      if (f.type === 'toggle') patch[f.key] = input.checked;
      else if (f.type === 'number') patch[f.key] = parseFloat(input.value) || 0;
      else patch[f.key] = input.value;
    });
    return patch;
  }

  function setMediaField(body, key, url) {
    var input = body.querySelector('[data-key="' + key + '"]');
    if (!input) return;
    input.value = url;
    input.dispatchEvent(new Event('input'));
    var pick = input.closest('.media-pick');
    if (pick) {
      var old = pick.querySelector('.preview');
      if (old) old.outerHTML = mediaPreviewHtml(url);
    }
  }

  var ACCEPT = { image: 'image/*', video: 'video/*', audio: 'audio/*' };

  function wireMediaBrowse(body) {
    /* "Library" — pick from already-uploaded media (opens on top, editor stays) */
    $$('[data-browse]', body).forEach(function (btn) {
      btn.addEventListener('click', function () {
        var kind = (btn.closest('.media-pick') || {}).dataset ? btn.closest('.media-pick').dataset.mediaKind : '';
        openMediaPicker(kind || null).then(function (url) {
          if (url) setMediaField(body, btn.dataset.browse, url);
        });
      });
    });

    /* "Upload" — one step: choose a file, it uploads to Cloudinary and fills the field */
    $$('[data-upload]', body).forEach(function (btn) {
      btn.addEventListener('click', function () {
        var kind = (btn.closest('.media-pick') || {}).dataset ? btn.closest('.media-pick').dataset.mediaKind : '';
        if (!CMS.cloudinary.ready()) {
          CMS.toast('Connect Cloudinary in Settings first (cloud name + upload preset)', 'error');
          return;
        }
        var fi = document.createElement('input');
        fi.type = 'file';
        fi.accept = ACCEPT[kind] || 'image/*,video/*';
        fi.onchange = function () {
          var file = fi.files[0];
          if (!file) return;
          var label = btn.innerHTML;
          btn.disabled = true;
          btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> 0%';
          var folder = (CMS.store.draft.site.integrations.cloudinary || {}).defaultFolder || 'elitex';
          CMS.cloudinary.upload(file, folder, function (p) {
            btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> ' + Math.round(p * 100) + '%';
          }).then(function (res) {
            var type = res.resource_type === 'video'
              ? (file.type.indexOf('audio') === 0 ? 'audio' : 'video') : 'image';
            CMS.store.addMedia({ url: res.secure_url, name: file.name, type: type, source: 'cloudinary', folder: res.folder || folder });
            CMS.store.audit('upload', file.name);
            setMediaField(body, btn.dataset.upload, res.secure_url);
            CMS.toast('Uploaded — saved to your Media Library too', 'success');
          }).catch(function (err) {
            CMS.toast(err.message, 'error');
          }).then(function () {
            btn.disabled = false;
            btn.innerHTML = label;
          });
        };
        fi.click();
      });
    });
  }

  function editItemModal(title, fields, item) {
    return CMS.modal({
      title: title,
      wide: fields.length > 5,
      bodyHtml: fields.map(function (f) { return itemFieldHtml(f, item[f.key]); }).join(''),
      okLabel: 'Save',
      onOpen: wireMediaBrowse
    }).then(function (r) {
      return r.ok ? readItemFields(r.body, fields) : null;
    });
  }

  /**
   * Full CRUD collection editor.
   * cfg = { el, path, prefix, fields, titleOf, subtitleOf, addLabel, newItem }
   */
  function collectionUI(cfg) {
    var host = cfg.el;

    function render() {
      var arr = CMS.store.list(cfg.path).slice().sort(function (a, b) { return (a.order || 0) - (b.order || 0); });
      if (!arr.length) {
        host.innerHTML = '<div class="empty-state"><i class="fas fa-inbox"></i>Nothing here yet.<br><br>' +
          '<button class="btn btn-primary btn-sm" data-add><i class="fas fa-plus"></i> ' + esc(cfg.addLabel || 'Add item') + '</button></div>';
      } else {
        host.innerHTML = '<div class="collection">' + arr.map(function (it) {
          return '<div class="item-row" draggable="true" data-id="' + it.id + '">' +
            '<span class="drag-handle" title="Drag to reorder"><i class="fas fa-grip-vertical"></i></span>' +
            thumbHtml(it) +
            '<div class="item-main"><b>' + esc(cfg.titleOf(it) || 'Untitled') + '</b><span>' + esc(cfg.subtitleOf ? (cfg.subtitleOf(it) || '') : '') + '</span></div>' +
            statusChip(it.status || 'published') +
            '<div class="item-actions">' +
            '<button class="icon-btn" data-act="edit" title="Edit"><i class="fas fa-pen"></i></button>' +
            '<button class="icon-btn" data-act="dup" title="Duplicate"><i class="fas fa-clone"></i></button>' +
            '<button class="icon-btn" data-act="vis" title="' + (it.status === 'hidden' ? 'Show' : 'Hide') + '"><i class="fas ' + (it.status === 'hidden' ? 'fa-eye' : 'fa-eye-slash') + '"></i></button>' +
            '<button class="icon-btn" data-act="pub" title="' + (it.status === 'published' ? 'Unpublish (draft)' : 'Publish') + '"><i class="fas ' + (it.status === 'published' ? 'fa-box-archive' : 'fa-upload') + '"></i></button>' +
            '<button class="icon-btn" data-act="del" title="Delete" style="color:var(--red)"><i class="fas fa-trash"></i></button>' +
            '</div></div>';
        }).join('') + '</div>' +
        '<div style="margin-top:12px"><button class="btn" data-add><i class="fas fa-plus"></i> ' + esc(cfg.addLabel || 'Add item') + '</button></div>';
      }

      /* actions */
      $$('[data-act]', host).forEach(function (btn) {
        btn.addEventListener('click', function () {
          var id = btn.closest('.item-row').dataset.id;
          var act = btn.dataset.act;
          var arr = CMS.store.list(cfg.path);
          var it = arr.find(function (x) { return x.id === id; });
          if (!it) return;

          if (act === 'edit') {
            editItemModal('Edit — ' + (cfg.titleOf(it) || 'item'), cfg.fields, it).then(function (patch) {
              if (patch) {
                CMS.store.updateItem(cfg.path, id, patch);
                CMS.store.audit('edit', cfg.path + ' → ' + (cfg.titleOf(it) || id));
                render();
                CMS.toast('Saved to draft', 'success');
              }
            });
          } else if (act === 'dup') {
            CMS.store.duplicateItem(cfg.path, id, cfg.prefix);
            render();
            CMS.toast('Duplicated as draft', 'success');
          } else if (act === 'vis') {
            CMS.store.updateItem(cfg.path, id, { status: it.status === 'hidden' ? 'draft' : 'hidden' });
            CMS.store.audit(it.status === 'hidden' ? 'show' : 'hide', cfg.path + ' → ' + (cfg.titleOf(it) || id));
            render();
          } else if (act === 'pub') {
            CMS.store.updateItem(cfg.path, id, { status: it.status === 'published' ? 'draft' : 'published' });
            CMS.store.audit(it.status === 'published' ? 'unpublish' : 'publish-item', cfg.path + ' → ' + (cfg.titleOf(it) || id));
            render();
            CMS.toast(it.status === 'published' ? 'Moved to draft' : 'Marked published (remember to Publish site)', 'success');
          } else if (act === 'del') {
            CMS.confirm('Delete item', 'Delete "' + (cfg.titleOf(it) || 'this item') + '"? This only affects the draft until you publish.').then(function (yes) {
              if (yes) { CMS.store.removeItem(cfg.path, id); render(); CMS.toast('Deleted from draft', 'success'); }
            });
          }
        });
      });

      /* add */
      $$('[data-add]', host).forEach(function (btn) {
        btn.addEventListener('click', function () {
          var fresh = cfg.newItem ? cfg.newItem() : {};
          editItemModal('New — ' + (cfg.addLabel || 'item'), cfg.fields, fresh).then(function (patch) {
            if (patch) {
              CMS.store.addItem(cfg.path, Object.assign(fresh, patch), cfg.prefix);
              render();
              CMS.toast('Added as draft', 'success');
            }
          });
        });
      });

      /* drag & drop reorder */
      var dragId = null;
      $$('.item-row', host).forEach(function (row) {
        row.addEventListener('dragstart', function (e) {
          dragId = row.dataset.id;
          row.classList.add('dragging');
          e.dataTransfer.effectAllowed = 'move';
        });
        row.addEventListener('dragend', function () { row.classList.remove('dragging'); });
        row.addEventListener('dragover', function (e) { e.preventDefault(); row.classList.add('drag-over'); });
        row.addEventListener('dragleave', function () { row.classList.remove('drag-over'); });
        row.addEventListener('drop', function (e) {
          e.preventDefault();
          row.classList.remove('drag-over');
          if (dragId && dragId !== row.dataset.id) {
            CMS.store.moveItem(cfg.path, dragId, row.dataset.id);
            render();
          }
        });
      });
    }

    render();
    return { render: render };
  }

  /* ------------------------------------------------------------------ */
  /* Media picker (modal)                                                */
  /* ------------------------------------------------------------------ */

  function openMediaPicker(typeFilter) {
    var selected = null;
    var kindLbl = { image: 'images', video: 'videos', audio: 'audio files' }[typeFilter] || 'media';
    var listHtml = function (q) {
      var media = CMS.store.draft.media || [];
      var items = media.filter(function (m) {
        if (typeFilter && m.type !== typeFilter) return false;
        if (q && (m.name || '').toLowerCase().indexOf(q.toLowerCase()) === -1) return false;
        return true;
      });
      if (!items.length) return '<div class="palette-empty">No ' + kindLbl + ' yet — click "Upload new" above to add one.</div>';
      return '<div class="media-grid">' + items.map(function (m) {
        var isCld = /res\.cloudinary\.com/.test(m.url);
        var thumb = m.type === 'audio'
          ? '<div class="thumb icon"><i class="fas fa-music"></i></div>'
          : (isCld
            ? '<img class="thumb" loading="lazy" src="' + esc(CMS.thumb(m.url, 260)) + '">'
            : (m.type === 'video'
              ? '<div class="thumb icon"><i class="fas fa-film"></i></div>'
              : '<img class="thumb" loading="lazy" src="../' + esc(m.url.replace(/^\.\//, '')) + '">'));
        return '<div class="media-card" data-url="' + esc(m.url) + '">' + thumb +
          '<span class="type-tag">' + esc(m.type) + '</span>' +
          '<div class="meta"><b>' + esc(m.name) + '</b><span>' + esc(m.folder || '') + '</span></div></div>';
      }).join('') + '</div>';
    };

    return CMS.modal({
      title: 'Choose ' + ({ image: 'an image', video: 'a video', audio: 'an audio file' }[typeFilter] || 'media'),
      wide: true,
      bodyHtml: '<div style="display:flex;gap:10px;margin-bottom:14px">' +
        '<input class="input" id="pickSearch" placeholder="Search ' + kindLbl + '…" style="flex:1">' +
        '<button type="button" class="btn btn-primary" id="pickUpload"><i class="fas fa-arrow-up-from-bracket"></i> Upload new</button></div>' +
        '<div id="pickGrid">' + listHtml('') + '</div>' +
        '<div class="hint" style="margin-top:10px">Tip: double-click an item to use it right away.</div>',
      okLabel: 'Use selected',
      onOpen: function (body) {
        var useNow = function (url) {
          selected = url;
          body.closest('.modal-backdrop').querySelector('[data-ok]').click();
        };
        var wire = function () {
          $$('.media-card', body).forEach(function (card) {
            card.addEventListener('click', function () {
              $$('.media-card', body).forEach(function (c) { c.classList.remove('selected'); });
              card.classList.add('selected');
              selected = card.dataset.url;
            });
            card.addEventListener('dblclick', function () { useNow(card.dataset.url); });
          });
        };
        wire();
        $('#pickSearch', body).addEventListener('input', function () {
          $('#pickGrid', body).innerHTML = listHtml(this.value);
          wire();
        });
        $('#pickUpload', body).addEventListener('click', function () {
          if (!CMS.cloudinary.ready()) {
            CMS.toast('Connect Cloudinary in Settings first (cloud name + upload preset)', 'error');
            return;
          }
          var fi = document.createElement('input');
          fi.type = 'file';
          fi.accept = ACCEPT[typeFilter] || 'image/*,video/*';
          fi.onchange = function () {
            var file = fi.files[0];
            if (!file) return;
            var btn = $('#pickUpload', body);
            btn.disabled = true;
            var folder = (CMS.store.draft.site.integrations.cloudinary || {}).defaultFolder || 'elitex';
            CMS.cloudinary.upload(file, folder, function (p) {
              btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> ' + Math.round(p * 100) + '%';
            }).then(function (res) {
              var type = res.resource_type === 'video'
                ? (file.type.indexOf('audio') === 0 ? 'audio' : 'video') : 'image';
              CMS.store.addMedia({ url: res.secure_url, name: file.name, type: type, source: 'cloudinary', folder: res.folder || folder });
              CMS.store.audit('upload', file.name);
              useNow(res.secure_url);
            }).catch(function (err) {
              CMS.toast(err.message, 'error');
              btn.disabled = false;
              btn.innerHTML = '<i class="fas fa-arrow-up-from-bracket"></i> Upload new';
            });
          };
          fi.click();
        });
      }
    }).then(function (r) { return r.ok ? selected : null; });
  }

  CMS.openMediaPicker = openMediaPicker;

  /* ------------------------------------------------------------------ */
  /* Tab helper                                                          */
  /* ------------------------------------------------------------------ */

  function tabsUI(el, tabs, renderTab) {
    var current = tabs[0].id;
    var bar = CMS.el('<div class="tabs">' + tabs.map(function (t, i) {
      return '<button class="tab' + (i === 0 ? ' active' : '') + '" data-tab="' + t.id + '">' + esc(t.label) + '</button>';
    }).join('') + '</div>');
    var pane = CMS.el('<div></div>');
    el.appendChild(bar);
    el.appendChild(pane);
    var show = function (id) {
      current = id;
      $$('.tab', bar).forEach(function (b) { b.classList.toggle('active', b.dataset.tab === id); });
      pane.innerHTML = '';
      renderTab(id, pane);
    };
    $$('.tab', bar).forEach(function (b) {
      b.addEventListener('click', function () { show(b.dataset.tab); });
    });
    show(current);
  }

  /* ================================================================== */
  /* VIEWS                                                               */
  /* ================================================================== */

  CMS.views = {};

  /* ---------------- Dashboard ---------------- */
  CMS.views.dashboard = {
    title: 'Dashboard', icon: 'fa-gauge-high',
    render: function (el) {
      var d = CMS.store.draft;
      var count = function (arr) { return (arr || []).filter(function (i) { return i.status !== 'hidden'; }).length; };
      var mediaCount = (d.media || []).length;
      var projects = count(d.pages.home.portfolio.items) + count(d.pages.showcase.items) + count(d.pages.showcase2.items);
      var dirty = CMS.store.isDirty();
      var audit = CMS.store.auditLog().slice(0, 6);

      el.innerHTML =
        '<div class="page-head"><div><h2>Welcome back, ' + esc((CMS.auth.current || {}).name || '') + '</h2>' +
        '<p>Manage every part of elitexinterior.com from here. Edits are saved as a draft instantly — publish when you\'re ready.</p></div>' +
        '<div class="actions">' +
        '<button class="btn" data-go="preview"><i class="fas fa-eye"></i> Live Preview</button>' +
        '<button class="btn btn-primary" data-go="publish"><i class="fas fa-rocket"></i> Publish</button></div></div>' +

        (dirty ? '<div class="card" style="border-color:rgba(245,158,11,.4);margin-bottom:18px;display:flex;align-items:center;gap:12px">' +
          '<i class="fas fa-circle-exclamation" style="color:var(--amber)"></i>' +
          '<div style="flex:1"><b>You have unpublished changes.</b><div class="sub">The public site still shows the last published version.</div></div>' +
          '<button class="btn btn-primary btn-sm" data-go="publish">Review & publish</button></div>' : '') +

        '<div class="grid cols-4" style="margin-bottom:22px">' +
        '<div class="stat-card"><i class="fas fa-images"></i><div class="num">' + projects + '</div><div class="lbl">Portfolio items</div></div>' +
        '<div class="stat-card"><i class="fas fa-star"></i><div class="num">' + count(d.pages.reviews.cards) + '</div><div class="lbl">Client reviews</div></div>' +
        '<div class="stat-card"><i class="fas fa-quote-left"></i><div class="num">' + count(d.pages.home.testimonials.slides) + '</div><div class="lbl">Testimonials</div></div>' +
        '<div class="stat-card"><i class="fas fa-photo-film"></i><div class="num">' + mediaCount + '</div><div class="lbl">Media assets</div></div>' +
        '</div>' +

        '<div class="grid cols-2">' +
        '<div class="card"><h3>Quick actions</h3><div class="sub" style="margin-bottom:12px">Jump straight to the most common tasks.</div>' +
        '<div style="display:flex;flex-direction:column;gap:8px">' +
        [['home', 'fa-house', 'Edit homepage content'],
         ['media', 'fa-cloud-arrow-up', 'Upload photos & videos'],
         ['reviews', 'fa-star', 'Manage reviews & testimonials'],
         ['projects', 'fa-layer-group', 'Edit project details'],
         ['seo', 'fa-magnifying-glass-chart', 'SEO & meta tags'],
         ['backup', 'fa-file-export', 'Backup / restore']]
          .map(function (q) {
            return '<button class="btn" style="justify-content:flex-start" data-go="' + q[0] + '"><i class="fas ' + q[1] + '" style="color:var(--gold)"></i>' + q[2] + '</button>';
          }).join('') + '</div></div>' +

        '<div class="card"><h3>Recent activity</h3><div class="sub" style="margin-bottom:12px">Latest actions in this browser.</div>' +
        (audit.length ? audit.map(function (a) {
          return '<div class="notif-item"><i class="fas fa-circle-dot"></i><div>' + esc(a.action) + ' — ' + esc(a.detail) +
            '<time>' + esc(a.user) + ' · ' + CMS.fmtAgo(a.ts) + '</time></div></div>';
        }).join('') : '<div class="notif-empty">No activity yet</div>') +
        '</div></div>';

      $$('[data-go]', el).forEach(function (b) {
        b.addEventListener('click', function () { CMS.app.go(b.dataset.go); });
      });
    }
  };

  /* ---------------- Home page ---------------- */
  CMS.views.home = {
    title: 'Home Page', icon: 'fa-house', perm: 'content',
    render: function (el) {
      var d = CMS.store.draft;
      el.innerHTML = '<div class="page-head"><div><h2>Home Page</h2><p>Everything on index.html. Changes appear instantly in Live Preview.</p></div>' +
        '<div class="actions"><button class="btn" id="goPrev"><i class="fas fa-eye"></i> Preview</button></div></div><div id="homeTabs"></div>';
      $('#goPrev', el).addEventListener('click', function () { CMS.store.settings.previewPage = 'index.html'; CMS.store.saveSettings(); CMS.app.go('preview'); });

      tabsUI($('#homeTabs', el), [
        { id: 'hero', label: 'Hero' }, { id: 'about', label: 'About' }, { id: 'services', label: 'Services' },
        { id: 'portfolio', label: 'Portfolio' }, { id: 'process', label: 'Process' }, { id: 'testimonials', label: 'Testimonials' },
        { id: 'cta', label: 'Reviews CTA' }, { id: 'contact', label: 'Contact' }, { id: 'footer', label: 'Footer' }, { id: 'nav', label: 'Navigation' }
      ], function (id, pane) {
        var h = d.pages.home;
        if (id === 'hero') {
          pane.innerHTML = '<div class="card">' +
            CMS.fText('Main title', 'pages.home.hero.title', h.hero.title) +
            '<div class="input-row">' +
            CMS.fText('Tagline (before highlight)', 'pages.home.hero.taglinePrefix', h.hero.taglinePrefix) +
            CMS.fText('Tagline highlight (gold)', 'pages.home.hero.taglineHighlight', h.hero.taglineHighlight) + '</div>' +
            CMS.fArea('Subtitle', 'pages.home.hero.subtitle', h.hero.subtitle) +
            '<div class="input-row">' +
            CMS.fText('Primary button label', 'pages.home.hero.ctaPrimary.label', h.hero.ctaPrimary.label) +
            CMS.fText('Primary button link', 'pages.home.hero.ctaPrimary.href', h.hero.ctaPrimary.href) + '</div>' +
            '<div class="input-row">' +
            CMS.fText('Secondary button label', 'pages.home.hero.ctaSecondary.label', h.hero.ctaSecondary.label) +
            CMS.fText('Secondary button link', 'pages.home.hero.ctaSecondary.href', h.hero.ctaSecondary.href) + '</div>' +
            CMS.fText('Scroll hint text', 'pages.home.hero.scrollHint', h.hero.scrollHint) + '</div>';
        } else if (id === 'about') {
          pane.innerHTML = '<div class="card">' +
            CMS.fToggle('Section visible', 'pages.home.about.visible', h.about.visible !== false) +
            CMS.fText('Heading', 'pages.home.about.heading', h.about.heading) +
            CMS.fArea('Paragraph 1', 'pages.home.about.paragraphs.0', h.about.paragraphs[0], 4) +
            CMS.fArea('Paragraph 2', 'pages.home.about.paragraphs.1', h.about.paragraphs[1], 4) +
            '<div class="input-row">' +
            CMS.fText('Button label', 'pages.home.about.cta.label', h.about.cta.label) +
            CMS.fText('Button link', 'pages.home.about.cta.href', h.about.cta.href) + '</div>' +
            itemFieldHtml({ key: '_aboutVideo', label: 'Section video', type: 'media', kind: 'video' }, h.about.videoSrc) + '</div>';
          var vi = pane.querySelector('[data-key="_aboutVideo"]');
          vi.addEventListener('input', function () { CMS.store.set('pages.home.about.videoSrc', vi.value); });
          wireMediaBrowse(pane);
        } else if (id === 'services') {
          pane.innerHTML = '<div class="card" style="margin-bottom:14px">' +
            CMS.fToggle('Section visible', 'pages.home.services.visible', h.services.visible !== false) +
            '<div class="input-row">' +
            CMS.fText('Heading', 'pages.home.services.heading', h.services.heading) +
            CMS.fText('Subtitle', 'pages.home.services.subtitle', h.services.subtitle) + '</div></div><div id="svcList"></div>';
          collectionUI({
            el: $('#svcList', pane), path: 'pages.home.services.items', prefix: 'sv', addLabel: 'Add service',
            titleOf: function (i) { return i.title; }, subtitleOf: function (i) { return i.description; },
            fields: [
              { key: 'title', label: 'Service name' },
              { key: 'icon', label: 'Icon class', hint: 'Font Awesome class, e.g. fa-solid fa-home — browse icons at fontawesome.com' },
              { key: 'description', label: 'Description', type: 'textarea', rows: 4 }
            ],
            newItem: function () { return { icon: 'fa-solid fa-star' }; }
          });
        } else if (id === 'portfolio') {
          pane.innerHTML = '<div class="card" style="margin-bottom:14px">' +
            CMS.fToggle('Section visible', 'pages.home.portfolio.visible', h.portfolio.visible !== false) +
            '<div class="input-row">' +
            CMS.fText('Heading', 'pages.home.portfolio.heading', h.portfolio.heading) +
            CMS.fText('Subtitle', 'pages.home.portfolio.subtitle', h.portfolio.subtitle) + '</div>' +
            '<div class="input-row">' +
            CMS.fText('"View all" label', 'pages.home.portfolio.viewAll.label', h.portfolio.viewAll.label) +
            CMS.fText('"View all" link', 'pages.home.portfolio.viewAll.href', h.portfolio.viewAll.href) + '</div></div><div id="pfList"></div>';
          collectionUI({
            el: $('#pfList', pane), path: 'pages.home.portfolio.items', prefix: 'pf', addLabel: 'Add gallery item',
            titleOf: function (i) { return i.title || '(no title)'; },
            subtitleOf: function (i) { return i.mediaType + ' · ' + i.size + (i.subtitle ? ' · ' + i.subtitle : ''); },
            fields: [
              { key: 'title', label: 'Title' },
              { key: 'subtitle', label: 'Subtitle' },
              { key: 'mediaType', label: 'Media type', type: 'select', options: ['video', 'image'] },
              { key: 'src', label: 'Media file', type: 'media' },
              { key: 'size', label: 'Tile size', type: 'select', options: [{ value: 'normal', label: 'Normal (1×1)' }, { value: 'wide', label: 'Wide (2×1)' }, { value: 'tall', label: 'Tall (1×2)' }, { value: 'large', label: 'Large (2×2)' }] },
              { key: 'alt', label: 'Alt text (for images / SEO)' }
            ],
            newItem: function () { return { mediaType: 'image', size: 'normal' }; }
          });
        } else if (id === 'process') {
          pane.innerHTML = '<div class="card" style="margin-bottom:14px">' +
            CMS.fToggle('Section visible', 'pages.home.process.visible', h.process.visible !== false) +
            '<div class="input-row">' +
            CMS.fText('Heading', 'pages.home.process.heading', h.process.heading) +
            CMS.fText('Subtitle', 'pages.home.process.subtitle', h.process.subtitle) + '</div></div><div id="prList"></div>';
          collectionUI({
            el: $('#prList', pane), path: 'pages.home.process.steps', prefix: 'pr', addLabel: 'Add step',
            titleOf: function (i) { return i.title; }, subtitleOf: function (i) { return i.description; },
            fields: [{ key: 'title', label: 'Step title' }, { key: 'description', label: 'Description', type: 'textarea' }]
          });
        } else if (id === 'testimonials') {
          pane.innerHTML = '<div class="card" style="margin-bottom:14px">' +
            CMS.fToggle('Section visible', 'pages.home.testimonials.visible', h.testimonials.visible !== false) +
            '<div class="input-row">' +
            CMS.fText('Heading', 'pages.home.testimonials.heading', h.testimonials.heading) +
            CMS.fText('Subtitle', 'pages.home.testimonials.subtitle', h.testimonials.subtitle) + '</div></div><div id="tsList"></div>';
          collectionUI({
            el: $('#tsList', pane), path: 'pages.home.testimonials.slides', prefix: 'ts', addLabel: 'Add testimonial',
            titleOf: function (i) { return i.name; }, subtitleOf: function (i) { return i.quote; },
            fields: [
              { key: 'name', label: 'Client name' },
              { key: 'location', label: 'Location / role line' },
              { key: 'avatar', label: 'Client photo', type: 'media', kind: 'image' },
              { key: 'quote', label: 'Quote', type: 'textarea', rows: 5 }
            ]
          });
        } else if (id === 'cta') {
          pane.innerHTML = '<div class="card" style="margin-bottom:14px">' +
            CMS.fToggle('Section visible', 'pages.home.reviewsCta.visible', h.reviewsCta.visible !== false) +
            CMS.fText('Heading', 'pages.home.reviewsCta.heading', h.reviewsCta.heading) +
            CMS.fArea('Subtitle', 'pages.home.reviewsCta.subtitle', h.reviewsCta.subtitle) +
            '<div class="input-row">' +
            CMS.fText('Button label', 'pages.home.reviewsCta.cta.label', h.reviewsCta.cta.label) +
            CMS.fText('Button link', 'pages.home.reviewsCta.cta.href', h.reviewsCta.cta.href) + '</div></div>' +
            '<div class="editor-section"><div class="sec-head"><h3>Stats</h3><span class="sub">Shared with the reviews page hero</span></div><div id="statsList"></div></div>' +
            '<div class="editor-section"><div class="sec-head"><h3>Trust badges</h3></div><div id="badgeList"></div></div>';
          collectionUI({
            el: $('#statsList', pane), path: 'site.stats', prefix: 'st', addLabel: 'Add stat',
            titleOf: function (i) { return i.value + (i.suffix || '') + ' — ' + i.label; },
            fields: [
              { key: 'value', label: 'Number (e.g. 270)' },
              { key: 'suffix', label: 'Suffix (e.g. +)' },
              { key: 'label', label: 'Label' }
            ]
          });
          collectionUI({
            el: $('#badgeList', pane), path: 'pages.home.reviewsCta.badges', prefix: 'bd', addLabel: 'Add badge',
            titleOf: function (i) { return i.label; },
            fields: [{ key: 'label', label: 'Badge text' }, { key: 'icon', label: 'Icon class', hint: 'e.g. fas fa-shield-alt' }]
          });
        } else if (id === 'contact') {
          var c = d.site.contact;
          pane.innerHTML = '<div class="card" style="margin-bottom:14px">' +
            CMS.fToggle('Section visible', 'pages.home.contactSection.visible', h.contactSection.visible !== false) +
            CMS.fText('Heading', 'pages.home.contactSection.heading', h.contactSection.heading) +
            CMS.fArea('Subtitle', 'pages.home.contactSection.subtitle', h.contactSection.subtitle) +
            '<div class="input-row">' +
            CMS.fText('Address label', 'pages.home.contactSection.addressLabel', h.contactSection.addressLabel) +
            CMS.fText('Phone label', 'pages.home.contactSection.phoneLabel', h.contactSection.phoneLabel) + '</div>' +
            CMS.fText('Submit button label', 'pages.home.contactSection.form.submitLabel', h.contactSection.form.submitLabel) +
            CMS.fText('Success message', 'pages.home.contactSection.form.successMessage', h.contactSection.form.successMessage) + '</div>' +
            '<div class="card" style="margin-bottom:14px"><h3 style="margin-bottom:12px">Contact details (site-wide)</h3>' +
            '<div class="input-row">' +
            CMS.fText('Phone number', 'site.contact.phone', c.phone) +
            CMS.fText('WhatsApp number (international)', 'site.contact.whatsappNumber', c.whatsappNumber, '234… no + sign') + '</div>' +
            CMS.fText('WhatsApp pre-filled message', 'site.contact.whatsappMessage', c.whatsappMessage) +
            CMS.fText('Email address', 'site.contact.email', c.email, 'Shown when set; leave empty to hide') +
            CMS.fArea('Studio address', 'site.contact.address', c.address, 2) +
            CMS.fArea('Google Maps embed URL', 'site.contact.mapEmbedSrc', c.mapEmbedSrc, 3, 'Google Maps → Share → Embed a map → copy the src="…" URL') + '</div>' +
            '<div class="editor-section"><div class="sec-head"><h3>Project type options</h3><span class="sub">Choices in the contact form dropdown</span></div><div id="ptList"></div></div>';
          collectionUI({
            el: $('#ptList', pane), path: 'pages.home.contactSection.form.projectTypes', prefix: 'pt', addLabel: 'Add option',
            titleOf: function (i) { return i.label; },
            fields: [{ key: 'label', label: 'Label' }, { key: 'value', label: 'Value (no spaces)' }]
          });
        } else if (id === 'footer') {
          var f = h.footer;
          pane.innerHTML = '<div class="card" style="margin-bottom:14px">' +
            CMS.fText('Brand name', 'pages.home.footer.brandName', f.brandName) +
            CMS.fArea('Blurb', 'pages.home.footer.blurb', f.blurb) +
            CMS.fText('Copyright line', 'pages.home.footer.copyright', f.copyright) + '</div>' +
            '<div class="card" style="margin-bottom:14px"><h3 style="margin-bottom:12px">Newsletter</h3>' +
            CMS.fToggle('Show newsletter form', 'pages.home.footer.newsletter.visible', f.newsletter.visible !== false) +
            '<div class="input-row">' +
            CMS.fText('Title', 'pages.home.footer.newsletter.title', f.newsletter.title) +
            CMS.fText('Placeholder', 'pages.home.footer.newsletter.placeholder', f.newsletter.placeholder) + '</div>' +
            CMS.fText('Text', 'pages.home.footer.newsletter.text', f.newsletter.text) +
            CMS.fText('Success message', 'pages.home.footer.newsletter.successMessage', f.newsletter.successMessage) + '</div>' +
            '<div class="editor-section"><div class="sec-head"><h3>Quick links</h3></div><div id="qlList"></div></div>' +
            '<div class="editor-section"><div class="sec-head"><h3>Social links</h3><span class="sub">Shown in every footer</span></div><div id="socList"></div></div>';
          collectionUI({
            el: $('#qlList', pane), path: 'pages.home.footer.quickLinks', prefix: 'ql', addLabel: 'Add link',
            titleOf: function (i) { return i.label; }, subtitleOf: function (i) { return i.href; },
            fields: [{ key: 'label', label: 'Label' }, { key: 'href', label: 'Link (URL or #section)' }]
          });
          collectionUI({
            el: $('#socList', pane), path: 'site.social', prefix: 'soc', addLabel: 'Add social link',
            titleOf: function (i) { return i.platform; }, subtitleOf: function (i) { return i.url; },
            fields: [
              { key: 'platform', label: 'Platform name' },
              { key: 'url', label: 'Profile URL' },
              { key: 'icon', label: 'Icon class', hint: 'e.g. fab fa-instagram, fab fa-tiktok' }
            ]
          });
        } else if (id === 'nav') {
          pane.innerHTML = '<div class="card" style="margin-bottom:14px">' +
            CMS.fText('Logo text', 'pages.home.nav.logoText', h.nav.logoText) +
            '<div class="input-row">' +
            CMS.fText('CTA button label', 'pages.home.nav.cta.label', h.nav.cta.label) +
            CMS.fText('CTA button link', 'pages.home.nav.cta.href', h.nav.cta.href) + '</div></div>' +
            '<div class="editor-section"><div class="sec-head"><h3>Menu links</h3></div><div id="navList"></div></div>';
          collectionUI({
            el: $('#navList', pane), path: 'pages.home.nav.links', prefix: 'nv', addLabel: 'Add menu link',
            titleOf: function (i) { return i.label; }, subtitleOf: function (i) { return i.href; },
            fields: [{ key: 'label', label: 'Label' }, { key: 'href', label: 'Link' }]
          });
        }
        bindInputs(pane);
      });
    }
  };

  /* ---------------- Showcase pages ---------------- */
  function showcaseView(pageKey, fileName, label) {
    return {
      title: label, icon: 'fa-images', perm: 'content',
      render: function (el) {
        var p = CMS.store.draft.pages[pageKey];
        el.innerHTML = '<div class="page-head"><div><h2>' + esc(label) + '</h2><p>The immersive gallery on ' + fileName + '. Grid items link to project details via a slug.</p></div>' +
          '<div class="actions"><button class="btn" id="goPrev"><i class="fas fa-eye"></i> Preview</button></div></div><div id="scTabs"></div>';
        $('#goPrev', el).addEventListener('click', function () { CMS.store.settings.previewPage = fileName; CMS.store.saveSettings(); CMS.app.go('preview'); });

        tabsUI($('#scTabs', el), [
          { id: 'items', label: 'Gallery items' }, { id: 'text', label: 'Headings & text' }, { id: 'audio', label: 'Background audio' }
        ], function (id, pane) {
          if (id === 'items') {
            pane.innerHTML = '<div id="scList"></div>';
            collectionUI({
              el: $('#scList', pane), path: 'pages.' + pageKey + '.items', prefix: 'sc', addLabel: 'Add gallery item',
              titleOf: function (i) { return i.title || i.projectSlug || '(untitled)'; },
              subtitleOf: function (i) { return i.mediaType + ' · ' + (i.category || '') + (i.projectSlug ? ' · opens: ' + i.projectSlug : ''); },
              fields: [
                { key: 'title', label: 'Overlay title' },
                { key: 'subtitle', label: 'Overlay subtitle' },
                { key: 'mediaType', label: 'Media type', type: 'select', options: ['video', 'image'] },
                { key: 'src', label: 'Media file', type: 'media' },
                { key: 'category', label: 'Category', type: 'select', options: ['luxury', 'residential', 'commercial'] },
                { key: 'projectSlug', label: 'Project details slug', hint: 'Matches an entry in Projects — clicking the tile opens that project\'s detail modal. Leave empty for no modal.' },
                { key: 'alt', label: 'Alt text' }
              ],
              newItem: function () { return { mediaType: 'image', category: 'luxury', lazy: true }; }
            });
          } else if (id === 'text') {
            pane.innerHTML = '<div class="card">' +
              CMS.fText('Hero title', 'pages.' + pageKey + '.hero.title', p.hero.title, 'Use <br> for a line break') +
              CMS.fArea('Hero subtitle', 'pages.' + pageKey + '.hero.subtitle', p.hero.subtitle) +
              '<div class="input-row">' +
              CMS.fText('Button 1 label', 'pages.' + pageKey + '.hero.ctaPrimary', p.hero.ctaPrimary) +
              CMS.fText('Button 2 label', 'pages.' + pageKey + '.hero.ctaSecondary', p.hero.ctaSecondary) + '</div>' +
              CMS.fText('Grid heading', 'pages.' + pageKey + '.gridHeading', p.gridHeading) +
              CMS.fToggle('Show philosophy section', 'pages.' + pageKey + '.philosophy.visible', p.philosophy.visible !== false) +
              CMS.fText('Philosophy heading', 'pages.' + pageKey + '.philosophy.heading', p.philosophy.heading) +
              CMS.fArea('Philosophy text', 'pages.' + pageKey + '.philosophy.text', p.philosophy.text) + '</div>';
          } else {
            pane.innerHTML = '<div class="card">' +
              CMS.fToggle('Enable "Cosmic Sound" button', 'pages.' + pageKey + '.audio.enabled', p.audio.enabled !== false) +
              itemFieldHtml({ key: '_audio', label: 'Audio file (MP3)', type: 'media', kind: 'audio' }, p.audio.src) + '</div>';
            var ai = pane.querySelector('[data-key="_audio"]');
            ai.addEventListener('input', function () { CMS.store.set('pages.' + pageKey + '.audio.src', ai.value); });
            wireMediaBrowse(pane);
          }
          bindInputs(pane);
        });
      }
    };
  }
  CMS.views.showcase = showcaseView('showcase', 'project.html', 'Showcase — project.html');
  CMS.views.showcase2 = showcaseView('showcase2', 'project2.html', 'Showcase — project2.html');

  /* ---------------- Project details ---------------- */
  CMS.views.projects = {
    title: 'Projects', icon: 'fa-layer-group', perm: 'content',
    render: function (el) {
      el.innerHTML = '<div class="page-head"><div><h2>Project Details</h2>' +
        '<p>Full project profiles (description, scale, completion date, location, philosophy, media) shown in the detail modal when a gallery tile or "View Project" is clicked. Each page has its own set.</p></div></div><div id="pdTabs"></div>';

      var maps = [
        { id: 'showcase', label: 'project.html', path: 'pages.showcase.details' },
        { id: 'showcase2', label: 'project2.html', path: 'pages.showcase2.details' },
        { id: 'reviews', label: 'reviews.html', path: 'pages.reviews.details' }
      ];

      var fields = [
        { key: 'title', label: 'Project title' },
        { key: 'description', label: 'Description', type: 'textarea', rows: 4 },
        { key: 'scale', label: 'Project scale', placeholder: 'Luxury Boutique - 450 sqm' },
        { key: 'date', label: 'Completion', placeholder: 'Completed 2025' },
        { key: 'location', label: 'Location', placeholder: 'Abuja, Nigeria' },
        { key: 'philosophy', label: 'Design philosophy', type: 'textarea', rows: 4 },
        { key: 'video', label: 'Video (leave empty to use image)', type: 'media', kind: 'video' },
        { key: 'image', label: 'Image (used when no video)', type: 'media', kind: 'image' }
      ];

      tabsUI($('#pdTabs', el), maps, function (mapId, pane) {
        var map = maps.find(function (m) { return m.id === mapId; });

        var renderList = function () {
          var details = CMS.get(CMS.store.draft, map.path) || {};
          var slugs = Object.keys(details);
          pane.innerHTML = (slugs.length ? '<div class="collection">' + slugs.map(function (slug) {
            var pr = details[slug];
            var media = pr.video || pr.image || '';
            var thumb = media && /res\.cloudinary/.test(media)
              ? '<img class="item-thumb" loading="lazy" src="' + esc(CMS.thumb(media, 160)) + '">'
              : '<div class="item-thumb icon"><i class="fas ' + (pr.video ? 'fa-film' : 'fa-image') + '"></i></div>';
            return '<div class="item-row" data-slug="' + esc(slug) + '">' + thumb +
              '<div class="item-main"><b>' + esc(pr.title || slug) + '</b><span>slug: ' + esc(slug) + (pr.date ? ' · ' + esc(pr.date) : '') + '</span></div>' +
              '<div class="item-actions">' +
              '<button class="icon-btn" data-act="edit" title="Edit"><i class="fas fa-pen"></i></button>' +
              '<button class="icon-btn" data-act="dup" title="Duplicate"><i class="fas fa-clone"></i></button>' +
              '<button class="icon-btn" data-act="del" title="Delete" style="color:var(--red)"><i class="fas fa-trash"></i></button>' +
              '</div></div>';
          }).join('') + '</div>' : '<div class="empty-state"><i class="fas fa-layer-group"></i>No project details yet.</div>') +
          '<div style="margin-top:12px"><button class="btn" data-add><i class="fas fa-plus"></i> Add project</button></div>';

          $$('[data-act]', pane).forEach(function (btn) {
            btn.addEventListener('click', function () {
              var slug = btn.closest('.item-row').dataset.slug;
              var details = CMS.get(CMS.store.draft, map.path);
              if (btn.dataset.act === 'edit') {
                editItemModal('Edit project — ' + slug, fields, details[slug]).then(function (patch) {
                  if (patch) {
                    Object.assign(details[slug], patch);
                    CMS.store.change({ path: map.path });
                    CMS.store.audit('edit', map.path + ' → ' + slug);
                    renderList();
                    CMS.toast('Saved to draft', 'success');
                  }
                });
              } else if (btn.dataset.act === 'dup') {
                CMS.prompt('Duplicate project', 'New slug (letters, dashes)', slug + '-copy').then(function (newSlug) {
                  if (!newSlug) return;
                  newSlug = newSlug.trim().toLowerCase().replace(/[^a-z0-9-]/g, '-');
                  if (details[newSlug]) { CMS.toast('That slug already exists', 'error'); return; }
                  details[newSlug] = CMS.clone(details[slug]);
                  CMS.store.change({ path: map.path });
                  renderList();
                });
              } else if (btn.dataset.act === 'del') {
                CMS.confirm('Delete project', 'Delete project detail "' + slug + '"? Gallery tiles pointing to it will simply stop opening a modal.').then(function (yes) {
                  if (yes) {
                    delete details[slug];
                    CMS.store.change({ path: map.path });
                    CMS.store.audit('delete', map.path + ' → ' + slug);
                    renderList();
                  }
                });
              }
            });
          });

          $$('[data-add]', pane).forEach(function (btn) {
            btn.addEventListener('click', function () {
              CMS.prompt('New project', 'Slug (letters, dashes — used to link gallery tiles)', '').then(function (slug) {
                if (!slug) return;
                slug = slug.trim().toLowerCase().replace(/[^a-z0-9-]/g, '-');
                var details = CMS.get(CMS.store.draft, map.path);
                if (details[slug]) { CMS.toast('That slug already exists', 'error'); return; }
                editItemModal('New project — ' + slug, fields, {}).then(function (patch) {
                  if (patch) {
                    details[slug] = patch;
                    CMS.store.change({ path: map.path });
                    CMS.store.audit('create', map.path + ' → ' + slug);
                    renderList();
                  }
                });
              });
            });
          });
        };
        renderList();
      });
    }
  };

  /* ---------------- Reviews page ---------------- */
  CMS.views.reviews = {
    title: 'Reviews Page', icon: 'fa-star', perm: 'content',
    render: function (el) {
      var p = CMS.store.draft.pages.reviews;
      el.innerHTML = '<div class="page-head"><div><h2>Reviews Page</h2><p>Client reviews, video testimonials and the review submission form on reviews.html.</p></div>' +
        '<div class="actions"><button class="btn" id="goPrev"><i class="fas fa-eye"></i> Preview</button></div></div><div id="rvTabs"></div>';
      $('#goPrev', el).addEventListener('click', function () { CMS.store.settings.previewPage = 'reviews.html'; CMS.store.saveSettings(); CMS.app.go('preview'); });

      tabsUI($('#rvTabs', el), [
        { id: 'cards', label: 'Review cards' }, { id: 'videos', label: 'Video testimonials' },
        { id: 'hero', label: 'Hero & stats' }, { id: 'form', label: 'Submit form' }
      ], function (id, pane) {
        if (id === 'cards') {
          pane.innerHTML = '<div class="card" style="margin-bottom:14px"><div class="input-row">' +
            CMS.fText('Section heading', 'pages.reviews.cardsHeading', p.cardsHeading) +
            CMS.fText('Section subtitle', 'pages.reviews.cardsSubtitle', p.cardsSubtitle) + '</div></div><div id="rcList"></div>';
          collectionUI({
            el: $('#rcList', pane), path: 'pages.reviews.cards', prefix: 'rv', addLabel: 'Add review',
            titleOf: function (i) { return i.name; },
            subtitleOf: function (i) { return (i.company || '') + ' · ' + '★'.repeat(i.rating || 5) + (i.featured ? ' · Featured' : ''); },
            fields: [
              { key: 'name', label: 'Client name' },
              { key: 'position', label: 'Position (e.g. CEO)' },
              { key: 'company', label: 'Company / brand' },
              { key: 'location', label: 'Location' },
              { key: 'avatar', label: 'Client photo', type: 'media', kind: 'image' },
              { key: 'rating', label: 'Rating (1–5)', type: 'number', min: 1, max: 5 },
              { key: 'text', label: 'Review text', type: 'textarea', rows: 5 },
              { key: 'projectSlug', label: 'Linked project slug', hint: 'From Projects → reviews.html tab. Powers the "View Project" button.' },
              { key: 'showViewProject', label: 'Show "View Project" button', type: 'toggle' },
              { key: 'featured', label: 'Featured review', type: 'toggle' }
            ],
            newItem: function () { return { rating: 5, showViewProject: false, featured: false, location: 'Abuja, Nigeria' }; }
          });
        } else if (id === 'videos') {
          pane.innerHTML = '<div class="card" style="margin-bottom:14px"><div class="input-row">' +
            CMS.fText('Section heading', 'pages.reviews.videoHeading', p.videoHeading) +
            CMS.fText('Section subtitle', 'pages.reviews.videoSubtitle', p.videoSubtitle) + '</div></div><div id="vtList"></div>';
          collectionUI({
            el: $('#vtList', pane), path: 'pages.reviews.videoTestimonials', prefix: 'vt', addLabel: 'Add video testimonial',
            titleOf: function (i) { return i.title; }, subtitleOf: function (i) { return i.subtitle; },
            fields: [
              { key: 'title', label: 'Title' },
              { key: 'subtitle', label: 'Subtitle' },
              { key: 'src', label: 'Video file', type: 'media', kind: 'video' }
            ]
          });
        } else if (id === 'hero') {
          pane.innerHTML = '<div class="card" style="margin-bottom:14px">' +
            '<div class="input-row">' +
            CMS.fText('Title (white part)', 'pages.reviews.hero.titlePrefix', p.hero.titlePrefix) +
            CMS.fText('Title (gold part)', 'pages.reviews.hero.titleHighlight', p.hero.titleHighlight) + '</div>' +
            CMS.fArea('Subtitle', 'pages.reviews.hero.subtitle', p.hero.subtitle) + '</div>' +
            '<div class="editor-section"><div class="sec-head"><h3>Animated stats</h3></div><div id="rsList"></div></div>';
          collectionUI({
            el: $('#rsList', pane), path: 'pages.reviews.stats', prefix: 'rs', addLabel: 'Add stat',
            titleOf: function (i) { return i.target + (i.suffix || '') + ' — ' + i.label; },
            fields: [
              { key: 'target', label: 'Number (e.g. 270 or 4.9)' },
              { key: 'suffix', label: 'Suffix (e.g. +)' },
              { key: 'label', label: 'Label' }
            ]
          });
        } else {
          pane.innerHTML = '<div class="card">' +
            CMS.fToggle('Show submit-review section', 'pages.reviews.submitForm.visible', p.submitForm.visible !== false) +
            CMS.fText('Heading', 'pages.reviews.submitForm.heading', p.submitForm.heading) +
            CMS.fArea('Subtitle', 'pages.reviews.submitForm.subtitle', p.submitForm.subtitle) +
            CMS.fText('Submit button label', 'pages.reviews.submitForm.submitLabel', p.submitForm.submitLabel) + '</div>';
        }
        bindInputs(pane);
      });
    }
  };

  /* ---------------- Media Library ---------------- */
  CMS.views.media = {
    title: 'Media Library', icon: 'fa-photo-film', perm: 'media',
    render: function (el) {
      var selected = {};
      var state = { q: '', type: 'all', folder: 'all' };

      el.innerHTML = '<div class="page-head"><div><h2>Media Library</h2>' +
        '<p>All images, videos and audio used across the site. Uploads go straight to Cloudinary and are automatically optimized (WebP/AVIF, compression, responsive sizes) when displayed.</p></div>' +
        '<div class="actions"><button class="btn" id="mBulkDel" style="display:none"><i class="fas fa-trash"></i> Remove selected</button>' +
        '<button class="btn btn-primary" id="mUploadBtn"><i class="fas fa-cloud-arrow-up"></i> Upload</button></div></div>' +
        '<div class="dropzone" id="mDrop"><i class="fas fa-cloud-arrow-up"></i><b>Drop files here</b> or click to choose — images & videos, bulk upload supported</div>' +
        '<input type="file" id="mFile" multiple accept="image/*,video/*,audio/*" style="display:none">' +
        '<div class="upload-progress" id="mProg"><div class="lbl" id="mProgLbl"></div><div class="bar-track"><div class="bar" id="mProgBar"></div></div></div>' +
        '<div class="media-toolbar">' +
        '<input class="input" id="mSearch" placeholder="Search by name…">' +
        '<select class="input" id="mType"><option value="all">All types</option><option value="image">Images</option><option value="video">Videos</option><option value="audio">Audio</option></select>' +
        '<select class="input" id="mFolder"><option value="all">All folders</option></select>' +
        '<span class="sub" id="mCount" style="color:var(--text-3);font-size:12px;margin-left:auto"></span></div>' +
        '<div id="mGrid"></div>';

      var grid = $('#mGrid', el);

      function folders() {
        var set = {};
        (CMS.store.draft.media || []).forEach(function (m) { if (m.folder) set[m.folder] = 1; });
        return Object.keys(set).sort();
      }
      function refreshFolderSelect() {
        var sel = $('#mFolder', el);
        var cur = sel.value || 'all';
        sel.innerHTML = '<option value="all">All folders</option>' + folders().map(function (f) {
          return '<option value="' + esc(f) + '">' + esc(f) + '</option>';
        }).join('');
        sel.value = cur;
      }

      function renderGrid() {
        var items = (CMS.store.draft.media || []).filter(function (m) {
          if (state.type !== 'all' && m.type !== state.type) return false;
          if (state.folder !== 'all' && m.folder !== state.folder) return false;
          if (state.q && (m.name || '').toLowerCase().indexOf(state.q.toLowerCase()) === -1) return false;
          return true;
        });
        $('#mCount', el).textContent = items.length + ' asset' + (items.length === 1 ? '' : 's');
        if (!items.length) {
          grid.innerHTML = '<div class="empty-state"><i class="fas fa-photo-film"></i>No media matches.</div>';
          return;
        }
        grid.innerHTML = '<div class="media-grid">' + items.map(function (m) {
          var isCld = /res\.cloudinary\.com/.test(m.url);
          var thumb = m.type === 'audio'
            ? '<div class="thumb icon"><i class="fas fa-music"></i></div>'
            : (isCld
              ? '<img class="thumb" loading="lazy" src="' + esc(CMS.thumb(m.url, 320)) + '">'
              : (m.type === 'video'
                ? '<div class="thumb icon"><i class="fas fa-film"></i></div>'
                : '<img class="thumb" loading="lazy" src="../' + esc(m.url.replace(/^\.\//, '')) + '">'));
          return '<div class="media-card' + (selected[m.id] ? ' selected' : '') + '" data-id="' + m.id + '">' +
            thumb + '<span class="type-tag">' + esc(m.type) + '</span><span class="check"><i class="fas fa-check"></i></span>' +
            '<div class="meta"><b>' + esc(m.name) + '</b><span>' + esc(m.folder || '—') + ' · used ' + CMS.store.usageCount(m.url) + '×</span></div></div>';
        }).join('') + '</div>';

        $$('.media-card', grid).forEach(function (card) {
          card.addEventListener('click', function (e) {
            var id = card.dataset.id;
            if (e.shiftKey || e.ctrlKey || e.metaKey || e.target.closest('.check')) {
              selected[id] = !selected[id];
              if (!selected[id]) delete selected[id];
              card.classList.toggle('selected', !!selected[id]);
              $('#mBulkDel', el).style.display = Object.keys(selected).length ? '' : 'none';
            } else {
              openAssetModal(id);
            }
          });
        });
      }

      function openAssetModal(id) {
        var m = (CMS.store.draft.media || []).find(function (x) { return x.id === id; });
        if (!m) return;
        var isCld = /res\.cloudinary\.com/.test(m.url);
        var usage = CMS.store.usageCount(m.url);
        var preview = m.type === 'video'
          ? '<video src="' + esc(m.url) + '" controls muted playsinline style="width:100%;max-height:300px;border-radius:10px;background:#000"></video>'
          : m.type === 'audio'
            ? '<audio src="' + esc(m.url) + '" controls style="width:100%"></audio>'
            : '<img src="' + esc(isCld ? CMS.thumb(m.url, 700) : '../' + m.url.replace(/^\.\//, '')) + '" style="width:100%;max-height:300px;object-fit:contain;border-radius:10px;background:#000">';

        CMS.modal({
          title: m.name,
          wide: true,
          bodyHtml: preview +
            '<div class="grid cols-2" style="margin-top:16px">' +
            '<div class="field"><label>Display name</label><input class="input" id="asName" value="' + esc(m.name) + '"></div>' +
            '<div class="field"><label>Folder</label><input class="input" id="asFolder" value="' + esc(m.folder || '') + '"></div></div>' +
            '<div class="field"><label>URL</label><div class="input-row"><input class="input" id="asUrl" value="' + esc(m.url) + '" readonly>' +
            '<button class="btn btn-sm" id="asCopy" style="flex:0"><i class="fas fa-copy"></i></button></div>' +
            '<div class="hint">Used in ' + usage + ' place' + (usage === 1 ? '' : 's') + ' on the site.' + (isCld ? '' : ' Local file — consider replacing with a Cloudinary upload for optimization.') + '</div></div>' +
            '<div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:6px">' +
            '<button class="btn btn-sm" id="asReplace"><i class="fas fa-rotate"></i> Replace everywhere…</button>' +
            '<button class="btn btn-sm btn-danger" id="asDelete"><i class="fas fa-trash"></i> Remove from library</button></div>' +
            '<input type="file" id="asReplaceFile" accept="image/*,video/*" style="display:none">',
          okLabel: 'Save',
          onOpen: function (body) {
            $('#asCopy', body).addEventListener('click', function () {
              navigator.clipboard.writeText(m.url).then(function () { CMS.toast('URL copied', 'success'); });
            });
            $('#asReplace', body).addEventListener('click', function () { $('#asReplaceFile', body).click(); });
            $('#asReplaceFile', body).addEventListener('change', function () {
              var file = this.files[0];
              if (!file) return;
              CMS.toast('Uploading replacement…');
              CMS.cloudinary.upload(file, m.folder !== 'local-vid' && m.folder !== 'cloudinary' ? m.folder : (CMS.store.draft.site.integrations.cloudinary.defaultFolder || 'elitex'))
                .then(function (res) {
                  var newUrl = res.secure_url;
                  var n = CMS.store.replaceUrl(m.url, newUrl);
                  CMS.store.addMedia({ url: newUrl, name: file.name, type: res.resource_type === 'video' ? (file.type.indexOf('audio') === 0 ? 'audio' : 'video') : 'image', source: 'cloudinary', folder: res.folder || '' });
                  CMS.store.audit('replace-media', m.name + ' → ' + file.name + ' (' + n + ' references)');
                  CMS.closeModal();
                  renderGrid(); refreshFolderSelect();
                  CMS.toast('Replaced in ' + n + ' place' + (n === 1 ? '' : 's'), 'success');
                })
                .catch(function (err) { CMS.toast(err.message, 'error'); });
            });
            $('#asDelete', body).addEventListener('click', function () {
              CMS.closeModal();
              CMS.confirm('Remove asset', usage
                ? 'This asset is used in ' + usage + ' place(s). Removing it from the library does NOT remove it from those places or from Cloudinary. Continue?'
                : 'Remove this asset from the library? (The file stays on Cloudinary — delete it there if you want it gone permanently.)', 'Remove')
                .then(function (yes) {
                  if (!yes) return;
                  CMS.store.draft.media = CMS.store.draft.media.filter(function (x) { return x.id !== id; });
                  CMS.store.change({ path: 'media' });
                  CMS.store.audit('delete-media', m.name);
                  renderGrid(); refreshFolderSelect();
                });
            });
          }
        }).then(function (r) {
          if (!r.ok) return;
          m.name = $('#asName', r.body).value || m.name;
          m.folder = $('#asFolder', r.body).value || m.folder;
          CMS.store.change({ path: 'media' });
          renderGrid(); refreshFolderSelect();
        });
      }

      /* uploads */
      function uploadFiles(files) {
        files = Array.prototype.slice.call(files);
        if (!files.length) return;
        if (!CMS.cloudinary.ready()) {
          CMS.toast('Configure Cloudinary in Settings first (cloud name + unsigned upload preset)', 'error');
          CMS.app.go('settings');
          return;
        }
        var folder = CMS.store.draft.site.integrations.cloudinary.defaultFolder || 'elitex';
        var prog = $('#mProg', el), bar = $('#mProgBar', el), lbl = $('#mProgLbl', el);
        prog.classList.add('show');
        var done = 0;

        var next = function (i) {
          if (i >= files.length) {
            prog.classList.remove('show');
            CMS.toast(done + ' file' + (done === 1 ? '' : 's') + ' uploaded', 'success');
            return;
          }
          var f = files[i];
          lbl.textContent = 'Uploading ' + (i + 1) + ' of ' + files.length + ' — ' + f.name;
          bar.style.width = '0%';
          CMS.cloudinary.upload(f, folder, function (p) { bar.style.width = Math.round(p * 100) + '%'; })
            .then(function (res) {
              var type = res.resource_type === 'video' ? (f.type.indexOf('audio') === 0 ? 'audio' : 'video') : 'image';
              CMS.store.addMedia({ url: res.secure_url, name: f.name, type: type, source: 'cloudinary', folder: res.folder || folder, width: res.width, height: res.height, bytes: res.bytes });
              CMS.store.audit('upload', f.name + ' → ' + (res.folder || folder));
              done++;
              renderGrid(); refreshFolderSelect();
              next(i + 1);
            })
            .catch(function (err) {
              CMS.toast(f.name + ': ' + err.message, 'error');
              next(i + 1);
            });
        };
        next(0);
      }

      $('#mUploadBtn', el).addEventListener('click', function () { $('#mFile', el).click(); });
      $('#mDrop', el).addEventListener('click', function () { $('#mFile', el).click(); });
      $('#mFile', el).addEventListener('change', function () { uploadFiles(this.files); this.value = ''; });
      var drop = $('#mDrop', el);
      ['dragenter', 'dragover'].forEach(function (ev) {
        drop.addEventListener(ev, function (e) { e.preventDefault(); drop.classList.add('over'); });
      });
      ['dragleave', 'drop'].forEach(function (ev) {
        drop.addEventListener(ev, function (e) { e.preventDefault(); drop.classList.remove('over'); });
      });
      drop.addEventListener('drop', function (e) { uploadFiles(e.dataTransfer.files); });

      /* filters */
      $('#mSearch', el).addEventListener('input', function () { state.q = this.value; renderGrid(); });
      $('#mType', el).addEventListener('change', function () { state.type = this.value; renderGrid(); });
      $('#mFolder', el).addEventListener('change', function () { state.folder = this.value; renderGrid(); });

      /* bulk delete */
      $('#mBulkDel', el).addEventListener('click', function () {
        var ids = Object.keys(selected);
        CMS.confirm('Remove ' + ids.length + ' assets', 'Remove the selected assets from the media library? Files stay on Cloudinary.', 'Remove').then(function (yes) {
          if (!yes) return;
          CMS.store.draft.media = CMS.store.draft.media.filter(function (x) { return !selected[x.id]; });
          CMS.store.change({ path: 'media' });
          CMS.store.audit('bulk-delete-media', ids.length + ' assets');
          selected = {};
          $('#mBulkDel', el).style.display = 'none';
          renderGrid(); refreshFolderSelect();
        });
      });

      refreshFolderSelect();
      renderGrid();
    }
  };

  /* ---------------- SEO ---------------- */
  CMS.views.seo = {
    title: 'SEO', icon: 'fa-magnifying-glass-chart', perm: 'content',
    render: function (el) {
      var seo = CMS.store.draft.seo;
      el.innerHTML = '<div class="page-head"><div><h2>SEO</h2>' +
        '<p>Meta titles, descriptions, social sharing cards, structured data and crawler files — per page.</p></div>' +
        '<div class="actions"><button class="btn" id="genFiles"><i class="fas fa-file-code"></i> Preview sitemap & robots</button></div></div><div id="seoTabs"></div>';

      var pages = [
        { id: 'index', label: 'Home' }, { id: 'project', label: 'project.html' },
        { id: 'project2', label: 'project2.html' }, { id: 'reviews', label: 'Reviews' },
        { id: 'global', label: 'Global' }
      ];

      tabsUI($('#seoTabs', el), pages, function (id, pane) {
        if (id === 'global') {
          var sd = seo.structuredData;
          pane.innerHTML = '<div class="card" style="margin-bottom:14px"><h3 style="margin-bottom:12px">Site</h3>' +
            CMS.fText('Site domain', 'site.domain', CMS.store.draft.site.domain, 'Used for canonical URLs, sitemap and structured data') +
            CMS.fText('Favicon URL', 'seo.faviconUrl', seo.faviconUrl, 'Upload a square image to the Media Library and paste its URL here') + '</div>' +
            '<div class="card"><h3 style="margin-bottom:12px">Structured data (Google rich results)</h3>' +
            CMS.fToggle('Enable LocalBusiness structured data', 'seo.structuredData.enabled', sd.enabled) +
            '<div class="input-row">' +
            CMS.fText('Business name', 'seo.structuredData.name', sd.name) +
            CMS.fText('Price range', 'seo.structuredData.priceRange', sd.priceRange) + '</div>' +
            CMS.fArea('Business description', 'seo.structuredData.description', sd.description) +
            CMS.fText('Area served', 'seo.structuredData.areaServed', sd.areaServed) + '</div>';
        } else {
          var pg = seo.pages[id];
          var base = 'seo.pages.' + id + '.';
          pane.innerHTML = '<div class="card">' +
            CMS.fText('Meta title', base + 'title', pg.title, (pg.title || '').length + ' characters — aim for under 60') +
            CMS.fArea('Meta description', base + 'description', pg.description, 3, (pg.description || '').length + ' characters — aim for under 160') +
            CMS.fText('Keywords', base + 'keywords', pg.keywords) +
            '<div class="input-row">' +
            CMS.fText('Canonical URL', base + 'canonical', pg.canonical) +
            CMS.fText('Robots', base + 'robots', pg.robots, 'e.g. index, follow') + '</div>' +
            '<h3 style="margin:16px 0 12px">Social sharing (Open Graph & Twitter Card)</h3>' +
            CMS.fText('Share title', base + 'ogTitle', pg.ogTitle) +
            CMS.fArea('Share description', base + 'ogDescription', pg.ogDescription, 2) +
            itemFieldHtml({ key: '_og', label: 'Share image', type: 'media', kind: 'image' }, pg.ogImage) + '</div>';
          var og = pane.querySelector('[data-key="_og"]');
          og.addEventListener('input', function () { CMS.store.set(base + 'ogImage', og.value); });
          wireMediaBrowse(pane);
        }
        bindInputs(pane);
      });

      $('#genFiles', el).addEventListener('click', function () {
        CMS.modal({
          title: 'sitemap.xml & robots.txt',
          wide: true,
          bodyHtml: '<div class="field"><label>sitemap.xml</label><textarea class="input" rows="8" readonly>' + esc(CMS.seoFiles.sitemap()) + '</textarea></div>' +
            '<div class="field"><label>robots.txt</label><textarea class="input" rows="6" readonly>' + esc(CMS.seoFiles.robots()) + '</textarea>' +
            '<div class="hint">These two files are committed automatically every time you publish.</div></div>',
          okLabel: 'Close', cancelLabel: null
        });
      });
    }
  };

  /* ---------------- Forms & integrations ---------------- */
  CMS.views.forms = {
    title: 'Forms', icon: 'fa-envelope-open-text', perm: 'content',
    render: function (el) {
      var integ = CMS.store.draft.site.integrations;
      el.innerHTML = '<div class="page-head"><div><h2>Forms & Integrations</h2>' +
        '<p>Where form submissions go, WhatsApp links, and the live chat widget.</p></div></div>' +
        '<div class="grid cols-2">' +
        '<div class="card"><h3 style="margin-bottom:12px"><i class="fas fa-paper-plane" style="color:var(--gold);margin-right:8px"></i>Formspree endpoints</h3>' +
        '<div class="sub" style="margin-bottom:14px">Create free forms at formspree.io — each form gives you a URL like https://formspree.io/f/xxxx. Submissions arrive in your email inbox.</div>' +
        CMS.fText('Contact form', 'site.integrations.formspreeContact', integ.formspreeContact) +
        CMS.fText('Newsletter form', 'site.integrations.formspreeNewsletter', integ.formspreeNewsletter) +
        CMS.fText('Review submission form', 'site.integrations.formspreeReview', integ.formspreeReview) + '</div>' +
        '<div class="card"><h3 style="margin-bottom:12px"><i class="fab fa-whatsapp" style="color:var(--green);margin-right:8px"></i>WhatsApp</h3>' +
        CMS.fText('WhatsApp number (international format)', 'site.contact.whatsappNumber', CMS.store.draft.site.contact.whatsappNumber, 'Example: 2348034967299') +
        CMS.fArea('Pre-filled message', 'site.contact.whatsappMessage', CMS.store.draft.site.contact.whatsappMessage, 2) +
        '<h3 style="margin:18px 0 12px"><i class="fas fa-comments" style="color:var(--gold);margin-right:8px"></i>Live chat (Tawk.to)</h3>' +
        CMS.fToggle('Enable live chat widget', 'site.integrations.tawkToEnabled', integ.tawkToEnabled) +
        CMS.fText('Tawk.to widget ID', 'site.integrations.tawkToId', integ.tawkToId, 'From your tawk.to dashboard embed code') + '</div></div>';
      bindInputs(el);
    }
  };

  /* ---------------- Live preview ---------------- */
  CMS.views.preview = {
    title: 'Live Preview', icon: 'fa-eye',
    render: function (el) {
      var page = CMS.store.settings.previewPage || 'index.html';
      el.innerHTML = '<div class="page-head"><div><h2>Live Preview</h2>' +
        '<p>Your draft, exactly as visitors will see it. Every edit updates this preview instantly — no refresh needed. Draft items show a badge.</p></div></div>' +
        '<div class="preview-wrap"><div class="preview-bar">' +
        '<select class="input" id="pvPage">' +
        ['index.html', 'project.html', 'project2.html', 'reviews.html'].map(function (p) {
          return '<option value="' + p + '"' + (p === page ? ' selected' : '') + '>' + p + '</option>';
        }).join('') + '</select>' +
        '<button class="btn btn-sm" id="pvReload"><i class="fas fa-rotate-right"></i> Reload</button>' +
        '<button class="btn btn-sm" id="pvMobile"><i class="fas fa-mobile-screen"></i> Mobile</button>' +
        '<button class="btn btn-sm" id="pvOpen" style="margin-left:auto"><i class="fas fa-arrow-up-right-from-square"></i> Open in tab</button>' +
        '</div><iframe class="preview-frame" id="pvFrame" title="Site preview"></iframe></div>';

      var frame = $('#pvFrame', el);
      var load = function (p) {
        frame.src = '../' + p + '?cmsPreview=1&t=' + Date.now();
      };
      load(page);

      CMS.app.previewFrame = frame;

      $('#pvPage', el).addEventListener('change', function () {
        CMS.store.settings.previewPage = this.value;
        CMS.store.saveSettings();
        load(this.value);
      });
      $('#pvReload', el).addEventListener('click', function () { load($('#pvPage', el).value); });
      $('#pvMobile', el).addEventListener('click', function () { frame.classList.toggle('mobile'); });
      $('#pvOpen', el).addEventListener('click', function () {
        window.open('../' + $('#pvPage', el).value + '?cmsPreview=1', '_blank');
      });

      frame.addEventListener('load', function () {
        try { frame.contentWindow.postMessage({ type: 'cms:content', content: CMS.store.draft }, '*'); } catch (e) {}
      });
    }
  };

  /* ---------------- Publish & versions ---------------- */
  CMS.views.publish = {
    title: 'Publish', icon: 'fa-rocket', perm: 'publish',
    render: function (el) {
      var dirty = CMS.store.isDirty();
      el.innerHTML = '<div class="page-head"><div><h2>Publish & Version History</h2>' +
        '<p>Publishing commits your draft to GitHub — the live site updates automatically within a minute or two.</p></div></div>' +

        '<div class="card" style="margin-bottom:18px;display:flex;align-items:center;gap:14px;flex-wrap:wrap">' +
        '<i class="fas ' + (dirty ? 'fa-circle-exclamation' : 'fa-circle-check') + '" style="font-size:22px;color:' + (dirty ? 'var(--amber)' : 'var(--green)') + '"></i>' +
        '<div style="flex:1;min-width:200px"><b>' + (dirty ? 'Unpublished changes in your draft' : 'Everything is published') + '</b>' +
        '<div class="sub">' + (dirty ? 'The live site still shows the previous version.' : 'Draft and live site are identical.') + '</div></div>' +
        '<button class="btn" id="pbDiscard"' + (dirty ? '' : ' disabled') + '><i class="fas fa-rotate-left"></i> Discard draft</button>' +
        '<button class="btn btn-primary" id="pbPublish"' + (dirty ? '' : ' disabled') + '><i class="fas fa-rocket"></i> Publish to live site</button></div>' +

        '<div class="grid cols-2">' +
        '<div class="card"><h3 style="margin-bottom:4px">Local snapshots</h3><div class="sub" style="margin-bottom:12px">Saved in this browser. A snapshot is taken automatically before every publish and restore.</div>' +
        '<div style="margin-bottom:12px"><button class="btn btn-sm" id="pbSnap"><i class="fas fa-camera"></i> Take snapshot now</button></div><div id="pbVersions"></div></div>' +
        '<div class="card"><h3 style="margin-bottom:4px">Published history (GitHub)</h3><div class="sub" style="margin-bottom:12px">Every publish is a commit — full history lives in your repository.</div><div id="pbCommits"><div class="a-skel" style="height:80px"></div></div></div>' +
        '</div>';

      function renderVersions() {
        var list = CMS.store.versions();
        $('#pbVersions', el).innerHTML = list.length ? '<table class="table"><tbody>' + list.map(function (v) {
          return '<tr><td><b>' + esc(v.label) + '</b><br><span style="font-size:11px;color:var(--text-3)">' + CMS.fmtTime(v.ts) + ' · ' + esc(v.by) + '</span></td>' +
            '<td style="text-align:right;white-space:nowrap">' +
            '<button class="btn btn-sm" data-restore="' + v.id + '">Restore</button> ' +
            '<button class="btn btn-sm btn-ghost" data-delver="' + v.id + '"><i class="fas fa-trash"></i></button></td></tr>';
        }).join('') + '</tbody></table>' : '<div class="notif-empty">No snapshots yet</div>';

        $$('[data-restore]', el).forEach(function (b) {
          b.addEventListener('click', function () {
            CMS.confirm('Restore snapshot', 'Replace your current draft with this snapshot? A backup snapshot of the current draft is taken first.', 'Restore').then(function (yes) {
              if (!yes) return;
              CMS.store.snapshot('Before restore');
              CMS.store.restoreVersion(b.dataset.restore);
              CMS.toast('Snapshot restored to draft', 'success');
              CMS.app.rerender();
            });
          });
        });
        $$('[data-delver]', el).forEach(function (b) {
          b.addEventListener('click', function () { CMS.store.deleteVersion(b.dataset.delver); renderVersions(); });
        });
      }
      renderVersions();

      $('#pbSnap', el).addEventListener('click', function () {
        CMS.prompt('Snapshot label', 'Name this snapshot', 'Snapshot ' + new Date().toLocaleString()).then(function (label) {
          if (label != null) { CMS.store.snapshot(label); renderVersions(); CMS.toast('Snapshot saved', 'success'); }
        });
      });

      $('#pbDiscard', el).addEventListener('click', function () {
        CMS.confirm('Discard draft', 'Throw away all unpublished changes and go back to the live version?', 'Discard').then(function (yes) {
          if (yes) {
            CMS.store.snapshot('Before discard');
            CMS.store.discardDraft();
            CMS.store.audit('discard', 'Draft discarded');
            CMS.toast('Draft discarded', 'success');
            CMS.app.rerender();
          }
        });
      });

      $('#pbPublish', el).addEventListener('click', function () {
        CMS.modal({
          title: 'Publish to live site',
          bodyHtml: '<div class="field"><label>Publish note (commit message)</label>' +
            '<input class="input" id="pubMsg" value="Content update ' + new Date().toLocaleDateString() + '"></div>' +
            '<div class="hint" style="margin-bottom:10px">This commits content/content.json, sitemap.xml and robots.txt to <b>' + esc(CMS.store.settings.repo) + '</b> (' + esc(CMS.store.settings.branch) + '). GitHub Pages redeploys automatically.</div>',
          okLabel: 'Publish now'
        }).then(function (r) {
          if (!r.ok) return;
          var msg = $('#pubMsg', r.body).value || 'cms: content update';
          var btn = $('#pbPublish', el);
          btn.disabled = true;
          btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Publishing…';
          CMS.store.snapshot('Before publish');
          CMS.github.publish(msg, [
            { path: 'sitemap.xml', content: CMS.seoFiles.sitemap() },
            { path: 'robots.txt', content: CMS.seoFiles.robots() }
          ]).then(function () {
            CMS.store.markPublished();
            CMS.store.audit('publish', msg);
            CMS.toast('Published! Live site updates in ~1 minute.', 'success');
            CMS.app.notify('Site published — "' + msg + '"');
            CMS.app.rerender();
          }).catch(function (err) {
            CMS.toast(err.message, 'error');
            CMS.app.rerender();
          });
        });
      });

      /* github history */
      CMS.github.history().then(function (commits) {
        $('#pbCommits', el).innerHTML = (commits && commits.length) ? '<table class="table"><tbody>' + commits.map(function (c) {
          return '<tr><td><b>' + esc(c.commit.message.split('\n')[0]) + '</b><br><span style="font-size:11px;color:var(--text-3)">' +
            CMS.fmtTime(c.commit.author.date) + ' · ' + esc(c.commit.author.name) + '</span></td>' +
            '<td style="text-align:right"><a class="btn btn-sm" href="' + esc(c.html_url) + '" target="_blank" rel="noopener">View</a></td></tr>';
        }).join('') + '</tbody></table>' : '<div class="notif-empty">No publish history yet</div>';
      }).catch(function (err) {
        $('#pbCommits', el).innerHTML = '<div class="notif-empty">' + esc(err.message) + '</div>';
      });
    }
  };

  /* ---------------- Backup ---------------- */
  CMS.views.backup = {
    title: 'Backup', icon: 'fa-file-export', perm: 'publish',
    render: function (el) {
      el.innerHTML = '<div class="page-head"><div><h2>Backup & Restore</h2>' +
        '<p>Export the entire site content as a JSON file, or restore from a previous export.</p></div></div>' +
        '<div class="grid cols-2">' +
        '<div class="card"><h3 style="margin-bottom:8px"><i class="fas fa-file-arrow-down" style="color:var(--gold);margin-right:8px"></i>Export</h3>' +
        '<div class="sub" style="margin-bottom:14px">Downloads a complete backup of your draft content — pages, projects, reviews, media registry, SEO, settings.</div>' +
        '<button class="btn btn-primary" id="bkExport"><i class="fas fa-download"></i> Download backup (.json)</button></div>' +
        '<div class="card"><h3 style="margin-bottom:8px"><i class="fas fa-file-arrow-up" style="color:var(--gold);margin-right:8px"></i>Import</h3>' +
        '<div class="sub" style="margin-bottom:14px">Restore content from a backup file. Your current draft is snapshotted first, so you can undo.</div>' +
        '<button class="btn" id="bkImport"><i class="fas fa-upload"></i> Choose backup file…</button>' +
        '<input type="file" id="bkFile" accept=".json,application/json" style="display:none"></div></div>';

      $('#bkExport', el).addEventListener('click', function () {
        var blob = new Blob([JSON.stringify(CMS.store.draft, null, 2)], { type: 'application/json' });
        var a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = 'elitex-content-backup-' + new Date().toISOString().slice(0, 10) + '.json';
        a.click();
        URL.revokeObjectURL(a.href);
        CMS.store.audit('export', 'Backup downloaded');
        CMS.toast('Backup downloaded', 'success');
      });

      $('#bkImport', el).addEventListener('click', function () { $('#bkFile', el).click(); });
      $('#bkFile', el).addEventListener('change', function () {
        var file = this.files[0];
        if (!file) return;
        var reader = new FileReader();
        reader.onload = function () {
          try {
            var json = JSON.parse(reader.result);
            if (!json.pages || !json.site) throw new Error('This file is not an Elitex CMS backup.');
            CMS.confirm('Import backup', 'Replace your current draft with "' + file.name + '"? A snapshot of the current draft is saved first.', 'Import').then(function (yes) {
              if (!yes) return;
              CMS.store.snapshot('Before import');
              CMS.store.draft = json;
              localStorage.setItem('elitexcms.draft.v1', JSON.stringify(json));
              document.dispatchEvent(new CustomEvent('cms:change', { detail: { reset: true } }));
              CMS.store.audit('import', file.name);
              CMS.toast('Backup imported into draft', 'success');
              CMS.app.rerender();
            });
          } catch (e) {
            CMS.toast('Invalid backup file: ' + e.message, 'error');
          }
        };
        reader.readAsText(file);
        this.value = '';
      });
    }
  };

  /* ---------------- Audit log ---------------- */
  CMS.views.audit = {
    title: 'Audit Log', icon: 'fa-clipboard-list', perm: 'publish',
    render: function (el) {
      var log = CMS.store.auditLog();
      el.innerHTML = '<div class="page-head"><div><h2>Audit Log</h2><p>Every action taken in this dashboard (stored in this browser, latest 300).</p></div>' +
        '<div class="actions"><button class="btn" id="auClear"><i class="fas fa-broom"></i> Clear log</button></div></div>' +
        (log.length ? '<div class="card" style="padding:0"><table class="table"><thead><tr><th>When</th><th>User</th><th>Action</th><th>Detail</th></tr></thead><tbody>' +
          log.map(function (a) {
            return '<tr><td style="white-space:nowrap">' + CMS.fmtTime(a.ts) + '</td><td>' + esc(a.user) + '</td><td><b>' + esc(a.action) + '</b></td><td>' + esc(a.detail) + '</td></tr>';
          }).join('') + '</tbody></table></div>' : '<div class="empty-state"><i class="fas fa-clipboard-list"></i>No actions logged yet.</div>');
      var clr = $('#auClear', el);
      if (clr) clr.addEventListener('click', function () {
        CMS.confirm('Clear audit log', 'Delete the entire local audit log?').then(function (yes) {
          if (yes) { localStorage.removeItem('elitexcms.audit.v1'); CMS.app.rerender(); }
        });
      });
    }
  };

  /* ---------------- Settings ---------------- */
  CMS.views.settings = {
    title: 'Settings', icon: 'fa-gear', perm: 'settings',
    render: function (el) {
      var s = CMS.store.settings;
      var cld = CMS.store.draft.site.integrations.cloudinary;
      el.innerHTML = '<div class="page-head"><div><h2>Settings</h2><p>Publishing, Cloudinary, security and team access.</p></div></div>' +
        '<div class="grid cols-2">' +

        '<div class="card"><h3 style="margin-bottom:12px"><i class="fab fa-github" style="color:var(--gold);margin-right:8px"></i>Publishing (GitHub)</h3>' +
        '<div class="field"><label>Repository</label><input class="input" id="stRepo" value="' + esc(s.repo) + '"><div class="hint">owner/repo — the repository that hosts this site on GitHub Pages</div></div>' +
        '<div class="field"><label>Branch</label><input class="input" id="stBranch" value="' + esc(s.branch) + '"></div>' +
        '<div class="field"><label>Fine-grained access token</label><input class="input" type="password" id="stToken" placeholder="' + (s.githubTokenEnc ? '•••••••• (saved, encrypted)' : 'github_pat_…') + '">' +
        '<div class="hint">Create at github.com → Settings → Developer settings → Fine-grained tokens. Give it access to only this repository with <b>Contents: Read and write</b>. It is stored encrypted with your password and never leaves this browser.</div></div>' +
        '<button type="button" class="btn btn-primary btn-sm" id="stSaveGit"><i class="fas fa-check"></i> Save publishing settings</button> ' +
        '<button type="button" class="btn btn-sm" id="stTestGit"><i class="fas fa-plug"></i> Test connection</button></div>' +

        '<div class="card"><h3 style="margin-bottom:12px"><i class="fas fa-cloud" style="color:var(--gold);margin-right:8px"></i>Cloudinary</h3>' +
        CMS.fText('Cloud name', 'site.integrations.cloudinary.cloudName', cld.cloudName) +
        CMS.fText('Unsigned upload preset', 'site.integrations.cloudinary.uploadPreset', cld.uploadPreset, 'Cloudinary console → Settings → Upload → Upload presets → Add preset → Signing mode: Unsigned. This lets the dashboard upload without exposing any secret key.') +
        CMS.fText('Default upload folder', 'site.integrations.cloudinary.defaultFolder', cld.defaultFolder) + '</div>' +

        '<div class="card"><h3 style="margin-bottom:12px"><i class="fas fa-shield-halved" style="color:var(--gold);margin-right:8px"></i>Security</h3>' +
        '<div class="field"><label>Session timeout (minutes)</label><input class="input" type="number" min="5" max="480" id="stTimeout" value="' + esc(s.sessionTimeout) + '"><div class="hint">You are logged out automatically after this much inactivity.</div></div>' +
        '<button class="btn btn-sm" id="stSaveSec"><i class="fas fa-check"></i> Save</button>' +
        '<div class="hint" style="margin-top:14px">Note: this admin runs entirely in your browser on a static host. Login protects this device\'s dashboard, drafts and encrypted secrets. Publishing power comes from the GitHub token — never share it. For extra safety, keep <code>/admin/</code> out of search engines (robots.txt already does this).</div></div>' +

        '<div class="card"><h3 style="margin-bottom:12px"><i class="fas fa-users" style="color:var(--gold);margin-right:8px"></i>Team</h3>' +
        '<div id="stUsers"></div>' +
        '<button class="btn btn-sm" id="stAddUser" style="margin-top:10px"><i class="fas fa-user-plus"></i> Add user</button>' +
        '<div class="hint" style="margin-top:10px">Owners can do everything. Editors can edit content and media but cannot publish or change settings. Accounts exist per browser.</div></div>' +
        '</div>';

      bindInputs(el);

      var saveGitBtn = $('#stSaveGit', el);
      saveGitBtn.addEventListener('click', function () {
        if (saveGitBtn.disabled) return;
        saveGitBtn.disabled = true;
        s.repo = $('#stRepo', el).value.trim();
        s.branch = $('#stBranch', el).value.trim() || 'main';
        var tok = $('#stToken', el).value.trim();
        var finish = function () {
          CMS.store.saveSettings();
          CMS.store.audit('settings', 'Publishing settings updated');
          CMS.toast('Publishing settings saved', 'success');
          saveGitBtn.disabled = false;
        };
        var fail = function (err) {
          CMS.toast(err.message || 'Could not save token', 'error');
          saveGitBtn.disabled = false;
        };
        if (tok) { CMS.github.setToken(tok).then(finish).catch(fail); }
        else { finish(); }
      });

      $('#stTestGit', el).addEventListener('click', function () {
        var btn = this;
        if (btn.disabled) return;
        var repo = $('#stRepo', el).value.trim() || CMS.store.settings.repo;
        btn.disabled = true;
        CMS.github.api('/repos/' + repo)
          .then(function (repoInfo) {
            CMS.toast('Connected to ' + repoInfo.full_name + ' ✓', 'success');
          })
          .catch(function (err) { CMS.toast(err.message, 'error'); })
          .then(function () { btn.disabled = false; });
      });

      $('#stSaveSec', el).addEventListener('click', function () {
        s.sessionTimeout = Math.max(5, parseInt($('#stTimeout', el).value, 10) || 30);
        CMS.store.saveSettings();
        CMS.toast('Saved', 'success');
      });

      function renderUsers() {
        $('#stUsers', el).innerHTML = '<table class="table"><tbody>' + CMS.auth.users.map(function (u) {
          var isSelf = CMS.auth.current && u.name === CMS.auth.current.name;
          return '<tr><td><b>' + esc(u.name) + '</b>' + (isSelf ? ' <span class="sub">(you)</span>' : '') + '</td>' +
            '<td><span class="chip ' + (u.role === 'owner' ? 'published' : 'draft') + '">' + esc(u.role) + '</span></td>' +
            '<td style="text-align:right">' + (isSelf ? '' : '<button class="btn btn-sm btn-ghost" data-deluser="' + esc(u.name) + '"><i class="fas fa-trash"></i></button>') + '</td></tr>';
        }).join('') + '</tbody></table>';
        $$('[data-deluser]', el).forEach(function (b) {
          b.addEventListener('click', function () {
            CMS.confirm('Remove user', 'Remove "' + b.dataset.deluser + '" from this dashboard?').then(function (yes) {
              if (yes) { CMS.auth.removeUser(b.dataset.deluser); CMS.store.audit('user-remove', b.dataset.deluser); renderUsers(); }
            });
          });
        });
      }
      renderUsers();

      $('#stAddUser', el).addEventListener('click', function () {
        CMS.modal({
          title: 'Add user',
          bodyHtml: '<div class="field"><label>Name</label><input class="input" id="nuName"></div>' +
            '<div class="field"><label>Password</label><input class="input" type="password" id="nuPass"><div class="hint">At least 8 characters</div></div>' +
            '<div class="field"><label>Role</label><select class="input" id="nuRole"><option value="editor">Editor — content & media only</option><option value="owner">Owner — full access</option></select></div>',
          okLabel: 'Create user',
          validate: function (body) {
            var name = $('#nuName', body).value.trim();
            var pass = $('#nuPass', body).value;
            if (!name) { CMS.toast('Name is required', 'error'); return false; }
            if (CMS.auth.users.some(function (u) { return u.name.toLowerCase() === name.toLowerCase(); })) { CMS.toast('That name is taken', 'error'); return false; }
            if (pass.length < 8) { CMS.toast('Password must be at least 8 characters', 'error'); return false; }
            return true;
          }
        }).then(function (r) {
          if (!r.ok) return;
          CMS.auth.createUser($('#nuName', r.body).value.trim(), $('#nuPass', r.body).value, $('#nuRole', r.body).value)
            .then(function () {
              CMS.store.audit('user-add', $('#nuName', r.body).value.trim());
              CMS.toast('User created', 'success');
              renderUsers();
            });
        });
      });
    }
  };
})(window.CMS);
