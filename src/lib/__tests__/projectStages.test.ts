import { describe, expect, it } from 'vitest';

import {
  getProjectStageCompletion,
  getProjectStageFromPath,
  getProjectStageRoute,
  getProjectStageStatuses,
} from '@/lib/projectStages';

describe('project stage helpers', () => {
  it('builds routes for every project pipeline stage', () => {
    expect(getProjectStageRoute('setup', 'project 1')).toBe('/project-setup?projectId=project%201');
    expect(getProjectStageRoute('studio', 'p1')).toBe('/projects/p1/studio');
    expect(getProjectStageRoute('timeline', 'p1')).toBe('/projects/p1/timeline');
    expect(getProjectStageRoute('editor', 'p1')).toBe('/projects/p1/editor');
    expect(getProjectStageRoute('directors-cut', 'p1')).toBe('/projects/p1/directors-cut');
  });

  it('recognizes setup and canonical project paths', () => {
    expect(getProjectStageFromPath('/project-setup?projectId=p1')).toBe('setup');
    expect(getProjectStageFromPath('/project-setup/p1')).toBe('setup');
    expect(getProjectStageFromPath('/projects/p1/studio')).toBe('studio');
    expect(getProjectStageFromPath('/projects/p1/timeline')).toBe('timeline');
    expect(getProjectStageFromPath('/projects/p1/directors-cut')).toBe('directors-cut');
  });

  it('derives completion from explicit future flags and existing project fields', () => {
    const completion = getProjectStageCompletion({
      selected_storyline_id: 'story-1',
      has_graph: true,
      shots_done: false,
      qcut_project_json: { version: 1 },
      has_cut: true,
    });

    expect(completion.setup).toBe(true);
    expect(completion.studio).toBe(true);
    expect(completion.timeline).toBe(false);
    expect(completion.editor).toBe(true);
    expect(completion['directors-cut']).toBe(true);
  });

  it('marks the active stage as current while preserving known completion states', () => {
    const statuses = getProjectStageStatuses(
      { setup_done: true, has_graph: true, shots_done: false },
      'editor'
    );

    expect(statuses.setup).toBe('complete');
    expect(statuses.studio).toBe('complete');
    expect(statuses.timeline).toBe('incomplete');
    expect(statuses.editor).toBe('current');
    expect(statuses['directors-cut']).toBe('unknown');
  });
});
