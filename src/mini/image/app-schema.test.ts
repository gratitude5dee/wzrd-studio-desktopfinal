import { describe, expect, it } from 'vitest';

import {
  CONTROLS,
  controlById,
  controlsForGroup,
  defaultControlValues,
  resetGroupValues,
} from './app-schema';

const OPTION_TYPES = new Set(['segmented', 'select', 'grid']);

describe('control schema', () => {
  it('has unique ids', () => {
    expect(new Set(CONTROLS.map((control) => control.id)).size).toBe(CONTROLS.length);
  });

  it('declares options for every option control and a range for every slider', () => {
    for (const control of CONTROLS) {
      if (OPTION_TYPES.has(control.type)) expect(control.options?.length).toBeGreaterThan(0);
      if (control.type === 'slider') expect(control.range).toBeDefined();
    }
  });

  it('defaults to a declared option for option controls', () => {
    const values = defaultControlValues();
    for (const control of CONTROLS) {
      if (!OPTION_TYPES.has(control.type)) continue;
      expect(control.options?.some((option) => option.value === values[control.id])).toBe(true);
    }
  });

  it('never declares the compact strip as a work surface (§5.1)', () => {
    for (const control of CONTROLS) {
      expect(control.surface.length).toBeGreaterThan(0);
      expect(control.surface).not.toContain('compact');
    }
  });

  it('renders every desktop control on the expanded sheet too', () => {
    const desktop = controlsForGroup('reframe', 'desktop').map((control) => control.id);
    const expanded = controlsForGroup('reframe', 'expanded').map((control) => control.id);
    for (const id of desktop) {
      expect(expanded).toContain(id);
      expect(controlById(id)?.group).toBe('reframe');
    }
  });

  it('keeps every reframe control local and prices every job control (§5.2)', () => {
    for (const control of CONTROLS) {
      if (control.group === 'reframe') {
        expect(control.cost).toBe('local');
        expect(control.available).toBe(true);
      }
      if (control.cost === 'job') expect(control.credits).toBeGreaterThan(0);
    }
  });

  it('resets one group at a time, never globally (§5.2)', () => {
    const dirty = { ...defaultControlValues(), 'reframe.aspect': '1:1', 'style.tier': 'quality' };
    const reset = resetGroupValues('reframe', dirty);
    expect(reset['reframe.aspect']).toBe('free');
    expect(reset['style.tier']).toBe('quality');
  });
});
