import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { AuthForm } from '@/components/auth-form';
import { parseAuthEnvironment } from '@/lib/auth-env';

const client = vi.hoisted(() => ({
  signIn: { email: vi.fn() },
  signUp: { email: vi.fn() },
}));
const navigation = vi.hoisted(() => ({ replace: vi.fn(), refresh: vi.fn() }));
const returnTo = vi.hoisted(() => ({ value: '/resumes/synthetic' }));

vi.mock('@/lib/auth-client', () => ({ authClient: client }));
vi.mock('next/navigation', () => ({
  useRouter: () => navigation,
  useSearchParams: () => new URLSearchParams({ returnTo: returnTo.value }),
}));

beforeEach(() => {
  vi.clearAllMocks();
  returnTo.value = '/resumes/synthetic';
  client.signIn.email.mockResolvedValue({ data: {}, error: null });
  client.signUp.email.mockResolvedValue({ data: {}, error: null });
});

describe('authentication UI and configuration', () => {
  it('requires server-only production authentication configuration', () => {
    expect(() => parseAuthEnvironment({ NODE_ENV: 'production' })).toThrow(
      'Invalid server auth environment',
    );
    expect(
      parseAuthEnvironment({
        NODE_ENV: 'production',
        DATABASE_URL: 'postgresql://synthetic:synthetic@db:5432/synthetic',
        BETTER_AUTH_SECRET: 'synthetic-production-secret-at-least-32-characters',
        BETTER_AUTH_URL: 'https://cv.synthetic.example',
        BETTER_AUTH_TRUSTED_ORIGINS: 'https://cv.synthetic.example',
        API_JWT_ISSUER: 'https://cv.synthetic.example',
        API_JWT_AUDIENCE: 'cv-builder-api',
      }).secret,
    ).toBe('synthetic-production-secret-at-least-32-characters');
  });

  it('signs in and follows only a local return path', async () => {
    render(<AuthForm mode="sign-in" />);
    fireEvent.change(screen.getByLabelText('Email'), {
      target: { value: 'user-a@synthetic.example' },
    });
    fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'Synthetic123!' } });
    fireEvent.click(screen.getByRole('button', { name: 'Sign in' }));
    await waitFor(() => expect(client.signIn.email).toHaveBeenCalledOnce());
    expect(navigation.replace).toHaveBeenCalledWith('/resumes/synthetic');
  });

  it('signs up with name and uses a generic failure message', async () => {
    client.signUp.email.mockResolvedValue({ data: null, error: { message: 'email exists' } });
    render(<AuthForm mode="sign-up" />);
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Synthetic User' } });
    fireEvent.change(screen.getByLabelText('Email'), {
      target: { value: 'user-a@synthetic.example' },
    });
    fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'Synthetic123!' } });
    fireEvent.click(screen.getByRole('button', { name: 'Sign up' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Authentication failed');
    expect(screen.getByRole('alert')).not.toHaveTextContent('email exists');
    expect(client.signUp.email).toHaveBeenCalledWith({
      name: 'Synthetic User',
      email: 'user-a@synthetic.example',
      password: 'Synthetic123!',
    });
  });

  it('rejects an external return path', async () => {
    returnTo.value = '//malicious.example';
    render(<AuthForm mode="sign-in" />);
    fireEvent.change(screen.getByLabelText('Email'), {
      target: { value: 'user-a@synthetic.example' },
    });
    fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'Synthetic123!' } });
    fireEvent.click(screen.getByRole('button', { name: 'Sign in' }));
    await waitFor(() => expect(navigation.replace).toHaveBeenCalledWith('/'));
  });
});
