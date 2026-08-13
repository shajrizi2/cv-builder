import { createEmptyResumeContent } from '@cv-builder/resume-schema';
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { ResumePreview } from '@/components/resume-preview';

describe('ResumePreview', () => {
  it('renders complete content and hides invisible sections', () => {
    const content = createEmptyResumeContent();
    content.personalInfo.fullName = 'Ada Lovelace';
    content.summary = 'Computing pioneer';
    content.skills = [{ id: crypto.randomUUID(), name: 'Mathematics', level: 'Expert' }];
    content.languages = [{ id: crypto.randomUUID(), name: 'English', proficiency: 'Fluent' }];
    content.links = [{ id: crypto.randomUUID(), label: 'Portfolio', url: 'https://example.com' }];
    content.sectionVisibility.skills = false;
    render(<ResumePreview content={content} template="classic" />);
    expect(screen.getByText('Ada Lovelace')).toBeInTheDocument();
    expect(screen.getByText('Computing pioneer')).toBeInTheDocument();
    expect(screen.getByText(/English/)).toBeInTheDocument();
    expect(screen.getByText(/Portfolio/)).toBeInTheDocument();
    expect(screen.queryByText(/Mathematics/)).not.toBeInTheDocument();
  });
  it('keeps partial content understandable and hides empty optional sections', () => {
    render(<ResumePreview content={createEmptyResumeContent()} template="classic" />);
    expect(screen.getByText('Your name')).toBeInTheDocument();
    expect(screen.queryByText('Profile')).not.toBeInTheDocument();
  });
});
