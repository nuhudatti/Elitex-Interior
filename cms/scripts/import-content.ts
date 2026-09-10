/**
 * Import content/content.json into Neon via Prisma.
 * Idempotent: upserts published + draft documents, media rows, and non-secret site settings.
 * content.json remains a snapshot file until Phase 2 cuts the public site over.
 */
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { PrismaClient, type Prisma } from '@prisma/client';

const prisma = new PrismaClient();
const CLOUD_NAME = 'dpdmb5t1l';
const CONTENT_PATH = path.resolve(process.cwd(), '..', 'content', 'content.json');

type ContentJson = {
  schemaVersion?: number;
  updatedAt?: string;
  media?: MediaEntry[];
  site?: {
    integrations?: {
      cloudinary?: {
        cloudName?: string;
        uploadPreset?: string;
        defaultFolder?: string;
      };
    };
  };
};

type MediaEntry = {
  id?: string;
  url?: string;
  name?: string;
  type?: string;
  source?: string;
  folder?: string;
  addedAt?: string;
};

function parseCloudinaryUrl(url: string) {
  const match = url.match(
    /^https:\/\/res\.cloudinary\.com\/([^/]+)\/(image|video|raw)\/upload\/(?:.*\/)?(?:v\d+\/)?(.+?)(?:\.([A-Za-z0-9]+))?$/
  );
  if (!match) return null;
  return {
    cloudName: match[1],
    cldResourceType: match[2],
    publicId: match[3],
    format: match[4] || null,
  };
}

const DEFAULT_SETTINGS: Array<{ key: string; value: Prisma.InputJsonValue }> = [
  { key: 'repo', value: 'nuhudatti/Elitex-Interior' },
  { key: 'branch', value: 'main' },
  { key: 'sessionTimeout', value: 30 },
  { key: 'previewPage', value: 'index.html' },
  { key: 'cldCloudName', value: CLOUD_NAME },
  { key: 'cldFolder', value: 'elitex' },
  { key: 'cldPreset', value: '' },
];

async function upsertDocument(key: 'published' | 'draft', data: ContentJson) {
  const schemaVersion = Number(data.schemaVersion) || 1;
  const status = key === 'published' ? 'published' : 'draft';
  const payload = data as Prisma.InputJsonValue;

  return prisma.contentDocument.upsert({
    where: { key },
    create: {
      key,
      status,
      schemaVersion,
      data: payload,
    },
    update: {
      status,
      schemaVersion,
      data: payload,
    },
  });
}

async function importMedia(entries: MediaEntry[]) {
  let upserted = 0;
  let skipped = 0;

  for (const entry of entries) {
    const url = String(entry.url || '').trim();
    if (!url) {
      skipped += 1;
      continue;
    }

    const parsed = parseCloudinaryUrl(url);
    const resourceType = String(entry.type || parsed?.cldResourceType || 'image');
    const createdAt = entry.addedAt ? new Date(entry.addedAt) : undefined;

    await prisma.media.upsert({
      where: { url },
      create: {
        legacyId: entry.id || null,
        publicId: parsed?.publicId || null,
        cloudName: parsed?.cloudName || CLOUD_NAME,
        resourceType,
        url,
        secureUrl: url.startsWith('https://') ? url : null,
        format: parsed?.format || null,
        folder: entry.folder || null,
        originalFilename: entry.name || null,
        source: entry.source || (parsed ? 'cloudinary' : 'local'),
        metadata: {
          importedFrom: 'content/content.json',
          cldResourceType: parsed?.cldResourceType || null,
        },
        ...(createdAt && !Number.isNaN(createdAt.getTime()) ? { createdAt } : {}),
      },
      update: {
        legacyId: entry.id || undefined,
        publicId: parsed?.publicId || undefined,
        cloudName: parsed?.cloudName || CLOUD_NAME,
        resourceType,
        secureUrl: url.startsWith('https://') ? url : undefined,
        format: parsed?.format || undefined,
        folder: entry.folder || undefined,
        originalFilename: entry.name || undefined,
        source: entry.source || (parsed ? 'cloudinary' : 'local'),
      },
    });
    upserted += 1;
  }

  return { upserted, skipped };
}

async function seedSettings(data: ContentJson) {
  const cloudinary = data.site?.integrations?.cloudinary || {};
  const settings = DEFAULT_SETTINGS.map((row) => {
    if (row.key === 'cldCloudName' && cloudinary.cloudName) {
      return { ...row, value: String(cloudinary.cloudName) };
    }
    if (row.key === 'cldFolder' && cloudinary.defaultFolder) {
      return { ...row, value: String(cloudinary.defaultFolder) };
    }
    if (row.key === 'cldPreset' && cloudinary.uploadPreset) {
      return { ...row, value: String(cloudinary.uploadPreset) };
    }
    return row;
  });

  for (const row of settings) {
    await prisma.siteSetting.upsert({
      where: { key: row.key },
      create: row,
      update: { value: row.value },
    });
  }

  return settings.length;
}

async function main() {
  const raw = await readFile(CONTENT_PATH, 'utf8');
  const data = JSON.parse(raw) as ContentJson;
  if (!data || typeof data !== 'object') {
    throw new Error(`Invalid JSON at ${CONTENT_PATH}`);
  }

  const media = Array.isArray(data.media) ? data.media : [];
  console.log(`Importing ${CONTENT_PATH}`);
  console.log(`schemaVersion=${data.schemaVersion ?? 1} media=${media.length}`);

  const published = await upsertDocument('published', data);
  const draft = await upsertDocument('draft', data);
  const mediaResult = await importMedia(media);
  const settingsCount = await seedSettings(data);

  await prisma.contentVersion.create({
    data: {
      documentId: published.id,
      label: 'Imported from content/content.json',
      data: data as Prisma.InputJsonValue,
    },
  });

  await prisma.auditLog.create({
    data: {
      action: 'import',
      entity: 'ContentDocument',
      entityId: published.id,
      detail: 'Imported content/content.json into published and draft documents',
      metadata: {
        source: 'content/content.json',
        updatedAt: data.updatedAt ?? null,
        mediaUpserted: mediaResult.upserted,
        mediaSkipped: mediaResult.skipped,
        settings: settingsCount,
      },
    },
  });

  console.log(
    JSON.stringify(
      {
        ok: true,
        publishedId: published.id,
        draftId: draft.id,
        mediaUpserted: mediaResult.upserted,
        mediaSkipped: mediaResult.skipped,
        settings: settingsCount,
      },
      null,
      2
    )
  );
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
