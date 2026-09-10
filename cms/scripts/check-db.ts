import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  if (!process.env.DATABASE_URL) {
    throw new Error('DATABASE_URL is not set. Copy cms/.env.example to cms/.env and add the Neon URIs.');
  }

  const started = Date.now();
  const rows = await prisma.$queryRaw<Array<{ ok: number; now: Date }>>`
    SELECT 1 AS ok, NOW() AS now
  `;
  const published = await prisma.contentDocument.findUnique({
    where: { key: 'published' },
    select: { id: true, schemaVersion: true, updatedAt: true },
  });
  const mediaCount = await prisma.media.count();

  console.log(
    JSON.stringify(
      {
        ok: true,
        connected: true,
        latencyMs: Date.now() - started,
        serverTime: rows[0]?.now ?? null,
        published: published ?? null,
        mediaCount,
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
