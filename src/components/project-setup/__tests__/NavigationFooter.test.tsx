import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { HTMLAttributes, ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import NavigationFooter from '../NavigationFooter';

type MotionDivProps = HTMLAttributes<HTMLDivElement> & {
  children?: ReactNode;
  initial?: unknown;
  animate?: unknown;
  transition?: unknown;
};

const mocks = vi.hoisted(() => ({
  navigate: vi.fn(),
  useProjectContext: vi.fn(),
}));

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom');
  return {
    ...actual,
    useNavigate: () => mocks.navigate,
  };
});

vi.mock('framer-motion', () => ({
  motion: {
    div: ({ children, initial, animate, transition, ...props }: MotionDivProps) => (
      <div {...props}>{children}</div>
    ),
  },
}));

vi.mock('../ProjectContext', () => ({
  useProjectContext: () => mocks.useProjectContext(),
}));

function mockContext(overrides: Record<string, unknown> = {}) {
  const finalizeProjectSetup = vi.fn().mockResolvedValue(true);
  const context = {
    activeTab: 'breakdown',
    getVisibleTabs: () => ['concept', 'settings', 'breakdown'],
    saveProjectData: vi.fn(),
    setActiveTab: vi.fn(),
    isCreating: false,
    isGenerating: false,
    isFinalizing: false,
    generateStoryline: vi.fn(),
    finalizeProjectSetup,
    projectData: { conceptOption: 'ai' },
    projectId: 'project-1',
    ...overrides,
  };

  mocks.useProjectContext.mockReturnValue(context);
  return context;
}

describe('NavigationFooter', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('finalizes setup before navigating the final step to Studio', async () => {
    const context = mockContext();

    render(<NavigationFooter />);

    fireEvent.click(screen.getByRole('button', { name: /go to studio/i }));

    await waitFor(() => {
      expect(context.finalizeProjectSetup).toHaveBeenCalledTimes(1);
      expect(mocks.navigate).toHaveBeenCalledWith('/projects/project-1/studio');
    });
  });

  it('keeps the wizard in place when finalization fails', async () => {
    const finalizeProjectSetup = vi.fn().mockResolvedValue(false);
    mockContext({ finalizeProjectSetup });

    render(<NavigationFooter />);

    fireEvent.click(screen.getByRole('button', { name: /go to studio/i }));

    await waitFor(() => {
      expect(finalizeProjectSetup).toHaveBeenCalledTimes(1);
    });
    expect(mocks.navigate).not.toHaveBeenCalled();
  });
});
