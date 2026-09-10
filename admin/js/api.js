/* ==========================================================================
   Elitex CMS — external services
   --------------------------------------------------------------------------
   • Cloudinary: unsigned uploads (browser-safe; no API secret ever used)
   • GitHub: publish content.json to the repository that hosts the site
   ========================================================================== */
(function (CMS) {
  'use strict';

  /* ------------------------------------------------------------------ */
  /* Cloudinary                                                          */
  /* ------------------------------------------------------------------ */

  var CHUNK = 6 * 1024 * 1024; /* 6MB — keeps long .mov uploads alive */
  var MAX_TRIES = 4;

  function resourceTypeOf(file) {
    var name = ((file && file.name) || '').toLowerCase();
    var type = ((file && file.type) || '').toLowerCase();
    if (type.indexOf('audio') === 0 || /\.(mp3|wav|ogg|m4a)$/.test(name)) return 'video';
    if (type.indexOf('video') === 0 || /\.(mov|mp4|m4v|webm|avi|mkv|qt)$/.test(name)) return 'video';
    return 'image';
  }

  function parseCldError(xhr) {
    var msg = '';
    try { msg = (JSON.parse(xhr.responseText).error || {}).message || ''; } catch (e) {}
    if (!msg && xhr.status) msg = 'Upload failed (' + xhr.status + ')';
    if (/preset/i.test(msg)) {
      return 'Upload preset not found. Open Settings → Cloudinary and paste your Unsigned preset name (Cloudinary → Settings → Upload → Upload presets → Add, Signing mode: Unsigned).';
    }
    if (!msg || xhr.status === 0) {
      return 'Network error during upload. Large .mov files need a stable connection — keep this tab open and try again. If it keeps failing, compress the video or export as MP4.';
    }
    return msg;
  }

  function postChunk(url, form, headers, onProgress, timeoutMs) {
    return new Promise(function (resolve, reject) {
      var xhr = new XMLHttpRequest();
      xhr.open('POST', url);
      Object.keys(headers || {}).forEach(function (k) { xhr.setRequestHeader(k, headers[k]); });
      xhr.timeout = timeoutMs || 0;
      xhr.upload.onprogress = function (e) {
        if (e.lengthComputable && onProgress) onProgress(e.loaded, e.total);
      };
      xhr.onload = function () {
        if (xhr.status >= 200 && xhr.status < 300) {
          try { resolve(JSON.parse(xhr.responseText || '{}')); }
          catch (e) { reject(new Error('Cloudinary returned an invalid response')); }
        } else {
          reject(new Error(parseCldError(xhr)));
        }
      };
      xhr.onerror = function () { reject(new Error(parseCldError(xhr))); };
      xhr.ontimeout = function () { reject(new Error('Upload timed out. Keep this tab open and retry — 2+ minute .mov files often need a few attempts on a slow connection.')); };
      xhr.send(form);
    });
  }

  function withRetries(fn) {
    var attempt = 0;
    var run = function () {
      return fn(attempt).catch(function (err) {
        var fatal = /preset not found|not configured|invalid/i.test(err.message || '');
        attempt++;
        if (fatal || attempt >= MAX_TRIES) throw err;
        var wait = Math.min(1500 * attempt, 6000);
        return new Promise(function (r) { setTimeout(r, wait); }).then(run);
      });
    };
    return run();
  }

  var Cloudinary = {
    config: function () {
      var c = ((CMS.store.draft.site || {}).integrations || {}).cloudinary || {};
      var s = CMS.store.settings || {};
      return {
        cloudName: String(c.cloudName || s.cldCloudName || '').trim(),
        uploadPreset: String(c.uploadPreset || s.cldPreset || '').trim(),
        defaultFolder: String(c.defaultFolder || s.cldFolder || 'elitex').trim() || 'elitex'
      };
    },

    ready: function () {
      var c = Cloudinary.config();
      return !!(c.cloudName && c.uploadPreset);
    },

    /**
     * Upload one file with progress callback (0–1).
     * Videos (including 2+ minute .mov) use chunked video/upload + async processing
     * so the browser connection is not held open while Cloudinary transcodes.
     */
    upload: function (file, folder, onProgress) {
      var c = Cloudinary.config();
      if (!c.cloudName) {
        return Promise.reject(new Error('Cloudinary cloud name is missing. Add it in Settings → Cloudinary.'));
      }
      if (!c.uploadPreset) {
        return Promise.reject(new Error('Upload preset not found. Open Settings → Cloudinary and paste your Unsigned upload preset name.'));
      }
      folder = folder || c.defaultFolder;
      var rtype = resourceTypeOf(file);
      var url = 'https://api.cloudinary.com/v1_1/' + encodeURIComponent(c.cloudName) + '/' + rtype + '/upload';
      var isVideo = rtype === 'video';
      var uid = (Date.now().toString(36) + Math.random().toString(36).slice(2, 10)).slice(0, 20);
      var total = file.size || 0;
      var report = function (loaded) {
        if (onProgress && total) onProgress(Math.min(loaded / total, 0.99));
      };

      var sendRange = function (start) {
        var end = Math.min(start + CHUNK, total) - 1;
        if (end < start && total) end = total - 1;
        var last = !total || end >= total - 1;
        var headers = {};
        if (total > CHUNK) {
          headers['X-Unique-Upload-Id'] = uid;
          headers['Content-Range'] = 'bytes ' + start + '-' + end + '/' + total;
        }
        return withRetries(function () {
          var blob = total ? file.slice(start, end + 1) : file;
          var form = new FormData();
          form.append('file', blob, file.name || 'upload');
          form.append('upload_preset', c.uploadPreset);
          if (folder) form.append('folder', folder);
          return postChunk(url, form, headers, function (loaded) {
            report(start + loaded);
          }, last && isVideo ? 12 * 60 * 1000 : 0);
        }).then(function (res) {
          if (!last && total > CHUNK) return sendRange(end + 1);
          if (onProgress) onProgress(1);
          if (res && res.error && res.error.message) throw new Error(res.error.message);
          if (res && !res.secure_url && res.public_id) {
            res.secure_url = 'https://res.cloudinary.com/' + c.cloudName + '/' + rtype + '/upload/' + res.public_id;
          }
          if (!res || !res.secure_url) throw new Error('Upload finished but Cloudinary did not return a video URL. Wait a minute and check Media Library.');
          return res;
        });
      };

      return sendRange(0);
    }
  };

  /* ------------------------------------------------------------------ */
  /* GitHub publishing                                                   */
  /* ------------------------------------------------------------------ */

  var GitHub = {
    token: null, /* decrypted at publish time, kept only in memory */

    getToken: function () {
      if (GitHub.token) return Promise.resolve(GitHub.token);
      return CMS.auth.decryptSecret(CMS.store.settings.githubTokenEnc).then(function (t) {
        GitHub.token = t || null;
        return GitHub.token;
      });
    },

    setToken: function (plain) {
      return CMS.auth.encryptSecret(plain).then(function (encd) {
        CMS.store.settings.githubTokenEnc = encd;
        GitHub.token = plain;
      });
    },

    api: function (path, opts) {
      opts = opts || {};
      return GitHub.getToken().then(function (token) {
        if (!token) throw new Error('No GitHub token configured. Add one in Settings → Publishing.');
        return fetch('https://api.github.com' + path, {
          method: opts.method || 'GET',
          headers: {
            Authorization: 'Bearer ' + token,
            Accept: 'application/vnd.github+json',
            'X-GitHub-Api-Version': '2022-11-28'
          },
          body: opts.body ? (function () {
            try { return JSON.stringify(opts.body); }
            catch (e) { throw new Error('Request payload is too large to send.'); }
          })() : undefined
        });
      }).then(function (res) {
        if (res.status === 401) throw new Error('GitHub token is invalid or expired.');
        if (res.status === 404 && !opts.allow404) throw new Error('Repository or file not found. Check repo name in Settings.');
        if (!res.ok && res.status !== 404) {
          return res.json().catch(function () { return {}; }).then(function (j) {
            throw new Error(j.message || ('GitHub error ' + res.status));
          });
        }
        return res.status === 404 ? null : res.json();
      });
    },

    /* base64 for GitHub API — never use Function.apply on large byte arrays (stack overflow). */
    b64: function (str) {
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
    },

    /**
     * Publish the draft: commits content/content.json (+ optional extra files)
     * to the configured repo/branch. GitHub Pages redeploys automatically.
     */
    publish: function (message, extraFiles) {
      return Promise.resolve().then(function () {
        var repo = CMS.store.settings.repo;
        var branch = CMS.store.settings.branch || 'main';
        var json = CMS.store.draftJson();
        var files = [{ path: 'content/content.json', content: json }].concat(extraFiles || []);

        var commitOne = function (file) {
          var apiPath = '/repos/' + repo + '/contents/' + file.path;
          var encoded;
          try { encoded = GitHub.b64(file.content); }
          catch (e) { throw new Error('Content encoding failed for ' + file.path); }
          return GitHub.api(apiPath + '?ref=' + encodeURIComponent(branch), { allow404: true })
            .then(function (existing) {
              return GitHub.api(apiPath, {
                method: 'PUT',
                body: {
                  message: message || ('cms: update ' + file.path),
                  content: encoded,
                  branch: branch,
                  sha: existing && existing.sha ? existing.sha : undefined
                }
              });
            });
        };

        return files.reduce(function (chain, f) {
          return chain.then(function () { return commitOne(f); });
        }, Promise.resolve());
      });
    },

    history: function () {
      var repo = CMS.store.settings.repo;
      var branch = CMS.store.settings.branch || 'main';
      return GitHub.api('/repos/' + repo + '/commits?path=content/content.json&sha=' + encodeURIComponent(branch) + '&per_page=15');
    }
  };

  /* ------------------------------------------------------------------ */
  /* SEO file generation (sitemap + robots)                              */
  /* ------------------------------------------------------------------ */

  var Seo = {
    sitemap: function () {
      var domain = (CMS.store.draft.site.domain || 'https://elitexinterior.com').replace(/\/$/, '');
      var pages = ['', 'project.html', 'project2.html', 'reviews.html'];
      var now = new Date().toISOString().slice(0, 10);
      return '<?xml version="1.0" encoding="UTF-8"?>\n' +
        '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' +
        pages.map(function (p) {
          return '  <url><loc>' + domain + '/' + p + '</loc><lastmod>' + now + '</lastmod></url>';
        }).join('\n') +
        '\n</urlset>\n';
    },
    robots: function () {
      var domain = (CMS.store.draft.site.domain || 'https://elitexinterior.com').replace(/\/$/, '');
      return 'User-agent: *\nAllow: /\nDisallow: /admin/\n\nSitemap: ' + domain + '/sitemap.xml\n';
    }
  };

  CMS.cloudinary = Cloudinary;
  CMS.github = GitHub;
  CMS.seoFiles = Seo;
})(window.CMS);
