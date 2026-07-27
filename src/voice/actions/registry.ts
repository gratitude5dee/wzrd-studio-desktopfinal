export type VoiceActionName =
  | 'get_app_context'
  | 'navigate_app'
  | 'start_new_project'
  | 'set_project_setup_fields'
  | 'project_setup_next'
  | 'storyline_update'
  | 'storyline_confirm'
  | 'settings_select_character'
  | 'settings_select_location'
  | 'settings_edit_selected_image'
  | 'breakdown_update_scene'
  | 'breakdown_start_storyboard'
  | 'timeline_select_shot'
  | 'timeline_open_shot'
  | 'timeline_update_shot_prompt'
  | 'timeline_generate_shot_image'
  | 'timeline_generate_all_images'
  | 'timeline_edit_shot_image'
  | 'timeline_start_directors_cut'
  | 'asset_store_save_current'
  | 'open_project_view'
  | 'kanvas_set_prompt'
  | 'kanvas_set_studio'
  | 'kanvas_generate'
  | 'kanvas_lipsync_set_step'
  | 'kanvas_lipsync_set_mode'
  | 'character_open'
  | 'character_select'
  | 'character_edit_image'
  | 'open_ip_vault'
  | 'ip_vault_finalize_asset'
  | 'ip_vault_select_item'
  | 'ip_vault_set_license'
  | 'ip_vault_register_ip'
  | 'ip_vault_set_derivative'
  | 'ip_vault_claim_revenue'
  | 'studio_create_node'
  | 'studio_select_node'
  | 'editor_import_media_by_url'
  | 'editor_add_clip'
  | 'editor_split_element'
  | 'editor_delete_element'
  | 'editor_add_title'
  | 'editor_export';

export type VoiceActionStatus =
  | 'completed'
  | 'needs_confirmation'
  | 'unavailable'
  | 'invalid_input'
  | 'failed';

export type VoiceActionRisk = 'navigation' | 'write' | 'generation' | 'sensitive';

export interface VoiceActionConfirmation {
  actionName: VoiceActionName;
  risk: VoiceActionRisk;
  message: string;
  input: unknown;
  traceId?: string;
}

export interface VoiceActionContextSnapshot {
  locationPath?: string;
  pathname?: string;
  search?: string;
  currentProjectId?: string | null;
  currentStudio?: string | null;
  selectedAssetIds?: string[];
  selectedJobId?: string | null;
  visibleComponentState?: Record<string, unknown>;
  availableActions?: VoiceActionName[];
}

export type VoiceActionResult =
  | {
      ok: true;
      status: 'completed';
      message: string;
      data?: unknown;
      uiFocus?: string;
      traceId?: string;
    }
  | {
      ok: false;
      status: Exclude<VoiceActionStatus, 'completed'>;
      message: string;
      data?: unknown;
      confirmation?: VoiceActionConfirmation;
      errorCode?: string;
      uiFocus?: string;
      traceId?: string;
    };

export interface VoiceActionExecutionContext {
  confirmed?: boolean;
  locationPath?: string;
  currentProjectId?: string | null;
  app?: VoiceActionContextSnapshot;
}

export type VoiceActionHandler<Input = unknown> = (
  input: Input,
  context: VoiceActionExecutionContext,
) => VoiceActionResult | Promise<VoiceActionResult>;

export interface VoiceActionRegistration<Input = unknown> {
  name: VoiceActionName;
  scope: string;
  description?: string;
  schema?: Record<string, unknown>;
  risk?: VoiceActionRisk;
  availability?: (context: VoiceActionExecutionContext) => boolean | VoiceActionResult;
  confirmation?: {
    risk: VoiceActionRisk;
    message: string;
  };
  handler: VoiceActionHandler<Input>;
}

export interface VoiceActionRegistry {
  register: <Input = unknown>(registration: VoiceActionRegistration<Input>) => () => void;
  execute: (
    name: VoiceActionName,
    input?: unknown,
    context?: VoiceActionExecutionContext,
  ) => Promise<VoiceActionResult>;
  list: (context?: VoiceActionExecutionContext) => VoiceActionRegistration[];
  clear: () => void;
}

function createTraceId(actionName: VoiceActionName): string {
  return `voice_${actionName}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

function cloneRegistrations(
  registrations: Map<VoiceActionName, VoiceActionRegistration[]>,
): VoiceActionRegistration[] {
  return Array.from(registrations.values()).flatMap((items) => [...items]);
}

export function createVoiceActionRegistry(): VoiceActionRegistry {
  const registrations = new Map<VoiceActionName, VoiceActionRegistration[]>();

  return {
    register(registration) {
      const current = registrations.get(registration.name) ?? [];
      const next = [...current, registration as VoiceActionRegistration];
      registrations.set(registration.name, next);

      return () => {
        const existing = registrations.get(registration.name) ?? [];
        const filtered = existing.filter((item) => item !== registration);
        if (filtered.length === 0) {
          registrations.delete(registration.name);
        } else {
          registrations.set(registration.name, filtered);
        }
      };
    },

    async execute(name, input = {}, context = {}) {
      const current = registrations.get(name) ?? [];
      const registration = current[current.length - 1];
      const traceId = createTraceId(name);
      if (!registration) {
        return {
          ok: false,
          status: 'unavailable',
          message: `Voice action "${name}" is not available on this page.`,
          errorCode: 'voice_action_unavailable',
          traceId,
        };
      }

      if (registration.availability) {
        const availability = registration.availability(context);
        if (availability !== true) {
          if (typeof availability === 'object') {
            return { ...availability, traceId: availability.traceId ?? traceId };
          }
          return {
            ok: false,
            status: 'unavailable',
            message: `Voice action "${name}" is not available right now.`,
            errorCode: 'voice_action_unavailable',
            traceId,
          };
        }
      }

      if (registration.confirmation && !context.confirmed) {
        return {
          ok: false,
          status: 'needs_confirmation',
          message: registration.confirmation.message,
          traceId,
          confirmation: {
            actionName: name,
            risk: registration.confirmation.risk,
            message: registration.confirmation.message,
            input,
            traceId,
          },
        };
      }

      try {
        const result = await registration.handler(input, context);
        return { ...result, traceId: result.traceId ?? traceId };
      } catch (error) {
        return {
          ok: false,
          status: 'failed',
          message: error instanceof Error ? error.message : 'Voice action failed.',
          errorCode: 'voice_action_failed',
          traceId,
        };
      }
    },

    list(context = {}) {
      return cloneRegistrations(registrations).filter((registration) => {
        if (!registration.availability) return true;
        return registration.availability(context) === true;
      });
    },

    clear() {
      registrations.clear();
    },
  };
}

export function voiceActionNeedsConfirmation(result: VoiceActionResult): boolean {
  return !result.ok && result.status === 'needs_confirmation' && Boolean(result.confirmation);
}

export const voiceActionRegistry = createVoiceActionRegistry();
