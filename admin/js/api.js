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

  var Cloudinary = {
    config: function () {
      return (CMS.store.draft.site.integrations || {}).cloudinary || {};
    },

    ready: function () {
      var c = Cloudinary.config();
      return !!(c.cloudName && c.uploadPreset);
    },

    /**
     * Upload one file with progress callback.
     * Uses the unsigned upload preset — create one in the Cloudinary console
     * (Settings → Upload → Upload presets → Add, mode "Unsigned").
     */
    upload: function (file, folder, onProgress) {
      var c = Cloudinary.config();
      if (!Cloudinary.ready()) {
        return Promise.reject(new Error('Cloudinary is not configured. Add your cloud name and unsigned upload preset in Settings.'));
      }
      return new Promise(function (resolve, reject) {
        var xhr = new XMLHttpRequest();
        var form = new FormData();
        form.append('file', file);
        form.append('upload_preset', c.uploadPreset);
        if (folder) form.append('folder', folder);
        xhr.open('POST', 'https://api.cloudinary.com/v1_1/' + encodeURIComponent(c.cloudName) + '/auto/upload');
        xhr.upload.onprogress = function (e) {
          if (e.lengthComputable && onProgress) onProgress(e.loaded / e.total);
        };
        xhr.onload = function () {
          if (xhr.status >= 200 && xhr.status < 300) {
            resolve(JSON.parse(xhr.responseText));
          } else {
            var msg = 'Upload failed (' + xhr.status + ')';
            try { msg = JSON.parse(xhr.responseText).error.message; } catch (e) {}
            reject(new Error(msg));
          }
        };
        xhr.onerror = function () { reject(new Error('Network error during upload')); };
        xhr.send(form);
      });
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
          body: opts.body ? JSON.stringify(opts.body) : undefined
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

    /* base64 that survives unicode */
    b64: function (str) {
      var bytes = new TextEncoder().encode(str);
      var chunks = [];
      for (var i = 0; i < bytes.length; i += 0x8000) {
        chunks.push(String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000)));
      }
      return btoa(chunks.join(''));
    },

    /**
     * Publish the draft: commits content/content.json (+ optional extra files)
     * to the configured repo/branch. GitHub Pages redeploys automatically.
     */
    publish: function (message, extraFiles) {
      var repo = CMS.store.settings.repo;
      var branch = CMS.store.settings.branch || 'main';
      var json = JSON.stringify(CMS.store.draft, null, 2);
      var files = [{ path: 'content/content.json', content: json }].concat(extraFiles || []);

      var commitOne = function (file) {
        var apiPath = '/repos/' + repo + '/contents/' + file.path;
        return GitHub.api(apiPath + '?ref=' + encodeURIComponent(branch), { allow404: true })
          .then(function (existing) {
            return GitHub.api(apiPath, {
              method: 'PUT',
              body: {
                message: message || ('cms: update ' + file.path),
                content: GitHub.b64(file.content),
                branch: branch,
                sha: existing && existing.sha ? existing.sha : undefined
              }
            });
          });
      };

      /* sequential to avoid ref race conditions */
      return files.reduce(function (chain, f) {
        return chain.then(function () { return commitOne(f); });
      }, Promise.resolve());
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
