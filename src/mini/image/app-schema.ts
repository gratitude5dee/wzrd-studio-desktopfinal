/**
 * Schema-driven control system (§5.1).
 *
 * Every control the Image Editor exposes is declared here once. Both the
 * desktop intent rail and the mobile bottom sheet render from this same
 * declaration, so a control can never exist on one surface only.
 */

export type ControlType = 'action' | 'choice' | 'range' | 'toggle';

/** Which intent group a control belongs to. */
export type ControlGroup = 'reframe' | 'retouch' | 'style';

/** Where a control is allowed to render. */
export type ControlSurface = 'rail' | 'sheet' | 'both';

/**
 * Credit cost tier. `0` runs entirely on-device; higher tiers render a cost dot
 * and only become available once the reactor path ships.
 */
export type ControlCost = 0 | 1 | 2;

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
  surface: ControlSurface;
  default?: string | number | boolean;
  options?: ControlOption[];
  range?: ControlRange;
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

export const INTENT_GROUPS: IntentGroupDefinition[] = [
  { id: 'reframe', label: 'Reframe', available: true },
  { id: 'retouch', label: 'Retouch', available: false },
  { id: 'style', label: 'Style', available: false },
];

export const CONTROLS: ControlDefinition[] = [
  {
    id: 'reframe.aspect',
    label: 'Crop',
    type: 'choice',
    group: 'reframe',
    cost: 0,
    surface: 'both',
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
    cost: 0,
    surface: 'both',
    available: true,
    hint: 'Rotate 90° clockwise',
  },
  {
    id: 'reframe.flip-horizontal',
    label: 'Flip',
    type: 'action',
    group: 'reframe',
    cost: 0,
    surface: 'both',
    available: true,
    hint: 'Mirror horizontally',
  },
  {
    id: 'reframe.flip-vertical',
    label: 'Flip vertical',
    type: 'action',
    group: 'reframe',
    cost: 0,
    surface: 'sheet',
    available: true,
  },
  {
    id: 'reframe.straighten',
    label: 'Straighten',
    type: 'range',
    group: 'reframe',
    cost: 0,
    surface: 'both',
    default: 0,
    range: { min: -15, max: 15, step: 0.5 },
    available: true,
  },
  {
    id: 'retouch.remove-bg',
    label: 'Remove background',
    type: 'action',
    group: 'retouch',
    cost: 1,
    surface: 'both',
    available: false,
  },
  {
    id: 'retouch.erase',
    label: 'Erase',
    type: 'action',
    group: 'retouch',
    cost: 1,
    surface: 'both',
    available: false,
  },
  {
    id: 'retouch.upscale',
    label: 'Upscale',
    type: 'action',
    group: 'retouch',
    cost: 2,
    surface: 'both',
    available: false,
  },
  {
    id: 'retouch.enhance',
    label: 'Enhance',
    type: 'action',
    group: 'retouch',
    cost: 1,
    surface: 'both',
    available: false,
  },
  {
    id: 'style.preset',
    label: 'Look',
    type: 'choice',
    group: 'style',
    cost: 0,
    surface: 'both',
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
    id: 'style.quality',
    label: 'Quality',
    type: 'choice',
    group: 'style',
    cost: 2,
    surface: 'both',
    default: 'fast',
    options: [
      { value: 'fast', label: 'Fast' },
      { value: 'quality', label: 'Quality' },
    ],
    available: false,
  },
];

export function controlsForGroup(group: ControlGroup, surface: 'rail' | 'sheet'): ControlDefinition[] {
  return CONTROLS.filter(
    (control) => control.group === group && (control.surface === 'both' || control.surface === surface)
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
