import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ResumeExportPanel } from '@/components/resume-export';

const api = vi.hoisted(() => ({
  createResumeExport: vi.fn(),
  getLatestResumeExport: vi.fn(),
  getResumeExport: vi.fn(),
  downloadResumeExport: vi.fn(),
}));
vi.mock('@/lib/resumes-api', () => api);

const resumeId = '550e8400-e29b-41d4-a716-446655440030';
const exportRecord = (status: 'QUEUED' | 'PROCESSING' | 'COMPLETED' | 'FAILED') => ({
  id: '550e8400-e29b-41d4-a716-446655440031',
  resumeId,
  template: 'classic' as const,
  status,
  errorCode: status === 'FAILED' ? ('PDF_RENDER_FAILED' as const) : null,
  errorMessage: status === 'FAILED' ? 'PDF generation failed. Please try again.' : null,
  fileSize: status === 'COMPLETED' ? 100 : null,
  createdAt: '2026-08-10T10:00:00.000Z',
  updatedAt: '2026-08-10T10:00:00.000Z',
});

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers();
  api.getLatestResumeExport.mockResolvedValue(null);
  api.createResumeExport.mockResolvedValue(exportRecord('QUEUED'));
});
afterEach(() => vi.useRealTimers());

describe('ResumeExportPanel', () => {
  it('waits for the newest save before creating an export', async () => {
    let finishSave!: (value: boolean) => void;
    const saveLatest = vi.fn(
      () =>
        new Promise<boolean>((resolve) => {
          finishSave = resolve;
        }),
    );
    render(<ResumeExportPanel resumeId={resumeId} saveLatest={saveLatest} />);
    fireEvent.click(screen.getByRole('button', { name: 'Export PDF' }));
    expect(screen.getByRole('button')).toHaveTextContent('Saving latest changes');
    expect(api.createResumeExport).not.toHaveBeenCalled();
    await act(async () => {
      finishSave(true);
    });
    expect(api.createResumeExport).toHaveBeenCalledWith(resumeId);
  });

  it('aborts export when saving fails', async () => {
    render(<ResumeExportPanel resumeId={resumeId} saveLatest={vi.fn().mockResolvedValue(false)} />);
    fireEvent.click(screen.getByRole('button', { name: 'Export PDF' }));
    await act(async () => {});
    expect(api.createResumeExport).not.toHaveBeenCalled();
    expect(screen.getByRole('alert')).toHaveTextContent('Save the latest changes');
  });

  it('guards duplicate clicks and recovers queued work through completion', async () => {
    let finishSave!: (value: boolean) => void;
    const saveLatest = vi.fn(
      () =>
        new Promise<boolean>((resolve) => {
          finishSave = resolve;
        }),
    );
    api.getResumeExport.mockResolvedValue(exportRecord('COMPLETED'));
    render(<ResumeExportPanel resumeId={resumeId} saveLatest={saveLatest} />);
    const button = screen.getByRole('button', { name: 'Export PDF' });
    fireEvent.click(button);
    fireEvent.click(button);
    expect(saveLatest).toHaveBeenCalledTimes(1);
    await act(async () => {
      finishSave(true);
    });
    expect(api.createResumeExport).toHaveBeenCalledTimes(1);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1500);
    });
    fireEvent.click(screen.getByRole('button', { name: 'Download PDF' }));
    expect(api.downloadResumeExport).toHaveBeenCalledWith(exportRecord('COMPLETED').id);
  });

  it('recovers an active export after refresh and allows retry after failure', async () => {
    api.getLatestResumeExport.mockResolvedValue(exportRecord('PROCESSING'));
    api.getResumeExport.mockResolvedValue(exportRecord('FAILED'));
    const saveLatest = vi.fn().mockResolvedValue(true);
    render(<ResumeExportPanel resumeId={resumeId} saveLatest={saveLatest} />);
    await act(async () => {});
    expect(screen.getByRole('status')).toHaveTextContent('Generating PDF');
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1500);
    });
    expect(screen.getByRole('alert')).toHaveTextContent('PDF generation failed');
    fireEvent.click(screen.getByRole('button', { name: 'Export PDF' }));
    await act(async () => {});
    expect(api.createResumeExport).toHaveBeenCalledOnce();
  });
});
