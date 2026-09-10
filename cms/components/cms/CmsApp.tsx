'use client';

import { DraftProvider } from './DraftProvider';
import { Shell } from './Shell';
import { ToastProvider } from './Toast';
import { UnsavedNavProvider } from './UnsavedNav';

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
        <UnsavedNavProvider>
          <Shell userName={userName} roleLabel={roleLabel} canPublish={canPublish} isAdmin={isAdmin}>
            {children}
          </Shell>
        </UnsavedNavProvider>
      </DraftProvider>
    </ToastProvider>
  );
}
