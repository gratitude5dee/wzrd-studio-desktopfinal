import { describe, expect, it, vi } from 'vitest';

import {
  createGlobalVoiceActions,
  resolveVoiceNavigationTarget,
} from './navigation';

describe('voice navigation actions', () => {
  it('resolves core app targets into route paths', () => {
    expect(resolveVoiceNavigationTarget({ target: 'home' })).toBe('/home');
    expect(resolveVoiceNavigationTarget({ target: 'project_setup' })).toBe('/project-setup');
    expect(resolveVoiceNavigationTarget({ target: 'ip_vault' })).toBe('/ip-vault');
    expect(resolveVoiceNavigationTarget({ target: 'kanvas_character_creation' })).toBe(
      '/kanvas?studio=character-creation',
    );
    expect(resolveVoiceNavigationTarget({ target: 'kanvas_image', prompt: 'sunset city' })).toBe(
      '/kanvas?studio=image&prompt=sunset+city',
    );
  });

  it('requires a project id for project-specific views', () => {
    expect(resolveVoiceNavigationTarget({ target: 'project_timeline' })).toBeNull();
    expect(resolveVoiceNavigationTarget({ target: 'project_timeline', projectId: 'p1' })).toBe(
      '/projects/p1/timeline',
    );
    expect(resolveVoiceNavigationTarget({ target: 'project_studio', projectId: 'p1' })).toBe(
      '/projects/p1/studio',
    );
  });

  it('navigates to project setup without creating a project draft', async () => {
    const navigate = vi.fn();
    const actions = createGlobalVoiceActions({
      navigate,
      getLocationPath: () => '/home',
      getCurrentProjectId: () => null,
    });
    const startNewProject = actions.find((action) => action.name === 'start_new_project');

    await expect(Promise.resolve(startNewProject?.handler({}, {}))).resolves.toMatchObject({
      ok: true,
      status: 'completed',
      message: expect.stringContaining('Project setup'),
    });
    expect(navigate).toHaveBeenCalledWith('/project-setup');
  });

  it('opens WTR externally through the global shortcut action', async () => {
    const navigate = vi.fn();
    const openSpy = vi.spyOn(window, 'open').mockImplementation(() => null);
    const actions = createGlobalVoiceActions({
      navigate,
      getLocationPath: () => '/home',
      getCurrentProjectId: () => null,
    });
    const openIpVault = actions.find((action) => action.name === 'open_ip_vault');

    await expect(Promise.resolve(openIpVault?.handler({}, {}))).resolves.toMatchObject({
      ok: true,
      status: 'completed',
      data: { url: 'https://wtr.wzrd.tech/app' },
    });
    expect(openSpy).toHaveBeenCalledWith('https://wtr.wzrd.tech/app', '_blank', 'noopener,noreferrer');
    expect(navigate).not.toHaveBeenCalled();
    openSpy.mockRestore();
  });
});
