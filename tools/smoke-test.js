// Smoke test: serve the site locally and verify pages + assets respond and
// contain the markers the CMS runtime depends on. Run: node tools/smoke-test.js
const http = require('http');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.xml': 'application/xml', '.txt': 'text/plain' };

const server = http.createServer((req, res) => {
  let p = decodeURIComponent(req.url.split('?')[0]);
  if (p.endsWith('/')) p += 'index.html';
  const file = path.join(root, p);
  fs.readFile(file, (err, data) => {
    if (err) { res.writeHead(404); res.end('not found'); return; }
    res.writeHead(200, { 'content-type': MIME[path.extname(file)] || 'application/octet-stream' });
    res.end(data);
  });
});

function get(url) {
  return new Promise((resolve, reject) => {
    http.get(url, res => {
      let body = '';
      res.on('data', c => body += c);
      res.on('end', () => resolve({ status: res.statusCode, body }));
    }).on('error', reject);
  });
}

const checks = [
  ['/index.html',          ['data-page="home"', 'js/site.js', 'css/site.css', 'data-cms=']],
  ['/project.html',        ['data-page="showcase"', 'js/site.js', 'showcaseGrid']],
  ['/project2.html',       ['data-page="showcase2"', 'js/site.js', 'showcaseGrid']],
  ['/reviews.html',        ['data-page="reviews"', 'js/site.js', 'data-cms="rev-cards"']],
  ['/content/content.json',['"pages"', '"home"', '"reviews"', '"media"']],
  ['/js/site.js',          ['IntersectionObserver', 'postMessage', 'f_auto']],
  ['/css/site.css',        ['.skel', '.lazy-media']],
  ['/admin/index.html',    ['js/app.js', 'noindex', 'loginScreen']],
  ['/admin/js/app.js',     ['boot']],
  ['/admin/css/admin.css', ['--']],
  ['/robots.txt',          ['Disallow: /admin/']],
];

server.listen(0, '127.0.0.1', async () => {
  const port = server.address().port;
  let fail = 0;
  for (const [route, markers] of checks) {
    try {
      const { status, body } = await get(`http://127.0.0.1:${port}${route}`);
      if (status !== 200) { console.log(`FAIL ${route} -> HTTP ${status}`); fail++; continue; }
      const missing = markers.filter(m => !body.includes(m));
      if (missing.length) { console.log(`FAIL ${route} -> missing: ${missing.join(', ')}`); fail++; }
      else console.log(`OK   ${route} (${(body.length / 1024).toFixed(1)} KB)`);
    } catch (e) { console.log(`FAIL ${route} -> ${e.message}`); fail++; }
  }
  // content.json structural validation
  try {
    const c = JSON.parse(fs.readFileSync(path.join(root, 'content/content.json'), 'utf8'));
    const need = ['site', 'seo', 'pages', 'media'];
    const miss = need.filter(k => !c[k]).concat(c.site && c.site.integrations ? [] : ['site.integrations']);
    if (miss.length) { console.log('FAIL content.json missing keys: ' + miss.join(', ')); fail++; }
    else {
      const arr = v => Array.isArray(v) ? v : (v && v.items) || [];
      const home = c.pages.home;
      console.log(`OK   content.json: ${arr(home.portfolio).length} portfolio, ${arr(c.pages.reviews.cards).length} reviews, ${arr(c.pages.reviews.videoTestimonials).length} video testimonials, ${arr(c.pages.showcase.items).length}+${arr(c.pages.showcase2.items).length} showcase items, ${arr(home.services).length} services, ${arr(home.testimonials.slides).length} home testimonials, ${c.media.length} media`);
    }
  } catch (e) { console.log('FAIL content.json: ' + e.message); fail++; }
  console.log(fail ? `\n${fail} CHECK(S) FAILED` : '\nALL CHECKS PASSED');
  server.close();
  process.exit(fail ? 1 : 0);
});
