import { createHash } from 'node:crypto';
import { prisma } from '@/lib/prisma';

const CLOUD = 'dpdmb5t1l';
const FOLDER = 'elitex';

export type UploadMode = 'signed' | 'unsigned' | 'unavailable';

export type CloudinaryConfig = {
  mode: UploadMode;
  cloudName: string;
  folder: string;
  uploadPreset: string;
  apiKeyPresent: boolean;
  missing: string[];
};

async function settingString(key: string) {
  const row = await prisma.siteSetting.findUnique({ where: { key } });
  const value = row?.value;
  if (typeof value === 'string') return value.trim();
  if (value && typeof value === 'object' && !Array.isArray(value)) return '';
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  return String(value ?? '').replace(/^"|"$/g, '').trim();
}

export async function readCloudinaryConfig(): Promise<CloudinaryConfig> {
  const draft = await prisma.contentDocument.findUnique({
    where: { key: 'draft' },
    select: { data: true },
  });
  const data = (draft?.data || {}) as {
    site?: { integrations?: { cloudinary?: { cloudName?: string; uploadPreset?: string; defaultFolder?: string } } };
  };
  const cld = data.site?.integrations?.cloudinary || {};

  const cloudName =
    process.env.CLOUDINARY_CLOUD_NAME?.trim() ||
    (await settingString('cldCloudName')) ||
    cld.cloudName ||
    CLOUD;
  const folder =
    (await settingString('cldFolder')) || cld.defaultFolder || FOLDER;
  const uploadPreset =
    process.env.CLOUDINARY_UPLOAD_PRESET?.trim() ||
    (await settingString('cldPreset')) ||
    cld.uploadPreset ||
    '';
  const apiKey = process.env.CLOUDINARY_API_KEY?.trim() || '';
  const apiSecret = process.env.CLOUDINARY_API_SECRET?.trim() || '';

  const missing: string[] = [];
  let mode: UploadMode = 'unavailable';
  if (apiKey && apiSecret) mode = 'signed';
  else if (cloudName && uploadPreset) mode = 'unsigned';
  else {
    if (!uploadPreset) missing.push('CLOUDINARY_UPLOAD_PRESET');
    if (!apiKey) missing.push('CLOUDINARY_API_KEY');
    if (!apiSecret) missing.push('CLOUDINARY_API_SECRET');
  }

  return {
    mode,
    cloudName,
    folder,
    uploadPreset,
    apiKeyPresent: Boolean(apiKey),
    missing,
  };
}

export function signCloudinaryParams(params: Record<string, string | number>, apiSecret: string) {
  const toSign = Object.keys(params)
    .filter((key) => params[key] !== undefined && params[key] !== '')
    .sort()
    .map((key) => `${key}=${params[key]}`)
    .join('&');
  return createHash('sha1').update(`${toSign}${apiSecret}`).digest('hex');
}

export function deliveryUrl(cloudName: string, resourceType: string, publicId: string, format?: string | null) {
  const suffix = format ? `.${format}` : '';
  return `https://res.cloudinary.com/${cloudName}/${resourceType}/upload/${publicId}${suffix}`;
}
