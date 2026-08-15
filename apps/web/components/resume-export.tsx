'use client';

import type { ResumeExport } from '@cv-builder/resume-schema';
import { useEffect, useRef, useState } from 'react';
import {
  createResumeExport,
  getLatestResumeExport,
  getResumeExport,
  downloadResumeExport,
} from '@/lib/resumes-api';

const POLL_MS = 1500;
const MAX_POLLS = 120;

export function ResumeExportPanel({
  resumeId,
  saveLatest,
}: {
  resumeId: string;
  saveLatest: () => Promise<boolean>;
}) {
  const [item, setItem] = useState<ResumeExport | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const creating = useRef(false);
  const activeExportId =
    item?.status === 'QUEUED' || item?.status === 'PROCESSING' ? item.id : undefined;

  useEffect(() => {
    let cancelled = false;
    void getLatestResumeExport(resumeId)
      .then((value) => {
        if (!cancelled) setItem(value);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [resumeId]);

  useEffect(() => {
    if (!activeExportId) return;
    let cancelled = false;
    let polls = 0;
    const timer = setInterval(() => {
      if (cancelled || polls >= MAX_POLLS) {
        clearInterval(timer);
        return;
      }
      polls += 1;
      void getResumeExport(activeExportId)
        .then((next) => {
          if (!cancelled) setItem(next);
          if (next.status === 'COMPLETED' || next.status === 'FAILED') clearInterval(timer);
        })
        .catch(() => undefined);
    }, POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [activeExportId]);

  async function startExport() {
    if (creating.current) return;
    creating.current = true;
    setSaving(true);
    setError('');
    try {
      if (!(await saveLatest())) {
        setError('Save the latest changes before exporting.');
        return;
      }
      setItem(await createResumeExport(resumeId));
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Could not start PDF export');
    } finally {
      setSaving(false);
      creating.current = false;
    }
  }

  async function download() {
    if (!item) return;
    setError('');
    try {
      await downloadResumeExport(item.id);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Could not download PDF');
    }
  }

  const active = item?.status === 'QUEUED' || item?.status === 'PROCESSING';
  return (
    <section className="export-panel" aria-label="PDF export">
      <button disabled={saving || active} onClick={() => void startExport()}>
        {saving ? 'Saving latest changes' : active ? 'Generating PDF' : 'Export PDF'}
      </button>
      {item?.status === 'QUEUED' && <p role="status">Queued</p>}
      {item?.status === 'PROCESSING' && <p role="status">Generating PDF</p>}
      {item?.status === 'COMPLETED' && (
        <button className="secondary" onClick={() => void download()}>
          Download PDF
        </button>
      )}
      {item?.status === 'FAILED' && (
        <p className="error-banner" role="alert">
          {item.errorMessage || 'PDF export failed. Please try again.'}
        </p>
      )}
      {error && (
        <p className="error-banner" role="alert">
          {error}
        </p>
      )}
    </section>
  );
}
