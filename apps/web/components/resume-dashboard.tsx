'use client';

import type { Resume } from '@cv-builder/resume-schema';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { createResume, deleteResume, listResumes, updateResume } from '@/lib/resumes-api';

export function ResumeDashboard() {
  const [resumes, setResumes] = useState<Resume[]>([]);
  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading');
  const [error, setError] = useState('');

  async function load() {
    setError('');
    setState('loading');
    try {
      setResumes(await listResumes());
      setError('');
      setState('ready');
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Could not load resumes');
      setState('error');
    }
  }
  useEffect(() => {
    listResumes()
      .then((items) => {
        setResumes(items);
        setState('ready');
      })
      .catch((reason: unknown) => {
        setError(reason instanceof Error ? reason.message : 'Could not load resumes');
        setState('error');
      });
  }, []);

  async function create() {
    try {
      const resume = await createResume({ title: 'Untitled resume' });
      setError('');
      window.location.assign(`/resumes/${resume.id}`);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Could not create resume');
      setState('error');
    }
  }

  async function rename(resume: Resume) {
    const title = window.prompt('Resume title', resume.title)?.trim();
    if (!title || title === resume.title) return;
    try {
      const updated = await updateResume(resume.id, { title });
      setError('');
      setResumes((current) => current.map((item) => (item.id === updated.id ? updated : item)));
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Could not rename resume');
    }
  }

  async function remove(resume: Resume) {
    if (!window.confirm(`Delete “${resume.title}”? This cannot be undone.`)) return;
    try {
      await deleteResume(resume.id);
      setError('');
      setResumes((current) => current.filter(({ id }) => id !== resume.id));
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Could not delete resume');
    }
  }

  return (
    <main className="dashboard-shell">
      <header className="dashboard-header">
        <div>
          <p className="eyebrow">CV Builder</p>
          <h1>Your resumes</h1>
          <p>Create, edit, and return to your saved CVs.</p>
        </div>
        <button onClick={() => void create()}>Create resume</button>
      </header>
      {error && (
        <p className="error-banner" role="alert">
          {error}
        </p>
      )}
      {state === 'loading' && <p role="status">Loading resumes…</p>}
      {state === 'error' && (
        <button className="secondary" onClick={() => void load()}>
          Try again
        </button>
      )}
      {state === 'ready' && resumes.length === 0 && (
        <section className="empty-state">
          <h2>No resumes yet</h2>
          <p>Create your first resume to start building your CV.</p>
          <button onClick={() => void create()}>Create resume</button>
        </section>
      )}
      {state === 'ready' && resumes.length > 0 && (
        <ul className="resume-grid">
          {resumes.map((resume) => (
            <li key={resume.id} className="resume-card">
              <Link href={`/resumes/${resume.id}`}>
                <h2>{resume.title}</h2>
                <p>Updated {new Date(resume.updatedAt).toLocaleDateString()}</p>
              </Link>
              <div>
                <button className="secondary" onClick={() => void rename(resume)}>
                  Rename
                </button>
                <button className="danger" onClick={() => void remove(resume)}>
                  Delete
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
