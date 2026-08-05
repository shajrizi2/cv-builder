'use client';

import {
  updateResumeInputSchema,
  type ResumeContent,
  type UpdateResumeInput,
} from '@cv-builder/resume-schema';
import { useCallback, useEffect, useRef, useState } from 'react';
import { updateResume } from '@/lib/resumes-api';

export type SaveStatus = 'saved' | 'unsaved' | 'saving' | 'failed';
type PendingSave = { input: UpdateResumeInput; version: number };

export function useAutosave(id: string, title: string, content: ResumeContent, delay = 700) {
  const [status, setStatus] = useState<SaveStatus>('saved');
  const version = useRef(0);
  const pending = useRef<PendingSave | undefined>(undefined);
  const flushPromise = useRef<Promise<boolean> | undefined>(undefined);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const initialized = useRef(false);

  const flush = useCallback((): Promise<boolean> => {
    if (flushPromise.current !== undefined) return flushPromise.current;

    const run = async (): Promise<boolean> => {
      while (pending.current !== undefined) {
        const item = pending.current;
        pending.current = undefined;
        setStatus('saving');
        try {
          await updateResume(id, item.input);
        } catch {
          pending.current ??= item;
          setStatus('failed');
          return false;
        }
        setStatus(
          version.current === item.version && pending.current === undefined ? 'saved' : 'unsaved',
        );
      }
      return true;
    };

    const active = run().finally(() => {
      flushPromise.current = undefined;
    });
    flushPromise.current = active;
    return active;
  }, [id]);

  useEffect(() => {
    if (!initialized.current) {
      initialized.current = true;
      return;
    }
    version.current += 1;
    const changeVersion = version.current;
    setStatus('unsaved');
    clearTimeout(timer.current);
    pending.current = undefined;

    const parsed = updateResumeInputSchema.safeParse({ title, content });
    if (!parsed.success) return;

    timer.current = setTimeout(() => {
      pending.current = { input: parsed.data, version: changeVersion };
      void flush();
    }, delay);
    return () => clearTimeout(timer.current);
  }, [content, delay, flush, title]);

  const saveLatest = useCallback(async (): Promise<boolean> => {
    const parsed = updateResumeInputSchema.safeParse({ title, content });
    if (!parsed.success) {
      setStatus('unsaved');
      return false;
    }
    if (status === 'saved') return true;

    clearTimeout(timer.current);
    pending.current = { input: parsed.data, version: version.current };
    return flush();
  }, [content, flush, status, title]);

  useEffect(() => {
    if (status === 'saved') return;
    const warnBeforeUnload = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener('beforeunload', warnBeforeUnload);
    return () => window.removeEventListener('beforeunload', warnBeforeUnload);
  }, [status]);

  return { status, retry: saveLatest, saveLatest, isNavigationSafe: status === 'saved' };
}
