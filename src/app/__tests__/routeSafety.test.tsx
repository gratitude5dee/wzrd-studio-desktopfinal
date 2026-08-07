import { render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';

import AuthenticatedRoutes from '@/app/AuthenticatedRoutes';

vi.mock('thirdweb/react', () => ({
  ThirdwebProvider: ({ children }: { children?: ReactNode }) => <>{children}</>,
}));
vi.mock('@/providers/AuthProvider', () => ({
  AuthProvider: ({ children }: { children?: ReactNode }) => <>{children}</>,
  useAuth: () => ({ user: { id: 'u1' }, loading: false }),
}));
vi.mock('@/components/ProtectedRoute', () => ({
  default: ({ children }: { children?: ReactNode }) => <>{children}</>,
}));
vi.mock('@/components/ProjectAccessGate', () => ({
  default: ({ children }: { children?: ReactNode }) => <>{children}</>,
}));
vi.mock('@/voice/VoiceAgentProvider', () => ({
  VoiceAgentProvider: ({ children }: { children?: ReactNode }) => <>{children}</>,
}));
vi.mock('@/components/CustomCursor', () => ({ default: () => null }));
vi.mock('@/components/ui/toaster', () => ({ Toaster: () => null }));
vi.mock('@/components/ui/sonner', () => ({ Toaster: () => null }));
vi.mock('@/components/billing/InsufficientCreditsDialog', () => ({
  InsufficientCreditsDialog: () => null,
}));
vi.mock('@/legacy-pages/SettingsPage', () => ({
  default: () => <div>settings landing</div>,
}));
vi.mock('@/legacy-pages/IPVault', () => ({
  default: () => <div>ip vault</div>,
}));

function LocationProbe() {
  return <span data-testid="location-path">{useLocation().pathname}</span>;
}

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <AuthenticatedRoutes />
      <LocationProbe />
    </MemoryRouter>,
  );
}

describe('route safety', () => {
  it('resolves /settings to the settings landing', async () => {
    renderAt('/settings');

    expect(await screen.findByText('settings landing')).toBeInTheDocument();
    expect(screen.getByTestId('location-path')).toHaveTextContent('/settings');
  });

  it('redirects the legacy Asset Store path to IP Vault', async () => {
    renderAt('/assets');

    expect(await screen.findByText('ip vault')).toBeInTheDocument();
    expect(screen.getByTestId('location-path')).toHaveTextContent('/ip-vault');
  });

  it('keeps the legacy /clip-studio and /IPVault redirects intact', async () => {
    const clipStudio = renderAt('/clip-studio');
    expect(clipStudio.getByTestId('location-path')).toHaveTextContent('/clipper');
    clipStudio.unmount();

    renderAt('/IPVault');
    expect(await screen.findByText('ip vault')).toBeInTheDocument();
    expect(screen.getByTestId('location-path')).toHaveTextContent('/ip-vault');
  });
});
