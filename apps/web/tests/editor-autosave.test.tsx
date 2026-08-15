import { createEmptyResumeContent } from '@cv-builder/resume-schema';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ResumeEditor } from '@/components/resume-editor';

const api = vi.hoisted(() => ({
  updateResume: vi.fn(),
  createResumeExport: vi.fn(),
  getLatestResumeExport: vi.fn(),
  getResumeExport: vi.fn(),
  downloadResumeExport: vi.fn(),
  getResumeImportSource: vi.fn(),
}));
const navigation = vi.hoisted(() => ({ push: vi.fn() }));
vi.mock('@/lib/resumes-api', () => api);
vi.mock('next/navigation', () => ({ useRouter: () => navigation }));
const resume = {
  id: '550e8400-e29b-41d4-a716-446655440000',
  title: 'My CV',
  template: 'classic' as const,
  content: createEmptyResumeContent(),
  createdAt: '2026-08-03T12:00:00.000Z',
  updatedAt: '2026-08-03T12:00:00.000Z',
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers();
  api.updateResume.mockResolvedValue(resume);
  api.getLatestResumeExport.mockResolvedValue(null);
  api.getResumeImportSource.mockResolvedValue(null);
});
afterEach(() => vi.useRealTimers());
describe('resume editor and autosave', () => {
  it('shows manual fallback text as a read-only escaped plain-text disclosure', async () => {
    api.getResumeImportSource.mockResolvedValue({
      importId: '550e8400-e29b-41d4-a716-446655440010',
      completionMode: 'MANUAL_FALLBACK',
      extractedText: '<script>window.syntheticAttack = true</script>\nSecond line',
    });
    render(<ResumeEditor initialResume={resume} />);
    await act(async () => {});
    expect(screen.getByText(/automatic mapping was unavailable/)).toBeInTheDocument();
    const source = screen.getByLabelText('Imported CV text');
    expect(source).toHaveTextContent('<script>window.syntheticAttack = true</script>');
    expect(source.querySelector('script')).toBeNull();
    expect(source).not.toHaveAttribute('contenteditable');
  });

  it('distinguishes AI mapping and keeps edits usable when source lookup fails', async () => {
    api.getResumeImportSource.mockResolvedValueOnce({
      importId: '550e8400-e29b-41d4-a716-446655440010',
      completionMode: 'AI_MAPPED',
      extractedText: null,
    });
    const { unmount } = render(<ResumeEditor initialResume={resume} />);
    await act(async () => {});
    expect(screen.getByText('Your CV was imported and mapped automatically.')).toBeInTheDocument();
    expect(screen.queryByText('Imported CV text')).not.toBeInTheDocument();
    unmount();

    api.getResumeImportSource.mockRejectedValueOnce(new Error('offline'));
    render(<ResumeEditor initialResume={resume} />);
    await act(async () => {});
    fireEvent.change(screen.getByLabelText('Summary'), {
      target: { value: 'Local edit survives' },
    });
    expect(screen.getByLabelText('Summary')).toHaveValue('Local edit survives');
    expect(screen.getByText(/continue editing/)).toBeInTheDocument();
  });

  it('switches templates immediately and persists through autosave', async () => {
    render(<ResumeEditor initialResume={resume} />);
    fireEvent.change(screen.getByLabelText('Resume template'), { target: { value: 'modern' } });
    expect(screen.getByLabelText('Live resume preview').innerHTML).toContain('template-modern');
    await act(async () => {
      await vi.advanceTimersByTimeAsync(700);
    });
    expect(api.updateResume).toHaveBeenCalledWith(
      resume.id,
      expect.objectContaining({ template: 'modern' }),
    );
  });
  it('updates preview immediately and saves once after the debounce', async () => {
    render(<ResumeEditor initialResume={resume} />);
    const name = screen.getByLabelText('Full name');
    fireEvent.change(name, { target: { value: 'Grace Hopper' } });
    fireEvent.change(name, { target: { value: 'Grace M. Hopper' } });
    expect(screen.getByLabelText('Live resume preview')).toHaveTextContent('Grace M. Hopper');
    expect(screen.getByRole('status')).toHaveTextContent('Unsaved changes');
    expect(api.updateResume).not.toHaveBeenCalled();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(700);
    });
    expect(api.updateResume).toHaveBeenCalledTimes(1);
    expect(api.updateResume.mock.calls[0]![1].content.personalInfo.fullName).toBe(
      'Grace M. Hopper',
    );
    expect(screen.getByRole('status')).toHaveTextContent('Saved');
  });
  it('adds, edits, reorders, and removes repeatable entries', () => {
    render(<ResumeEditor initialResume={resume} />);
    fireEvent.click(screen.getByRole('button', { name: 'Add skills' }));
    fireEvent.change(screen.getByLabelText('Skill'), { target: { value: 'TypeScript' } });
    expect(screen.getByLabelText('Live resume preview')).toHaveTextContent('TypeScript');
    fireEvent.click(screen.getByRole('button', { name: 'Remove skills' }));
    expect(screen.queryByLabelText('Skill')).not.toBeInTheDocument();
  });
  it('preserves failed local changes and allows retry', async () => {
    api.updateResume.mockRejectedValueOnce(new Error('offline')).mockResolvedValueOnce(resume);
    render(<ResumeEditor initialResume={resume} />);
    fireEvent.change(screen.getByLabelText('Summary'), {
      target: { value: 'Latest local summary' },
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(700);
    });
    expect(screen.getByRole('status')).toHaveTextContent('Save failed');
    expect(screen.getByLabelText('Summary')).toHaveValue('Latest local summary');
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
    await act(async () => {});
    expect(api.updateResume).toHaveBeenCalledTimes(2);
    expect(screen.getByRole('status')).toHaveTextContent('Saved');
  });
  it('saves the latest edit before returning to the dashboard', async () => {
    render(<ResumeEditor initialResume={resume} />);
    fireEvent.change(screen.getByLabelText('Summary'), {
      target: { value: 'Save before leaving' },
    });
    fireEvent.click(screen.getByRole('button', { name: '← Resumes' }));
    await act(async () => {});

    expect(api.updateResume).toHaveBeenCalledTimes(1);
    expect(api.updateResume.mock.calls[0]![1].content.summary).toBe('Save before leaving');
    expect(navigation.push).toHaveBeenCalledWith('/');
  });
  it('stays in the editor when the navigation save fails', async () => {
    api.updateResume.mockRejectedValueOnce(new Error('offline'));
    render(<ResumeEditor initialResume={resume} />);
    fireEvent.change(screen.getByLabelText('Summary'), { target: { value: 'Keep this locally' } });
    fireEvent.click(screen.getByRole('button', { name: '← Resumes' }));
    await act(async () => {});

    expect(navigation.push).not.toHaveBeenCalled();
    expect(screen.getByRole('status')).toHaveTextContent('Save failed');
    expect(screen.getByLabelText('Summary')).toHaveValue('Keep this locally');
  });
  it('retries the same latest state and then allows navigation', async () => {
    api.updateResume.mockRejectedValueOnce(new Error('offline')).mockResolvedValue(resume);
    render(<ResumeEditor initialResume={resume} />);
    fireEvent.change(screen.getByLabelText('Summary'), { target: { value: 'Retry this value' } });
    fireEvent.click(screen.getByRole('button', { name: '← Resumes' }));
    await act(async () => {});
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
    await act(async () => {});
    fireEvent.click(screen.getByRole('button', { name: '← Resumes' }));

    expect(api.updateResume).toHaveBeenCalledTimes(2);
    expect(api.updateResume.mock.calls[1]![1].content.summary).toBe('Retry this value');
    expect(navigation.push).toHaveBeenCalledWith('/');
  });
  it('shows canonical title validation and resumes autosave after it is fixed', async () => {
    render(<ResumeEditor initialResume={resume} />);
    fireEvent.change(screen.getByLabelText('Resume title'), { target: { value: '   ' } });
    expect(screen.getByRole('alert')).toHaveTextContent('Resume title: Title is required');
    await act(async () => {
      await vi.advanceTimersByTimeAsync(700);
    });
    expect(api.updateResume).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: '← Resumes' }));
    await act(async () => {});
    expect(navigation.push).not.toHaveBeenCalled();
    fireEvent.change(screen.getByLabelText('Resume title'), { target: { value: 'Valid title' } });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(700);
    });
    expect(api.updateResume).toHaveBeenCalledTimes(1);
    expect(api.updateResume.mock.calls[0]![1].title).toBe('Valid title');
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });
  it('queues a newer edit during an active save and never marks it saved early', async () => {
    let resolveFirst!: (value: typeof resume) => void;
    let resolveSecond!: (value: typeof resume) => void;
    api.updateResume
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            resolveFirst = resolve;
          }),
      )
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            resolveSecond = resolve;
          }),
      );
    render(<ResumeEditor initialResume={resume} />);
    fireEvent.change(screen.getByLabelText('Summary'), { target: { value: 'First version' } });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(700);
    });
    expect(screen.getByRole('status')).toHaveTextContent('Saving');

    fireEvent.change(screen.getByLabelText('Summary'), { target: { value: 'Newest version' } });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(700);
    });
    await act(async () => {
      resolveFirst(resume);
    });
    expect(api.updateResume).toHaveBeenCalledTimes(2);
    expect(api.updateResume.mock.calls[1]![1].content.summary).toBe('Newest version');
    expect(screen.getByRole('status')).not.toHaveTextContent('Saved');

    await act(async () => {
      resolveSecond(resume);
    });
    expect(screen.getByRole('status')).toHaveTextContent('Saved');
  });

  it('persists the exact newest render before exporting even while status was saved', async () => {
    let resolveSave!: (value: typeof resume) => void;
    api.updateResume.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveSave = resolve;
        }),
    );
    api.createResumeExport.mockResolvedValue({ status: 'QUEUED' });
    render(<ResumeEditor initialResume={resume} />);

    fireEvent.change(screen.getByLabelText('Resume title'), { target: { value: 'Newest title' } });
    fireEvent.change(screen.getByLabelText('Summary'), { target: { value: 'Newest content' } });
    fireEvent.change(screen.getByLabelText('Resume template'), { target: { value: 'modern' } });
    fireEvent.click(screen.getByRole('button', { name: 'Export PDF' }));

    expect(api.updateResume).toHaveBeenCalledTimes(1);
    expect(api.updateResume).toHaveBeenCalledWith(
      resume.id,
      expect.objectContaining({
        title: 'Newest title',
        template: 'modern',
        content: expect.objectContaining({ summary: 'Newest content' }),
      }),
    );
    expect(api.createResumeExport).not.toHaveBeenCalled();
    await act(async () => resolveSave(resume));
    expect(api.createResumeExport).toHaveBeenCalledWith(resume.id);
  });

  it('queues an explicit export snapshot behind an older in-flight save', async () => {
    let resolveOlder!: (value: typeof resume) => void;
    let resolveNewest!: (value: typeof resume) => void;
    api.updateResume
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            resolveOlder = resolve;
          }),
      )
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            resolveNewest = resolve;
          }),
      );
    api.createResumeExport.mockResolvedValue({ status: 'QUEUED' });
    render(<ResumeEditor initialResume={resume} />);
    fireEvent.change(screen.getByLabelText('Summary'), { target: { value: 'Older edit' } });
    await act(async () => vi.advanceTimersByTimeAsync(700));

    fireEvent.change(screen.getByLabelText('Summary'), { target: { value: 'Export this edit' } });
    fireEvent.click(screen.getByRole('button', { name: 'Export PDF' }));
    expect(api.updateResume).toHaveBeenCalledTimes(1);
    await act(async () => resolveOlder(resume));
    expect(api.updateResume).toHaveBeenCalledTimes(2);
    expect(api.updateResume.mock.calls[1]![1].content.summary).toBe('Export this edit');
    expect(api.createResumeExport).not.toHaveBeenCalled();
    await act(async () => resolveNewest(resume));
    expect(api.createResumeExport).toHaveBeenCalledWith(resume.id);
  });

  it('blocks export when the exact latest snapshot fails to save', async () => {
    api.updateResume.mockRejectedValueOnce(new Error('offline'));
    render(<ResumeEditor initialResume={resume} />);
    fireEvent.change(screen.getByLabelText('Resume title'), {
      target: { value: 'Unsaved export' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Export PDF' }));
    await act(async () => {});
    expect(api.createResumeExport).not.toHaveBeenCalled();
    expect(screen.getByRole('alert')).toHaveTextContent('Save the latest changes');
  });
});
