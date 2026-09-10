import { Prisma, type PrismaClient } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import type { SessionActor } from '@/lib/auth';
import { actorUserId } from '@/lib/auth';

type Db = PrismaClient | Prisma.TransactionClient;

export async function writeAudit(
  db: Db,
  actor: SessionActor | null,
  data: {
    action: string;
    entity: string;
    entityId?: string | null;
    detail?: string | null;
    metadata?: Prisma.InputJsonValue;
  }
) {
  return db.auditLog.create({
    data: {
      userId: actor ? actorUserId(actor) : null,
      action: data.action,
      entity: data.entity,
      entityId: data.entityId ?? null,
      detail: data.detail ?? null,
      metadata: data.metadata,
    },
    select: { id: true, createdAt: true },
  });
}

export async function writeAuditStandalone(
  actor: SessionActor | null,
  data: {
    action: string;
    entity: string;
    entityId?: string | null;
    detail?: string | null;
    metadata?: Prisma.InputJsonValue;
  }
) {
  return writeAudit(prisma, actor, data);
}
