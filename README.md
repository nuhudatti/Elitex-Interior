# Elitex Interior — Website + CMS

Luxury interior design website for **Elitex Interior** (Abuja, Nigeria) with a built-in,
zero-backend content management system. Everything on the public site is managed from
the Admin Dashboard — no more editing HTML by hand.

Built with **HTML, CSS, vanilla JavaScript, Cloudinary and the GitHub API**. No frameworks,
no build step, no server. Works on GitHub Pages as-is.

---

## Project structure

```
├── index.html            Homepage (hydrated from content.json)
├── project.html          Showcase gallery 1
├── project2.html         Showcase gallery 2 (extended)
├── reviews.html          Client reviews & testimonials
├── content/
│   └── content.json      ★ Single source of truth for ALL site content
├── js/
│   └── site.js           Public runtime: hydration, lazy loading, Cloudinary
│                         optimization, SEO injection, live-preview bridge
├── css/
│   └── site.css          Shared public styles (skeletons, lazy media)
├── admin/                ★ Admin Dashboard (open /admin/ in your browser)
│   ├── index.html        App shell (login, sidebar, topbar, palette)
│   ├── css/admin.css     Design system
│   └── js/
│       ├── core.js       DOM helpers, toasts, modals
│       ├── auth.js       Accounts, sessions, roles, encrypted secrets
│       ├── store.js      Draft/published state, versions, audit log
│       ├── api.js        Cloudinary uploads + GitHub publishing
│       ├── views.js      Every editor screen
│       └── app.js        Routing, shortcuts, notifications, preview sync
├── tools/                One-time migration scripts (safe to keep or delete)
├── vid/                  Legacy local media (prefer Cloudinary for new files)
├── robots.txt / sitemap.xml   Generated automatically on publish
└── qr.html               Unrelated utility page (not managed by the CMS)
```

## How it works

1. All content lives in `content/content.json`.
2. Each public page is a styled shell; `js/site.js` fetches the JSON and renders
   navigation, hero, galleries, testimonials, reviews, contact info, footer, SEO
   meta tags — everything.
3. The Admin Dashboard edits a **draft** copy (saved in your browser instantly).
4. **Live Preview** shows the draft in a real page with zero refresh.
5. **Publish** commits the JSON (plus `sitemap.xml` / `robots.txt`) to GitHub via
   the API. GitHub Pages redeploys the live site automatically in ~1 minute.

## First-time setup (5 minutes)

1. **Open the dashboard** — visit `/admin/` on your site (or a local server, see below).
   Create your owner account (name + password). This account exists per browser.
2. **Connect GitHub** — Settings → Publishing:
   - Repository: `nuhudatti/Elitex-Interior` (or wherever the site lives)
   - Create a **fine-grained personal access token** at GitHub → Settings →
     Developer settings → Fine-grained tokens, scoped to this repository only,
     with **Contents: Read and write**. Paste it and Save. It's stored encrypted
     with your password and never leaves your browser.
   - Click **Test connection**.
3. **Connect Cloudinary** — Settings → Cloudinary:
   - Cloud name: `dpdmb5t1l` (already filled in)
   - Create an **unsigned upload preset**: Cloudinary console → Settings →
     Upload → Upload presets → *Add upload preset* → Signing mode **Unsigned** → Save.
     Paste the preset name. Now you can upload straight from the dashboard.

## Everyday use

| Task | Where |
|---|---|
| Edit any text, button, section | Content → the page → tab |
| Add/edit/hide/reorder gallery items | Home Page → Portfolio, or the Showcase pages |
| Project detail popups (scale, date, philosophy) | Projects |
| Reviews, ratings, video testimonials | Reviews Page |
| Upload / search / replace images & videos | Media Library |
| Meta titles, descriptions, share images | SEO |
| Form destinations, WhatsApp, live chat | Forms |
| See your changes live | Live Preview |
| Go live | Publish (Ctrl+Shift+P) |
| Download / restore full backups | Backup |

Every list item supports **Create · Edit · Duplicate · Hide · Publish · Unpublish ·
Delete · Drag-to-reorder**. Draft items show a "Draft" badge in the preview and are
invisible on the live site until published.

### Keyboard shortcuts

- `Ctrl/Cmd + K` — command palette (search & jump anywhere)
- `Ctrl/Cmd + S` — save snapshot
- `Ctrl/Cmd + Shift + P` — publish view
- `g` then `d/h/m/r/j/p/u/s/t/a` — go to Dashboard / Home / Media / Reviews /
  Projects / Preview / Publish / SEO / Settings / Audit
- `Esc` — close any modal

## Performance

The public site is optimized aggressively:

- Videos and images load **only when scrolled into view** (IntersectionObserver),
  with Cloudinary-generated poster frames so nothing heavy loads up front.
- Cloudinary transformations (`f_auto,q_auto,w_…`) deliver WebP/AVIF at the right
  size automatically.
- All JavaScript is deferred; Font Awesome & Swiper CSS load asynchronously;
  fonts and media hosts are preconnected; `content.json` is preloaded.
- The Tawk.to chat widget loads only after first interaction (or 6s idle).
- Skeleton placeholders prevent layout jumps while content hydrates.

## Running locally

Any static server works:

```bash
# from the project folder
python -m http.server 8000
# or
npx serve .
```

Then open `http://localhost:8000/admin/`. (Opening files directly with `file://`
won't work because the browser blocks `fetch` of content.json.)

## Security notes

- Passwords are never stored — only PBKDF2 verifier hashes (150k iterations).
- The GitHub token is AES-GCM encrypted with a key derived from your password.
- Sessions expire after a configurable idle timeout (default 30 min).
- Every dashboard action is recorded in the Audit Log.
- `/admin/` is excluded from search engines via robots.txt and meta noindex.
- Roles: **owner** (everything) and **editor** (content & media only).

## Backup & recovery

- **Backup** → Export downloads the full content as JSON. Keep copies!
- Local snapshots are taken automatically before every publish/restore/import.
- Every publish is a git commit — the full history lives in the repository,
  viewable from Publish → Published history.
