import Link from 'next/link';
import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { Suspense } from 'react';

import { AuthForm } from '@/components/auth-form';
import { auth } from '@/lib/auth';

export default async function SignInPage() {
  if (await auth.api.getSession({ headers: await headers() })) redirect('/');
  return (
    <main className="auth-shell">
      <section className="auth-card">
        <p className="eyebrow">CV Builder</p>
        <h1>Sign in</h1>
        <p>Access your private resumes, imports, and PDF exports.</p>
        <Suspense fallback={<p role="status">Loading…</p>}>
          <AuthForm mode="sign-in" />
        </Suspense>
        <p>
          New here? <Link href="/sign-up">Create an account</Link>
        </p>
      </section>
    </main>
  );
}
