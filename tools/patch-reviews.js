/**
 * patch-reviews.js — one-time migration of reviews.html to the CMS runtime.
 * Replaces static review/video blocks with CMS-rendered containers and
 * removes the legacy inline script (js/site.js now powers the page).
 */
const fs = require('fs');
const path = require('path');

const file = path.join(__dirname, '..', 'reviews.html');
let html = fs.readFileSync(file, 'utf8');

function replaceBetween(startMarker, endMarker, replacement, label) {
  const s = html.indexOf(startMarker);
  if (s === -1) throw new Error('start marker not found: ' + label);
  const e = html.indexOf(endMarker, s + startMarker.length);
  if (e === -1) throw new Error('end marker not found: ' + label);
  html = html.slice(0, s) + replacement + html.slice(e + endMarker.length);
  console.log('patched:', label);
}

/* 1. review cards section */
replaceBetween(
  '<h2 class="quantum-title">VOICES OF EXCELLENCE</h2>',
  '</section>',
  [
    '<h2 class="quantum-title" data-cms="rev-cards-heading">VOICES OF EXCELLENCE</h2>',
    '            <p class="section-subtitle" data-cms="rev-cards-subtitle">',
    '                Read what our clients have to say about their journey with Elitex Interior',
    '            </p>',
    '            ',
    '            <div class="review-grid" data-cms="rev-cards">',
    '                <div class="skel skel-dark" style="height:320px"></div>',
    '                <div class="skel skel-dark" style="height:320px"></div>',
    '                <div class="skel skel-dark" style="height:320px"></div>',
    '            </div>',
    '        </section>'
  ].join('\n'),
  'review cards'
);

/* 2. video testimonials section */
replaceBetween(
  '<h2 class="quantum-title">IN THEIR OWN WORDS</h2>',
  '</section>',
  [
    '<h2 class="quantum-title" data-cms="rev-video-heading">IN THEIR OWN WORDS</h2>',
    '            <p class="section-subtitle" data-cms="rev-video-subtitle">',
    '                Watch our clients share their experiences with Elitex Interior',
    '            </p>',
    '            ',
    '            <div class="video-testimonials" data-cms="rev-videos">',
    '                <div class="skel skel-dark" style="height:280px"></div>',
    '                <div class="skel skel-dark" style="height:280px"></div>',
    '            </div>',
    '        </section>'
  ].join('\n'),
  'video testimonials'
);

/* 3. submit form headings */
html = html.replace(
  '<h2 class="quantum-title">SHARE YOUR EXPERIENCE</h2>',
  '<h2 class="quantum-title" data-cms="rev-form-heading">SHARE YOUR EXPERIENCE</h2>'
);
html = html.replace(
  /<p class="section-subtitle">\s*We value your feedback\. Share your Elitex Interior experience with others\.\s*<\/p>/,
  '<p class="section-subtitle" data-cms="rev-form-subtitle">We value your feedback. Share your Elitex Interior experience with others.</p>'
);

/* 4. footer bindings */
html = html.replace(
  '<h4 class="text-xl font-bold text-white mb-4">ELITEX INTERIOR</h4>',
  '<h4 class="text-xl font-bold text-white mb-4" data-cms="footer-brand">ELITEX INTERIOR</h4>'
);
html = html.replace(
  /<p class="text-white\/60 text-sm md:text-base">Crafting timeless[\s\S]*?<\/p>/,
  '<p class="text-white/60 text-sm md:text-base" data-cms="footer-blurb">Crafting timeless and elegant interiors in Abuja. We transform spaces into bespoke environments that reflect your personality and lifestyle.</p>'
);
html = html.replace('<ul class="space-y-2 md:space-y-3">', '<ul class="space-y-2 md:space-y-3" id="footer-quicklinks">');
html = html.replace(
  /<div class="flex space-x-4">\s*<a href="https:\/\/www\.instagram[\s\S]*?<\/div>/,
  [
    '<div class="flex space-x-4" data-cms="footer-social">',
    '                        <a href="https://www.instagram.com/elitex_interior?igsh=MW95cnFzYWFreHp2dA==" aria-label="Instagram" class="text-xl md:text-2xl hover:text-[var(--secondary)] transition-colors"><i class="fab fa-instagram"></i></a>',
    '                    </div>'
  ].join('\n')
);
html = html.replace(
  /<p><i class="fas fa-map-marker-alt mr-2 text-\[var\(--secondary\)\]"><\/i>[^<]*<\/p>/,
  '<p><i class="fas fa-map-marker-alt mr-2 text-[var(--secondary)]"></i> <span data-cms="footer-address">Suite A31 Shakir plaza, garki area 11, Abuja</span></p>'
);
html = html.replace(
  /<p><i class="fab fa-whatsapp mr-2 text-\[var\(--secondary\)\]"><\/i>[^<]*<\/p>/,
  '<p><i class="fab fa-whatsapp mr-2 text-[var(--secondary)]"></i> <span data-cms="footer-phone">08034967299</span></p>'
);
html = html.replace(
  /<p>&copy; <span id="current-year"><\/span>[^<]*<\/p>/,
  '<p data-cms="footer-copy">&copy; 2025 Elitex Interior. All Rights Reserved. Crafted with Excellence.</p>'
);

/* 5. modal video: add playsinline, drop autoplay attribute handling */
html = html.replace(
  '<video id="modalVideo" class="w-full h-full" controls>',
  '<video id="modalVideo" class="w-full h-full" controls playsinline>'
);

/* 6. remove the legacy inline script (everything from the last <script> to </body>) */
const anchor = html.indexOf('// Quantum Preloader');
if (anchor === -1) throw new Error('legacy script anchor not found');
const scriptStart = html.lastIndexOf('<script>', anchor);
const scriptEnd = html.indexOf('</script>', anchor);
if (scriptStart === -1 || scriptEnd === -1) throw new Error('legacy script bounds not found');
html = html.slice(0, scriptStart) + html.slice(scriptEnd + '</script>'.length);
console.log('patched: legacy inline script removed');

fs.writeFileSync(file, html);
console.log('reviews.html patched OK');
