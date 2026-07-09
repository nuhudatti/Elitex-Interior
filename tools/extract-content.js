/**
 * extract-content.js
 * One-time migration tool: reads the original static HTML pages and produces
 * content/content.json — the single source of truth for the Elitex CMS.
 *
 * Usage: node tools/extract-content.js
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const read = (f) => fs.readFileSync(path.join(ROOT, f), 'utf8');

/* ---------- helpers ---------- */

const stripComments = (html) => html.replace(/<!--[\s\S]*?-->/g, '');

const attr = (chunk, name) => {
  const m = chunk.match(new RegExp(name + '\\s*=\\s*"([^"]*)"'));
  return m ? m[1].trim() : null;
};

const text = (chunk, re) => {
  const m = chunk.match(re);
  return m ? m[1].replace(/\s+/g, ' ').trim() : null;
};

let uid = 0;
const id = (prefix) => `${prefix}_${(++uid).toString(36).padStart(3, '0')}`;

/** Extract the inline `const projects = {...}` object from a page. */
function extractProjectsObject(html) {
  const start = html.indexOf('const projects = {');
  if (start === -1) return {};
  let i = html.indexOf('{', start);
  let depth = 0;
  let end = -1;
  let inStr = null;
  for (let p = i; p < html.length; p++) {
    const c = html[p];
    if (inStr) {
      if (c === '\\') { p++; continue; }
      if (c === inStr) inStr = null;
      continue;
    }
    if (c === "'" || c === '"' || c === '`') { inStr = c; continue; }
    if (c === '/' && html[p + 1] === '/') { p = html.indexOf('\n', p); continue; }
    if (c === '{') depth++;
    if (c === '}') { depth--; if (depth === 0) { end = p; break; } }
  }
  if (end === -1) return {};
  const objText = html.slice(i, end + 1);
  // eslint-disable-next-line no-new-func
  const obj = new Function('return (' + objText + ')')();
  const out = {};
  for (const [slug, p] of Object.entries(obj)) {
    out[slug] = {
      title: p.title || '',
      description: p.description || '',
      scale: p.scale || '',
      date: p.date || '',
      location: p.location || '',
      philosophy: p.philosophy || '',
      video: (p.video || '').trim() || null,
      image: (p.image || '').trim() || null
    };
  }
  return out;
}

/** Split a grid region into item chunks by an opening marker. */
function splitItems(region, marker) {
  const chunks = [];
  let idx = region.indexOf(marker);
  while (idx !== -1) {
    const next = region.indexOf(marker, idx + marker.length);
    chunks.push(region.slice(idx, next === -1 ? undefined : next));
    idx = next;
  }
  return chunks;
}

/* ---------- index.html portfolio ---------- */

function extractHomePortfolio(html) {
  const clean = stripComments(html);
  const start = clean.indexOf('id="portfolioGrid"');
  const end = clean.indexOf('View All Projects');
  const region = clean.slice(start, end);
  return splitItems(region, '<div class="grid-item').map((chunk, i) => {
    const classes = text(chunk, /^<div class="([^"]*)"/) || '';
    const size = classes.includes('large') ? 'large' : classes.includes('wide') ? 'wide' : classes.includes('tall') ? 'tall' : 'normal';
    const videoSrc = attr(chunk, 'data-video-src');
    const sourceSrc = text(chunk, /<source\s+src="([^"]*)"/);
    const imgSrc = text(chunk, /<img\s+src="([^"]*)"/);
    return {
      id: id('pf'),
      order: i + 1,
      status: 'published',
      title: text(chunk, /<h3[^>]*>([\s\S]*?)<\/h3>/) || '',
      subtitle: text(chunk, /<p[^>]*>([\s\S]*?)<\/p>/) || '',
      size,
      mediaType: (videoSrc || sourceSrc) ? 'video' : 'image',
      src: sourceSrc || imgSrc || videoSrc || '',
      modalVideoSrc: videoSrc,
      alt: attr(chunk, 'alt') || ''
    };
  });
}

/* ---------- project pages showcase grids ---------- */

