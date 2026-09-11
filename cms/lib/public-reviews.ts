import { prisma } from '@/lib/prisma';
import { readCloudinaryConfig, signCloudinaryParams } from '@/lib/cloudinary';

export const PUBLIC_REVIEWS_KEY = 'public-reviews';
const MAX_REVIEWS = 200;
const MAX_AVATAR_CHARS = 180000;

export type PublicReview = {
  id: string;
  name: string;
  location: string;
  company: string;
  position: string;
  avatar: string;
  quote: string;
  text: string;
  rating: number;
  status: 'published' | 'hidden';
  source: 'public';
  order: number;
  createdAt: string;
};

type Store = { reviews: PublicReview[] };

function asStore(data: unknown): Store {
  if (!data || typeof data !== 'object' || Array.isArray(data)) return { reviews: [] };
  const reviews = (data as { reviews?: unknown }).reviews;
  if (!Array.isArray(reviews)) return { reviews: [] };
  return {
    reviews: reviews.filter((item): item is PublicReview => {
      if (!item || typeof item !== 'object') return false;
      const row = item as PublicReview;
      return Boolean(row.id && row.name && (row.quote || row.text));
    }),
  };
}

export async function readPublicReviews(): Promise<PublicReview[]> {
  const row = await prisma.contentDocument.findUnique({
    where: { key: PUBLIC_REVIEWS_KEY },
    select: { data: true },
  });
  return asStore(row?.data).reviews
    .filter((item) => item.status !== 'hidden')
    .sort((a, b) => (b.order || 0) - (a.order || 0));
}

export async function appendPublicReview(review: PublicReview): Promise<PublicReview[]> {
  const current = await readPublicReviews();
  if (current.length >= MAX_REVIEWS) {
    throw new Error('reviews_full');
  }
  const next = [review, ...current].slice(0, MAX_REVIEWS);
  await prisma.contentDocument.upsert({
    where: { key: PUBLIC_REVIEWS_KEY },
    create: {
      key: PUBLIC_REVIEWS_KEY,
      status: 'published',
      schemaVersion: 1,
      data: { reviews: next },
    },
    update: {
      status: 'published',
      data: { reviews: next },
    },
  });
  return next;
}

function clip(value: unknown, max: number) {
  return String(value ?? '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, max);
}

export function parseReviewInput(input: unknown) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    return { ok: false as const, error: 'invalid_body' };
  }
  const body = input as Record<string, unknown>;
  if (clip(body.website, 80) || clip(body.company_website, 80)) {
    return { ok: false as const, error: 'rejected' };
  }

  const name = clip(body.name, 80);
  const location = clip(body.location, 140) || 'Abuja, Nigeria';
  const company = clip(body.company, 80);
  const position = clip(body.position, 80);
  const quote = clip(body.quote ?? body.text, 1200);
  const rating = Math.min(5, Math.max(1, Number(body.rating) || 5));
  const avatar = String(body.avatar || '').trim();

  if (name.length < 2) return { ok: false as const, error: 'name_required' };
  if (quote.length < 24) return { ok: false as const, error: 'quote_required' };
  if (avatar && !(avatar.startsWith('data:image/') || /^https?:\/\//i.test(avatar))) {
    return { ok: false as const, error: 'avatar_invalid' };
  }
  if (avatar.startsWith('data:image/') && avatar.length > MAX_AVATAR_CHARS) {
    return { ok: false as const, error: 'avatar_too_large' };
  }

  return {
    ok: true as const,
    value: { name, location, company, position, quote, rating, avatar },
  };
}

export function newReviewId() {
  return `pr_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
}

export async function storeReviewAvatar(avatar: string) {
  if (!avatar) return '';
  if (/^https?:\/\//i.test(avatar)) return avatar.slice(0, 500);

  const config = await readCloudinaryConfig();
  const folder = `${config.folder || 'elitex'}/reviews`;
  const body = new URLSearchParams();
  body.set('file', avatar);
  body.set('folder', folder);

  if (config.mode === 'signed') {
    const timestamp = Math.floor(Date.now() / 1000);
    const apiKey = process.env.CLOUDINARY_API_KEY?.trim() || '';
    const apiSecret = process.env.CLOUDINARY_API_SECRET?.trim() || '';
    body.set('timestamp', String(timestamp));
    body.set('api_key', apiKey);
    body.set('signature', signCloudinaryParams({ timestamp, folder }, apiSecret));
  } else if (config.mode === 'unsigned' && config.uploadPreset) {
    body.set('upload_preset', config.uploadPreset);
  } else if (avatar.length <= MAX_AVATAR_CHARS) {
    return avatar;
  } else {
    return '';
  }

  const res = await fetch(`https://api.cloudinary.com/v1_1/${config.cloudName}/image/upload`, {
    method: 'POST',
    body,
  });
  if (!res.ok) {
    if (avatar.length <= MAX_AVATAR_CHARS) return avatar;
    throw new Error('avatar_upload_failed');
  }
  const json = (await res.json()) as { secure_url?: string; url?: string };
  return json.secure_url || json.url || avatar;
}
