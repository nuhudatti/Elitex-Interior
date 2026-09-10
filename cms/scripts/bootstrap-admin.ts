/**
 * Seed the first Administrator from CMS_BOOTSTRAP_ADMIN_EMAIL + CMS_BOOTSTRAP_ADMIN_PASSWORD.
 * Never prints the password. Refuses if any user already exists unless CMS_BOOTSTRAP_ADMIN_RESET=1
 * is set, in which case it updates that email's password (still not printed).
 */
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { PrismaClient } from '@prisma/client';
import { assertPasswordPolicy, hashPassword } from '../lib/password';

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

const prisma = new PrismaClient();

async function main() {
  const email = String(process.env.CMS_BOOTSTRAP_ADMIN_EMAIL || '')
    .trim()
    .toLowerCase();
  const password = String(process.env.CMS_BOOTSTRAP_ADMIN_PASSWORD || '');
  const reset = process.env.CMS_BOOTSTRAP_ADMIN_RESET === '1';

  if (!email || !password) {
    throw new Error(
      'Set CMS_BOOTSTRAP_ADMIN_EMAIL and CMS_BOOTSTRAP_ADMIN_PASSWORD in cms/.env (names only in chat).'
    );
  }

  const policy = assertPasswordPolicy(password);
  if (policy) throw new Error(policy);

  const hashed = await hashPassword(password);
  const count = await prisma.user.count();
  const existing = await prisma.user.findFirst({ where: { email } });

  if (count > 0 && !reset && !existing) {
    throw new Error('Users already exist. Refusing to create another bootstrap admin.');
  }

  if (existing) {
    if (!reset) {
      console.log(JSON.stringify({ ok: true, created: false, existed: true, emailSet: true }));
      return;
    }
    await prisma.user.update({
      where: { id: existing.id },
      data: {
        passwordHash: hashed.hash,
        passwordSalt: hashed.salt,
        role: 'owner',
      },
    });
    console.log(JSON.stringify({ ok: true, created: false, reset: true, emailSet: true }));
    return;
  }

  await prisma.user.create({
    data: {
      email,
      name: 'Administrator',
      passwordHash: hashed.hash,
      passwordSalt: hashed.salt,
      role: 'owner',
    },
  });

  console.log(JSON.stringify({ ok: true, created: true, emailSet: true, role: 'Administrator' }));
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
