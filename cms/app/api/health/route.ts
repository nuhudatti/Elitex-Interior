import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function publicDbError(error: unknown): string {
  if (!(error instanceof Error)) return 'database_unreachable';
  const message = error.message.toLowerCase();
  if (message.includes('environment variable not found')) return 'missing_database_url';
  if (message.includes('can\'t reach') || message.includes('p1001')) return 'host_unreachable';
  if (message.includes('authentication') || message.includes('p1000')) return 'auth_failed';
  if (message.includes('does not exist') || message.includes('p2021')) return 'schema_missing';
  return 'database_unreachable';
}

export async function GET() {
  const started = Date.now();

  try {
    const engineRows = await prisma.$queryRaw<
      Array<{ version: string; neonTimeline: string | null }>
    >`
      SELECT version() AS version,
             current_setting('neon.timeline_id', true) AS "neonTimeline"
    `;
    const engine = engineRows[0];
    const neon = Boolean(engine?.neonTimeline);
    const postgresql = /^PostgreSQL/i.test(engine?.version || '');

    let published = null;
    let draft = null;
    let mediaCount = 0;
    let schemaReady = true;

    try {
      [published, draft, mediaCount] = await Promise.all([
        prisma.contentDocument.findUnique({
          where: { key: 'published' },
          select: { id: true, schemaVersion: true, updatedAt: true },
        }),
        prisma.contentDocument.findUnique({
          where: { key: 'draft' },
          select: { id: true, schemaVersion: true, updatedAt: true },
        }),
        prisma.media.count(),
      ]);
    } catch {
      schemaReady = false;
    }

    return NextResponse.json({
      ok: true,
      service: 'elitex-cms-api',
      phase: 1,
      db: {
        connected: true,
        latencyMs: Date.now() - started,
        engine: postgresql ? 'postgresql' : 'unknown',
        neon,
        schemaReady,
      },
      content: {
        published: published ?? null,
        draft: draft ?? null,
      },
      mediaCount,
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        service: 'elitex-cms-api',
        phase: 1,
        db: {
          connected: false,
          latencyMs: Date.now() - started,
          error: publicDbError(error),
        },
      },
      { status: 503 }
    );
  }
}
