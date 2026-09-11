/* ==========================================================================
   Elitex Interior — public site runtime
   --------------------------------------------------------------------------
   Renders every page from published Neon (GET /api/content) with
   content/content.json as fallback if the API is unreachable:
     • hydrates text sections in place (no layout shift)
     • renders media collections with skeletons + IntersectionObserver lazy load
     • applies Cloudinary transformations (f_auto/q_auto → WebP/AVIF)
     • applies SEO meta from the CMS
     • powers forms, modals, sliders, counters
     • live-preview bridge: instant re-render from the Admin Dashboard
   Pages declare themselves via <body data-page="home|showcase|showcase2|reviews">
   ========================================================================== */
(function () {
  'use strict';

  var PAGE = document.body.getAttribute('data-page') || 'home';
  var PREVIEW = /[?&]cmsPreview=1/.test(location.search);
  var DRAFT_KEY = 'elitexcms.draft.v1';
  var content = null;
  var swiperInstance = null;
  var homeWorks = [];
  var sheetLastFocus = null;
  var heroHold = false;
  var exhibitArmed = false;
  var preloaderGone = false;
  var publicVoices = [];
  var PUBLIC_REVIEWS_KEY = 'elitex.publicReviews.v1';

  /* ------------------------------------------------------------------ */
  /* Helpers                                                             */
  /* ------------------------------------------------------------------ */

  function $(sel, root) { return (root || document).querySelector(sel); }
  function $$(sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); }

  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }
  /* escape, but allow explicit <br> line breaks stored in content */
  function escBr(s) { return esc(s).replace(/&lt;br\s*\/?&gt;/gi, '<br>'); }

  function setText(sel, value) {
    var el = $(sel);
    if (el && value != null) el.textContent = value;
  }
  function setHtml(sel, value) {
    var el = $(sel);
    if (el && value != null) el.innerHTML = value;
  }

  /* visible items: published always; drafts only in preview (with badge) */
  function items(list) {
    if (!Array.isArray(list)) return [];
    return list
      .filter(function (it) {
        if (!it || it.status === 'hidden') return false;
        if (it.status === 'draft') return PREVIEW;
        return true;
      })
      .sort(function (a, b) { return (a.order || 0) - (b.order || 0); });
  }
  function draftBadge(it) {
    return (PREVIEW && it.status === 'draft') ? '<span class="cms-draft-badge">Draft</span>' : '';
  }
  function pad2(n) {
    return n < 10 ? '0' + n : String(n);
  }
  function clipLine(s, max) {
    s = String(s || '').replace(/\s+/g, ' ').trim();
    var pipe = s.indexOf('|');
    if (pipe > 8) s = s.slice(0, pipe).trim();
    if (s.length <= max) return s;
    return s.slice(0, max).replace(/\s+\S*$/, '').replace(/[.,;:–-]+$/, '') + '…';
  }
  function voiceQuote(t) {
    return String((t && (t.quote || t.text)) || '');
  }
  function voiceLine(t) {
    if (!t) return '';
    var bits = [t.position, t.company, t.location].filter(Boolean);
    var out = [];
    bits.forEach(function (b) {
      var s = String(b).replace(/\s+/g, ' ').trim();
      if (!s) return;
      if (out.some(function (x) { return x === s || x.indexOf(s) !== -1 || s.indexOf(x) !== -1; })) return;
      out.push(s);
    });
    return out.join(' · ');
  }
  function asVoice(r) {
    return {
      id: r.id,
      name: r.name,
      location: r.location || '',
      avatar: r.avatar || '',
      quote: voiceQuote(r),
      rating: r.rating || 5,
      company: r.company || '',
      position: r.position || '',
      status: r.status || 'published',
      order: r.order || 0,
      source: r.source || 'public'
    };
  }
  function allVoices() {
    var home = content && content.pages && content.pages.home;
    var cms = home ? items(home.testimonials.slides) : [];
    return publicVoices.map(asVoice).concat(cms);
  }
  function rememberPublicReviews(list) {
    publicVoices = (list || []).map(asVoice);
    try { localStorage.setItem(PUBLIC_REVIEWS_KEY, JSON.stringify(publicVoices.slice(0, 20))); } catch (e) {}
  }
  function readLocalPublicReviews() {
    try {
      var raw = JSON.parse(localStorage.getItem(PUBLIC_REVIEWS_KEY) || '[]');
      if (Array.isArray(raw)) publicVoices = raw.map(asVoice);
    } catch (e) {}
  }
  function publicApiRoot() {
    var url = 'https://elitex-interior.vercel.app/api/content';
    var meta = document.querySelector('meta[name="elitex-content-api"]');
    if (meta && meta.getAttribute('content')) url = meta.getAttribute('content');
    try {
      var stored = localStorage.getItem('elitex.cmsContentApi');
      if (stored) url = stored;
    } catch (e) {}
    return String(url).replace(/\/content\/?$/, '');
  }
  function reviewsApiUrl() {
    return publicApiRoot() + '/reviews';
  }

  /* ------------------------------------------------------------------ */
  /* Cloudinary                                                          */
  /* ------------------------------------------------------------------ */

  var CLD_RE = /(https?:\/\/res\.cloudinary\.com\/[^/]+\/(image|video)\/upload\/)(.*)$/;

  function cldImage(url, width) {
    var m = CLD_RE.exec(url || '');
    if (!m || m[2] !== 'image') return url;
    if (/\/upload\/[a-z]+_[^/]*\//.test(url)) return url;
    return m[1] + 'f_auto,q_auto,c_limit,w_' + (width || 1000) + '/' + m[3];
  }
  function cldVideo(url, width, opts) {
    var m = CLD_RE.exec(url || '');
    if (!m || m[2] !== 'video') return url;
    if (/\/upload\/[a-z]+_[^/]*\//.test(url)) return url;
    var q = (opts && opts.quality) || 'q_auto:eco';
    var bits = ['f_mp4', 'vc_h264', q, 'c_limit', 'w_' + (width || 720)];
    if (opts && opts.silent) bits.splice(2, 0, 'ac_none');
    return m[1] + bits.join(',') + '/' + m[3];
  }
  /* poster frame generated by Cloudinary from the first video frame */
  function cldPoster(url, width) {
    var m = CLD_RE.exec(url || '');
    if (!m || m[2] !== 'video') return '';
    var rest = m[3].replace(/\.(mp4|mov|webm)(\?.*)?$/i, '.jpg');
    return m[1] + 'so_0,f_auto,q_auto,c_limit,w_' + (width || 800) + '/' + rest;
  }
  function cldSrcSet(url, kind, widths) {
    widths = widths || [640, 960, 1280];
    return widths.map(function (w) {
      var src = kind === 'video' ? cldPoster(url, w) : cldImage(url, w);
      return src ? src + ' ' + w + 'w' : '';
    }).filter(Boolean).join(', ');
  }
  function saveDataOn() {
    try { return !!(navigator.connection && navigator.connection.saveData); } catch (e) { return false; }
  }
  function connectionSlow() {
    try {
      var c = navigator.connection;
      if (!c) return false;
      if (c.saveData) return true;
      return /2g/.test(c.effectiveType || '');
    } catch (e) { return false; }
  }
  function filmWidth(kind, src) {
    var mobile = window.innerWidth < 760;
    var heavy = /\.mov(\?|$)/i.test(src || '');
    if (connectionSlow()) return 480;
    if (kind === 'hero') {
      if (heavy) return mobile ? 480 : 720;
      return mobile ? 720 : 1080;
    }
    return mobile ? 640 : 854;
  }
  function heroFilmUrl(src, kind) {
    if (!src) return '';
    if (!/res\.cloudinary/.test(src)) return src;
    return cldVideo(src, filmWidth(kind || 'hero', src), {
      silent: true,
      quality: window.innerWidth < 760 ? 'q_auto:low' : 'q_auto:eco'
    });
  }
  function isPlayableHeroFilm(src) {
    if (!src) return false;
    if (/^\.\/|^vid\//i.test(src)) return false;
    return /res\.cloudinary\.com\/[^/]+\/video\//.test(src);
  }
  function pickPlayableFilm(works) {
    var i, it, mp4 = null, other = null;
    for (i = 0; i < (works || []).length; i++) {
      it = works[i];
      if (!it || it.mediaType !== 'video' || !isPlayableHeroFilm(it.src)) continue;
      if (/\.mp4(\?|$)/i.test(it.src)) {
        if (!mp4) mp4 = it;
      } else if (!other) {
        other = it;
      }
    }
    return mp4 || other || null;
  }
  function armVideo(film) {
    if (!film) return;
    film.muted = true;
    film.defaultMuted = true;
    film.playsInline = true;
    film.setAttribute('muted', '');
    film.setAttribute('playsinline', '');
    film.setAttribute('webkit-playsinline', '');
  }
  function assignFilmSrc(film, preload) {
    if (!film || film.__assigned) return;
    var src = film.getAttribute('data-src');
    if (!src) {
      if (film.src) film.__assigned = true;
      return;
    }
    film.__assigned = true;
    armVideo(film);
    film.preload = preload || 'auto';
    film.src = src;
    try { film.load(); } catch (e) {}
  }
  function playWhenReady(film) {
    if (!film) return;
    assignFilmSrc(film, 'auto');
    armVideo(film);
    var go = function () {
      var p = film.play();
      if (p && p.catch) p.catch(function () {});
    };
    if (film.readyState >= 2) {
      go();
      return;
    }
    if (!film.__playArmed) {
      film.__playArmed = true;
      film.addEventListener('canplay', go, { once: true });
    }
    go();
  }
  function unlockHomeFilms() {
    if (unlockHomeFilms.done) return;
    unlockHomeFilms.done = true;
    var hero = $('video.ex-hero-film');
    if (hero) {
      playWhenReady(hero);
      if (!hero.paused && hero.readyState >= 2) releaseHero();
    }
    var live = $('.ex-room.is-live video.ex-room-film') || $('.ex-room-film');
    if (live) playWhenReady(live);
    var logo = $('.ex-logo-film');
    if (logo && logo.getAttribute('src')) playWhenReady(logo);
  }

  /* ------------------------------------------------------------------ */
  /* Lazy loading                                                        */
  /* ------------------------------------------------------------------ */

  var io = ('IntersectionObserver' in window) ? new IntersectionObserver(function (entries) {
    entries.forEach(function (entry) {
      var el = entry.target;
      if (el.tagName === 'VIDEO') {
        var src = el.querySelector('source');
        if (entry.isIntersecting) {
          if (src && !src.src && src.getAttribute('data-src')) {
            src.src = src.getAttribute('data-src');
            el.load();
            el.addEventListener('loadeddata', function () {
              var wrap = el.closest('.lazy-media'); if (wrap) wrap.classList.add('is-loaded');
            }, { once: true });
          }
          if (PAGE !== 'home') {
            var p = el.play(); if (p && p.catch) p.catch(function () {});
          }
        } else if (!el.paused) {
          el.pause();
        }
      } else if (el.tagName === 'IMG') {
        if (entry.isIntersecting) {
          if (!el.src && el.getAttribute('data-src')) {
            if (el.getAttribute('data-srcset')) el.setAttribute('srcset', el.getAttribute('data-srcset'));
            if (el.getAttribute('data-sizes')) el.setAttribute('sizes', el.getAttribute('data-sizes'));
            el.src = el.getAttribute('data-src');
            el.addEventListener('load', function () {
              var wrap = el.closest('.lazy-media'); if (wrap) wrap.classList.add('is-loaded');
            }, { once: true });
          }
          io.unobserve(el);
        }
      }
    });
  }, { rootMargin: '200px 0px', threshold: 0.05 }) : null;

  function observeLazy(root) {
    $$('video[data-lazy], img[data-src]', root).forEach(function (el) {
      if (io) { io.observe(el); }
      else if (el.tagName === 'IMG') { el.src = el.getAttribute('data-src'); }
      else {
        var s = el.querySelector('source');
        if (s && s.getAttribute('data-src')) { s.src = s.getAttribute('data-src'); el.load(); el.play(); }
      }
    });
  }

  function videoTag(src, opts) {
    opts = opts || {};
    var poster = cldPoster(src, opts.posterWidth || 800);
    return '<video muted playsinline loop preload="none" data-lazy="1"' +
      (poster ? ' poster="' + esc(poster) + '"' : '') +
      ' class="' + esc(opts.className || 'w-full h-full object-cover') + '">' +
      '<source data-src="' + esc(cldVideo(src)) + '" type="video/mp4"></video>';
  }
  function imgTag(src, alt, opts) {
    opts = opts || {};
    return '<img data-src="' + esc(cldImage(src, opts.width || 1000)) + '" alt="' + esc(alt || '') + '"' +
      ' loading="lazy" decoding="async" class="' + esc(opts.className || 'w-full h-full object-cover') + '">';
  }

  /* ------------------------------------------------------------------ */
  /* SEO                                                                 */
  /* ------------------------------------------------------------------ */

  var SEO_PAGE_KEY = { home: 'index', showcase: 'project', showcase2: 'project2', reviews: 'reviews' };

  function metaSet(attrName, attrValue, contentValue) {
    if (contentValue == null || contentValue === '') return;
    var el = document.head.querySelector('meta[' + attrName + '="' + attrValue + '"]');
    if (!el) {
      el = document.createElement('meta');
      el.setAttribute(attrName, attrValue);
      document.head.appendChild(el);
    }
    el.setAttribute('content', contentValue);
  }
  function linkSet(rel, href) {
    if (!href) return;
    var el = document.head.querySelector('link[rel="' + rel + '"]');
    if (!el) { el = document.createElement('link'); el.setAttribute('rel', rel); document.head.appendChild(el); }
    el.setAttribute('href', href);
  }

  function applySeo() {
    var seo = content.seo || {};
    var page = (seo.pages || {})[SEO_PAGE_KEY[PAGE]] || {};
    if (page.title) document.title = page.title;
    metaSet('name', 'description', page.description);
    metaSet('name', 'keywords', page.keywords);
    metaSet('name', 'robots', page.robots);
    metaSet('property', 'og:title', page.ogTitle || page.title);
    metaSet('property', 'og:description', page.ogDescription || page.description);
    metaSet('property', 'og:image', page.ogImage);
    metaSet('property', 'og:url', page.canonical);
    metaSet('property', 'twitter:title', page.ogTitle || page.title);
    metaSet('property', 'twitter:description', page.ogDescription || page.description);
    metaSet('property', 'twitter:image', page.ogImage);
    if (page.canonical) linkSet('canonical', page.canonical);
    if (seo.faviconUrl) linkSet('icon', seo.faviconUrl);

    var sd = seo.structuredData || {};
    if (sd.enabled) {
      var contact = (content.site || {}).contact || {};
      var json = {
        '@context': 'https://schema.org',
        '@type': sd.type || 'LocalBusiness',
        name: sd.name || content.site.name,
        description: sd.description || '',
        url: (content.site || {}).domain || location.origin,
        telephone: contact.phone || undefined,
        address: contact.address ? { '@type': 'PostalAddress', streetAddress: contact.address, addressLocality: 'Abuja', addressCountry: 'NG' } : undefined,
        priceRange: sd.priceRange || undefined,
        areaServed: sd.areaServed || undefined
      };
      var el = document.getElementById('cms-jsonld');
      if (!el) {
        el = document.createElement('script');
        el.type = 'application/ld+json';
        el.id = 'cms-jsonld';
        document.head.appendChild(el);
      }
      el.textContent = JSON.stringify(json);
    }
  }

  /* ------------------------------------------------------------------ */
  /* Shared renderers                                                    */
  /* ------------------------------------------------------------------ */

  function whatsappUrl() {
    var c = (content.site && content.site.contact) || {};
    return 'https://wa.me/' + (c.whatsappNumber || '') + '?text=' + encodeURIComponent(c.whatsappMessage || '');
  }

  function renderFooterCommon() {
    var f = content.pages.home.footer;
    setText('[data-cms="footer-brand"]', f.brandName);
    setText('[data-cms="footer-blurb"]', f.blurb);
    setText('[data-cms="footer-copy"]', '\u00A9 ' + new Date().getFullYear() + ' ' + f.copyright);

    var social = $('[data-cms="footer-social"]');
    if (social) {
      social.innerHTML = items(content.site.social).map(function (s) {
        return '<a href="' + esc(s.url) + '" target="_blank" rel="noopener" aria-label="' + esc(s.platform) + '"' +
          ' class="ex-social-link"><i class="' + esc(s.icon) + '"></i></a>';
      }).join('');
    }
  }

  /* ------------------------------------------------------------------ */
  /* HOME page                                                           */
  /* ------------------------------------------------------------------ */

  function workTitle(it) {
    var t = String((it && it.title) || '').trim();
    if (!t || /^new$/i.test(t)) return '';
    return t;
  }

  function workPoster(it, width) {
    if (!it || !it.src) return '';
    if (it.mediaType === 'video') return cldPoster(it.src, width || 1200);
    return cldImage(it.src, width || 1200);
  }

  function stillImg(it, opts) {
    opts = opts || {};
    var alt = it.alt || workTitle(it) || 'Elitex Interior project';
    var kind = it.mediaType === 'video' ? 'video' : 'image';
    var src = kind === 'video' ? cldPoster(it.src, opts.width || 1200) : cldImage(it.src, opts.width || 1200);
    if (!src) return '';
    var srcset = /res\.cloudinary/.test(it.src || '') ? cldSrcSet(it.src, kind, opts.widths) : '';
    var sizes = opts.sizes || '100vw';
    var pos = opts.objectPosition ? ' style="object-position:' + esc(opts.objectPosition) + '"' : '';
    if (opts.eager) {
      return '<img class="' + esc(opts.className || '') + '" src="' + esc(src) + '"' +
        (srcset ? ' srcset="' + esc(srcset) + '"' : '') +
        ' sizes="' + esc(sizes) + '" alt="' + esc(alt) + '" fetchpriority="high" decoding="async"' + pos + '>';
    }
    return '<img class="' + esc(opts.className || '') + '" data-src="' + esc(src) + '"' +
      (srcset ? ' data-srcset="' + esc(srcset) + '"' : '') +
      ' data-sizes="' + esc(sizes) + '" alt="' + esc(alt) + '" loading="lazy" decoding="async"' + pos + '>';
  }

  function heroFromCms(p, works) {
    var hero = (p && p.hero) || {};
    var picked = pickPlayableFilm(works);
    var still = null;
    if (hero.imageSrc) {
      still = {
        mediaType: 'image',
        src: hero.imageSrc,
        alt: hero.mediaAlt || hero.title || 'Elitex Interior',
        objectPosition: hero.objectPosition
      };
    } else if (hero.videoSrc) {
      still = {
        mediaType: 'video',
        src: hero.videoSrc,
        alt: hero.mediaAlt || hero.title || 'Elitex Interior',
        objectPosition: hero.objectPosition
      };
    } else if (picked) {
      still = {
        mediaType: 'video',
        src: picked.src,
        alt: hero.mediaAlt || workTitle(picked) || hero.title || 'Elitex Interior',
        objectPosition: hero.objectPosition
      };
    } else if (works[0] && works[0].src) {
      still = {
        mediaType: works[0].mediaType,
        src: works[0].src,
        alt: works[0].alt || workTitle(works[0]) || 'Elitex Interior',
        objectPosition: hero.objectPosition
      };
    }
    /* Admin film always wins. Until they set one, use a short Cloudinary MP4 — not the first .mov. */
    var filmSrc = hero.videoSrc || '';
    if (!filmSrc && !hero.imageSrc) {
      filmSrc = (still && still.mediaType === 'video' && isPlayableHeroFilm(still.src) ? still.src : '') ||
        (picked && picked.src) || '';
    }
    return { still: still, filmSrc: filmSrc, credit: String(hero.credit || '').trim() };
  }

  function fillHeroStage(heroMedia) {
    var stage = $('#heroStage');
    if (!stage) return;
    var it = heroMedia && heroMedia.still;
    if (!it || !it.src) {
      stage.innerHTML = '<div class="ex-hero-fallback" aria-hidden="true"></div>';
      return;
    }
    var width = window.innerWidth < 760 ? 900 : 1800;
    var html = stillImg(it, {
      eager: true,
      width: width,
      sizes: '100vw',
      className: 'ex-hero-still',
      objectPosition: it.objectPosition || 'center'
    });
    if (!html) {
      html = '<div class="ex-hero-fallback" aria-hidden="true"></div>';
    }
    stage.innerHTML = html;
    var poster = it.mediaType === 'video' ? workPoster(it, width) : cldImage(it.src, width);
    enhanceHeroFilm(heroMedia.filmSrc, poster, it.objectPosition);
  }

  function enhanceHeroFilm(filmSrc, poster, objectPosition) {
    if (!filmSrc) return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    if (saveDataOn()) return;
    var stage = $('#heroStage');
    if (!stage || stage.querySelector('video.ex-hero-film')) return;

    heroHold = true;
    var src = heroFilmUrl(filmSrc, 'hero');
    var mobile = window.innerWidth < 760;

    var hint = document.createElement('link');
    hint.rel = 'preload';
    hint.as = 'video';
    hint.href = src;
    hint.type = 'video/mp4';
    document.head.appendChild(hint);

    var film = document.createElement('video');
    film.className = 'ex-hero-film';
    film.setAttribute('muted', '');
    film.setAttribute('autoplay', '');
    film.setAttribute('loop', '');
    film.setAttribute('playsinline', '');
    film.setAttribute('webkit-playsinline', '');
    film.setAttribute('preload', 'auto');
    film.setAttribute('fetchpriority', 'high');
    film.setAttribute('aria-hidden', 'true');
    if (poster) film.setAttribute('poster', poster);
    if (objectPosition) film.style.objectPosition = objectPosition;
    armVideo(film);
    film.autoplay = true;
    film.loop = true;
    film.preload = 'auto';
    film.volume = 0;

    var released = false;
    var finish = function () {
      if (released) return;
      released = true;
      releaseHero();
    };
    film.addEventListener('playing', function () {
      film.classList.add('is-on');
      finish();
    }, { once: true });
    film.addEventListener('error', finish, { once: true });
    film.addEventListener('canplay', function () {
      kick();
      setTimeout(function () { if (!released) finish(); }, 1600);
    }, { once: true });

    var kick = function () {
      armVideo(film);
      film.muted = true;
      film.volume = 0;
      var p = film.play();
      if (p && p.catch) p.catch(function () {});
    };
    ['loadedmetadata', 'loadeddata', 'canplay', 'canplaythrough'].forEach(function (ev) {
      film.addEventListener(ev, kick);
    });
    stage.appendChild(film);
    film.src = src;
    try { film.load(); } catch (e) {}
    kick();
    setTimeout(kick, 80);
    setTimeout(kick, 280);
    if (mobile) setTimeout(kick, 700);
  }

  function roomClass(it, i) {
    var size = it.size || 'normal';
    if (size === 'large') return 'ex-room ex-room--cine';
    if (size === 'wide') return 'ex-room ex-room--wide';
    if (size === 'tall') return 'ex-room ex-room--tall';
    var cycle = ['cine', 'wide', 'tall'];
    return 'ex-room ex-room--' + cycle[i % cycle.length];
  }

  function fillAboutMedia(about) {
    var host = $('#aboutMedia');
    if (!host) return;
    var image = about.imageSrc;
    var video = about.videoSrc;
    var pos = about.objectPosition || 'center';
    var alt = about.heading || 'Elitex Interior';
    var imgOpts = {
      eager: true,
      width: window.innerWidth < 760 ? 900 : 1400,
      sizes: '100vw',
      objectPosition: pos
    };
    if (!image && !video) {
      host.innerHTML = '';
      return;
    }
    if (image) {
      host.innerHTML = stillImg({ mediaType: 'image', src: image, alt: alt }, imgOpts);
      return;
    }
    var poster = cldPoster(video, imgOpts.width);
    var src = /res\.cloudinary/.test(video) ? cldVideo(video, filmWidth(), { silent: true }) : video;
    host.innerHTML = '<video class="ex-logo-film" muted playsinline loop preload="auto"' +
      (poster ? ' poster="' + esc(poster) + '"' : '') +
      ' data-src="' + esc(src) + '" aria-label="' + esc(alt) + '"></video>';
    var film = host.querySelector('video');
    if (!film) return;
    armVideo(film);
    film.addEventListener('loadedmetadata', function () {
      if (film.videoWidth && film.videoHeight) {
        host.style.aspectRatio = film.videoWidth + ' / ' + film.videoHeight;
      }
      if (typeof ScrollTrigger !== 'undefined' && ScrollTrigger.refresh) {
        ScrollTrigger.refresh();
      }
    });
    if ('IntersectionObserver' in window) {
      var watch = new IntersectionObserver(function (entries) {
        entries.forEach(function (entry) {
          if (entry.isIntersecting) assignFilmSrc(film, 'auto');
          var box = film.getBoundingClientRect();
          var onScreen = box.bottom > 0 && box.top < window.innerHeight;
          if (onScreen && !window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
            playWhenReady(film);
          } else if (!film.paused && !onScreen) {
            film.pause();
          }
        });
      }, { rootMargin: '700px 0px', threshold: 0.01 });
      watch.observe(film);
    } else {
      assignFilmSrc(film, 'auto');
    }
  }

  function renderHome() {
    var p = content.pages.home;

    /* nav */
    setText('[data-cms="nav-logo"]', p.nav.logoText);
    var navLinks = items(p.nav.links).map(function (l) {
      return '<a href="' + esc(l.href) + '">' + esc(l.label) + '</a>';
    }).join('');
    setHtml('[data-cms="nav-links"]', navLinks);
    var navCta = $('[data-cms="nav-cta"]');
    if (navCta) { navCta.textContent = p.nav.cta.label; navCta.href = p.nav.cta.href; }
    var mob = $('[data-cms="mobile-links"]');
    if (mob) {
      mob.innerHTML = items(p.nav.links).map(function (l) {
        return '<a href="' + esc(l.href) + '" class="mobile-menu-link">' + esc(l.label) + '</a>';
      }).join('') +
      '<a href="' + esc(p.nav.cta.href) + '" class="mobile-menu-link ex-btn ex-btn-solid">' + esc(p.nav.cta.label) + '</a>';
    }

    /* hero */
    setText('[data-cms="hero-title"]', p.hero.title);
    var tag = $('[data-cms="hero-tagline"]');
    if (tag) {
      tag.innerHTML = esc(p.hero.taglinePrefix) + '<em>' + esc(p.hero.taglineHighlight) + '</em>';
    }
    setText('[data-cms="hero-subtitle"]', p.hero.subtitle);
    setText('[data-cms="hero-scroll-hint"]', p.hero.scrollHint);
    var addr = (content.site.contact && content.site.contact.address) || '';
    var place = $('[data-cms="hero-place"]');
    if (place) {
      var kicker = (p.hero.kicker || '').trim();
      if (!kicker) kicker = /abuja/i.test(addr) ? 'Abuja' : (addr.split(',')[0] || '');
      place.textContent = kicker;
      place.hidden = !kicker;
    }
    var credit = $('[data-cms="hero-credit"]');
    if (credit) {
      var creditText = String((p.hero && p.hero.credit) || '').trim();
      credit.textContent = creditText;
      credit.hidden = !creditText;
    }
    var cs = $('[data-cms="hero-cta-secondary"]');
    if (cs) { cs.href = p.hero.ctaSecondary.href; cs.textContent = p.hero.ctaSecondary.label; }
    var cp = $('[data-cms="hero-cta-primary"]');
    if (cp) { cp.href = p.hero.ctaPrimary.href; cp.textContent = p.hero.ctaPrimary.label; }

    /* about */
    var about = $('#about');
    if (about) about.style.display = p.about.visible === false ? 'none' : '';
    setText('[data-cms="about-heading"]', p.about.heading);
    setText('[data-cms="about-p1"]', p.about.paragraphs[0] || '');
    setText('[data-cms="about-p2"]', p.about.paragraphs[1] || '');
    var aboutCta = $('[data-cms="about-cta"]');
    if (aboutCta) {
      aboutCta.href = p.about.cta.href;
      aboutCta.textContent = p.about.cta.label;
    }
    fillAboutMedia(p.about);

    /* portfolio */
    var pf = $('#portfolio'); if (pf) pf.style.display = p.portfolio.visible === false ? 'none' : '';
    setText('[data-cms="portfolio-heading"]', p.portfolio.heading);
    setText('[data-cms="portfolio-subtitle"]', p.portfolio.subtitle);
    var works = items(p.portfolio.items);
    homeWorks = works;
    fillHeroStage(heroFromCms(p, works));
    var exhibit = $('#exhibition');
    if (exhibit) {
      exhibit.innerHTML = works.map(function (it, i) {
        var title = workTitle(it);
        var n = i + 1 < 10 ? '0' + (i + 1) : String(i + 1);
        var label = title || ('View project ' + n);
        var playable = it.mediaType === 'video' && it.src && !saveDataOn();
        var film = '';
        if (playable) {
          var src = /res\.cloudinary/.test(it.src) ? cldVideo(it.src, filmWidth(), { silent: true }) : it.src;
          var poster = cldPoster(it.src, 960);
          film = '<video class="ex-room-film" muted playsinline loop preload="none" data-src="' + esc(src) + '"' +
            (poster ? ' poster="' + esc(poster) + '"' : '') +
            ' aria-hidden="true"></video>';
        }
        return '<article class="' + roomClass(it, i) + '">' + draftBadge(it) +
          '<button type="button" class="ex-room-media lazy-media" data-work-index="' + i + '" aria-label="' + esc(label) + '">' +
          '<span class="ex-room-stage">' +
          stillImg(it, { width: 960, sizes: '(min-width: 900px) 1080px, 100vw', widths: [640, 960, 1280] }) +
          film +
          '</span></button></article>';
      }).join('');
      observeLazy(exhibit);
      if (!heroHold) {
        exhibitArmed = true;
        initExhibitLife();
      }
    }
    var viewAll = $('#portfolioViewAll');
    if (viewAll) {
      viewAll.href = p.portfolio.viewAll.href;
      var viewLab = viewAll.querySelector('span');
      if (viewLab) viewLab.textContent = p.portfolio.viewAll.label;
    }

    /* services */
    var svc = $('#services'); if (svc) svc.style.display = p.services.visible === false ? 'none' : '';
    setText('[data-cms="services-heading"]', p.services.heading);
    setText('[data-cms="services-subtitle"]', p.services.subtitle);
    setHtml('#servicesGrid', items(p.services.items).map(function (s) {
      return '<article class="ex-service ex-reveal">' + draftBadge(s) +
        '<div class="ex-service-icon"><i class="' + esc(s.icon) + '"></i></div>' +
        '<h3>' + esc(s.title) + '</h3>' +
        '<p>' + esc(s.description) + '</p></article>';
    }).join(''));

    /* process */
    var pr = $('#process'); if (pr) pr.style.display = p.process.visible === false ? 'none' : '';
    setText('[data-cms="process-heading"]', p.process.heading);
    setText('[data-cms="process-subtitle"]', p.process.subtitle);
    setHtml('#processGrid', items(p.process.steps).map(function (s, i) {
      return '<article class="ex-step ex-reveal">' + draftBadge(s) +
        '<span class="ex-step-num">' + (i + 1 < 10 ? '0' + (i + 1) : String(i + 1)) + '</span>' +
        '<h3>' + esc(s.title) + '</h3>' +
        '<p>' + esc(s.description) + '</p></article>';
    }).join(''));

    /* testimonials */
    var ts = $('#testimonials'); if (ts) ts.style.display = p.testimonials.visible === false ? 'none' : '';
    setText('[data-cms="testimonials-heading"]', p.testimonials.heading);
    setText('[data-cms="testimonials-subtitle"]', p.testimonials.subtitle);
    paintVoices();

    /* contact */
    var ct = $('#contact'); if (ct) ct.style.display = p.contactSection.visible === false ? 'none' : '';
    setText('[data-cms="contact-heading"]', p.contactSection.heading);
    setText('[data-cms="contact-subtitle"]', p.contactSection.subtitle);
    setText('[data-cms="contact-address-label"]', p.contactSection.addressLabel);
    setText('[data-cms="contact-address"]', content.site.contact.address);
    setText('[data-cms="contact-phone-label"]', p.contactSection.phoneLabel);
    var wa = $('#contactWhatsapp');
    if (wa) {
      wa.href = whatsappUrl();
      wa.textContent = content.site.contact.phone || '';
    } else {
      setText('[data-cms="contact-phone"]', content.site.contact.phone);
    }
    var map = $('#contactMap');
    if (map && content.site.contact.mapEmbedSrc && map.src !== content.site.contact.mapEmbedSrc) {
      map.src = content.site.contact.mapEmbedSrc;
    }
    var form = $('#contact-form');
    if (form && content.site.integrations) {
      form.action = content.site.integrations.formspreeContact;
      var sel = form.querySelector('select[name="project"]');
      if (sel) {
        sel.innerHTML = '<option value="">Select project type</option>' + items(p.contactSection.form.projectTypes).map(function (o) {
          return '<option value="' + esc(o.value) + '">' + esc(o.label) + '</option>';
        }).join('');
      }
      var btn = form.querySelector('button[type="submit"]');
      if (btn) btn.textContent = p.contactSection.form.submitLabel;
    }

    /* footer */
    renderFooterCommon();
    setHtml('#footer-quicklinks', items(p.footer.quickLinks).map(function (l) {
      return '<li><a href="' + esc(l.href) + '">' + esc(l.label) + '</a></li>';
    }).join(''));
    setText('[data-cms="newsletter-title"]', p.footer.newsletter.title);
    setText('[data-cms="newsletter-text"]', p.footer.newsletter.text);
    var nf = $('#newsletter-form');
    if (nf) {
      if (content.site.integrations) nf.action = content.site.integrations.formspreeNewsletter;
      var inp = nf.querySelector('input[name="email"]');
      if (inp) inp.placeholder = p.footer.newsletter.placeholder;
      nf.style.display = p.footer.newsletter.visible === false ? 'none' : '';
    }

    initGsapFades();
    initHeroHandoff();
  }

  function voicePortrait(t, size) {
    var name = String(t.name || '').trim();
    var initial = esc((name.charAt(0) || '?').toUpperCase());
    if (!t.avatar) return '<span class="ex-quote-initial" aria-hidden="true">' + initial + '</span>';
    return '<img loading="lazy" decoding="async" width="' + size + '" height="' + size + '" src="' +
      esc(cldImage(t.avatar, size * 2)) + '" alt="">';
  }

  function renderVoices(slides) {
    var wrap = $('#testimonialWrapper');
    var rail = $('#voicesRail');
    var meter = $('#voicesMeter');
    if (!wrap) return;

    if (!slides.length) {
      wrap.innerHTML = '';
      if (rail) rail.innerHTML = '';
      if (meter) meter.hidden = true;
      return;
    }

    var splitAt = slides.length > 6 ? 3 : slides.length;
    var html = '';
    slides.forEach(function (t, i) {
      if (i === splitAt) {
        html += '<div class="ex-voices-more"><p class="ex-voices-more-kicker">More voices</p>';
      }
      var compact = i >= splitAt;
      html += '<article class="ex-quote' + (i === 0 ? ' is-lead' : '') + (compact ? ' is-compact' : '') +
        (i === 0 ? ' is-current is-in' : '') + '" data-voice="' + i + '" id="voice-' + i + '">' + draftBadge(t) +
        '<div class="ex-quote-top"><span class="ex-quote-num">' + pad2(i + 1) + '</span></div>' +
        '<blockquote>' + esc(voiceQuote(t)) + '</blockquote>' +
        '<footer class="ex-quote-who">' + voicePortrait(t, compact ? 40 : 56) +
        '<div><h4>' + esc(t.name) + '</h4>' +
        (voiceLine(t) ? '<p>' + esc(voiceLine(t)) + '</p>' : '') +
        '</div></footer></article>';
    });
    if (slides.length > splitAt) html += '</div>';
    wrap.innerHTML = html;

    if (rail) {
      rail.hidden = slides.length < 2;
      rail.innerHTML = '<div class="ex-voices-rail-track">' + slides.map(function (t, i) {
        return '<button type="button" class="ex-voice-chip' + (i === 0 ? ' is-on' : '') + '" data-voice="' + i + '"' +
          (i === 0 ? ' aria-current="true"' : '') + '>' +
          voicePortrait(t, 40) +
          '<span><strong>' + esc(clipLine(t.name, 36)) + '</strong>' +
          (voiceLine(t) ? '<em>' + esc(clipLine(voiceLine(t), 32)) + '</em>' : '') +
          '</span></button>';
      }).join('') + '</div>';
    }

    if (meter) {
      meter.hidden = slides.length < 2;
      setText('#voicesIndex', pad2(1));
      setText('#voicesTotal', pad2(slides.length));
      var bar = $('#voicesProgress');
      if (bar) bar.style.width = (100 / slides.length) + '%';
    }
  }

  function initVoices() {
    var section = $('#testimonials');
    var list = $('#testimonialWrapper');
    var rail = $('#voicesRail');
    if (!section || !list || PAGE !== 'home') return;

    if (section.__voicesCleanup) {
      section.__voicesCleanup();
      section.__voicesCleanup = null;
    }

    var quotes = $$('.ex-quote', list);
    var chips = rail ? $$('.ex-voice-chip', rail) : [];
    if (!quotes.length) return;

    var reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    var current = 0;
    var clicking = false;

    function setActive(i, fromUser) {
      if (i < 0 || i >= quotes.length) return;
      current = i;
      quotes.forEach(function (q, n) {
        q.classList.toggle('is-current', n === i);
      });
      chips.forEach(function (chip, n) {
        var on = n === i;
        chip.classList.toggle('is-on', on);
        if (on) chip.setAttribute('aria-current', 'true');
        else chip.removeAttribute('aria-current');
      });
      setText('#voicesIndex', pad2(i + 1));
      var bar = $('#voicesProgress');
      if (bar) bar.style.width = ((i + 1) / quotes.length * 100) + '%';
      var onChip = chips[i];
      var scroller = rail ? (rail.querySelector('.ex-voices-rail-track') || rail) : null;
      if (onChip && scroller) {
        var box = scroller.getBoundingClientRect();
        var chipBox = onChip.getBoundingClientRect();
        if (scroller.scrollHeight > scroller.clientHeight + 8) {
          scroller.scrollTop += ((chipBox.top + chipBox.bottom) / 2) - ((box.top + box.bottom) / 2);
        } else if (scroller.scrollWidth > scroller.clientWidth + 8) {
          var left = onChip.offsetLeft - (scroller.clientWidth / 2) + (onChip.offsetWidth / 2);
          if (scroller.scrollTo) scroller.scrollTo({ left: Math.max(0, left), behavior: reduce ? 'auto' : 'smooth' });
          else scroller.scrollLeft = Math.max(0, left);
        }
      }
      if (fromUser) {
        clicking = true;
        quotes[i].scrollIntoView({
          behavior: reduce ? 'auto' : 'smooth',
          block: 'start'
        });
        setTimeout(function () { clicking = false; }, 640);
      }
    }

    function onRailClick(e) {
      var chip = e.target.closest('[data-voice]');
      if (!chip || !rail.contains(chip)) return;
      e.preventDefault();
      setActive(Number(chip.getAttribute('data-voice')), true);
    }

    function onKey(e) {
      if (!section.contains(document.activeElement) && document.activeElement !== section) return;
      var next = current;
      if (e.key === 'ArrowDown' || e.key === 'ArrowRight') next = Math.min(quotes.length - 1, current + 1);
      else if (e.key === 'ArrowUp' || e.key === 'ArrowLeft') next = Math.max(0, current - 1);
      else return;
      e.preventDefault();
      setActive(next, true);
    }

    var io = null;
    if ('IntersectionObserver' in window) {
      io = new IntersectionObserver(function (entries) {
        entries.forEach(function (entry) {
          if (entry.isIntersecting) entry.target.classList.add('is-in');
        });
        if (clicking) return;
        var best = -1;
        var bestScore = 0;
        quotes.forEach(function (q, n) {
          var r = q.getBoundingClientRect();
          var mid = window.innerHeight * 0.42;
          var dist = Math.abs((r.top + r.bottom) / 2 - mid);
          var visible = Math.min(r.bottom, window.innerHeight) - Math.max(r.top, 0);
          if (visible < 48) return;
          var score = visible - dist * 0.35;
          if (score > bestScore) {
            bestScore = score;
            best = n;
          }
        });
        if (best >= 0 && best !== current) setActive(best, false);
      }, { threshold: [0.12, 0.35, 0.55, 0.75], rootMargin: '-12% 0px -28% 0px' });
      quotes.forEach(function (q) { io.observe(q); });
    } else {
      quotes.forEach(function (q) { q.classList.add('is-in', 'is-current'); });
    }

    if (rail) rail.addEventListener('click', onRailClick);
    document.addEventListener('keydown', onKey);

    setActive(0, false);
    section.__voicesCleanup = function () {
      if (io) io.disconnect();
      if (rail) rail.removeEventListener('click', onRailClick);
      document.removeEventListener('keydown', onKey);
    };
  }

  function paintVoices() {
    renderVoices(allVoices());
    initVoices();
  }

  function loadPublicReviews() {
    return fetch(reviewsApiUrl(), {
      method: 'GET',
      cache: 'no-store',
      credentials: 'omit',
      headers: { Accept: 'application/json' }
    }).then(function (r) {
      if (!r.ok) throw new Error('http');
      return r.json();
    }).then(function (json) {
      var remote = Array.isArray(json && json.reviews) ? json.reviews : [];
      var seen = {};
      var merged = [];
      remote.concat(publicVoices).forEach(function (row) {
        var v = asVoice(row);
        if (!v.id || seen[v.id]) return;
        seen[v.id] = true;
        merged.push(v);
      });
      merged.sort(function (a, b) { return (b.order || 0) - (a.order || 0); });
      rememberPublicReviews(merged.slice(0, 40));
      if (!content) return;
      if (PAGE === 'home') paintVoices();
      if (PAGE === 'reviews') renderReviews();
    }).catch(function () {});
  }

  function compressReviewPhoto(file, done) {
    if (!file || !file.type || file.type.indexOf('image/') !== 0) {
      done('');
      return;
    }
    var img = new Image();
    var url = URL.createObjectURL(file);
    img.onload = function () {
      var max = 640;
      var w = img.width;
      var h = img.height;
      if (w > max || h > max) {
        var scale = Math.min(max / w, max / h);
        w = Math.round(w * scale);
        h = Math.round(h * scale);
      }
      var canvas = document.createElement('canvas');
      canvas.width = w;
      canvas.height = h;
      var ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0, w, h);
      URL.revokeObjectURL(url);
      done(canvas.toDataURL('image/jpeg', 0.82));
    };
    img.onerror = function () {
      URL.revokeObjectURL(url);
      done('');
    };
    img.src = url;
  }

  function initReviewComposer() {
    var overlay = $('#reviewOverlay');
    var openBtn = $('#reviewOpen');
    var closeBtn = $('#reviewClose');
    var form = $('#public-review-form');
    if (!overlay || !form || PAGE !== 'home' || form.__bound) return;
    form.__bound = true;
    form.__rating = 5;
    form.__avatar = '';

    var statusEl = $('#reviewStatus');
    var saveBtn = $('#reviewSave');
    var preview = $('#reviewPhotoPreview');
    var stars = $$('#reviewStars button');

    function setStatus(msg, kind) {
      if (!statusEl) return;
      statusEl.textContent = msg || '';
      statusEl.style.color = kind === 'err' ? '#b42318' : (kind === 'ok' ? '#177245' : '');
    }

    function paintStars(n) {
      form.__rating = n;
      stars.forEach(function (btn) {
        btn.classList.toggle('is-on', Number(btn.getAttribute('data-rating')) <= n);
      });
    }
    paintStars(5);

    function open() {
      overlay.hidden = false;
      document.body.classList.add('is-locked');
      setStatus('');
      var name = $('#reviewName');
      if (name) name.focus();
    }
    function close() {
      overlay.hidden = true;
      document.body.classList.remove('is-locked');
      if (openBtn) openBtn.focus();
    }

    if (openBtn) openBtn.addEventListener('click', open);
    if (closeBtn) closeBtn.addEventListener('click', close);
    overlay.addEventListener('click', function (e) {
      if (e.target === overlay) close();
    });
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && !overlay.hidden) close();
    });
    stars.forEach(function (btn) {
      btn.addEventListener('click', function () {
        paintStars(Number(btn.getAttribute('data-rating')) || 5);
      });
    });

    var photo = $('#reviewPhoto');
    if (photo) {
      photo.addEventListener('change', function () {
        var file = photo.files && photo.files[0];
        if (!file) return;
        compressReviewPhoto(file, function (data) {
          form.__avatar = data;
          if (preview) {
            preview.src = data;
            preview.hidden = !data;
          }
        });
      });
    }

    form.addEventListener('submit', function (e) {
      e.preventDefault();
      if ($('#reviewWebsite') && $('#reviewWebsite').value) return;
      var payload = {
        name: ($('#reviewName') || {}).value || '',
        location: ($('#reviewLocation') || {}).value || '',
        company: ($('#reviewCompany') || {}).value || '',
        quote: ($('#reviewQuote') || {}).value || '',
        rating: form.__rating || 5,
        avatar: form.__avatar || ''
      };
      payload.name = payload.name.replace(/\s+/g, ' ').trim();
      payload.location = payload.location.replace(/\s+/g, ' ').trim();
      payload.company = payload.company.replace(/\s+/g, ' ').trim();
      payload.quote = payload.quote.replace(/\s+/g, ' ').trim();
      if (payload.name.length < 2) { setStatus('Please add your name.', 'err'); return; }
      if (payload.location.length < 2) { setStatus('Please add your location or role.', 'err'); return; }
      if (payload.quote.length < 24) { setStatus('Please write a little more about your experience.', 'err'); return; }
      if (saveBtn) { saveBtn.disabled = true; saveBtn.textContent = 'Saving…'; }
      setStatus('Saving your review…');

      function showReview(review) {
        rememberPublicReviews([asVoice(review)].concat(publicVoices.filter(function (row) {
          return row.id !== review.id;
        })));
        paintVoices();
        close();
        form.reset();
        form.__avatar = '';
        paintStars(5);
        if (preview) { preview.removeAttribute('src'); preview.hidden = true; }
        var first = $('#voice-0');
        if (first && first.scrollIntoView) first.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }

      fetch(reviewsApiUrl(), {
        method: 'POST',
        cache: 'no-store',
        credentials: 'omit',
        headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      }).then(function (r) {
        return r.json().then(function (json) { return { ok: r.ok, json: json }; });
      }).then(function (res) {
        if (res.ok && res.json && res.json.review) {
          showReview(res.json.review);
          return;
        }
        throw new Error((res.json && res.json.error) || 'save_failed');
      }).catch(function () {
        showReview({
          id: 'pr_local_' + Date.now().toString(36),
          name: payload.name,
          location: payload.location,
          company: payload.company,
          avatar: payload.avatar,
          quote: payload.quote,
          rating: payload.rating,
          order: Date.now(),
          status: 'published',
          source: 'public'
        });
      }).finally(function () {
        if (saveBtn) { saveBtn.disabled = false; saveBtn.textContent = 'Save review'; }
      });
    });

    if (location.hash === '#review') open();
  }

  function initSwiper() {
    if (typeof Swiper === 'undefined') return;
    if (swiperInstance) { try { swiperInstance.destroy(true, true); } catch (e) {} }
    swiperInstance = new Swiper('.testimonial-slider', {
      loop: true,
      autoplay: { delay: 5000, disableOnInteraction: false },
      pagination: { el: '.swiper-pagination', clickable: true },
      navigation: { nextEl: '.swiper-button-next', prevEl: '.swiper-button-prev' },
      breakpoints: {
        640: { slidesPerView: 1, spaceBetween: 20 },
        768: { slidesPerView: 2, spaceBetween: 30 },
        1024: { slidesPerView: 2, spaceBetween: 40 }
      }
    });
  }

  function bindVideoModal(root) {
    if (!root || root.__videoBound) return;
    root.__videoBound = true;
    root.addEventListener('click', function (e) {
      var room = e.target.closest('[data-work-index]');
      if (room && root.contains(room)) {
        e.preventDefault();
        openSheet(homeWorks[Number(room.getAttribute('data-work-index'))]);
        return;
      }
      var clip = e.target.closest('[data-video-src]');
      if (!clip || !root.contains(clip)) return;
      e.preventDefault();
      openSheet({
        mediaType: 'video',
        src: clip.getAttribute('data-video-src'),
        title: '',
        subtitle: ''
      });
    });
  }

  function openSheet(it) {
    var sheet = $('#projectSheet');
    var media = $('#sheetMedia');
    var title = $('#sheetTitle');
    var sub = $('#sheetSub');
    var play = $('#sheetPlay');
    if (!sheet || !media || !it) return;
    sheetLastFocus = document.activeElement;
    var label = workTitle(it);
    if (title) {
      title.textContent = label;
      title.hidden = !label;
    }
    if (sub) {
      sub.textContent = it.subtitle || '';
      sub.hidden = !it.subtitle;
    }
    var hasCopy = !!(label || it.subtitle);
    sheet.classList.toggle('is-media-only', !hasCopy);
    if (label) {
      sheet.setAttribute('aria-labelledby', 'sheetTitle');
      sheet.removeAttribute('aria-label');
    } else {
      sheet.setAttribute('aria-label', 'Project');
      sheet.removeAttribute('aria-labelledby');
    }
    var poster = stillImg(it, { eager: true, width: window.innerWidth < 760 ? 800 : 1200, sizes: '90vw', widths: [640, 960, 1280] });
    $$('#exhibition video.ex-room-film').forEach(function (film) { if (!film.paused) film.pause(); });
    if (it.mediaType === 'video' && it.src) {
      var w = window.innerWidth < 760 ? 720 : 960;
      var src = /res\.cloudinary/.test(it.src) ? cldVideo(it.src, w) : it.src;
      media.innerHTML = '<video controls playsinline autoplay muted loop poster="' + esc(workPoster(it, 1200) || '') + '" src="' + esc(src) + '"></video>';
      if (play) play.hidden = true;
    } else {
      media.innerHTML = poster || '';
      if (play) play.hidden = true;
    }
    sheet.classList.add('active');
    sheet.setAttribute('aria-hidden', 'false');
    document.body.classList.add('is-sheet-open');
    var closeBtn = $('#sheetClose');
    if (closeBtn) closeBtn.focus();
  }

  function closeSheet() {
    var sheet = $('#projectSheet');
    var media = $('#sheetMedia');
    if (!sheet) return;
    sheet.classList.remove('active');
    sheet.setAttribute('aria-hidden', 'true');
    document.body.classList.remove('is-sheet-open');
    if (media) {
      var film = media.querySelector('video');
      if (film) { film.pause(); film.removeAttribute('src'); film.load(); }
      media.innerHTML = '';
    }
    if (sheetLastFocus && typeof sheetLastFocus.focus === 'function') {
      try { sheetLastFocus.focus(); } catch (e) {}
    }
    sheetLastFocus = null;
  }

  /* ------------------------------------------------------------------ */
  /* SHOWCASE pages (project.html / project2.html)                       */
  /* ------------------------------------------------------------------ */

  function renderShowcase() {
    var p = content.pages[PAGE]; /* showcase | showcase2 */

    setHtml('[data-cms="show-hero-title"]', escBr(p.hero.title));
    setText('[data-cms="show-hero-subtitle"]', p.hero.subtitle);
    setText('[data-cms="show-cta-primary"]', p.hero.ctaPrimary);
    setText('[data-cms="show-cta-secondary"]', p.hero.ctaSecondary);
    setText('[data-cms="show-grid-heading"]', p.gridHeading);
    setText('[data-cms="philosophy-heading"]', p.philosophy.heading);
    setText('[data-cms="philosophy-text"]', p.philosophy.text);
    var phil = $('[data-cms="philosophy-section"]');
    if (phil) phil.style.display = p.philosophy.visible === false ? 'none' : '';

    var audio = $('#cosmicAudio');
    var musicBtn = $('#toggleMusic');
    if (audio) {
      var src = audio.querySelector('source');
      if (src && p.audio.src && src.getAttribute('src') !== p.audio.src) src.setAttribute('src', p.audio.src);
    }
    if (musicBtn) musicBtn.style.display = (p.audio.enabled === false) ? 'none' : '';

    var grid = $('#showcaseGrid');
    if (grid) {
      grid.innerHTML = items(p.items).map(function (it) {
        var media = it.mediaType === 'video'
          ? '<video class="eternal-media" muted playsinline loop preload="none" data-lazy="1"' +
            (cldPoster(it.src, 700) ? ' poster="' + esc(cldPoster(it.src, 700)) + '"' : '') + '>' +
            '<source data-src="' + esc(cldVideo(it.src)) + '" type="video/mp4"></video>'
          : '<img data-src="' + esc(cldImage(it.src, 900)) + '" alt="' + esc(it.alt || it.title) + '" loading="lazy" decoding="async" class="eternal-media">';
        var overlay = (it.title || it.subtitle)
          ? '<div class="eternal-overlay">' +
            (it.title ? '<h3 class="text-2xl font-bold mb-2">' + esc(it.title) + '</h3>' : '') +
            (it.subtitle ? '<p class="text-gray-300">' + esc(it.subtitle) + '</p>' : '') + '</div>'
          : '';
        return '<div class="eternal-item lazy-media" data-category="' + esc(it.category) + '"' +
          (it.projectSlug ? ' data-project="' + esc(it.projectSlug) + '"' : '') + '>' +
          draftBadge(it) + media + overlay + '</div>';
      }).join('');
      observeLazy(grid);
      bindProjectModal(grid, p.details);
      initShowcaseItemAnimations();
    }
  }

  function bindProjectModal(root, details) {
    var modal = $('#projectModal');
    if (!modal) return;
    var modalVideo = $('#modalVideo');
    var modalImage = $('#modalImage');

    $$('[data-project]', root).forEach(function (item) {
      item.addEventListener('click', function () {
        var d = (details || {})[item.getAttribute('data-project')];
        if (!d) return;
        setText('#modalTitle', d.title || '');
        setText('#modalDescription', d.description || '');
        setText('#modalScale', d.scale || '');
        setText('#modalDate', d.date || '');
        setText('#modalLocation', d.location || '');
        setText('#modalPhilosophy', d.philosophy || '');
        if (d.video) {
          modalVideo.src = cldVideo(d.video);
          modalVideo.style.display = 'block';
          if (modalImage) modalImage.style.display = 'none';
          var pl = modalVideo.play(); if (pl && pl.catch) pl.catch(function () {});
        } else if (d.image) {
          if (modalImage) { modalImage.src = cldImage(d.image, 1200); modalImage.style.display = 'block'; }
          modalVideo.style.display = 'none';
        }
        modal.classList.add('active');
        document.body.style.overflow = 'hidden';
      });
    });

    var close = function () {
      modal.classList.remove('active');
      document.body.style.overflow = '';
      if (modalVideo) { modalVideo.pause(); modalVideo.removeAttribute('src'); modalVideo.load(); }
    };
    var closeBtn = $('#modalClose');
    if (closeBtn && !closeBtn.__bound) { closeBtn.__bound = true; closeBtn.addEventListener('click', close); }
    if (!modal.__bound) {
      modal.__bound = true;
      modal.addEventListener('click', function (e) { if (e.target === modal) close(); });
      document.addEventListener('keydown', function (e) { if (e.key === 'Escape') close(); });
    }
  }

  function initShowcaseItemAnimations() {
    if (typeof gsap === 'undefined' || typeof ScrollTrigger === 'undefined') return;
    gsap.utils.toArray('.eternal-item').forEach(function (item, i) {
      gsap.fromTo(item, { opacity: 0, y: 60 }, {
        opacity: 1, y: 0, duration: 0.8, delay: (i % 6) * 0.06,
        scrollTrigger: { trigger: item, start: 'top 85%', toggleActions: 'play none none none' }
      });
    });
  }

  /* ------------------------------------------------------------------ */
  /* REVIEWS page                                                        */
  /* ------------------------------------------------------------------ */

  function renderReviews() {
    var p = content.pages.reviews;

    var heroTitle = $('[data-cms="rev-hero-title"]');
    if (heroTitle) {
      heroTitle.innerHTML = esc(p.hero.titlePrefix) +
        '<span style="background: var(--eternal-gold); -webkit-background-clip: text; -webkit-text-fill-color: transparent; background-clip: text;">' +
        esc(p.hero.titleHighlight) + '</span>';
    }
    setText('[data-cms="rev-hero-subtitle"]', p.hero.subtitle);

    setHtml('[data-cms="rev-stats"]', items(p.stats).map(function (s, i) {
      return '<div class="stat-card floating-element" style="animation-delay: ' + (0.2 * (i + 1)).toFixed(1) + 's;">' +
        '<div class="stat-number" data-target="' + esc(s.target) + '">0' + esc(s.suffix) + '</div>' +
        '<div class="stat-label">' + esc(s.label) + '</div></div>';
    }).join(''));

    setText('[data-cms="rev-cards-heading"]', p.cardsHeading);
    setText('[data-cms="rev-cards-subtitle"]', p.cardsSubtitle);
    var grid = $('[data-cms="rev-cards"]');
    if (grid) {
      var cards = publicVoices.map(function (r) {
        return {
          id: r.id,
          name: r.name,
          position: r.position,
          company: r.company,
          location: r.location,
          avatar: r.avatar,
          rating: r.rating || 5,
          text: voiceQuote(r),
          status: 'published'
        };
      }).concat(items(p.cards));
      grid.innerHTML = cards.map(function (c) {
        var stars = '';
        for (var i = 0; i < 5; i++) {
          stars += '<span class="star' + (i < (c.rating || 5) ? ' filled' : '') + '"><i class="fas fa-star"></i></span>';
        }
        var meta = [c.position, c.company].filter(Boolean).join(', ');
        return '<div class="review-card floating-element relative"' + (c.projectSlug ? ' data-project-slug="' + esc(c.projectSlug) + '"' : '') + '>' + draftBadge(c) +
          '<div class="review-header">' +
          (c.avatar
            ? '<img src="' + esc(cldImage(c.avatar, 200)) + '" alt="' + esc(c.name) + '" loading="lazy" class="client-avatar">'
            : '<span class="client-avatar" aria-hidden="true"></span>') +
          '<div class="client-info"><h3>' + esc(c.name) + '</h3><p>' + esc(meta || c.location) + '</p></div></div>' +
          '<div class="rating">' + stars + '</div>' +
          '<p class="review-text">' + esc(c.text) + '</p>' +
          (c.showViewProject && c.projectSlug
            ? '<a href="#" class="project-link view-project-btn" data-project="' + esc(c.projectSlug) + '" onclick="return false;">View Project <i class="fas fa-arrow-right ml-2"></i></a>'
            : '') +
          '</div>';
      }).join('');
      bindProjectModal(grid, p.details);
    }

    setText('[data-cms="rev-video-heading"]', p.videoHeading);
    setText('[data-cms="rev-video-subtitle"]', p.videoSubtitle);
    var vids = $('[data-cms="rev-videos"]');
    if (vids) {
      vids.innerHTML = items(p.videoTestimonials).map(function (v) {
        return '<div class="video-testimonial floating-element lazy-media" data-video="' + esc(cldVideo(v.src)) + '">' + draftBadge(v) +
          '<video muted playsinline loop preload="none" data-lazy="1"' +
          (cldPoster(v.src, 700) ? ' poster="' + esc(cldPoster(v.src, 700)) + '"' : '') + '>' +
          '<source data-src="' + esc(cldVideo(v.src)) + '" type="video/mp4"></video>' +
          '<div class="video-overlay"><h3 class="text-lg font-bold">' + esc(v.title) + '</h3>' +
          '<p class="text-gray-300 text-sm">' + esc(v.subtitle) + '</p></div>' +
          '<div class="play-btn"><i class="fas fa-play"></i></div></div>';
      }).join('');
      observeLazy(vids);
      bindVideoTestimonials(vids);
    }

    setText('[data-cms="rev-form-heading"]', p.submitForm.heading);
    setText('[data-cms="rev-form-subtitle"]', p.submitForm.subtitle);
    var form = $('#review-form');
    if (form) form.action = content.site.integrations.formspreeReview;
    var sec = $('#submit-review');
    if (sec) sec.style.display = p.submitForm.visible === false ? 'none' : '';

    /* footer */
    renderFooterCommon();
    setText('[data-cms="footer-address"]', content.site.contact.address);
    setText('[data-cms="footer-phone"]', content.site.contact.phone);
    var ql = $('#footer-quicklinks');
    if (ql) {
      ql.innerHTML = [
        { label: 'About Us', href: 'index.html#about' },
        { label: 'Services', href: 'index.html#services' },
        { label: 'Portfolio', href: 'project.html' },
        { label: 'Contact', href: 'index.html#contact' },
        { label: 'Write Review', href: '#submit-review' }
      ].map(function (l) {
        return '<li><a href="' + esc(l.href) + '" class="hover:text-[var(--secondary)] transition-colors text-sm md:text-base">' + esc(l.label) + '</a></li>';
      }).join('');
    }

    initCounters();
    initReviewAnimations();
  }

  function bindVideoTestimonials(root) {
    var modal = $('#projectModal');
    var modalVideo = $('#modalVideo');
    var modalImage = $('#modalImage');
    if (!modal || !modalVideo) return;
    $$('.video-testimonial', root).forEach(function (v) {
      v.addEventListener('click', function () {
        modalVideo.src = v.getAttribute('data-video');
        modalVideo.style.display = 'block';
        if (modalImage) modalImage.style.display = 'none';
        setText('#modalTitle', (v.querySelector('.video-overlay h3') || {}).textContent || '');
        setText('#modalDescription', (v.querySelector('.video-overlay p') || {}).textContent || '');
        setText('#modalScale', 'Video Testimonial');
        setText('#modalDate', 'Recent Project');
        setText('#modalLocation', 'Abuja, Nigeria');
        setText('#modalPhilosophy', 'This testimonial captures the authentic experience of our client, showcasing the transformative power of our design philosophy in their own words.');
        modal.classList.add('active');
        var pl = modalVideo.play(); if (pl && pl.catch) pl.catch(function () {});
      });
    });
  }

  function initCounters() {
    if (typeof gsap === 'undefined' || typeof ScrollTrigger === 'undefined') return;
    $$('.stat-number').forEach(function (counter) {
      var target = parseFloat(counter.getAttribute('data-target'));
      var suffix = counter.textContent.replace(/[0-9.]/g, '');
      ScrollTrigger.create({
        trigger: counter,
        start: 'top 85%',
        once: true,
        onEnter: function () {
          var start = 0;
          var step = target / 60;
          var tick = function () {
            start += step;
            if (start < target) {
              counter.textContent = (target % 1 !== 0 ? start.toFixed(1) : Math.ceil(start)) + suffix;
              requestAnimationFrame(tick);
            } else {
              counter.textContent = (target % 1 !== 0 ? target.toFixed(1) : target) + suffix;
            }
          };
          tick();
        }
      });
    });
  }

  function initReviewAnimations() {
    if (typeof gsap === 'undefined' || typeof ScrollTrigger === 'undefined') return;
    gsap.utils.toArray('.review-card, .video-testimonial, .stat-card').forEach(function (item, i) {
      gsap.fromTo(item, { opacity: 0, y: 50 }, {
        opacity: 1, y: 0, duration: 0.8, delay: (i % 4) * 0.1,
        scrollTrigger: { trigger: item, start: 'top 85%', toggleActions: 'play none none none' }
      });
    });
  }

  /* ------------------------------------------------------------------ */
  /* Shared behaviours                                                   */
  /* ------------------------------------------------------------------ */

  function initHeroHandoff() {
    if (PAGE !== 'home') return;
    var hero = $('#hero');
    var about = $('#about');
    var stage = $('#heroStage');
    var copy = hero ? hero.querySelector('.ex-hero-copy') : null;
    var reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    if (reduce) {
      if (about) about.classList.add('is-in');
      return;
    }

    if (typeof gsap === 'undefined' || typeof ScrollTrigger === 'undefined') {
      if (about && 'IntersectionObserver' in window && !about.__inIo) {
        about.__inIo = true;
        var io = new IntersectionObserver(function (entries) {
          entries.forEach(function (entry) {
            if (entry.isIntersecting) entry.target.classList.add('is-in');
          });
        }, { threshold: 0.08 });
        io.observe(about);
      }
      return;
    }

    gsap.registerPlugin(ScrollTrigger);
    if (about && about.__handoff) {
      if (ScrollTrigger.refresh) ScrollTrigger.refresh();
      return;
    }
    if (about) about.__handoff = true;
    document.body.classList.add('has-hero-handoff');

    var media = $('#aboutMedia');
    if (copy) {
      gsap.to(copy, {
        y: -28,
        opacity: 0.2,
        ease: 'none',
        scrollTrigger: {
          trigger: hero,
          start: 'top top',
          end: 'bottom top',
          scrub: 0.45
        }
      });
    }
    /* Hero scroll cue fade is owned by .ex-scroll.is-away */
    if (stage) {
      gsap.fromTo(stage, { scale: 1 }, {
        scale: 1.05,
        ease: 'none',
        transformOrigin: 'center center',
        scrollTrigger: {
          trigger: hero,
          start: 'top top',
          end: 'bottom top',
          scrub: 0.4
        }
      });
    }
    if (media && media.childElementCount) {
      gsap.fromTo(media, { y: 28 }, {
        y: 0,
        ease: 'none',
        scrollTrigger: {
          trigger: media,
          start: 'top 96%',
          end: 'top 62%',
          scrub: 0.55
        }
      });
    }
  }

  function initExhibitLife() {
    var exhibit = $('#exhibition');
    if (!exhibit) return;
    if (exhibit.__lifeIo) { exhibit.__lifeIo.disconnect(); exhibit.__lifeIo = null; }
    if (exhibit.__filmIo) { exhibit.__filmIo.disconnect(); exhibit.__filmIo = null; }
    if (exhibit.__warmIo) { exhibit.__warmIo.disconnect(); exhibit.__warmIo = null; }
    var rooms = $$('.ex-room', exhibit);
    var films = $$('video.ex-room-film', exhibit);
    var reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    var save = saveDataOn();

    films.forEach(function (film) {
      armVideo(film);
      film.addEventListener('playing', function () {
        var room = film.closest('.ex-room');
        if (room) room.classList.add('is-playing');
      });
      film.addEventListener('pause', function () {
        var room = film.closest('.ex-room');
        if (room && film.paused) room.classList.remove('is-playing');
      });
    });

    if ('IntersectionObserver' in window) {
      exhibit.__lifeIo = new IntersectionObserver(function (entries) {
        entries.forEach(function (entry) {
          entry.target.classList.toggle('is-live', entry.isIntersecting);
        });
      }, { threshold: 0.12, rootMargin: '0px 0px -6% 0px' });
      rooms.forEach(function (room) { exhibit.__lifeIo.observe(room); });

      if (!reduce && !save && films.length) {
        exhibit.__warmIo = new IntersectionObserver(function (entries) {
          entries.forEach(function (entry) {
            if (entry.isIntersecting) assignFilmSrc(entry.target, 'auto');
          });
        }, { rootMargin: '900px 0px', threshold: 0.01 });
        films.forEach(function (film) { exhibit.__warmIo.observe(film); });

        exhibit.__filmIo = new IntersectionObserver(function (entries) {
          entries.forEach(function (entry) {
            entry.target.__on = entry.isIntersecting;
            entry.target.__ratio = entry.intersectionRatio;
          });
          var visible = films.filter(function (film) { return film.__on; })
            .sort(function (a, b) { return (b.__ratio || 0) - (a.__ratio || 0); });
          var next = visible[0] || null;
          films.forEach(function (film, i) {
            if (film === next) {
              playWhenReady(film);
              if (films[i + 1]) assignFilmSrc(films[i + 1], 'auto');
              if (films[i + 2]) assignFilmSrc(films[i + 2], 'metadata');
            } else if (!film.paused) {
              film.pause();
            }
          });
        }, { threshold: [0.01, 0.2, 0.45, 0.7], rootMargin: '120px 0px' });
        films.forEach(function (film) { exhibit.__filmIo.observe(film); });
        films.slice(0, 2).forEach(function (film) { assignFilmSrc(film, 'auto'); });
      }
    } else {
      rooms.forEach(function (room) { room.classList.add('is-live'); });
      films.slice(0, 2).forEach(function (film) { playWhenReady(film); });
    }
  }

  function initGsapFades() {
    var nodes = $$('.fade-in, .ex-reveal');
    var reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (typeof gsap === 'undefined' || typeof ScrollTrigger === 'undefined' || reduce) {
      nodes.forEach(function (el) { el.classList.add('is-visible'); el.style.opacity = 1; el.style.transform = 'none'; });
      return;
    }
    gsap.registerPlugin(ScrollTrigger);
    nodes.forEach(function (el) {
      if (el.__exReveal) return;
      el.__exReveal = true;
      gsap.fromTo(el, { opacity: 0, y: 28 }, {
        opacity: 1, y: 0, duration: 0.9, ease: 'power2.out',
        scrollTrigger: { trigger: el, start: 'top 88%', toggleActions: 'play none none none' }
      });
    });
    if (ScrollTrigger.refresh) {
      setTimeout(function () { ScrollTrigger.refresh(); }, 60);
    }
  }

  function initHomeChrome() {
    var navbar = $('#navbar');
    if (navbar && !navbar.__bound) {
      navbar.__bound = true;
      var layoutHeroCue = function () {
        var cue = $('.ex-scroll');
        var heroEl = $('#hero');
        var actions = heroEl ? heroEl.querySelector('.ex-hero-actions') : null;
        if (!cue) return;
        var away = window.scrollY > 36;
        cue.classList.remove('is-shift');
        if (heroEl) {
          var box = heroEl.getBoundingClientRect();
          var span = Math.max(120, box.height * 0.38);
          var passed = Math.min(100, Math.max(0, (-box.top / span) * 100));
          cue.style.setProperty('--ex-scroll-p', String(Math.round(passed)));
          if (box.bottom < 140) away = true;
        }
        if (!away && actions) {
          var a = actions.getBoundingClientRect();
          var c = cue.getBoundingClientRect();
          var hits = !(c.right < a.left - 10 || c.left > a.right + 10 || c.bottom < a.top - 10 || c.top > a.bottom + 10);
          if (hits) {
            if (window.innerWidth >= 760) cue.classList.add('is-shift');
            else away = true;
          }
        }
        cue.classList.toggle('is-away', away);
      };
      var onScroll = function () {
        navbar.classList.toggle('is-scrolled', window.scrollY > 40);
        layoutHeroCue();
      };
      onScroll();
      window.addEventListener('scroll', onScroll, { passive: true });
      window.addEventListener('resize', layoutHeroCue);
      setTimeout(layoutHeroCue, 1200);
    }
    var scrollCue = $('#heroScroll') || $('.ex-scroll');
    if (scrollCue && !scrollCue.__bound) {
      scrollCue.__bound = true;
      scrollCue.addEventListener('click', function (e) {
        var about = $('#about');
        if (!about) return;
        e.preventDefault();
        var reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
        about.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'start' });
      });
    }
    if (!document.__exUnlock) {
      document.__exUnlock = true;
      ['pointerdown', 'touchstart', 'keydown', 'scroll'].forEach(function (ev) {
        window.addEventListener(ev, unlockHomeFilms, { once: true, passive: true });
      });
    }
    var menuBtn = $('#menu-btn');
    var closeBtn = $('#close-menu-btn');
    var mobileMenu = $('#mobile-menu');
    function setMenu(open) {
      if (!mobileMenu) return;
      mobileMenu.classList.toggle('open', open);
      document.body.classList.toggle('is-locked', open);
      if (menuBtn) menuBtn.setAttribute('aria-expanded', open ? 'true' : 'false');
      if (open && closeBtn) closeBtn.focus();
    }
    if (menuBtn && mobileMenu && !menuBtn.__bound) {
      menuBtn.__bound = true;
      menuBtn.addEventListener('click', function () { setMenu(true); });
      if (closeBtn) closeBtn.addEventListener('click', function () { setMenu(false); });
      mobileMenu.addEventListener('click', function (e) {
        if (e.target.closest('.mobile-menu-link')) setMenu(false);
      });
      document.addEventListener('keydown', function (e) {
        if (e.key === 'Escape' && mobileMenu.classList.contains('open')) setMenu(false);
      });
    }
    var sheet = $('#projectSheet');
    var sheetClose = $('#sheetClose');
    if (sheet && !sheet.__bound) {
      sheet.__bound = true;
      if (sheetClose) sheetClose.addEventListener('click', closeSheet);
      sheet.addEventListener('click', function (e) { if (e.target === sheet) closeSheet(); });
      document.addEventListener('keydown', function (e) {
        if (!sheet.classList.contains('active')) return;
        if (e.key === 'Escape') {
          closeSheet();
          return;
        }
        if (e.key !== 'Tab') return;
        var focusable = Array.prototype.filter.call(
          sheet.querySelectorAll('button:not([hidden]), video[controls]'),
          function (el) { return !el.disabled && el.offsetParent !== null; }
        );
        if (!focusable.length) return;
        var first = focusable[0];
        var last = focusable[focusable.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      });
    }
    bindVideoModal(document);
    if ('IntersectionObserver' in window) {
      var hero = $('#hero');
      if (hero && !hero.__filmIo) {
        hero.__filmIo = true;
        var filmWatch = new IntersectionObserver(function (entries) {
          entries.forEach(function (entry) {
            var film = entry.target.querySelector('video.ex-hero-film');
            if (!film) return;
            if (entry.isIntersecting) {
              var play = film.play();
              if (play && play.catch) play.catch(function () {});
            } else if (!film.paused) {
              film.pause();
            }
          });
        }, { threshold: 0.15 });
        filmWatch.observe(hero);
      }
    }
  }

  function initShowcaseChrome() {
    /* custom cursor (desktop only) */
    var cursor = $('#cursor');
    var follower = $('#cursorFollower');
    if (cursor && follower && window.matchMedia('(pointer:fine)').matches) {
      document.addEventListener('mousemove', function (e) {
        cursor.style.transform = 'translate(' + (e.clientX - 4) + 'px,' + (e.clientY - 4) + 'px)';
        follower.style.transform = 'translate(' + (e.clientX - 20) + 'px,' + (e.clientY - 20) + 'px)';
      });
    }
    /* audio toggle */
    var audio = $('#cosmicAudio');
    var btn = $('#toggleMusic');
    if (audio && btn) {
      var on = false;
      btn.addEventListener('click', function () {
        if (on) {
          audio.pause();
          btn.innerHTML = '<i class="fas fa-music mr-2"></i>Cosmic Sound';
        } else {
          var src = audio.querySelector('source');
          if (src && !audio.getAttribute('data-loaded')) { audio.setAttribute('data-loaded', '1'); audio.load(); }
          var p = audio.play(); if (p && p.catch) p.catch(function () {});
          btn.innerHTML = '<i class="fas fa-pause mr-2"></i>Pause Sound';
        }
        on = !on;
      });
    }
    initCosmicDecor();
    /* hero buttons */
    window.scrollToProjects = function () {
      var target = $('#projects');
      if (typeof gsap !== 'undefined' && gsap.plugins && gsap.plugins.scrollTo) {
        gsap.to(window, { duration: 2, scrollTo: '#projects', ease: 'power2.inOut' });
      } else if (target) {
        target.scrollIntoView({ behavior: 'smooth' });
      }
    };
    window.startImmersion = function () {
      var pre = $('#quantum-preloader');
      if (pre) {
        pre.style.opacity = '1'; pre.style.visibility = 'visible';
        setTimeout(function () {
          pre.style.opacity = '0'; pre.style.visibility = 'hidden';
          window.scrollToProjects();
        }, 1200);
      } else { window.scrollToProjects(); }
    };
  }

  function initCosmicDecor() {
    var host = $('.infinite-scroll');
    if (host && !host.__particles) {
      host.__particles = true;
      for (var i = 0; i < 30; i++) {
        var pt = document.createElement('div');
        pt.className = 'cosmic-particle';
        pt.style.left = Math.random() * 100 + 'vw';
        pt.style.top = Math.random() * 100 + 'vh';
        pt.style.animationDelay = (Math.random() * 6) + 's';
        var size = (Math.random() * 4 + 2) + 'px';
        pt.style.width = size; pt.style.height = size;
        host.appendChild(pt);
      }
    }
    if (typeof gsap !== 'undefined' && typeof ScrollTrigger !== 'undefined') {
      gsap.registerPlugin(ScrollTrigger);
      gsap.to('.cosmic-bg', {
        yPercent: -50, ease: 'none',
        scrollTrigger: { trigger: '.infinite-scroll', start: 'top bottom', end: 'bottom top', scrub: true }
      });
    }
  }

  function initForms() {
    function ajaxify(form, statusEl, okMsg) {
      if (!form || form.__bound) return;
      form.__bound = true;
      form.addEventListener('submit', function (e) {
        e.preventDefault();
        if (statusEl) { statusEl.textContent = 'Sending\u2026'; statusEl.style.color = ''; }
        fetch(form.action, { method: 'POST', body: new FormData(form), headers: { Accept: 'application/json' } })
          .then(function (res) {
            if (res.ok) {
              if (statusEl) { statusEl.textContent = okMsg; statusEl.style.color = '#16a34a'; }
              form.reset();
            } else {
              if (statusEl) { statusEl.textContent = 'Oops! There was a problem submitting your form.'; statusEl.style.color = '#dc2626'; }
            }
          })
          .catch(function () {
            if (statusEl) { statusEl.textContent = 'Network error. Please try again.'; statusEl.style.color = '#dc2626'; }
          });
      });
    }
    ajaxify($('#contact-form'), $('#form-status'), (content.pages.home.contactSection.form || {}).successMessage || 'Thank you! Your message has been sent.');
    ajaxify($('#newsletter-form'), $('#form-message'), (content.pages.home.footer.newsletter || {}).successMessage || 'Subscribed!');
    ajaxify($('#review-form'), $('#form-status'), 'Thank you! Your review has been submitted.');
  }

  function initTawk() {
    var integ = content.site.integrations;
    if (!integ.tawkToEnabled || !integ.tawkToId || PREVIEW) return;
    var load = function () {
      if (window.__tawkLoaded) return;
      window.__tawkLoaded = true;
      window.Tawk_API = window.Tawk_API || {};
      window.Tawk_LoadStart = new Date();
      var s1 = document.createElement('script');
      s1.async = true;
      s1.src = 'https://embed.tawk.to/' + integ.tawkToId;
      s1.charset = 'UTF-8';
      s1.setAttribute('crossorigin', '*');
      document.head.appendChild(s1);
    };
    /* defer the chat widget: after first interaction or 6s idle */
    ['scroll', 'pointerdown', 'keydown', 'touchstart'].forEach(function (ev) {
      window.addEventListener(ev, load, { once: true, passive: true });
    });
    setTimeout(load, 6000);
  }

  function hidePreloader() {
    if (heroHold) return;
    var pre = $('#preloader') || $('#quantum-preloader');
    if (!pre || preloaderGone) return;
    preloaderGone = true;
    pre.style.opacity = '0';
    pre.style.visibility = 'hidden';
    pre.style.pointerEvents = 'none';
    setTimeout(function () {
      pre.style.display = 'none';
      if (typeof ScrollTrigger !== 'undefined' && ScrollTrigger.refresh) ScrollTrigger.refresh();
    }, 700);
  }

  function releaseHero() {
    heroHold = false;
    hidePreloader();
    var exhibit = $('#exhibition');
    if (!exhibitArmed && exhibit && exhibit.querySelector('.ex-room')) {
      exhibitArmed = true;
      initExhibitLife();
    }
  }

  /* ------------------------------------------------------------------ */
  /* Render dispatcher                                                   */
  /* ------------------------------------------------------------------ */

  function render() {
    if (!content) return;
    try {
      content.site = content.site || {};
      content.site.contact = content.site.contact || {};
      content.pages = content.pages || {};
      applySeo();
      if (PAGE === 'home') { renderHome(); }
      else if (PAGE === 'showcase' || PAGE === 'showcase2') { renderShowcase(); }
      else if (PAGE === 'reviews') { renderReviews(); }
      initForms();
    } catch (err) {
      console.error('[ElitexCMS] render error:', err);
    }
    hidePreloader();
  }

  /* ------------------------------------------------------------------ */
  /* Live preview bridge                                                 */
  /* ------------------------------------------------------------------ */

  function initPreviewBridge() {
    var bar = document.createElement('div');
    bar.className = 'cms-preview-bar';
    bar.innerHTML = '<span class="dot"></span> LIVE PREVIEW \u2014 draft content';
    document.body.appendChild(bar);

    window.addEventListener('message', function (e) {
      var msg = e.data;
      if (!msg || msg.type !== 'cms:content' || !msg.content) return;
      content = msg.content;
      render();
    });
    /* draft edited in another tab of the same browser */
    window.addEventListener('storage', function (e) {
      if (e.key === DRAFT_KEY && e.newValue) {
        try { content = JSON.parse(e.newValue); render(); } catch (err) {}
      }
    });
    if (window.parent !== window) {
      window.parent.postMessage({ type: 'cms:ready', page: PAGE }, '*');
    }
  }

  /* ------------------------------------------------------------------ */
  /* Boot                                                                */
  /* ------------------------------------------------------------------ */

  function boot() {
    readLocalPublicReviews();
    if (PREVIEW) {
      initPreviewBridge();
      try {
        var draft = localStorage.getItem(DRAFT_KEY);
        if (draft) content = JSON.parse(draft);
      } catch (e) {}
    }

    var chrome = function () {
      if (PAGE === 'home') initHomeChrome();
      else if (PAGE === 'showcase' || PAGE === 'showcase2') initShowcaseChrome();
      else if (PAGE === 'reviews') initCosmicDecor();
    };

    /* Public site reads published Neon only. Draft is never requested here.
       Preview (?cmsPreview=1) may overlay draft via postMessage from the CMS. */
    var DEFAULT_CONTENT_API = 'https://elitex-interior.vercel.app/api/content';

    function contentApiUrl() {
      var meta = document.querySelector('meta[name="elitex-content-api"]');
      if (meta && meta.getAttribute('content')) return meta.getAttribute('content');
      try {
        var stored = localStorage.getItem('elitex.cmsContentApi');
        if (stored) return stored;
      } catch (e) {}
      return DEFAULT_CONTENT_API;
    }

    function looksLikeContent(doc) {
      return !!(doc && typeof doc === 'object' && doc.site && typeof doc.site === 'object' && doc.pages && typeof doc.pages === 'object');
    }

    function fetchJson(url) {
      var ctrl = typeof AbortController !== 'undefined' ? new AbortController() : null;
      var timer = ctrl ? setTimeout(function () { ctrl.abort(); }, 8000) : null;
      return fetch(url, {
        method: 'GET',
        cache: 'no-store',
        credentials: 'omit',
        headers: { Accept: 'application/json' },
        signal: ctrl ? ctrl.signal : undefined
      }).then(function (r) {
        if (!r.ok) throw new Error('http ' + r.status);
        return r.json();
      }).finally(function () {
        if (timer) clearTimeout(timer);
      });
    }

    function loadPublished() {
      return fetchJson(contentApiUrl()).then(function (json) {
        if (json && json.document && json.document !== 'published') {
          throw new Error('not published');
        }
        var doc = json && json.content ? json.content : json;
        if (!looksLikeContent(doc)) throw new Error('shape');
        if (typeof console !== 'undefined' && console.info) {
          console.info('[Elitex] content source: published');
        }
        return doc;
      });
    }

    function loadFallback() {
      return fetchJson('content/content.json').then(function (doc) {
        if (!looksLikeContent(doc)) throw new Error('fallback shape');
        if (typeof console !== 'undefined' && console.warn) {
          console.warn('[Elitex] published content unavailable; using saved snapshot');
        }
        return doc;
      });
    }

    loadPublished()
      .catch(function () { return loadFallback(); })
      .then(function (json) {
        if (!content) content = json; /* preview draft overlay wins; public always uses fetched published/snapshot */
        render();
        chrome();
        initTawk();
        loadPublicReviews();
        initReviewComposer();
      })
      .catch(function (err) {
        console.error('[ElitexCMS] failed to load published content:', err);
        if (content) { render(); chrome(); initReviewComposer(); } else { hidePreloader(); }
      });

    if (PAGE === 'home') {
      setTimeout(function () {
        heroHold = false;
        releaseHero();
      }, 8000);
    } else {
      setTimeout(hidePreloader, 4000);
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();
