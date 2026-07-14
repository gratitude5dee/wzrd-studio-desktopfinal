import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const serviceMocks = vi.hoisted(() => ({
  create: vi.fn(),
  list: vi.fn(),
}));

vi.mock('@/services/supabaseService', () => ({
  supabaseService: {
    projects: serviceMocks,
  },
}));

import EditorEntryPage, { selectRecentEditorProjects } from './EditorEntryPage';

function renderEntry() {
  return render(
    <MemoryRouter initialEntries={['/editor']}>
      <Routes>
        <Route path="/editor" element={<EditorEntryPage />} />
        <Route path="/projects/:projectId/editor" element={<div>Canonical QCut editor</div>} />
      </Routes>
    </MemoryRouter>,
  );
}

describe('EditorEntryPage', () => {
  beforeEach(() => {
    serviceMocks.list.mockResolvedValue([]);
    serviceMocks.create.mockResolvedValue('project-new');
  });

  it('sorts and limits recent projects without mutating the query result', () => {
    const projects = Array.from({ length: 14 }, (_, index) => ({
      id: `project-${index}`,
      title: `Project ${index}`,
      user_id: 'user-1',
      updated_at: new Date(2026, 0, index + 1).toISOString(),
    }));

    const recent = selectRecentEditorProjects(projects);

    expect(recent).toHaveLength(12);
    expect(recent[0]?.id).toBe('project-13');
    expect(projects[0]?.id).toBe('project-0');
  });

  it('opens an existing project at the canonical QCut route', async () => {
    serviceMocks.list.mockResolvedValue([
      { id: 'project-1', title: 'Launch cut', user_id: 'user-1' },
    ]);
    renderEntry();

    fireEvent.click(await screen.findByRole('button', { name: 'Open Launch cut' }));

    expect(await screen.findByText('Canonical QCut editor')).toBeInTheDocument();
  });

  it('creates a project before entering the canonical QCut route', async () => {
    renderEntry();

    fireEvent.click(screen.getByRole('button', { name: 'New project' }));

    await waitFor(() => {
      expect(serviceMocks.create).toHaveBeenCalledWith({ title: 'Untitled Project' });
    });
    expect(await screen.findByText('Canonical QCut editor')).toBeInTheDocument();
  });
});
