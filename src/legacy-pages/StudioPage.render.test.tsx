import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
const setActiveProject = vi.fn();
const addNodeOfType = vi.fn(() => ({ id: 'node-1' }));
const scheduleSave = vi.fn();
const addGeneratedWorkflow = vi.fn();
const addNode = vi.fn();
const createNode = vi.fn();
const saveGraph = vi.fn();
const executeGraphStreaming = vi.fn();

vi.mock('react-router-dom', () => ({
  useParams: () => ({ projectId: 'project-1' }),
  useNavigate: () => vi.fn(),
}));
vi.mock('@/store/appStore', () => ({
  useAppStore: () => ({
    setActiveProject,
  }),
}));
vi.mock('@/components/AppHeader', () => ({
  default: () => <div data-testid="app-header">App Header</div>,
}));
vi.mock('@/components/studio/StudioSidebar', () => ({
  default: () => <div data-testid="studio-sidebar">Studio Sidebar</div>,
}));
vi.mock('@/components/studio/StudioCanvas', () => ({
  default: () => {
    throw new Error('Canvas render failed');
  },
}));
vi.mock('@/components/studio/panels/SettingsPanel', () => ({
  SettingsPanel: () => <div data-testid="settings-panel">Settings Panel</div>,
}));
vi.mock('@/components/studio/StudioRightPanel', () => ({
  StudioRightPanel: () => <div data-testid="studio-right-panel">Studio Right Panel</div>,
}));
vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    from: () => ({
      select: () => ({
        eq: () => ({
          single: async () => ({ data: { title: 'Demo Project' }, error: null }),
        }),
      }),
    }),
  },
}));
vi.mock('@/store/computeFlowStore', () => ({
  useComputeFlowStore: () => ({
    addGeneratedWorkflow,
    addNode,
    createNode,
    saveGraph,
    executeGraphStreaming,
  }),
}));
vi.mock('@/hooks/studio/useStudioGraphActions', () => ({
  useStudioGraphActions: () => ({
    addNodeOfType,
    scheduleSave,
  }),
}));
vi.mock('@/hooks/use-mobile', () => ({
  useIsMobile: () => false,
}));

import StudioPage from './StudioPage';

describe('StudioPage error recovery', () => {
  beforeEach(() => {
    setActiveProject.mockReset();
    addNodeOfType.mockClear();
    scheduleSave.mockClear();
    addGeneratedWorkflow.mockClear();
    addNode.mockClear();
    createNode.mockClear();
    saveGraph.mockClear();
    executeGraphStreaming.mockClear();
  });

  afterEach(() => {
    consoleErrorSpy.mockClear();
  });

  it('shows a visible Studio fallback instead of a blank screen when the canvas crashes', async () => {
    render(<StudioPage />);

    await waitFor(() => {
      expect(screen.getByText('Studio Failed to Load')).toBeInTheDocument();
    });

    expect(screen.getByTestId('app-header')).toBeInTheDocument();
    expect(screen.getByTestId('studio-sidebar')).toBeInTheDocument();
    expect(screen.getByText('Canvas render failed')).toBeInTheDocument();
  });
});
