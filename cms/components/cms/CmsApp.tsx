'use client';

import { DraftProvider } from './DraftProvider';
import { Shell } from './Shell';
import { ToastProvider } from './Toast';

export function CmsApp({
  children,
  userName,
  roleLabel,
  canPublish,
  isAdmin,
}: {
  children: React.ReactNode;
  userName: string;
  roleLabel: string;
  canPublish: boolean;
  isAdmin: boolean;
}) {
  return (
    <ToastProvider>
      <DraftProvider>
        <Shell userName={userName} roleLabel={roleLabel} canPublish={canPublish} isAdmin={isAdmin}>
          {children}
        </Shell>
      </DraftProvider>
    </ToastProvider>
  );
}
