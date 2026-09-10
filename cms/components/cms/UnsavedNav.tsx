'use client';

import { usePathname, useRouter } from 'next/navigation';
import { createContext, useCallback, useContext, useState } from 'react';
import { useDraft } from './DraftProvider';
import { useModalA11y } from './useModalA11y';

const NavContext = createContext<{ go: (href: string) => void } | null>(null);

function UnsavedDialog({
  busy,
  saving,
  onStay,
  onSave,
  onLeave,
}: {
  busy: boolean;
  saving: boolean;
  onStay: () => void;
  onSave: () => void;
  onLeave: () => void;
}) {
  const ref = useModalA11y(onStay);
  return (
    <div className="modal-backdrop" role="presentation">
      <div
        ref={ref}
        className="modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="unsaved-title"
        style={{ width: 'min(480px, 100%)' }}
      >
        <h2 id="unsaved-title">Unsaved changes</h2>
        <p className="hint" style={{ marginBottom: 18 }}>
          You have edits that have not been saved. Save them, leave without saving, or stay on this page.
        </p>
        <div className="row" style={{ justifyContent: 'flex-end' }}>
          <button className="btn" type="button" disabled={busy} onClick={onStay}>
            Stay
          </button>
          <button className="btn btn-primary" type="button" disabled={busy || saving} onClick={onSave}>
            {busy ? 'Saving…' : 'Save and continue'}
          </button>
          <button className="btn btn-danger" type="button" disabled={busy} onClick={onLeave}>
            Leave without saving
          </button>
        </div>
      </div>
    </div>
  );
}

export function UnsavedNavProvider({ children }: { children: React.ReactNode }) {
  const { dirty, saving, saveDraft } = useDraft();
  const pathname = usePathname();
  const router = useRouter();
  const [pending, setPending] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const go = useCallback(
    (href: string) => {
      if (dirty && href !== pathname) {
        setPending(href);
        return;
      }
      router.push(href);
    },
    [dirty, pathname, router]
  );

  return (
    <NavContext.Provider value={{ go }}>
      {children}
      {pending ? (
        <UnsavedDialog
          busy={busy}
          saving={saving}
          onStay={() => setPending(null)}
          onSave={async () => {
            setBusy(true);
            const ok = await saveDraft();
            setBusy(false);
            if (!ok) return;
            const href = pending;
            setPending(null);
            router.push(href);
          }}
          onLeave={() => {
            const href = pending;
            setPending(null);
            router.push(href);
          }}
        />
      ) : null}
    </NavContext.Provider>
  );
}

export function useUnsavedNav() {
  const ctx = useContext(NavContext);
  if (!ctx) throw new Error('useUnsavedNav must be used inside UnsavedNavProvider');
  return ctx;
}

export function CmsLink({
  href,
  className,
  children,
}: {
  href: string;
  className?: string;
  children: React.ReactNode;
}) {
  const { go } = useUnsavedNav();
  return (
    <a
      href={href}
      className={className}
      aria-current={className?.includes('active') ? 'page' : undefined}
      onClick={(event) => {
        event.preventDefault();
        go(href);
      }}
    >
      {children}
    </a>
  );
}
