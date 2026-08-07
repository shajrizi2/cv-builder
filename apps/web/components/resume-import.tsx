'use client';
import { useEffect, useRef, useState } from 'react';
import type { ResumeImport } from '@cv-builder/resume-schema';
import { createResumeImport, getResumeImport, listResumeImports } from '@/lib/resumes-api';
const labels = {
  QUEUED: 'Queued',
  PROCESSING: 'Processing',
  COMPLETED: 'Imported',
  FAILED: 'Import failed',
} as const;
const defaultNavigate = (url: string): void => window.location.assign(url);
export function ResumeImportPanel({
  navigate = defaultNavigate,
}: {
  navigate?: (url: string) => void;
}) {
  const [items, setItems] = useState<ResumeImport[]>([]);
  const [activeIds, setActiveIds] = useState<string[]>([]);
  const [message, setMessage] = useState('');
  const input = useRef<HTMLInputElement>(null);
  const redirectEligibleIds = useRef(new Set<string>());
  const pollCounts = useRef(new Map<string, number>());

  useEffect(() => {
    let cancelled = false;
    void listResumeImports()
      .then((history) => {
        if (cancelled) return;
        setItems(history);
        const recovered = history.filter(
          (item) => item.status === 'QUEUED' || item.status === 'PROCESSING',
        );
        for (const item of recovered) redirectEligibleIds.current.add(item.id);
        setActiveIds(recovered.map((item) => item.id));
      })
      .catch(() => {
        if (!cancelled) setMessage('Could not recover resume imports');
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const pollableIds = activeIds.filter((id) => (pollCounts.current.get(id) ?? 0) < 120);
    if (pollableIds.length === 0) return;
    let cancelled = false;
    const timer = setTimeout(() => {
      void Promise.all(pollableIds.map((id) => getResumeImport(id)))
        .then((updated) => {
          if (cancelled) return;
          for (const id of pollableIds)
            pollCounts.current.set(id, (pollCounts.current.get(id) ?? 0) + 1);
          setItems((current) =>
            current.map((item) => updated.find((next) => next.id === item.id) ?? item),
          );
          const completed = updated.find(
            (item) =>
              item.status === 'COMPLETED' &&
              item.resumeId !== null &&
              redirectEligibleIds.current.has(item.id),
          );
          if (completed?.resumeId) {
            navigate(`/resumes/${completed.resumeId}`);
            return;
          }
          setActiveIds(
            updated
              .filter((item) => item.status === 'QUEUED' || item.status === 'PROCESSING')
              .map((item) => item.id),
          );
        })
        .catch(() => {
          if (cancelled) return;
          for (const id of pollableIds)
            pollCounts.current.set(id, (pollCounts.current.get(id) ?? 0) + 1);
          setActiveIds((current) => [...current]);
        });
    }, 1500);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [activeIds, navigate]);
  async function upload(file?: File) {
    if (!file) return;
    if (
      !['pdf', 'docx'].includes(file.name.split('.').pop()?.toLowerCase() ?? '') ||
      file.size === 0 ||
      file.size > 10 * 1024 * 1024
    ) {
      setMessage('Choose a non-empty PDF or DOCX file up to 10 MB.');
      return;
    }
    setMessage('Uploading');
    try {
      const created = await createResumeImport(file);
      setItems((x) => [created, ...x]);
      redirectEligibleIds.current.add(created.id);
      if (created.status === 'COMPLETED' && created.resumeId) {
        navigate(`/resumes/${created.resumeId}`);
      } else if (created.status === 'QUEUED' || created.status === 'PROCESSING') {
        setActiveIds((current) => [...new Set([...current, created.id])]);
      }
      setMessage('');
    } catch (e) {
      setMessage(e instanceof Error ? e.message : 'Import failed');
    } finally {
      if (input.current) input.current.value = '';
    }
  }
  return (
    <section className="import-panel">
      <h2>Import existing CV</h2>
      <p>PDF or DOCX, up to 10 MB. Scanned PDFs require selectable text.</p>
      <label className="file-action">
        Choose CV
        <input
          ref={input}
          type="file"
          accept=".pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
          onChange={(e) => void upload(e.target.files?.[0])}
        />
      </label>
      {message && <p role={message === 'Uploading' ? 'status' : 'alert'}>{message}</p>}
      <ul>
        {items.slice(0, 5).map((item) => (
          <li key={item.id}>
            <span>{item.originalFilename}</span> — <strong>{labels[item.status]}</strong>
            {item.status === 'FAILED' && item.errorMessage ? `: ${item.errorMessage}` : ''}
          </li>
        ))}
      </ul>
    </section>
  );
}
