/**
 * Phase 4: public site reads published Neon; content.json remains fallback snapshot.
 * Does not print secrets. Does not mutate content.
 */
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';

function loadLocalEnv() {
  const file = path.resolve(process.cwd(), '.env');
  if (!existsSync(file)) return;
  for (const line of readFileSync(file, 'utf8').split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const match = trimmed.match(/^([A-Z0-9_]+)\s*=\s*(.*)$/);
    if (!match || process.env[match[1]]) continue;
    let value = match[2].trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    process.env[match[1]] = value;
  }
}

loadLocalEnv();

const BASE = (process.env.CMS_BASE_URL || 'https://elitex-interior.vercel.app').replace(/\/$/, '');
const KEY = process.env.CMS_API_SECRET || '';

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

async function main() {
  const file = path.resolve(process.cwd(), '..', 'content', 'content.json');
  assert(existsSync(file), 'content/content.json missing');
  const local = JSON.parse(readFileSync(file, 'utf8')) as {
    site?: { name?: string };
    pages?: Record<string, unknown>;
    seo?: unknown;
    media?: unknown[];
  };
  assert(local.site?.name === 'Elitex Interior', 'fallback snapshot site.name is not Elitex Interior');

  const response = await fetch(`${BASE}/api/content`, {
    cache: 'no-store',
    headers: { Accept: 'application/json', Origin: 'https://elitexinterior.com' },
  });
  const json = (await response.json()) as {
    ok?: boolean;
    source?: string;
    document?: string;
    content?: {
      site?: { name?: string };
      pages?: Record<string, unknown>;
      seo?: unknown;
      media?: unknown[];
    };
    error?: string;
  };
  assert(response.ok && json.ok, `GET /api/content failed ${response.status} ${json.error || ''}`);
  assert(json.source === 'neon', `source=${String(json.source)}`);
  if (json.document) assert(json.document === 'published', `document=${String(json.document)}`);
  const content = json.content!;
  assert(content.site?.name === 'Elitex Interior', `published site.name=${String(content.site?.name)}`);
  assert(!String(content.site?.name || '').startsWith('phase2-verify'), 'phase2 verify name leaked to public API');
  assert(Boolean(content.pages?.home && content.pages?.showcase && content.pages?.showcase2 && content.pages?.reviews), 'pages missing');
  assert(Boolean(content.seo), 'seo missing');
  assert(Array.isArray(content.media) && content.media.length >= 115, 'published media array missing');

  const cors = response.headers.get('access-control-allow-origin');
  if (json.document === 'published') {
    assert(cors === 'https://elitexinterior.com', `CORS origin=${String(cors)}`);
  }

  const health = (await fetch(`${BASE}/api/health`, { cache: 'no-store' }).then((r) => r.json())) as {
    mediaCount?: number;
  };
  assert(Number(health.mediaCount) >= 116, `health mediaCount=${String(health.mediaCount)}`);

  if (KEY) {
    const draft = await fetch(`${BASE}/api/cms/content/draft`, {
      headers: { Accept: 'application/json', 'x-cms-key': KEY },
      cache: 'no-store',
    });
    const draftJson = (await draft.json()) as { ok?: boolean; content?: { site?: { name?: string }; updatedAt?: string } };
    assert(draft.status === 200 && draftJson.ok, 'machine draft read failed');
    const publishedName = content.site?.name;
    const draftName = draftJson.content?.site?.name;
    assert(publishedName === 'Elitex Interior', 'published name drifted');
    const isolation =
      draftName !== publishedName
        ? 'draft site.name differs from published — public API must keep published'
        : 'draft and published site.name match';
    console.log(
      JSON.stringify(
        {
          ok: true,
          base: BASE,
          publishedSite: publishedName,
          draftSite: draftName,
          isolation,
          mediaCount: health.mediaCount,
          fallback: 'content/content.json still in repo',
          cors: cors,
        },
        null,
        2
      )
    );
    return;
  }

  console.log(
    JSON.stringify(
      {
        ok: true,
        base: BASE,
        publishedSite: content.site?.name,
        mediaCount: health.mediaCount,
        fallback: 'content/content.json still in repo',
        cors,
      },
      null,
      2
    )
  );
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
