import { createEmptyResumeContent } from '@cv-builder/resume-schema';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import HomePage from '@/app/page';

const api = vi.hoisted(() => ({
  listResumes: vi.fn(),
  createResume: vi.fn(),
  updateResume: vi.fn(),
  deleteResume: vi.fn(),
}));
vi.mock('@/lib/resumes-api', () => api);
const resume = {
  id: '550e8400-e29b-41d4-a716-446655440000',
  title: 'My CV',
  content: createEmptyResumeContent(),
  createdAt: '2026-08-03T12:00:00.000Z',
  updatedAt: '2026-08-03T12:00:00.000Z',
};

beforeEach(() => {
  vi.clearAllMocks();
  api.listResumes.mockResolvedValue([]);
});
describe('resume dashboard', () => {
  it('shows loading then the empty state', async () => {
    render(<HomePage />);
    expect(screen.getByRole('status')).toHaveTextContent('Loading resumes');
    expect(await screen.findByRole('heading', { name: 'No resumes yet' })).toBeInTheDocument();
  });
  it('renders saved resumes and renames and deletes them', async () => {
    api.listResumes.mockResolvedValue([resume]);
    api.updateResume.mockResolvedValue({ ...resume, title: 'Renamed' });
    api.deleteResume.mockResolvedValue(undefined);
    vi.spyOn(window, 'prompt').mockReturnValue('Renamed');
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    render(<HomePage />);
    expect(await screen.findByRole('heading', { name: 'My CV' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Rename' }));
    expect(await screen.findByRole('heading', { name: 'Renamed' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Delete' }));
    await waitFor(() =>
      expect(screen.queryByRole('heading', { name: 'Renamed' })).not.toBeInTheDocument(),
    );
  });
  it('shows an actionable load error and retry', async () => {
    api.listResumes.mockRejectedValueOnce(new Error('API unavailable')).mockResolvedValueOnce([]);
    render(<HomePage />);
    expect(await screen.findByRole('alert')).toHaveTextContent('API unavailable');
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(await screen.findByText('No resumes yet')).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });
});