function extractShowcase(html) {
  const clean = stripComments(html);
  const start = clean.indexOf('id="showcaseGrid"');
  const end = clean.indexOf('BEYOND DESIGN, BEYOND TIME');
  const region = clean.slice(start, end);
  return splitItems(region, '<div class="eternal-item"').map((chunk, i) => {
    const src = text(chunk, /<source\s+(?:data-src|src)="([^"]*)"/);
    const lazy = /<source\s+data-src=/.test(chunk);
    const imgSrc = text(chunk, /<img\s+src="([^"]*)"/);
    return {
      id: id('sc'),
      order: i + 1,
      status: 'published',
      category: attr(chunk, 'data-category') || 'luxury',
      projectSlug: attr(chunk, 'data-project'),
      mediaType: src ? 'video' : 'image',
      src: (src || imgSrc || '').trim(),
      lazy,
      title: text(chunk, /<h3[^>]*>([\s\S]*?)<\/h3>/) || '',
      subtitle: text(chunk, /<p class="text-gray-300">([\s\S]*?)<\/p>/) || '',
      alt: attr(chunk, 'alt') || ''
    };
  }).filter((it) => it.src);
}

/* ---------- reviews.html cards + video testimonials ---------- */

function extractReviewCards(html) {
  const clean = stripComments(html);
  const start = clean.indexOf('<div class="review-grid">');
  const end = clean.indexOf('IN THEIR OWN WORDS');
  const region = clean.slice(start, end);
  return splitItems(region, '<div class="review-card').map((chunk, i) => {
    const stars = (chunk.match(/star filled/g) || []).length;
    const info = chunk.match(/client-info">\s*<h3>([\s\S]*?)<\/h3>\s*<p>([\s\S]*?)<\/p>/);
    return {
      id: id('rv'),
      order: i + 1,
      status: 'published',
      featured: i === 0,
      projectSlug: attr(chunk, 'data-project'),
      name: info ? info[1].replace(/\s+/g, ' ').trim() : '',
      company: info ? info[2].replace(/\s+/g, ' ').trim() : '',
      position: '',
      location: 'Abuja, Nigeria',
      avatar: text(chunk, /<img\s+src="([^"]*)"/) || '',
      rating: stars || 5,
      text: text(chunk, /<p class="review-text">\s*([\s\S]*?)\s*<\/p>/) || '',
      showViewProject: /view-project-btn/.test(chunk)
    };
  });
}

function extractVideoTestimonials(html) {
  const clean = stripComments(html);
  const start = clean.indexOf('<div class="video-testimonials">');
  const end = clean.indexOf('id="submit-review"');
  const region = clean.slice(start, end);
  return splitItems(region, '<div class="video-testimonial floating-element"').map((chunk, i) => ({
    id: id('vt'),
    order: i + 1,
    status: 'published',
    title: text(chunk, /<h3[^>]*>([\s\S]*?)<\/h3>/) || '',
    subtitle: text(chunk, /<p[^>]*>([\s\S]*?)<\/p>/) || '',
    src: attr(chunk, 'data-video') || ''
  })).filter((it) => it.src);
}

/* ---------- run ---------- */

const indexHtml = read('index.html');
const projectHtml = read('project.html');
const project2Html = read('project2.html');
const reviewsHtml = read('reviews.html');

const homePortfolio = extractHomePortfolio(indexHtml);
const showcase1Items = extractShowcase(projectHtml);
const showcase2Items = extractShowcase(project2Html);
const reviewCards = extractReviewCards(reviewsHtml);
const videoTestimonials = extractVideoTestimonials(reviewsHtml);
const showcase1Details = extractProjectsObject(projectHtml);
const showcase2Details = extractProjectsObject(project2Html);
const reviewsDetails = extractProjectsObject(reviewsHtml);

