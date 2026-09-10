import { Suspense } from 'react';
import { LoginForm } from './login-form';

export default function LoginPage() {
  return (
    <div className="login-wrap">
      <div className="login-card">
        <div className="eyebrow">Elitex Interior</div>
        <h1>CMS sign in</h1>
        <p>Enter the email and password for this CMS. Your session stays on the server.</p>
        <Suspense fallback={<p className="hint">Loading…</p>}>
          <LoginForm />
        </Suspense>
      </div>
    </div>
  );
}
