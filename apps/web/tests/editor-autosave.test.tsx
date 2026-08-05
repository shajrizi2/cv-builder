import { createEmptyResumeContent } from '@cv-builder/resume-schema';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ResumeEditor } from '@/components/resume-editor';

const api = vi.hoisted(() => ({ updateResume: vi.fn() }));
const navigation = vi.hoisted(() => ({ push: vi.fn() }));
vi.mock('@/lib/resumes-api', () => api);
vi.mock('next/navigation', () => ({ useRouter: () => navigation }));
const resume = {
  id: '550e8400-e29b-41d4-a716-446655440000',
  title: 'My CV',
  content: createEmptyResumeContent(),
  createdAt: '2026-08-03T12:00:00.000Z',
  updatedAt: '2026-08-03T12:00:00.000Z',
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers();
  api.updateResume.mockResolvedValue(resume);
});
afterEach(() => vi.useRealTimers());
describe('resume editor and autosave', () => {
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
});
