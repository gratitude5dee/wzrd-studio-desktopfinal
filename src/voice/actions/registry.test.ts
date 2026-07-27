import { describe, expect, it, vi } from 'vitest';

import {
  createVoiceActionRegistry,
  voiceActionNeedsConfirmation,
} from './registry';

describe('voice action registry', () => {
  it('registers, executes, and unregisters a voice action', async () => {
    const registry = createVoiceActionRegistry();
    const handler = vi.fn(async (input) => ({
      ok: true as const,
      status: 'completed' as const,
      message: `opened ${(input as { target: string }).target}`,
    }));

    const unregister = registry.register({
      name: 'navigate_app',
      scope: 'global',
      handler,
    });

    await expect(registry.execute('navigate_app', { target: 'home' })).resolves.toMatchObject({
      ok: true,
      message: 'opened home',
    });
    expect(handler).toHaveBeenCalledWith({ target: 'home' }, expect.any(Object));

    unregister();

    await expect(registry.execute('navigate_app', { target: 'home' })).resolves.toMatchObject({
      ok: false,
      status: 'unavailable',
    });
  });

  it('requires confirmation before executing persistent or credit-consuming actions', async () => {
    const registry = createVoiceActionRegistry();
    const handler = vi.fn(async () => ({
      ok: true as const,
      status: 'completed' as const,
      message: 'image edit started',
    }));

    registry.register({
      name: 'character_edit_image',
      scope: 'character',
      confirmation: {
        risk: 'generation',
        message: 'Edit this character image with nanobanana?',
      },
      handler,
    });

    const blocked = await registry.execute('character_edit_image', { prompt: 'wear a flannel' });
    expect(voiceActionNeedsConfirmation(blocked)).toBe(true);
    expect(blocked).toMatchObject({
      ok: false,
      status: 'needs_confirmation',
      confirmation: {
        actionName: 'character_edit_image',
        message: 'Edit this character image with nanobanana?',
      },
    });
    expect(handler).not.toHaveBeenCalled();

    await expect(
      registry.execute('character_edit_image', { prompt: 'wear a flannel' }, { confirmed: true }),
    ).resolves.toMatchObject({
      ok: true,
      status: 'completed',
    });
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it('uses the latest scoped registration for the same action name', async () => {
    const registry = createVoiceActionRegistry();

    registry.register({
      name: 'character_select',
      scope: 'global',
      handler: async () => ({ ok: true, status: 'completed', message: 'global' }),
    });
    const unregisterScoped = registry.register({
      name: 'character_select',
      scope: 'character',
      handler: async () => ({ ok: true, status: 'completed', message: 'character scoped' }),
    });

    await expect(registry.execute('character_select', { name: 'Mira' })).resolves.toMatchObject({
      message: 'character scoped',
    });

    unregisterScoped();

    await expect(registry.execute('character_select', { name: 'Mira' })).resolves.toMatchObject({
      message: 'global',
    });
  });

  it('gates Story Protocol IP Vault actions behind confirmation', async () => {
    const registry = createVoiceActionRegistry();
    const handler = vi.fn(async () => ({
      ok: true as const,
      status: 'completed' as const,
      message: 'registration submitted',
    }));

    registry.register({
      name: 'ip_vault_register_ip',
      scope: 'ip-vault',
      confirmation: {
        risk: 'sensitive',
        message: 'Register this IP on Story Protocol with your wallet?',
      },
      handler,
    });

    const blocked = await registry.execute('ip_vault_register_ip', { itemId: 'vault-1' });
    expect(blocked).toMatchObject({
      ok: false,
      status: 'needs_confirmation',
      confirmation: {
        actionName: 'ip_vault_register_ip',
        risk: 'sensitive',
      },
    });
    expect(handler).not.toHaveBeenCalled();

    await expect(
      registry.execute('ip_vault_register_ip', { itemId: 'vault-1' }, { confirmed: true }),
    ).resolves.toMatchObject({
      ok: true,
      status: 'completed',
    });
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it('filters and blocks actions that are unavailable for the current app context', async () => {
    const registry = createVoiceActionRegistry();
    const handler = vi.fn(async () => ({
      ok: true as const,
      status: 'completed' as const,
      message: 'generated',
    }));

    registry.register({
      name: 'kanvas_generate',
      scope: 'kanvas',
      availability: (context) => context.app?.currentStudio === 'image',
      handler,
    });

    expect(registry.list({ app: { currentStudio: 'video' } })).toHaveLength(0);

    await expect(
      registry.execute('kanvas_generate', {}, { app: { currentStudio: 'video' } }),
    ).resolves.toMatchObject({
      ok: false,
      status: 'unavailable',
      errorCode: 'voice_action_unavailable',
    });
    expect(handler).not.toHaveBeenCalled();

    await expect(
      registry.execute('kanvas_generate', {}, { app: { currentStudio: 'image' } }),
    ).resolves.toMatchObject({
      ok: true,
      status: 'completed',
      traceId: expect.stringMatching(/^voice_kanvas_generate_/),
    });
  });
});
