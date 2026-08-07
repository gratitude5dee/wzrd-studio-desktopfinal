import { describe, expect, it } from 'vitest';

import { CONTROLS, controlById, controlsForGroup, defaultControlValues } from './app-schema';

describe('control schema', () => {
  it('has unique ids', () => {
    expect(new Set(CONTROLS.map((control) => control.id)).size).toBe(CONTROLS.length);
  });

  it('declares options for every choice and a range for every range control', () => {
    for (const control of CONTROLS) {
      if (control.type === 'choice') expect(control.options?.length).toBeGreaterThan(0);
      if (control.type === 'range') expect(control.range).toBeDefined();
    }
  });

  it('defaults to a declared option for choice controls', () => {
    const values = defaultControlValues();
    for (const control of CONTROLS) {
      if (control.type !== 'choice') continue;
      expect(control.options?.some((option) => option.value === values[control.id])).toBe(true);
    }
  });

  it('renders `both` controls on the rail and the sheet alike', () => {
    const rail = controlsForGroup('reframe', 'rail').map((control) => control.id);
    const sheet = controlsForGroup('reframe', 'sheet').map((control) => control.id);
    for (const id of rail) {
      expect(sheet).toContain(id);
      expect(controlById(id)?.group).toBe('reframe');
    }
  });

  it('keeps every reframe control local and every retouch control priced', () => {
    for (const control of CONTROLS) {
      if (control.group === 'reframe') {
        expect(control.cost).toBe(0);
        expect(control.available).toBe(true);
      }
      if (control.group === 'retouch') expect(control.cost).toBeGreaterThan(0);
    }
  });
});
