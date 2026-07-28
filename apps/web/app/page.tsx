import { publicEnv } from '@/lib/env';

export default function HomePage() {
  return (
    <main className="mx-auto flex min-h-screen max-w-3xl items-center px-6 py-16">
      <section aria-labelledby="page-title" className="space-y-4">
        <p className="text-sm font-semibold uppercase tracking-wider text-slate-600">
          Frontend status
        </p>
        <h1 id="page-title" className="text-4xl font-bold tracking-tight text-slate-950">
          {publicEnv.NEXT_PUBLIC_APP_NAME}
        </h1>
        <p className="max-w-2xl text-lg leading-8 text-slate-700">
          A web application for creating clear, professional CVs.
        </p>
        <p role="status" className="font-medium text-emerald-700">
          The frontend application is running.
        </p>
      </section>
    </main>
  );
}
