import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

export default async function DashboardPage() {
  const [published, draft, mediaCount, versions, users] = await Promise.all([
    prisma.contentDocument.findUnique({
      where: { key: 'published' },
      select: { updatedAt: true },
    }),
    prisma.contentDocument.findUnique({
      where: { key: 'draft' },
      select: { updatedAt: true },
    }),
    prisma.media.count(),
    prisma.contentVersion.count(),
    prisma.user.count(),
  ]);

  const unpublished = Boolean(
    draft && published && draft.updatedAt.getTime() !== published.updatedAt.getTime()
  );

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Dashboard</h1>
          <p>Neon is the source of truth. Save draft never publishes. Cloudinary holds files only.</p>
        </div>
      </div>
      {unpublished ? (
        <div className="banner">Draft is newer than published. Review and publish when ready.</div>
      ) : null}
      <div className="grid cols-4">
        <div className="card stat">
          <div className="num">{mediaCount}</div>
          <div className="lbl">Media records</div>
        </div>
        <div className="card stat">
          <div className="num">{versions}</div>
          <div className="lbl">Content versions</div>
        </div>
        <div className="card stat">
          <div className="num">{users}</div>
          <div className="lbl">Users</div>
        </div>
        <div className="card stat">
          <div className="num">{unpublished ? 'Draft' : 'Live'}</div>
          <div className="lbl">Working state</div>
        </div>
      </div>
      <div className="card">
        <p className="hint">Published updated {published?.updatedAt.toISOString() || '—'}</p>
        <p className="hint">Draft updated {draft?.updatedAt.toISOString() || '—'}</p>
      </div>
    </>
  );
}