/* Media registry: every unique asset referenced anywhere */
const mediaSet = new Map();
const registerMedia = (url, hint) => {
  if (!url) return;
  url = url.trim();
  if (!url || mediaSet.has(url)) return;
  const isVideo = /\.(mp4|mov|webm)(\?|$)/i.test(url) || (hint === 'video');
  const isAudio = /\.mp3(\?|$)/i.test(url);
  const name = decodeURIComponent(url.split('/').pop() || url).split('?')[0];
  mediaSet.set(url, {
    id: id('md'),
    url,
    name,
    type: isAudio ? 'audio' : isVideo ? 'video' : 'image',
    source: url.includes('res.cloudinary.com') ? 'cloudinary' : 'local',
    folder: url.includes('res.cloudinary.com') ? 'cloudinary' : 'local-vid',
    addedAt: new Date().toISOString()
  });
};

homePortfolio.forEach((it) => { registerMedia(it.src, it.mediaType); registerMedia(it.modalVideoSrc, 'video'); });
[...showcase1Items, ...showcase2Items].forEach((it) => registerMedia(it.src, it.mediaType));
reviewCards.forEach((it) => registerMedia(it.avatar, 'image'));
videoTestimonials.forEach((it) => registerMedia(it.src, 'video'));
[showcase1Details, showcase2Details, reviewsDetails].forEach((map) =>
  Object.values(map).forEach((p) => { registerMedia(p.video, 'video'); registerMedia(p.image, 'image'); }));
registerMedia('https://res.cloudinary.com/dpdmb5t1l/video/upload/v1761317720/elitexinterior_d2kpx9.mp3', 'audio');
registerMedia('./vid/logo.mp4', 'video');

/* ---------- hand-curated content (exact copy from the original pages) ---------- */

