import Link from 'next/link';
import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { Suspense } from 'react';

import { AuthForm } from '@/components/auth-form';
import { auth } from '@/lib/auth';

export default async function SignUpPage() {
  if (await auth.api.getSession({ headers: await headers() })) redirect('/');
  return (
    <main className="auth-shell">
      <section className="auth-card">
        <p className="eyebrow">CV Builder</p>
        <h1>Create your account</h1>
        <p>Your resumes and generated documents are private to your account.</p>
        <Suspense fallback={<p role="status">Loading…</p>}>
          <AuthForm mode="sign-up" />
        </Suspense>
        <p>
          Already have an account? <Link href="/sign-in">Sign in</Link>
        </p>
      </section>
    </main>
  );
}
