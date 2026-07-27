import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter, useLocation, useNavigate } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { MobileBottomNav } from '@/components/home/MobileBottomNav';
import { Sidebar } from '@/components/home/Sidebar';
import { MobileSidebarDrawer } from '@/components/home/MobileSidebarDrawer';
import { SIDEBAR_COLLAPSED_STORAGE_KEY, SidebarProvider, useSidebar } from '@/contexts/SidebarContext';

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
  const state = (location.state as { activeView?: string } | null)?.activeView ?? '';
  return (
    <>
      <span data-testid="location-path">{location.pathname}</span>
      <span data-testid="location-state">{state}</span>
    </>
  );
}

function renderDesktopSidebar(initialEntry = '/home', activeView = 'all', onViewChange = vi.fn()) {
  return render(
    <MemoryRouter initialEntries={[initialEntry]}>
      <SidebarProvider>
        <Sidebar activeView={activeView} onViewChange={onViewChange} />
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

function renderMobileBottomNav() {
  return render(
    <MemoryRouter initialEntries={['/home']}>
      <MobileBottomNav activeView="all" onViewChange={vi.fn()} onCreateProject={vi.fn()} />
      <LocationProbe />
    </MemoryRouter>,
  );
}

function getPrimaryNavLabels(root?: HTMLElement) {
  const primaryLabels = [
    'WZRDOS',
    'Studio',
    'All Projects',
    'Kanvas',
    'Image',
    'Video',
    'Edit',
    'Lip Sync',
    'Cinema Studio',
    'Worldview',
    'Characters',
    'Lyrics',
    'IP Vault',
    'Clipper',
    'Sourcify',
    'Postz',
    'Creative Intelligence',
    'Aura',
    'Asset Store',
    'Settings',
    'Integrations',
    'Shared with me',
    'Community',
  ];
  const queryRoot = root ? within(root) : screen;
  return queryRoot
    .getAllByRole('button')
    .map((button) => button.getAttribute('aria-label') ?? button.textContent?.trim() ?? '')
    .filter((label) => primaryLabels.includes(label));
}

function readStoredSidebarState() {
  return JSON.parse(localStorage.getItem(SIDEBAR_COLLAPSED_STORAGE_KEY) ?? '{}') as {
    global?: boolean;
    overrides?: Record<string, boolean>;
  };
}

function SidebarStateProbe() {
  const navigate = useNavigate();
  const { isCollapsed, mode, offset, peekVisible, setIsCollapsed } = useSidebar();

  return (
    <>
      <span data-testid="sidebar-collapsed">{String(isCollapsed)}</span>
      <span data-testid="sidebar-mode">{mode}</span>
      <span data-testid="sidebar-offset">{String(offset)}</span>
      <span data-testid="sidebar-peek-visible">{String(peekVisible)}</span>
      <button type="button" onClick={() => setIsCollapsed(false)}>
        Expand route
      </button>
      <button type="button" onClick={() => navigate('/home')}>
        Go home
      </button>
      <LocationProbe />
    </>
  );
}

describe('home navigation IP Vault entry', () => {
  beforeEach(() => {
    localStorage.clear();
    Object.defineProperty(window, 'scrollTo', {
      writable: true,
      value: vi.fn(),
    });
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

  it('renders the expanded app sidebar with IP Vault after Asset Store and navigates to routes', () => {
    renderDesktopSidebar();

    const sidebar = screen.getByTestId('app-sidebar');
    expect(sidebar).toHaveAttribute('data-state', 'expanded');
    expect(screen.getByText(/^studio$/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^settings$/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^integrations$/i })).toBeInTheDocument();
    expect(screen.getByText(/100 credits/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^logout$/i })).toBeInTheDocument();
    expect(getPrimaryNavLabels(sidebar)).toEqual([
      'WZRDOS',
      'Studio',
      'All Projects',
      'Asset Store',
      'Aura',
      'Kanvas',
      'Image',
      'Video',
      'Edit',
      'Lip Sync',
      'Cinema Studio',
      'Worldview',
      'Characters',
      'Lyrics',
      'IP Vault',
      'Clipper',
      'Sourcify',
      'Postz',
      'Creative Intelligence',
      'Shared with me',
      'Community',
      'Settings',
      'Integrations',
    ]);

    fireEvent.click(screen.getByRole('button', { name: /sourcify/i }));
    expect(screen.getByTestId('location-path')).toHaveTextContent('/sourcify');

    fireEvent.click(screen.getByRole('button', { name: /postz/i }));
    expect(screen.getByTestId('location-path')).toHaveTextContent('/postz');

    fireEvent.click(screen.getByRole('button', { name: /ip vault/i }));
    expect(screen.getByTestId('location-path')).toHaveTextContent('/ip-vault');
  });

  it('collapses from the expanded sidebar, persists across remount, and toggles with Cmd/Ctrl+B', async () => {
    const firstRender = renderDesktopSidebar();

    expect(screen.getByTestId('app-sidebar')).toHaveAttribute('data-state', 'expanded');

    fireEvent.click(screen.getByRole('button', { name: /collapse sidebar/i }));

    await waitFor(() => {
      expect(screen.queryByTestId('app-sidebar')).not.toBeInTheDocument();
      expect(screen.getByTestId('sidebar-hover-zone')).toBeInTheDocument();
      expect(readStoredSidebarState()).toMatchObject({ global: true, overrides: {} });
    });

    firstRender.unmount();
    renderDesktopSidebar();

    expect(screen.queryByTestId('app-sidebar')).not.toBeInTheDocument();
    fireEvent.pointerEnter(screen.getByTestId('sidebar-hover-zone'));
    expect(await screen.findByTestId('app-sidebar')).toHaveAttribute('data-state', 'collapsed');
    expect(screen.getByRole('button', { name: /expand sidebar/i })).toBeInTheDocument();

    fireEvent.keyDown(window, { key: 'b', metaKey: true });

    await waitFor(() => {
      expect(screen.getByTestId('app-sidebar')).toHaveAttribute('data-state', 'expanded');
      expect(readStoredSidebarState()).toMatchObject({ global: false, overrides: {} });
    });
  });

  it('reveals the hidden rail from a tiny hot strip without installing window move listeners', async () => {
    localStorage.setItem(SIDEBAR_COLLAPSED_STORAGE_KEY, JSON.stringify({ global: true, overrides: {} }));
    const addEventListenerSpy = vi.spyOn(window, 'addEventListener');

    renderDesktopSidebar();

    const hoverZone = screen.getByTestId('sidebar-hover-zone');
    expect(hoverZone).toHaveClass('w-3');
    expect(screen.queryByTestId('app-sidebar')).not.toBeInTheDocument();
    expect(
      addEventListenerSpy.mock.calls.some(([eventName]) => eventName === 'pointermove' || eventName === 'mousemove')
    ).toBe(false);

    fireEvent.pointerEnter(hoverZone);

    const sidebar = await screen.findByTestId('app-sidebar');
    expect(sidebar).toHaveAttribute('data-state', 'collapsed');
    expect(sidebar).toHaveAttribute('data-peek-visible', 'true');
    expect(hoverZone).toHaveClass('w-[80px]');

    fireEvent.keyDown(window, { key: 'Escape' });

    await waitFor(() => {
      expect(screen.queryByTestId('app-sidebar')).not.toBeInTheDocument();
    });

    addEventListenerSpy.mockRestore();
  });

  it('migrates collapsed state saved by the previous sidebar version', () => {
    localStorage.setItem('wzrd:sidebar-collapsed:v2', 'true');

    renderDesktopSidebar();

    expect(screen.queryByTestId('app-sidebar')).not.toBeInTheDocument();
    fireEvent.pointerEnter(screen.getByTestId('sidebar-hover-zone'));
    expect(screen.getByTestId('app-sidebar')).toHaveAttribute('data-state', 'collapsed');
  });

  it('keeps the project setup collapsed default scoped to that route', async () => {
    localStorage.setItem(SIDEBAR_COLLAPSED_STORAGE_KEY, JSON.stringify({ global: true, overrides: {} }));

    render(
      <MemoryRouter initialEntries={['/project-setup']}>
        <SidebarProvider>
          <SidebarStateProbe />
        </SidebarProvider>
      </MemoryRouter>,
    );

    expect(screen.getByTestId('sidebar-collapsed')).toHaveTextContent('true');
    expect(screen.getByTestId('sidebar-mode')).toHaveTextContent('hidden');
    expect(screen.getByTestId('sidebar-offset')).toHaveTextContent('0');

    fireEvent.click(screen.getByRole('button', { name: /expand route/i }));

    await waitFor(() => {
      expect(screen.getByTestId('sidebar-collapsed')).toHaveTextContent('false');
      expect(screen.getByTestId('sidebar-mode')).toHaveTextContent('expanded');
      expect(screen.getByTestId('sidebar-offset')).toHaveTextContent('256');
      expect(readStoredSidebarState()).toMatchObject({ global: true, overrides: { '/project-setup': false } });
    });

    fireEvent.click(screen.getByRole('button', { name: /go home/i }));

    await waitFor(() => {
      expect(screen.getByTestId('location-path')).toHaveTextContent('/home');
      expect(screen.getByTestId('sidebar-collapsed')).toHaveTextContent('true');
      expect(readStoredSidebarState()).toMatchObject({ global: true, overrides: { '/project-setup': false } });
    });
  });

  it('defaults project setup project aliases to the hidden sidebar mode', () => {
    render(
      <MemoryRouter initialEntries={['/project-setup/project-1']}>
        <SidebarProvider>
          <SidebarStateProbe />
        </SidebarProvider>
      </MemoryRouter>,
    );

    expect(screen.getByTestId('sidebar-collapsed')).toHaveTextContent('true');
    expect(screen.getByTestId('sidebar-mode')).toHaveTextContent('hidden');
    expect(screen.getByTestId('sidebar-offset')).toHaveTextContent('0');
  });

  it('highlights route-backed pages and home subviews in the app sidebar', () => {
    const { rerender } = renderDesktopSidebar('/kanvas?studio=cinema', 'kanvas');

    expect(screen.getByRole('button', { name: /^kanvas$/i })).toHaveAttribute('aria-current', 'page');

    rerender(
      <MemoryRouter initialEntries={['/kanvas/lyrics']}>
        <SidebarProvider>
          <Sidebar activeView="kanvas" onViewChange={vi.fn()} />
          <LocationProbe />
        </SidebarProvider>
      </MemoryRouter>,
    );

    expect(screen.getByRole('button', { name: /^kanvas$/i })).toHaveAttribute('aria-current', 'page');

    rerender(
      <MemoryRouter initialEntries={['/kanvas/remix']}>
        <SidebarProvider>
          <Sidebar activeView="kanvas" onViewChange={vi.fn()} />
          <LocationProbe />
        </SidebarProvider>
      </MemoryRouter>,
    );

    expect(screen.getByRole('button', { name: /^kanvas$/i })).toHaveAttribute('aria-current', 'page');

    rerender(
      <MemoryRouter initialEntries={['/home']}>
        <SidebarProvider>
          <Sidebar activeView="aura" onViewChange={vi.fn()} />
          <LocationProbe />
        </SidebarProvider>
      </MemoryRouter>,
    );

    expect(screen.getByRole('button', { name: /^aura$/i })).toHaveAttribute('aria-current', 'page');
    expect(screen.getByRole('button', { name: /all projects/i })).not.toHaveAttribute('aria-current');

    rerender(
      <MemoryRouter initialEntries={['/ip-vault']}>
        <SidebarProvider>
          <Sidebar activeView="ip-vault" onViewChange={vi.fn()} />
          <LocationProbe />
        </SidebarProvider>
      </MemoryRouter>,
    );

    expect(screen.getByRole('button', { name: /ip vault/i })).toHaveAttribute('aria-current', 'page');
  });

  it('expands nested groups and navigates Kanvas studio children with query params', async () => {
    renderDesktopSidebar('/home', 'all');

    expect(screen.getByRole('button', { name: /^studio$/i })).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByRole('button', { name: /^kanvas$/i })).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByRole('button', { name: /^image$/i })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /collapse kanvas/i }));
    expect(screen.getByRole('button', { name: /^kanvas$/i })).toHaveAttribute('aria-expanded', 'false');
    await waitFor(() => {
      expect(screen.queryByRole('button', { name: /^image$/i })).not.toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: /expand kanvas/i }));
    fireEvent.click(screen.getByRole('button', { name: /^video$/i }));

    expect(screen.getByTestId('location-path')).toHaveTextContent('/kanvas');
    expect(screen.getByRole('button', { name: /^video$/i })).toHaveAttribute('aria-current', 'page');
  });

  it('navigates route-less home subviews back to Home with active view state', () => {
    const onViewChange = vi.fn();

    renderDesktopSidebar('/clipper', 'clipper', onViewChange);

    fireEvent.click(screen.getByRole('button', { name: /^aura$/i }));

    expect(onViewChange).not.toHaveBeenCalled();
    expect(screen.getByTestId('location-path')).toHaveTextContent('/home');
    expect(screen.getByTestId('location-state')).toHaveTextContent('aura');
  });

  it('supports mobile group disclosures and Kanvas child navigation', async () => {
    renderMobileDrawer();

    expect(screen.getByRole('button', { name: /^kanvas$/i })).toHaveAttribute('aria-expanded', 'true');
    fireEvent.click(screen.getByRole('button', { name: /collapse kanvas/i }));
    expect(screen.getByRole('button', { name: /^kanvas$/i })).toHaveAttribute('aria-expanded', 'false');
    await waitFor(() => {
      expect(screen.queryByRole('button', { name: /^image$/i })).not.toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: /expand kanvas/i }));
    fireEvent.click(screen.getByRole('button', { name: /^video$/i }));
    expect(screen.getByTestId('location-path')).toHaveTextContent('/kanvas');
  });

  it('places IP Vault after Asset Store in the mobile drawer and navigates to it', () => {
    const firstRender = renderMobileDrawer();

    expect(getPrimaryNavLabels()).toEqual([
      'WZRDOS',
      'Studio',
      'All Projects',
      'Asset Store',
      'Aura',
      'Kanvas',
      'Image',
      'Video',
      'Edit',
      'Lip Sync',
      'Cinema Studio',
      'Worldview',
      'Characters',
      'Lyrics',
      'IP Vault',
      'Clipper',
      'Sourcify',
      'Postz',
      'Creative Intelligence',
      'Shared with me',
      'Community',
      'Settings',
      'Integrations',
    ]);

    fireEvent.click(screen.getByRole('button', { name: /sourcify/i }));
    expect(screen.getByTestId('location-path')).toHaveTextContent('/sourcify');
    firstRender.unmount();

    const secondRender = renderMobileDrawer();
    fireEvent.click(screen.getByRole('button', { name: /postz/i }));
    expect(screen.getByTestId('location-path')).toHaveTextContent('/postz');
    secondRender.unmount();

    renderMobileDrawer();
    fireEvent.click(screen.getByRole('button', { name: /ip vault/i }));
    expect(screen.getByTestId('location-path')).toHaveTextContent('/ip-vault');
  });

  it('keeps mobile bottom nav routes in sync with the shared nav config', () => {
    renderMobileBottomNav();

    expect(screen.getByRole('button', { name: /projects/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /kanvas/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /create/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /clipper/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /shared with me/i })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /kanvas/i }));
    expect(screen.getByTestId('location-path')).toHaveTextContent('/kanvas');
  });
});
