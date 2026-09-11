import {
  jsonError,
  jsonOk,
  logSafe,
  publicDbError,
  publicWriteCors,
} from '@/lib/api';
import {
  appendPublicReview,
  newReviewId,
  parseReviewInput,
  readPublicReviews,
  storeReviewAvatar,
  type PublicReview,
} from '@/lib/public-reviews';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const hits = new Map<string, { count: number; reset: number }>();

function clientKey(request: Request) {
  const forwarded = request.headers.get('x-forwarded-for') || '';
  return forwarded.split(',')[0].trim() || request.headers.get('x-real-ip') || 'anon';
}

function rateLimited(key: string) {
  const now = Date.now();
  const row = hits.get(key);
  if (!row || row.reset < now) {
    hits.set(key, { count: 1, reset: now + 10 * 60 * 1000 });
    return false;
  }
  row.count += 1;
  return row.count > 6;
}

export function OPTIONS(request: Request) {
  return publicWriteCors(jsonOk({ ok: true }), request);
}

export async function GET(request: Request) {
  try {
    const reviews = await readPublicReviews();
    return publicWriteCors(jsonOk({ ok: true, reviews }), request);
  } catch (error) {
    logSafe('GET /api/reviews', error);
    return publicWriteCors(jsonError(500, publicDbError(error)), request);
  }
}

export async function POST(request: Request) {
  try {
    if (rateLimited(clientKey(request))) {
      return publicWriteCors(jsonError(429, 'too_many_reviews'), request);
    }

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return publicWriteCors(jsonError(400, 'invalid_json'), request);
    }

    const parsed = parseReviewInput(body);
    if (!parsed.ok) return publicWriteCors(jsonError(400, parsed.error), request);

    const avatar = await storeReviewAvatar(parsed.value.avatar);
    const now = Date.now();
    const review: PublicReview = {
      id: newReviewId(),
      name: parsed.value.name,
      location: parsed.value.location,
      company: parsed.value.company,
      position: parsed.value.position,
      avatar,
      quote: parsed.value.quote,
      text: parsed.value.quote,
      rating: parsed.value.rating,
      status: 'published',
      source: 'public',
      order: now,
      createdAt: new Date(now).toISOString(),
    };

    await appendPublicReview(review);
    return publicWriteCors(jsonOk({ ok: true, review }), request);
  } catch (error) {
    logSafe('POST /api/reviews', error);
    const message = error instanceof Error ? error.message : '';
    if (message === 'reviews_full') {
      return publicWriteCors(jsonError(507, 'reviews_full'), request);
    }
    return publicWriteCors(jsonError(500, publicDbError(error)), request);
  }
}
