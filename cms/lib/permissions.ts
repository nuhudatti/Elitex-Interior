import type { User, UserRole } from '@prisma/client';
import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';

export type Permission =
  | 'content.read'
  | 'content.write'
  | 'content.publish'
  | 'media.read'
  | 'media.write'
  | 'versions.read'
  | 'versions.restore'
  | 'audit.read'
  | 'users.manage'
  | 'settings.read'
  | 'settings.write';

export type AuthUser = Pick<User, 'id' | 'email' | 'name' | 'role'> & {
  canPublish: boolean;
};

const PUBLISH_GRANTS_KEY = 'publishGrants';

export function isAdministrator(user: { role: UserRole }) {
  return user.role === 'owner';
}

export async function readPublishGrants() {
  const row = await prisma.siteSetting.findUnique({
    where: { key: PUBLISH_GRANTS_KEY },
    select: { value: true },
  });
  const value = row?.value;
  if (!Array.isArray(value)) return [] as string[];
  return value.filter((item): item is string => typeof item === 'string');
}

export async function writePublishGrants(ids: string[]) {
  const unique = [...new Set(ids)];
  await prisma.siteSetting.upsert({
    where: { key: PUBLISH_GRANTS_KEY },
    create: { key: PUBLISH_GRANTS_KEY, value: unique as Prisma.InputJsonValue },
    update: { value: unique as Prisma.InputJsonValue },
  });
  return unique;
}

export function canPublishContent(user: AuthUser) {
  return isAdministrator(user) || user.canPublish === true;
}

export async function toAuthUser(user: Pick<User, 'id' | 'email' | 'name' | 'role'>, grants?: string[]) {
  const list = grants ?? (await readPublishGrants());
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    role: user.role,
    canPublish: isAdministrator(user) || list.includes(user.id),
  } satisfies AuthUser;
}

export function hasPermission(user: AuthUser, permission: Permission) {
  if (isAdministrator(user)) return true;

  switch (permission) {
    case 'content.read':
    case 'content.write':
    case 'media.read':
    case 'media.write':
    case 'versions.read':
    case 'versions.restore':
      return true;
    case 'content.publish':
      return canPublishContent(user);
    case 'audit.read':
    case 'users.manage':
    case 'settings.read':
    case 'settings.write':
      return false;
    default:
      return false;
  }
}

export function publicRoleLabel(role: UserRole) {
  return role === 'owner' ? 'Administrator' : 'Editor';
}

export function publicUser(user: AuthUser) {
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    role: user.role,
    roleLabel: publicRoleLabel(user.role),
    canPublish: canPublishContent(user),
    canPublishGrant: user.role === 'owner' ? true : user.canPublish,
  };
}
