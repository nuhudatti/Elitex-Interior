import { Suspense } from 'react';
import { LoginForm } from './login-form';

export default function LoginPage() {
  return (
    <div className="login-wrap">
      <div className="login-card">
        <div className="eyebrow">Elitex Interior</div>
        <h1>CMS sign in</h1>
        <p>Server-side session. Drafts stay private until you publish.</p>
        <Suspense fallback={<p className="hint">Loading…</p>}>
          <LoginForm />
        </Suspense>
      </div>
    </div>
  );
}
