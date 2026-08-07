import { appRoutes, WTR_EXTERNAL_URL } from '@/lib/routes';

import type {
  VoiceActionRegistration,
  VoiceActionResult,
} from './registry';

export type VoiceNavigationTarget =
  | 'home'
  | 'project_setup'
  | 'assets'
  | 'ip_vault'
  | 'learning_studio'
  | 'settings_billing'
  | 'kanvas'
  | 'kanvas_image'
  | 'kanvas_video'
  | 'kanvas_edit'
  | 'kanvas_cinema'
  | 'kanvas_lipsync'
  | 'kanvas_character_creation'
  | 'project_studio'
  | 'project_timeline'
  | 'project_editor'
  | 'project_directors_cut'
  | 'project_observability';

export interface VoiceNavigationInput {
  target?: VoiceNavigationTarget;
  projectId?: string | null;
  prompt?: string | null;
}

export interface GlobalVoiceActionOptions {
  navigate: (path: string) => void;
  getLocationPath: () => string;
  getCurrentProjectId: () => string | null;
  getAvailableActionNames?: () => string[];
}

function buildKanvasPath(studio?: string, prompt?: string | null): string {
  const params = new URLSearchParams();
  if (studio) params.set('studio', studio);
  if (prompt?.trim()) params.set('prompt', prompt.trim());
  const query = params.toString();
  return query ? `${appRoutes.kanvas}?${query}` : appRoutes.kanvas;
}

export function resolveVoiceNavigationTarget(input: VoiceNavigationInput): string | null {
  const projectId = input.projectId ?? null;

  switch (input.target) {
    case 'home':
      return appRoutes.home;
    case 'project_setup':
      return appRoutes.projectSetup;
    case 'assets':
      return appRoutes.assets;
    case 'ip_vault':
      return appRoutes.ipVault;
    case 'learning_studio':
      return appRoutes.learningStudio;
    case 'settings_billing':
      return appRoutes.settings.billing;
    case 'kanvas':
      return appRoutes.kanvas;
    case 'kanvas_image':
      return buildKanvasPath('image', input.prompt);
    case 'kanvas_video':
      return buildKanvasPath('video', input.prompt);
    case 'kanvas_edit':
      return buildKanvasPath('edit', input.prompt);
    case 'kanvas_cinema':
      return buildKanvasPath('cinema', input.prompt);
    case 'kanvas_lipsync':
      return buildKanvasPath('lipsync', input.prompt);
    case 'kanvas_character_creation':
      return buildKanvasPath('character-creation', input.prompt);
    case 'project_studio':
      return projectId ? appRoutes.projects.studio(projectId) : null;
    case 'project_timeline':
      return projectId ? appRoutes.projects.timeline(projectId) : null;
    case 'project_editor':
      return projectId ? appRoutes.projects.editor(projectId) : null;
    case 'project_directors_cut':
      return projectId ? appRoutes.projects.directorsCut(projectId) : null;
    case 'project_observability':
      return projectId ? appRoutes.projects.observability(projectId) : null;
    default:
      return null;
  }
}

function completed(message: string, data?: unknown): VoiceActionResult {
  return { ok: true, status: 'completed', message, data };
}

function invalid(message: string): VoiceActionResult {
  return { ok: false, status: 'invalid_input', message, errorCode: 'invalid_navigation_target' };
}

export function createGlobalVoiceActions(options: GlobalVoiceActionOptions): VoiceActionRegistration[] {
  return [
    {
      name: 'get_app_context',
      scope: 'global',
      handler: () =>
        completed('Current app context loaded.', {
          locationPath: options.getLocationPath(),
          currentProjectId: options.getCurrentProjectId(),
          availableActions: options.getAvailableActionNames?.() ?? [],
        }),
    },
    {
      name: 'navigate_app',
      scope: 'global',
      handler: (input) => {
        const navInput = input as VoiceNavigationInput;
        const path = resolveVoiceNavigationTarget({
          ...navInput,
          projectId: navInput.projectId ?? options.getCurrentProjectId(),
        });

        if (!path) {
          return invalid('I need a valid destination or project before I can navigate there.');
        }

        options.navigate(path);
        return completed(`Opened ${navInput.target ?? 'destination'}.`, { path });
      },
    },
    {
      name: 'open_ip_vault',
      scope: 'global',
      handler: () => {
        window.open(WTR_EXTERNAL_URL, '_blank', 'noopener,noreferrer');
        return completed('WTR is open in a new tab.', { url: WTR_EXTERNAL_URL });
      },
    },
    {
      name: 'start_new_project',
      scope: 'global',
      handler: () => {
        options.navigate(appRoutes.projectSetup);
        return completed('Project setup is open. Tell me the title or concept when you are ready.', {
          path: appRoutes.projectSetup,
        });
      },
    },
    {
      name: 'open_project_view',
      scope: 'global',
      handler: (input) => {
        const navInput = input as VoiceNavigationInput;
        const target = navInput.target ?? 'project_timeline';
        const path = resolveVoiceNavigationTarget({
          ...navInput,
          target,
          projectId: navInput.projectId ?? options.getCurrentProjectId(),
        });
        if (!path) {
          return invalid('I need an active project before opening that project view.');
        }
        options.navigate(path);
        return completed(`Opened ${target.replace(/_/g, ' ')}.`, { path });
      },
    },
    {
      name: 'character_open',
      scope: 'global',
      handler: () => {
        const path = buildKanvasPath('character-creation');
        options.navigate(path);
        return completed('Character creation is open.', { path });
      },
    },
    {
      name: 'kanvas_set_studio',
      scope: 'global',
      handler: (input) => {
        const payload = input as { studio?: string; prompt?: string | null };
        const studio = payload.studio === 'character-creation' ? 'character-creation' : payload.studio;
        const path = buildKanvasPath(studio, payload.prompt);
        options.navigate(path);
        return completed('Kanvas is open.', { path });
      },
    },
  ];
}
