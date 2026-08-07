import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { Sidebar } from '@/components/home/Sidebar';
import { MobileSidebarDrawer } from '@/components/home/MobileSidebarDrawer';
import { SidebarProvider } from '@/contexts/SidebarContext';

vi.mock('@/providers/AuthProvider', () => ({
  useAuth: () => ({
    user: { email: 'creator@example.com' },
  }),
}));

vi.mock('@/hooks/useCredits', () => ({
  useCredits: () => ({
    availableCredits: 100,
    isLoading: false,
  }),
}));

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    auth: {
      signOut: vi.fn(),
    },
  },
}));

vi.mock('sonner', () => ({
  toast: {
    error: vi.fn(),
    success: vi.fn(),
  },
}));

function LocationProbe() {
  const location = useLocation();
  return <span data-testid="location-path">{location.pathname}</span>;
}

function renderDesktopSidebar() {
  return render(
    <MemoryRouter initialEntries={['/home']}>
      <SidebarProvider>
        <Sidebar activeView="all" onViewChange={vi.fn()} />
        <LocationProbe />
      </SidebarProvider>
    </MemoryRouter>,
  );
}

function renderMobileDrawer() {
  return render(
    <MemoryRouter initialEntries={['/home']}>
      <MobileSidebarDrawer
        activeView="all"
        isOpen
        onClose={vi.fn()}
        onViewChange={vi.fn()}
      />
      <LocationProbe />
    </MemoryRouter>,
  );
}

const TOP_LEVEL_NAV_LABELS = [
  'Studio',
  'Kanvas',
  'IP Management',
  'Clip Studio',
  'Settings',
];

const toggle = (label: string) => screen.getByRole('button', { name: `Toggle ${label} section` });

const STUDIO_CHILD_LABELS = [
  'All Projects',
  'Shared with me',
  'Community',
  'Favorites',
  'Aura',
];

function getNavLabels(labels: string[]) {
  return screen
    .getAllByRole('button')
    .map((button) => button.getAttribute('aria-label') ?? button.textContent?.trim() ?? '')
    .filter((label) => labels.includes(label));
}

