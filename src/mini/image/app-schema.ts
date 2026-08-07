/**
 * Schema-driven control system (§5.1).
 *
 * Every control the Image Editor exposes is declared here once, as data. That
 * is what lets one definition render as a bottom sheet on a phone and a panel
 * on desktop without forking behaviour (§5.1), and it is why `surface` is a
 * list rather than a single value.
 */

export type ControlType = 'segmented' | 'slider' | 'select' | 'action' | 'toggle' | 'grid';

/** Which intent group a control belongs to (§3.2). */
export type ControlGroup = 'reframe' | 'retouch' | 'style';

/**
 * Work surfaces. The compact strip is never one (§5.1) — it is a launcher, so
 * no control may declare it.
 */
export type ControlSurface = 'expanded' | 'desktop';

/**
 * §5.2: every control shows its cost before it runs. `local` shows nothing,
 * because free and instant is the default assumption; `job` carries a blue dot
 * and its credit count in mono.
 */
export type ControlCost = 'local' | 'job';

export interface ControlOption {
  value: string;
  label: string;
}

export interface ControlRange {
  min: number;
  max: number;
  step: number;
}

export interface ControlDefinition {
  id: string;
  label: string;
  type: ControlType;
  group: ControlGroup;
  cost: ControlCost;
  surface: ControlSurface[];
  default?: string | number | boolean;
  options?: ControlOption[];
  range?: ControlRange;
  /** Credits shown beside the cost dot. Job controls only. */
  credits?: number;
  /** Phase gate: controls whose backing path has not shipped render disabled. */
  available?: boolean;
  hint?: string;
}

export interface IntentGroupDefinition {
  id: ControlGroup;
  label: string;
  /** Groups without a shipped backend still render, but their controls are disabled. */
  available: boolean;
}

/** §3.2: three intents, in order of decreasing frequency. Reframe is first and local. */
export const INTENT_GROUPS: IntentGroupDefinition[] = [
  { id: 'reframe', label: 'Reframe', available: true },
  { id: 'retouch', label: 'Retouch', available: false },
  { id: 'style', label: 'Style', available: false },
];

const EVERYWHERE: ControlSurface[] = ['expanded', 'desktop'];

export const CONTROLS: ControlDefinition[] = [
  {
    id: 'reframe.aspect',
    label: 'Crop',
    type: 'segmented',
    group: 'reframe',
    cost: 'local',
    surface: EVERYWHERE,
    default: 'free',
    options: [
      { value: '1:1', label: '1:1' },
      { value: '4:5', label: '4:5' },
      { value: '9:16', label: '9:16' },
      { value: '16:9', label: '16:9' },
      { value: 'free', label: 'Free' },
    ],
    available: true,
  },
  {
    id: 'reframe.rotate',
    label: 'Rotate',
    type: 'action',
    group: 'reframe',
    cost: 'local',
    surface: EVERYWHERE,
    available: true,
    hint: 'Rotate 90° clockwise',
  },
  {
    id: 'reframe.flip-horizontal',
    label: 'Flip',
    type: 'action',
    group: 'reframe',
    cost: 'local',
    surface: EVERYWHERE,
    available: true,
    hint: 'Mirror horizontally',
  },
  {
    id: 'reframe.flip-vertical',
    label: 'Flip vertical',
    type: 'action',
    group: 'reframe',
    cost: 'local',
    surface: ['expanded'],
    available: true,
  },
  {
    id: 'reframe.straighten',
    label: 'Straighten',
    type: 'slider',
    group: 'reframe',
    cost: 'local',
    surface: EVERYWHERE,
    default: 0,
    range: { min: -15, max: 15, step: 0.5 },
    available: true,
  },
  {
    id: 'retouch.remove-bg',
    label: 'Remove background',
    type: 'action',
    group: 'retouch',
    cost: 'job',
    surface: EVERYWHERE,
    credits: 1,
    available: false,
  },
  {
    id: 'retouch.erase',
    label: 'Erase',
    type: 'action',
    group: 'retouch',
    cost: 'job',
    surface: EVERYWHERE,
    credits: 1,
    available: false,
  },
  {
    id: 'retouch.upscale',
    label: 'Upscale',
    type: 'action',
    group: 'retouch',
    cost: 'job',
    surface: EVERYWHERE,
    credits: 2,
    available: false,
  },
  {
    id: 'retouch.enhance',
    label: 'Enhance',
    type: 'action',
    group: 'retouch',
    cost: 'job',
    surface: EVERYWHERE,
    credits: 1,
    available: false,
  },
  /** §4.4: local presets are free and instant; the generative ones cost a job. */
  {
    id: 'style.local',
    label: 'Look',
    type: 'grid',
    group: 'style',
    cost: 'local',
    surface: EVERYWHERE,
    default: 'none',
    options: [
      { value: 'none', label: 'None' },
      { value: 'punch', label: 'Punch' },
      { value: 'faded', label: 'Faded' },
      { value: 'cool', label: 'Cool' },
      { value: 'warm', label: 'Warm' },
      { value: 'mono', label: 'Mono' },
      { value: 'contrast', label: 'Contrast' },
      { value: 'dither', label: 'Dither' },
    ],
    available: false,
  },
  {
    id: 'style.generative',
    label: 'Restyle',
    type: 'grid',
    group: 'style',
    cost: 'job',
    surface: EVERYWHERE,
    default: 'none',
    options: [
      { value: 'none', label: 'None' },
      { value: 'illustrate', label: 'Illustrate' },
      { value: 'paint', label: 'Paint' },
      { value: 'anime', label: 'Anime' },
      { value: 'ascii', label: 'ASCII' },
    ],
    credits: 1,
    available: false,
  },
  {
    id: 'style.tier',
    label: 'Quality',
    type: 'segmented',
    group: 'style',
    cost: 'local',
    surface: EVERYWHERE,
    default: 'fast',
    options: [
      { value: 'fast', label: 'Fast' },
      { value: 'quality', label: 'Quality' },
    ],
    available: false,
  },
];

export function controlsForGroup(
  group: ControlGroup,
  surface: ControlSurface
): ControlDefinition[] {
  return CONTROLS.filter(
    (control) => control.group === group && control.surface.includes(surface)
  );
}

export function controlById(id: string): ControlDefinition | undefined {
  return CONTROLS.find((control) => control.id === id);
}

export type ControlValues = Record<string, string | number | boolean>;

export function defaultControlValues(): ControlValues {
  return CONTROLS.reduce<ControlValues>((values, control) => {
    if (control.default !== undefined) {
      values[control.id] = control.default;
    }
    return values;
  }, {});
}

/** §5.2: reset is per-group, never global. */
export function resetGroupValues(group: ControlGroup, values: ControlValues): ControlValues {
  const next = { ...values };
  for (const control of CONTROLS) {
    if (control.group === group && control.default !== undefined) {
      next[control.id] = control.default;
    }
  }
  return next;
}