const content = {
  schemaVersion: 1,
  updatedAt: new Date().toISOString(),
  site: {
    name: 'Elitex Interior',
    domain: 'https://elitexinterior.com',
    contact: {
      phone: '08034967299',
      whatsappNumber: '2348034967299',
      whatsappMessage: "Hello Elitex Interior, I'm interested in your services.",
      email: '',
      address: 'Suit A31 Shakir plaza, garki area 11, Abuja',
      mapEmbedSrc: 'https://www.google.com/maps/embed?pb=!1m18!1m12!1m3!1d3940.935292511274!2d7.486414314786133!3d9.005693893581627!2m3!1f0!2f0!3f0!3m2!1i1024!2i768!4f13.1!3m3!1m2!1s0x104e0a38a6644d67%3A0x4f5b4b5b5b5b5b5b!2sShakir%20Plaza%2C%20Garki%20Area%2011%2C%20Abuja!5e0!3m2!1sen!2sng!4v1700000000000!5m2!1sen!2sng'
    },
    social: [
      { id: 'soc_ig', platform: 'Instagram', icon: 'fab fa-instagram', url: 'https://www.instagram.com/elitex_interior?igsh=MW95cnFzYWFreHp2dA==', status: 'published', order: 1 },
      { id: 'soc_wa', platform: 'WhatsApp', icon: 'fab fa-whatsapp', url: 'https://wa.me/2348034967299?text=Hello%20Elitex%20Interior%2C%20I%27m%20interested%20in%20your%20services.', status: 'published', order: 2 },
      { id: 'soc_fb', platform: 'Facebook', icon: 'fab fa-facebook-f', url: '', status: 'hidden', order: 3 },
      { id: 'soc_pin', platform: 'Pinterest', icon: 'fab fa-pinterest', url: '', status: 'hidden', order: 4 },
      { id: 'soc_li', platform: 'LinkedIn', icon: 'fab fa-linkedin-in', url: '', status: 'hidden', order: 5 }
    ],
    stats: [
      { id: 'st_1', value: '270', suffix: '+', label: 'Projects Completed', status: 'published', order: 1 },
      { id: 'st_2', value: '250', suffix: '+', label: 'Client Satisfaction', status: 'published', order: 2 },
      { id: 'st_3', value: '4.9', suffix: '', label: 'Average Rating', status: 'published', order: 3 },
      { id: 'st_4', value: '5', suffix: '+', label: 'Years Excellence', status: 'published', order: 4 }
    ],
    integrations: {
      formspreeContact: 'https://formspree.io/f/mgvnlqzg',
      formspreeNewsletter: 'https://formspree.io/f/mgvnlqzg',
      formspreeReview: 'https://formspree.io/f/mgvnlqzg',
      tawkToId: '655b9a71958be55aeaaee6c0/1hf3p1g2o',
      tawkToEnabled: true,
      cloudinary: { cloudName: 'dpdmb5t1l', uploadPreset: '', defaultFolder: 'elitex' }
    }
  },
  seo: {
    faviconUrl: '',
    pages: {
      index: {
        title: 'Elitex Interior | Bespoke Interior Design in Abuja, Nigeria',
        description: 'Elitex Interior transforms spaces in Abuja with bespoke luxury interior design. Specializing in residential, commercial, and custom furniture solutions.',
        keywords: 'interior design Abuja, luxury interiors Nigeria, bespoke furniture, commercial design, residential design, Elitex Interior',
        ogTitle: 'Elitex Interior | Bespoke Interior Design in Abuja, Nigeria',
        ogDescription: 'Transforming spaces with bespoke luxury interior design. Specializing in residential, commercial, and custom furniture solutions.',
        ogImage: 'meta.png',
        canonical: 'https://elitexinterior.com/',
        robots: 'index, follow'
      },
      project: {
        title: 'ELITEX SHOWCASE | Beyond Interior Design | Global Masterpieces',
        description: "Experience ELITEX INTERIOR's revolutionary design showcase - a digital gallery that transcends space and time. Witness interior design redefined for eternity.",
        keywords: 'interior design showcase, Elitex Interior projects, luxury interiors Abuja',
        ogTitle: 'ELITEX SHOWCASE | Beyond Interior Design',
        ogDescription: 'Where Design Transcends Reality - A Global Digital Masterpiece',
        ogImage: 'meta.png',
        canonical: 'https://elitexinterior.com/project.html',
        robots: 'index, follow'
      },
      project2: {
        title: 'ELITEX SHOWCASE | Beyond Interior Design | Global Masterpieces',
        description: "Experience ELITEX INTERIOR's revolutionary design showcase - a digital gallery that transcends space and time. Witness interior design redefined for eternity.",
        keywords: 'interior design showcase, Elitex Interior projects, luxury interiors Abuja',
        ogTitle: 'ELITEX SHOWCASE | Beyond Interior Design',
        ogDescription: 'Where Design Transcends Reality - A Global Digital Masterpiece',
        ogImage: 'meta.png',
        canonical: 'https://elitexinterior.com/project2.html',
        robots: 'index, follow'
      },
      reviews: {
        title: 'Client Reviews | Elitex Interior',
        description: "Read authentic client experiences with Elitex Interior — Abuja's most acclaimed luxury interior design studio.",
        keywords: 'Elitex Interior reviews, client testimonials, interior design Abuja reviews',
        ogTitle: 'Client Experiences | Elitex Interior',
        ogDescription: "Discover why Abuja's most discerning clients trust Elitex Interior.",
        ogImage: 'meta.png',
        canonical: 'https://elitexinterior.com/reviews.html',
        robots: 'index, follow'
      }
    },
    structuredData: {
      enabled: true,
      type: 'LocalBusiness',
      name: 'Elitex Interior',
      description: 'Bespoke luxury interior design studio in Abuja, Nigeria.',
      priceRange: '$$$',
      areaServed: 'Abuja, Nigeria'
    }
  },
  pages: {
    home: {
      nav: {
        logoText: 'ELITEX INTERIOR',
        links: [
          { id: 'nv_1', label: 'About', href: '#about', status: 'published', order: 1 },
          { id: 'nv_2', label: 'Services', href: '#services', status: 'published', order: 2 },
          { id: 'nv_3', label: 'Portfolio', href: '#portfolio', status: 'published', order: 3 },
          { id: 'nv_4', label: 'Process', href: '#process', status: 'published', order: 4 },
          { id: 'nv_5', label: 'Testimonials', href: '#testimonials', status: 'published', order: 5 },
          { id: 'nv_6', label: 'Contact', href: '#contact', status: 'published', order: 6 }
        ],
        cta: { label: 'Start Your Project', href: '#contact' }
      },
      hero: {
        visible: true,
        title: 'ELITEX',
        taglinePrefix: 'We Make Your Interior Dreams ',
        taglineHighlight: 'Come To Life',
        subtitle: "Transforming Abuja's most visionary spaces through bespoke interior design that blends luxury, functionality, and timeless elegance.",
        scrollHint: 'DISCOVER THE ART OF SPACE',
        ctaPrimary: { label: 'Begin Your Transformation', href: '#contact' },
        ctaSecondary: { label: 'Explore Our Masterpieces', href: '#portfolio' }
      },
      about: {
        visible: true,
        heading: 'Eternal Design Excellence',
        paragraphs: [
          "At Elitex Interior, we believe that great design is about more than just aesthetics; it's about creating environments that inspire, comfort, and endure. Based in the heart of Abuja, we are a collective of passionate designers, artisans, and visionaries dedicated to crafting spaces that tell a story.",
          "Our philosophy combines timeless principles with modern innovation, ensuring every project is a unique reflection of our client's personality and aspirations. From the grandest architectural details to the finest bespoke furniture, we pour our expertise and passion into every detail."
        ],
        cta: { label: 'Meet The Team', href: '#contact' },
        videoSrc: './vid/logo.mp4'
      },
      services: {
        visible: true,
        heading: 'Our Expertise',
        subtitle: 'We offer a comprehensive range of design services, tailored to create exceptional and functional spaces.',
        items: [
          { id: 'sv_1', order: 1, status: 'published', icon: 'fa-solid fa-home', title: 'Residential Design', description: 'Crafting bespoke homes that are a perfect blend of comfort, luxury, and personal style. From single rooms to entire estates, we create living spaces that feel like home.' },
          { id: 'sv_2', order: 2, status: 'published', icon: 'fa-solid fa-building', title: 'Commercial Design', description: 'Designing inspiring and functional commercial spaces, including offices, hotels, and retail environments that enhance brand identity and user experience.' },
          { id: 'sv_3', order: 3, status: 'published', icon: 'fa-solid fa-couch', title: 'Bespoke Furniture', description: 'Creating unique, handcrafted furniture pieces tailored to your exact specifications. Our custom designs are the perfect finishing touch for any distinguished interior.' }
        ]
      },
      portfolio: {
        visible: true,
        heading: 'Visual Showcase',
        subtitle: 'Explore our gallery of completed projects, showcasing our diverse design capabilities across various spaces.',
        viewAll: { label: 'View All Projects', href: 'project.html' },
        items: homePortfolio
      },
      process: {
        visible: true,
        heading: 'Our Design Process',
        subtitle: 'A meticulous approach that ensures every project exceeds expectations, from concept to final installation.',
        steps: [
          { id: 'pr_1', order: 1, status: 'published', title: 'Consultation', description: 'We begin with an in-depth consultation to understand your vision, needs, and aspirations for the space.' },
          { id: 'pr_2', order: 2, status: 'published', title: 'Concept Development', description: 'Our team creates detailed concepts, mood boards, and 3D visualizations to bring your vision to life.' },
          { id: 'pr_3', order: 3, status: 'published', title: 'Execution', description: 'We meticulously execute the design, crafting custom furniture and overseeing every installation detail.' },
          { id: 'pr_4', order: 4, status: 'published', title: 'Reveal', description: 'We present the transformed space, ensuring every detail meets our exacting standards and your expectations.' }
        ]
      },
      testimonials: {
        visible: true,
        heading: 'Client Acclaim',
        subtitle: 'Hear what our clients have to say about their experience with Elitex Interior.',
        slides: [
          { id: 'ts_1', order: 1, status: 'published', name: 'Founder & CEO, Elitex Interior & Ruwaidis Veil', role: '', location: 'Africa, Nigeria', avatar: './vid/ruwaidis.jpg', quote: 'A visionary designer redefining modern elegance in Abuja\u2019s luxury spaces. Through Elitex Interior, she curates timeless environments that merge art, culture, and innovation. With Ruwaidis Veil, she extends her creative mastery into fashion, celebrating the beauty of modest sophistication. Her work embodies refinement, purpose, and an unyielding passion for excellence.' },
          { id: 'ts_2', order: 2, status: 'published', name: 'Labiba Kabir', role: '', location: 'Abuja, Nigeria', avatar: './vid/kadija.jpg', quote: 'Elitex Interior brought Global Asoebi Couture\u2019s vision to life with a space that radiates elegance and creativity. Every corner reflects the spirit of luxury fashion and the artistry that defines our brand.' },
          { id: 'ts_3', order: 3, status: 'published', name: 'Haajara Kabeer', role: '', location: 'Science, Technology & Engineering Professional Specialist in Energy Sustainability & Strategic Carbon Management | Chevening Scholar (2021) | STEM Advocate empowering women in technology and innovation', avatar: './vid/stem2.jpg', quote: 'From the custom furniture to the lighting design, every element was perfect. True artisans and professionals. Highly recommended for any luxury project.' },
          { id: 'ts_4', order: 4, status: 'published', name: 'Muktar Kabir', role: '', location: 'Evergreen Residence, Jabi District, Abuja', avatar: './vid/mukky.jpg', quote: 'Elitex Interior captured my brand\u2019s essence flawlessly. From the ACE DRIL Exclusive Eyewear studio to the Luxe Hangers space, every detail reflects precision, luxury, and identity. Truly exceptional craftsmanship.' }
        ]
      },
      reviewsCta: {
        visible: true,
        heading: 'Beyond Client Expectations',
        subtitle: "Discover why Elitex Interior is Abuja's most acclaimed design studio through authentic client experiences",
        cta: { label: 'Explore All Client Experiences', href: 'reviews.html' },
        badges: [
          { id: 'bd_1', order: 1, status: 'published', icon: 'fas fa-shield-alt', label: '100% Verified Reviews' },
          { id: 'bd_2', order: 2, status: 'published', icon: 'fas fa-video', label: 'Video Testimonials' },
          { id: 'bd_3', order: 3, status: 'published', icon: 'fas fa-project-diagram', label: 'Project Photos Included' }
        ]
      },
      contactSection: {
        visible: true,
        heading: 'Begin Your Transformation',
        subtitle: "Ready to transform your space into a masterpiece? Let's discuss your vision and create something extraordinary together.",
        addressLabel: 'Studio Location',
        phoneLabel: 'Direct Contact (WhatsApp)',
        form: {
          submitLabel: 'Send Project Inquiry',
          successMessage: 'Thank you! Your message has been sent.',
          projectTypes: [
            { id: 'pt_1', value: 'residential', label: 'Residential', order: 1, status: 'published' },
            { id: 'pt_2', value: 'commercial', label: 'Commercial', order: 2, status: 'published' },
            { id: 'pt_3', value: 'retail', label: 'Retail Store', order: 3, status: 'published' },
            { id: 'pt_4', value: 'furniture', label: 'Custom Furniture', order: 4, status: 'published' }
          ]
        }
      },
      footer: {
        visible: true,
        brandName: 'ELITEX INTERIOR',
        blurb: 'Crafting timeless and elegant interiors in Abuja. We transform spaces into bespoke environments that reflect your personality and lifestyle.',
        quickLinks: [
          { id: 'ql_1', label: 'About Us', href: '#about', status: 'published', order: 1 },
          { id: 'ql_2', label: 'Services', href: '#services', status: 'published', order: 2 },
          { id: 'ql_3', label: 'Portfolio', href: '#portfolio', status: 'published', order: 3 },
          { id: 'ql_4', label: 'Contact', href: '#contact', status: 'published', order: 4 },
          { id: 'ql_5', label: 'Project', href: './project2.html', status: 'published', order: 5 }
        ],
        newsletter: {
          visible: true,
          title: 'Newsletter',
          text: 'Get design inspiration and news.',
          placeholder: 'Your Email',
          successMessage: '\u2705 Message sent successfully!'
        },
        copyright: 'Elitex Interior. All Rights Reserved. Designed with Excellence.'
      }
    },
    showcase: {
      hero: {
        title: 'BEYOND<br>DESIGN',
        subtitle: 'Where spaces transcend reality and design becomes eternal. Welcome to the future of interior architecture.',
        ctaPrimary: 'EXPLORE MASTERPIECES',
        ctaSecondary: 'BEGIN IMMERSION'
      },
      gridHeading: 'ETERNAL CREATIONS',
      philosophy: {
        visible: true,
        heading: 'BEYOND DESIGN, BEYOND TIME',
        text: "We don't just create spaces. We craft environments that transcend the ordinary, where every corner tells a story and every detail echoes through eternity."
      },
      audio: { enabled: true, src: 'https://res.cloudinary.com/dpdmb5t1l/video/upload/v1761317720/elitexinterior_d2kpx9.mp3' },
      items: showcase1Items,
      details: showcase1Details
    },
    showcase2: {
      hero: {
        title: 'BEYOND<br>DESIGN',
        subtitle: 'Where spaces transcend reality and design becomes eternal. Welcome to the future of interior architecture.',
        ctaPrimary: 'EXPLORE MASTERPIECES',
        ctaSecondary: 'BEGIN IMMERSION'
      },
      gridHeading: 'ETERNAL CREATIONS',
      philosophy: {
        visible: true,
        heading: 'BEYOND DESIGN, BEYOND TIME',
        text: "We don't just create spaces. We craft environments that transcend the ordinary, where every corner tells a story and every detail echoes through eternity."
      },
      audio: { enabled: true, src: 'https://res.cloudinary.com/dpdmb5t1l/video/upload/v1761317720/elitexinterior_d2kpx9.mp3' },
      items: showcase2Items,
      details: showcase2Details
    },
    reviews: {
      hero: {
        titlePrefix: 'CLIENT ',
        titleHighlight: 'EXPERIENCES',
        subtitle: "Discover why Abuja's most discerning clients trust Elitex Interior to transform their spaces. Read authentic testimonials from those who have experienced our revolutionary design approach."
      },
      stats: [
        { id: 'rs_1', target: '270', suffix: '+', label: 'Projects Completed', status: 'published', order: 1 },
        { id: 'rs_2', target: '250', suffix: '+', label: 'Satisfied Clients', status: 'published', order: 2 },
        { id: 'rs_3', target: '4.9', suffix: '', label: 'Average Rating', status: 'published', order: 3 },
        { id: 'rs_4', target: '5', suffix: '+', label: 'Years Experience', status: 'published', order: 4 }
      ],
      cardsHeading: 'VOICES OF EXCELLENCE',
      cardsSubtitle: 'Read what our clients have to say about their journey with Elitex Interior',
      cards: reviewCards,
      videoHeading: 'IN THEIR OWN WORDS',
      videoSubtitle: 'Watch our clients share their experiences with Elitex Interior',
      videoTestimonials,
      details: reviewsDetails,
      submitForm: {
        visible: true,
        heading: 'SHARE YOUR EXPERIENCE',
        subtitle: 'We value your feedback. Share your Elitex Interior experience with others.',
        submitLabel: 'Submit Review'
      }
    }
  },
  media: [...mediaSet.values()]
};

const outDir = path.join(ROOT, 'content');
fs.mkdirSync(outDir, { recursive: true });
fs.writeFileSync(path.join(outDir, 'content.json'), JSON.stringify(content, null, 2));

console.log('content/content.json written');
console.log('home portfolio items :', homePortfolio.length);
console.log('showcase (project)   :', showcase1Items.length, 'items /', Object.keys(showcase1Details).length, 'details');
console.log('showcase2 (project2) :', showcase2Items.length, 'items /', Object.keys(showcase2Details).length, 'details');
console.log('review cards         :', reviewCards.length);
console.log('video testimonials   :', videoTestimonials.length);
console.log('media registry       :', mediaSet.size);
