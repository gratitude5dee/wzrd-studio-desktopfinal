import { describe, expect, it } from 'vitest';

import { createVoiceActionRegistry } from './actions/registry';
import { getVoiceInstructions, getVoiceToolDefinitions } from './agent';

describe('voice agent config', () => {
  it('returns non-empty instructions', () => {
    const instructions = getVoiceInstructions();
    expect(instructions).toContain('WorldStudio');
    expect(instructions).toContain('Unclear Audio');
    expect(instructions).toContain('This will spend credits. Should I continue?');
    expect(instructions).toContain('nano_banana_fast_edit');
    expect(instructions).toContain('timeline_open_shot');
    expect(instructions.length).toBeGreaterThan(50);
  });

  it('returns tool definitions with the execute_worldstudio_action tool', () => {
    const registry = createVoiceActionRegistry();
    const tools = getVoiceToolDefinitions(registry);

    expect(tools).toHaveLength(1);
    expect(tools[0].name).toBe('execute_worldstudio_action');
    expect(tools[0].type).toBe('function');
    expect(tools[0].strict).toBe(false);
    expect(tools[0].parameters).toHaveProperty('properties');
    expect(
      ((tools[0].parameters.properties as any).name.enum as string[]),
    ).toEqual(expect.arrayContaining([
      'project_setup_next',
      'settings_edit_selected_image',
      'timeline_open_shot',
      'timeline_generate_all_images',
      'asset_store_save_current',
      'kanvas_set_prompt',
      'kanvas_lipsync_set_step',
      'kanvas_lipsync_set_mode',
    ]));
  });
});
