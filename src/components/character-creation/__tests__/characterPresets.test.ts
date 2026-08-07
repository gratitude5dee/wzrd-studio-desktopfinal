import { describe, expect, it } from 'vitest';

import {
  CHARACTER_PRESETS,
  stashPresetStarter,
  takePresetStarter,
} from '@/components/character-creation/characterPresets';

describe('characterPresets', () => {
  it('exposes presets with image, traits, and style seeds', () => {
    expect(CHARACTER_PRESETS.length).toBeGreaterThan(0);
    for (const preset of CHARACTER_PRESETS) {
      expect(preset.id).toBeTruthy();
      expect(preset.name).toBeTruthy();
      expect(preset.imageUrl).toBeTruthy();
      expect(preset.traits).toBeTypeOf('object');
      expect(preset.styleDetails).toBeTypeOf('object');
    }
  });

  it('has unique preset ids', () => {
    const ids = CHARACTER_PRESETS.map((p) => p.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('stashes and consumes a pending preset exactly once', () => {
    expect(takePresetStarter()).toBeNull();

    stashPresetStarter(CHARACTER_PRESETS[0]);
    expect(takePresetStarter()).toEqual(CHARACTER_PRESETS[0]);
    expect(takePresetStarter()).toBeNull();
  });
});