describe('home navigation structure', () => {
  beforeEach(() => {
    localStorage.clear();
    const observer = vi.fn(() => ({
      observe: vi.fn(),
      unobserve: vi.fn(),
      disconnect: vi.fn(),
      takeRecords: vi.fn(() => []),
    }));
    Object.defineProperty(window, 'IntersectionObserver', {
      writable: true,
      value: observer,
    });
    Object.defineProperty(globalThis, 'IntersectionObserver', {
      writable: true,
      value: observer,
    });
  });

  it('renders exactly the five root groups', () => {
    renderDesktopSidebar();

    expect(getNavLabels(TOP_LEVEL_NAV_LABELS)).toEqual(TOP_LEVEL_NAV_LABELS);
    expect(screen.getAllByRole('button', { name: /^Toggle .* section$/ })).toHaveLength(
      TOP_LEVEL_NAV_LABELS.length,
    );
    // Studio owns the active 'all' view, so its subtabs are expanded by default.
    expect(getNavLabels(STUDIO_CHILD_LABELS)).toEqual(STUDIO_CHILD_LABELS);
    expect(screen.queryByRole('button', { name: 'Asset Store' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'WTR' })).toBeNull();
  });

  it('navigates from group children', () => {
    renderDesktopSidebar();

    // Kanvas children are only rendered once the group is expanded.
    expect(screen.queryByRole('button', { name: 'Cinema Studio' })).toBeNull();
    fireEvent.click(toggle('Kanvas'));
    fireEvent.click(screen.getByRole('button', { name: 'Cinema Studio' }));
    expect(screen.getByTestId('location-path')).toHaveTextContent('/kanvas');

    fireEvent.click(toggle('Clip Studio'));
    fireEvent.click(screen.getByRole('button', { name: 'Sourcify' }));
    expect(screen.getByTestId('location-path')).toHaveTextContent('/sourcify');

    // Postz now lives under Clip Studio.
    fireEvent.click(screen.getByRole('button', { name: 'Postz' }));
    expect(screen.getByTestId('location-path')).toHaveTextContent('/postz');

    // IP Management holds IP Vault only.
    expect(screen.queryByRole('button', { name: 'IP Vault' })).toBeNull();
    fireEvent.click(toggle('IP Management'));
    fireEvent.click(screen.getByRole('button', { name: 'IP Vault' }));
    expect(screen.getByTestId('location-path')).toHaveTextContent('/ip-vault');

    fireEvent.click(toggle('Settings'));
    fireEvent.click(screen.getByRole('button', { name: 'Billing' }));
    expect(screen.getByTestId('location-path')).toHaveTextContent('/settings/billing');
  });

  it('navigates to the group landing from the root label', () => {
    renderDesktopSidebar();

    fireEvent.click(screen.getByRole('button', { name: 'Settings' }));
    expect(screen.getByTestId('location-path')).toHaveTextContent('/settings');

    fireEvent.click(screen.getByRole('button', { name: 'IP Management' }));
    expect(screen.getByTestId('location-path')).toHaveTextContent('/ip-vault');
  });

  it('marks the active child with aria-current', () => {
    render(
      <MemoryRouter initialEntries={['/sourcify']}>
        <SidebarProvider>
          <Sidebar activeView="sourcify" onViewChange={vi.fn()} />
        </SidebarProvider>
      </MemoryRouter>,
    );

    expect(screen.getByRole('button', { name: 'Sourcify' })).toHaveAttribute('aria-current', 'page');
    expect(screen.getByRole('button', { name: 'Clipper' })).not.toHaveAttribute('aria-current');
  });

  it('collapses and re-expands the Studio group', () => {
    renderDesktopSidebar();

    expect(toggle('Studio')).toHaveAttribute('aria-expanded', 'true');
    fireEvent.click(toggle('Studio'));
    expect(toggle('Studio')).toHaveAttribute('aria-expanded', 'false');

    fireEvent.click(toggle('Studio'));
    expect(screen.getByRole('button', { name: 'Favorites' })).toBeInTheDocument();
  });

  it('expands the group owning the active view so the active child stays visible', () => {
    render(
      <MemoryRouter initialEntries={['/sourcify']}>
        <SidebarProvider>
          <Sidebar activeView="sourcify" onViewChange={vi.fn()} />
        </SidebarProvider>
      </MemoryRouter>,
    );

    expect(toggle('Clip Studio')).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByRole('button', { name: 'Sourcify' })).toBeInTheDocument();
    expect(toggle('Kanvas')).toHaveAttribute('aria-expanded', 'false');
    expect(toggle('Studio')).toHaveAttribute('aria-expanded', 'false');
  });

  it('preserves Clip Studio and Postz nav nodes when active view changes', () => {
    const onViewChange = vi.fn();
    const { rerender } = render(
      <MemoryRouter initialEntries={['/home']}>
        <SidebarProvider>
          <Sidebar activeView="all" onViewChange={onViewChange} />
        </SidebarProvider>
      </MemoryRouter>,
    );

    const clipStudioButton = screen.getByRole('button', { name: 'Clip Studio' });

    rerender(
      <MemoryRouter initialEntries={['/home']}>
        <SidebarProvider>
          <Sidebar activeView="sourcify" onViewChange={onViewChange} />
        </SidebarProvider>
      </MemoryRouter>,
    );

    expect(screen.getByRole('button', { name: 'Clip Studio' })).toBe(clipStudioButton);
    expect(screen.getByRole('button', { name: 'Postz' })).toBeInTheDocument();

    rerender(
      <MemoryRouter initialEntries={['/home']}>
        <SidebarProvider>
          <Sidebar activeView="postz" onViewChange={onViewChange} />
        </SidebarProvider>
      </MemoryRouter>,
    );

    expect(screen.getByRole('button', { name: 'Clip Studio' })).toBe(clipStudioButton);
    expect(screen.getByRole('button', { name: 'Postz' })).toHaveAttribute('aria-current', 'page');
  });

  it('mirrors the grouped structure in the mobile drawer and navigates from it', () => {
    const firstRender = renderMobileDrawer();

    expect(getNavLabels(TOP_LEVEL_NAV_LABELS)).toEqual(TOP_LEVEL_NAV_LABELS);
    expect(screen.queryByRole('button', { name: 'Asset Store' })).toBeNull();

    fireEvent.click(toggle('Clip Studio'));
    fireEvent.click(screen.getByRole('button', { name: 'Sourcify' }));
    expect(screen.getByTestId('location-path')).toHaveTextContent('/sourcify');
    firstRender.unmount();

    const secondRender = renderMobileDrawer();
    fireEvent.click(toggle('Clip Studio'));
    fireEvent.click(screen.getByRole('button', { name: 'Postz' }));
    expect(screen.getByTestId('location-path')).toHaveTextContent('/postz');
    secondRender.unmount();

    const thirdRender = renderMobileDrawer();
    fireEvent.click(toggle('IP Management'));
    fireEvent.click(screen.getByRole('button', { name: 'IP Vault' }));
    expect(screen.getByTestId('location-path')).toHaveTextContent('/ip-vault');
    thirdRender.unmount();

    renderMobileDrawer();
    fireEvent.click(toggle('Kanvas'));
    fireEvent.click(screen.getByRole('button', { name: 'Lyrics' }));
    expect(screen.getByTestId('location-path')).toHaveTextContent('/kanvas/lyrics');
  });
});
