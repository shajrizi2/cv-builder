'use client';

import type { Resume } from '@cv-builder/resume-schema';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { getResume } from '@/lib/resumes-api';
import { ResumeEditor } from './resume-editor';

export function ResumeWorkspace({ id }: { id: string }) {
  const [resume, setResume] = useState<Resume>();
  const [error, setError] = useState('');
  useEffect(() => {
    getResume(id)
      .then(setResume)
      .catch((reason: unknown) =>
        setError(reason instanceof Error ? reason.message : 'Could not load resume'),
      );
  }, [id]);
  if (error)
    return (
      <main className="dashboard-shell">
        <p className="error-banner" role="alert">
          {error}
        </p>
        <Link href="/">Return to resumes</Link>
      </main>
    );
  if (!resume)
    return (
      <main className="dashboard-shell">
        <p role="status">Loading resume…</p>
      </main>
    );
  return <ResumeEditor initialResume={resume} />;
}
