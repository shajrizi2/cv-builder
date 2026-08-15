'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { FormEvent, useState } from 'react';
import { authClient } from '@/lib/auth-client';

function safeReturnTo(value: string | null): string {
  return value?.startsWith('/') && !value.startsWith('//') ? value : '/';
}

export function AuthForm({ mode }: { mode: 'sign-in' | 'sign-up' }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setError('');
    const data = new FormData(event.currentTarget);
    const email = String(data.get('email') ?? '');
    const password = String(data.get('password') ?? '');
    const returnTo = safeReturnTo(searchParams.get('returnTo'));
    const result =
      mode === 'sign-up'
        ? await authClient.signUp.email({
            name: String(data.get('name') ?? ''),
            email,
            password,
          })
        : await authClient.signIn.email({ email, password });
    if (result.error) {
      setError('Authentication failed. Check your details and try again.');
      setPending(false);
      return;
    }
    router.replace(returnTo);
    router.refresh();
  }

  const signingUp = mode === 'sign-up';
  return (
    <form className="auth-form" onSubmit={(event) => void submit(event)}>
      {signingUp && (
        <label>
          Name
          <input name="name" required minLength={1} maxLength={100} autoComplete="name" />
        </label>
      )}
      <label>
        Email
        <input name="email" type="email" required autoComplete="email" />
      </label>
      <label>
        Password
        <input
          name="password"
          type="password"
          required
          minLength={8}
          autoComplete={signingUp ? 'new-password' : 'current-password'}
        />
      </label>
      {error && (
        <p className="error-banner" role="alert">
          {error}
        </p>
      )}
      <button disabled={pending}>
        {pending ? 'Please wait…' : signingUp ? 'Sign up' : 'Sign in'}
      </button>
    </form>
  );
}
