/* ==========================================================================
   Elitex CMS — authentication, sessions, roles, secret storage
   --------------------------------------------------------------------------
   • First run: owner creates an account (password never stored, only a
     PBKDF2-derived verifier hash + salt).
   • Sessions expire after a configurable idle timeout.
   • Secrets (GitHub token) are encrypted with AES-GCM using a key derived
     from the password, so they are unreadable without logging in.
   • Roles: owner (everything) / editor (content + media only).

   NOTE: this is a static-hosted admin. The real protection for published
   content is the GitHub token (kept encrypted and only in this browser).
   The login gate protects the dashboard, drafts and secrets on this device.
   ========================================================================== */
(function (CMS) {
  'use strict';

  var LS_USERS = 'elitexcms.users.v1';
  var SS_SESSION = 'elitexcms.session.v1';
  var enc = new TextEncoder();

  function buf2hex(buf) {
    return Array.prototype.map.call(new Uint8Array(buf), function (b) {
      return ('0' + b.toString(16)).slice(-2);
    }).join('');
  }
  function hex2buf(hex) {
    var out = new Uint8Array(hex.length / 2);
    for (var i = 0; i < out.length; i++) out[i] = parseInt(hex.substr(i * 2, 2), 16);
    return out.buffer;
  }

  function pbkdf2(password, saltHex, iterations, bits) {
    return crypto.subtle.importKey('raw', enc.encode(password), 'PBKDF2', false, ['deriveBits'])
      .then(function (key) {
        return crypto.subtle.deriveBits(
          { name: 'PBKDF2', salt: hex2buf(saltHex), iterations: iterations, hash: 'SHA-256' },
          key, bits
        );
      });
  }

  var Auth = {
    users: [],
    current: null,       /* {name, role} */
    _aesKey: null,       /* in-memory only, derived at login */

    load: function () {
      try { Auth.users = JSON.parse(localStorage.getItem(LS_USERS) || '[]'); }
      catch (e) { Auth.users = []; }
    },
    save: function () { localStorage.setItem(LS_USERS, JSON.stringify(Auth.users)); },

    hasUsers: function () { return Auth.users.length > 0; },

    createUser: function (name, password, role) {
      var salt = buf2hex(crypto.getRandomValues(new Uint8Array(16)).buffer);
      return pbkdf2(password, salt, 150000, 256).then(function (bits) {
        Auth.users.push({ name: name, role: role || 'owner', salt: salt, verifier: buf2hex(bits), createdAt: new Date().toISOString() });
        Auth.save();
      });
    },

    removeUser: function (name) {
      Auth.users = Auth.users.filter(function (u) { return u.name !== name; });
      Auth.save();
    },

    login: function (name, password) {
      var user = Auth.users.find(function (u) { return u.name.toLowerCase() === name.toLowerCase(); });
      if (!user) return Promise.resolve(false);
      return pbkdf2(password, user.salt, 150000, 256).then(function (bits) {
        if (buf2hex(bits) !== user.verifier) return false;
        /* derive AES key for secret storage (separate iteration count) */
        return pbkdf2(password, user.salt, 150001, 256).then(function (keyBits) {
          return crypto.subtle.importKey('raw', keyBits, 'AES-GCM', false, ['encrypt', 'decrypt']);
        }).then(function (aesKey) {
          Auth._aesKey = aesKey;
          Auth.current = { name: user.name, role: user.role };
          Auth.touch();
          return true;
        });
      });
    },

    logout: function () {
      Auth.current = null;
      Auth._aesKey = null;
      sessionStorage.removeItem(SS_SESSION);
    },

    /* session idle timeout */
    timeoutMinutes: 30,
    touch: function () {
      if (!Auth.current) return;
      sessionStorage.setItem(SS_SESSION, JSON.stringify({
        user: Auth.current,
        expires: Date.now() + Auth.timeoutMinutes * 60000
      }));
    },
    sessionValid: function () {
      try {
        var s = JSON.parse(sessionStorage.getItem(SS_SESSION) || 'null');
        return !!(s && s.expires > Date.now());
      } catch (e) { return false; }
    },

    can: function (perm) {
      if (!Auth.current) return false;
      if (Auth.current.role === 'owner') return true;
      /* editors: content and media only */
      return ['content', 'media'].indexOf(perm) !== -1;
    },

    /* ---------- encrypted secrets ---------- */
    encryptSecret: function (plain) {
      if (!Auth._aesKey) return Promise.reject(new Error('not logged in'));
      var iv = crypto.getRandomValues(new Uint8Array(12));
      return crypto.subtle.encrypt({ name: 'AES-GCM', iv: iv }, Auth._aesKey, enc.encode(plain))
        .then(function (ct) { return buf2hex(iv.buffer) + ':' + buf2hex(ct); });
    },
    decryptSecret: function (stored) {
      if (!Auth._aesKey) return Promise.reject(new Error('not logged in'));
      if (!stored) return Promise.resolve('');
      var parts = stored.split(':');
      return crypto.subtle.decrypt({ name: 'AES-GCM', iv: new Uint8Array(hex2buf(parts[0])) }, Auth._aesKey, hex2buf(parts[1]))
        .then(function (pt) { return new TextDecoder().decode(pt); })
        .catch(function () { return ''; });
    }
  };

  Auth.load();
  CMS.auth = Auth;
})(window.CMS);
