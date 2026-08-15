import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ResumeImportPanel } from '@/components/resume-import';
const api = vi.hoisted(() => ({
  createResumeImport: vi.fn(),
  listResumeImports: vi.fn(),
  getResumeImport: vi.fn(),
}));
vi.mock('@/lib/resumes-api', () => api);
const base = {
  id: '550e8400-e29b-41d4-a716-446655440000',
  originalFilename: 'cv.pdf',
  mimeType: 'application/pdf',
  fileSize: 8,
  status: 'QUEUED',
  completionMode: null,
  hasExtractedText: false,
  errorCode: null,
  errorMessage: null,
  resumeId: null,
  createdAt: '2026-08-05T12:00:00.000Z',
  updatedAt: '2026-08-05T12:00:00.000Z',
} as const;
const processing = { ...base, status: 'PROCESSING' as const };
const completed = {
  ...base,
  status: 'COMPLETED' as const,
  resumeId: '550e8400-e29b-41d4-a716-446655440001',
  completionMode: 'AI_MAPPED' as const,
};
const failed = {
  ...base,
  id: '550e8400-e29b-41d4-a716-446655440002',
  status: 'FAILED' as const,
  errorCode: 'PROCESSING_FAILED' as const,
  errorMessage: 'Failed',
};
beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers();
  api.listResumeImports.mockResolvedValue([]);
  api.createResumeImport.mockResolvedValue(base);
});
afterEach(() => vi.useRealTimers());
async function settle() {
  await act(async () => {});
}
async function poll() {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(1500);
  });
}
describe('resume import dashboard', () => {
  it('shows historical terminal imports without polling or redirecting', async () => {
    api.listResumeImports.mockResolvedValue([completed, failed]);
    const navigate = vi.fn();
    render(<ResumeImportPanel navigate={navigate} />);
    await settle();
    await poll();
    expect(navigate).not.toHaveBeenCalled();
    expect(api.getResumeImport).not.toHaveBeenCalled();
    expect(screen.getByText('Imported automatically')).toBeInTheDocument();
    expect(screen.getByText('Import failed')).toBeInTheDocument();
  });
  it('redirects when a recovered active import later completes and stops polling', async () => {
    api.listResumeImports.mockResolvedValue([processing]);
    api.getResumeImport.mockResolvedValue(completed);
    const navigate = vi.fn();
    render(<ResumeImportPanel navigate={navigate} />);
    await settle();
    await poll();
    expect(navigate).toHaveBeenCalledWith(`/resumes/${completed.resumeId}`);
    const calls = api.getResumeImport.mock.calls.length;
    await poll();
    expect(api.getResumeImport).toHaveBeenCalledTimes(calls);
  });
  it('redirects when a newly uploaded import completes', async () => {
    api.getResumeImport.mockResolvedValue(completed);
    const navigate = vi.fn();
    render(<ResumeImportPanel navigate={navigate} />);
    await settle();
    fireEvent.change(screen.getByLabelText('Choose CV'), {
      target: { files: [new File(['%PDF-1.7'], 'cv.pdf', { type: 'application/pdf' })] },
    });
    await settle();
    await poll();
    expect(navigate).toHaveBeenCalledWith(`/resumes/${completed.resumeId}`);
  });
  it('stops polling when an active import fails', async () => {
    api.listResumeImports.mockResolvedValue([processing]);
    api.getResumeImport.mockResolvedValue(failed);
    render(<ResumeImportPanel navigate={vi.fn()} />);
    await settle();
    await poll();
    const calls = api.getResumeImport.mock.calls.length;
    await poll();
    expect(api.getResumeImport).toHaveBeenCalledTimes(calls);
  });
  it('validates empty files before upload', async () => {
    render(<ResumeImportPanel navigate={vi.fn()} />);
    fireEvent.change(screen.getByLabelText('Choose CV'), {
      target: { files: [new File([], 'empty.pdf', { type: 'application/pdf' })] },
    });
    expect(screen.getByRole('alert')).toHaveTextContent('non-empty PDF or DOCX');
    expect(api.createResumeImport).not.toHaveBeenCalled();
  });
});
