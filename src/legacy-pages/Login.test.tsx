import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import Login from './Login';

const mocks = vi.hoisted(() => ({
  useAuth: vi.fn(),
  authenticateWallet: vi.fn(),
  getThirdwebClient: vi.fn(),
  createThirdwebWallets: vi.fn(),
}));

vi.mock('@/providers/AuthProvider', () => ({
  useAuth: () => mocks.useAuth(),
}));

vi.mock('@/lib/thirdweb/client', () => ({
  getThirdwebClient: mocks.getThirdwebClient,
}));

vi.mock('@/lib/thirdweb/wallets', () => ({
  createThirdwebWallets: mocks.createThirdwebWallets,
}));

vi.mock('@/lib/thirdweb/theme', () => ({
  wzrdTheme: {},
}));

vi.mock('thirdweb/react', () => ({
  ConnectEmbed: ({ header }: { header?: { title?: string } }) => (
    <div data-testid="connect-embed">{header?.title ?? 'thirdweb sign-in'}</div>
  ),
}));

vi.mock('@/components/ui/animated-logo', () => ({
  AnimatedLogo: () => <div data-testid="animated-logo">WZRD</div>,
}));

vi.mock('@/components/ui/LoadingSpinner', () => ({
  LoadingSpinner: () => <div role="status">Loading</div>,
}));

function renderLogin(initialEntry = '/login') {
  return render(
    <MemoryRouter initialEntries={[initialEntry]}>
      <Routes>
        <Route path="/login" element={<Login />} />
      </Routes>
    </MemoryRouter>,
  );
}

function mockAuth(overrides: Partial<ReturnType<typeof baseAuth>> = {}) {
  mocks.authenticateWallet.mockResolvedValue(false);
  mocks.useAuth.mockReturnValue({
    ...baseAuth(),
    ...overrides,
  });
}

function baseAuth() {
  return {
    user: null,
    authenticateWallet: mocks.authenticateWallet,
    isWalletAuthenticating: false,
    walletAuthError: null,
  };
}

describe('Login', () => {
  beforeEach(() => {
    mocks.getThirdwebClient.mockResolvedValue({});
    mocks.createThirdwebWallets.mockReturnValue([]);
    mockAuth();
  });

  it('uses thirdweb as the primary sign-in surface', async () => {
    renderLogin();

    expect(await screen.findByTestId('connect-embed')).toBeInTheDocument();
    expect(screen.getByText('Sign in with thirdweb')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /continue with google/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /email link/i })).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/email address/i)).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /wallet sign-in/i })).not.toBeInTheDocument();
    expect(screen.queryByText(/magic link sent/i)).not.toBeInTheDocument();
  });

  it('keeps thirdweb options visible when the Supabase session bridge fails', async () => {
    mockAuth({
      walletAuthError: 'Wallet sign-in could not be completed.',
    });

    renderLogin();

    expect(await screen.findByTestId('connect-embed')).toBeInTheDocument();
    expect(await screen.findByText('Wallet sign-in could not be completed.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /retry sign-in/i })).toBeInTheDocument();
  });

  it('allows session bridge retry without hiding thirdweb sign-in', async () => {
    mockAuth({
      walletAuthError: 'Wallet sign-in could not be completed.',
    });

    renderLogin();

    await userEvent.click(await screen.findByRole('button', { name: /retry sign-in/i }));

    expect(mocks.authenticateWallet).toHaveBeenCalledTimes(1);
    expect(await screen.findByTestId('connect-embed')).toBeInTheDocument();
  });

  it('shows a thirdweb-specific provider setup error', async () => {
    renderLogin('/login?error=validation_failed&error_description=Unsupported%20provider%3A%20provider%20is%20not%20enabled');

    expect(await screen.findByText(/this thirdweb sign-in method is not enabled yet/i)).toBeInTheDocument();
    expect(await screen.findByTestId('connect-embed')).toBeInTheDocument();
  });
});
