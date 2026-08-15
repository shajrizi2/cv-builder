'use client';

import { useEffect, useState } from 'react';
import { authClient } from '@/lib/auth-client';
import { clearApiAuthentication } from '@/lib/resumes-api';

export function AccountNavigation({ name, email }: { name: string; email: string }) {
  const [expired, setExpired] = useState(false);
  const [signingOut, setSigningOut] = useState(false);

  useEffect(() => {
    const handler = () => setExpired(true);
    window.addEventListener('cv-builder:auth-expired', handler);
    return () => window.removeEventListener('cv-builder:auth-expired', handler);
  }, []);

  async function signOut() {
    setSigningOut(true);
    await authClient.signOut();
    clearApiAuthentication();
    window.location.assign('/sign-in');
  }

  return (
    <>
      {expired && (
        <div className="session-banner" role="alert">
          Your session expired. Unsaved changes remain on this page.{' '}
          <a href="/sign-in">Sign in again</a> to continue.
        </div>
      )}
      <nav className="account-navigation" aria-label="Account">
        <span>
          {name} <small>{email}</small>
        </span>
        <button className="secondary" disabled={signingOut} onClick={() => void signOut()}>
          {signingOut ? 'Signing out…' : 'Sign out'}
        </button>
      </nav>
    </>
  );
}
