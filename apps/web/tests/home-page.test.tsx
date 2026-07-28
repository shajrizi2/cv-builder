import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import HomePage from '@/app/page';

describe('HomePage', () => {
  it('renders the minimal frontend status content', () => {
    render(<HomePage />);

    expect(screen.getByRole('heading', { level: 1, name: 'CV Builder' })).toBeInTheDocument();
    expect(
      screen.getByText('A web application for creating clear, professional CVs.'),
    ).toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent('The frontend application is running.');
  });
});
