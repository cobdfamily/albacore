type RawAttributes = Record<string, unknown>;
type NormalizedAttributes = Record<string, unknown>;
type CurrentmapRoles = {
  toAria: Record<string, string | undefined>;
  toNative: Record<string, string | undefined>;
};

const roles = await loadCurrentmapRoles();
const roleMap = roles.toAria;

// TODO(v0.2): expand as more platform AX attributes are brokered through Bluefin.
export const rawToCanonicalAttribute = {
  AXTitle: 'name',
  AXDescription: 'description',
  AXHelp: 'description',
  AXValue: 'value',
  AXPlaceholderValue: 'placeholder',
  AXRole: 'role',
  AXChildren: 'children',
  AXParent: 'parent',
  AXDisclosureLevel: 'level',
  AXMinValue: 'valueMin',
  AXMaxValue: 'valueMax',
  AXSelectedTextRange: 'selectedRange',
  AXPosition: 'position',
  AXSize: 'size',
  AXIdentifier: 'stableId'
} as const satisfies Record<string, string>;

// TODO(v0.2): expand fallback chains for platform-specific equivalents.
export const canonicalToRawAttributes = {
  name: ['AXTitle', 'AXDescription'],
  description: ['AXDescription', 'AXHelp'],
  value: ['AXValue'],
  placeholder: ['AXPlaceholderValue'],
  role: ['AXRole'],
  children: ['AXChildren'],
  parent: ['AXParent'],
  level: ['AXDisclosureLevel'],
  valueMin: ['AXMinValue'],
  valueMax: ['AXMaxValue'],
  selectedRange: ['AXSelectedTextRange'],
  position: ['AXPosition'],
  size: ['AXSize'],
  stableId: ['AXIdentifier'],
  states: [
    'AXFocused',
    'AXFocusable',
    'AXSelected',
    'AXSelectable',
    'AXExpanded',
    'AXPressed',
    'AXEnabled',
    'AXRequired',
    'AXElementBusy',
    'AXModal',
    'AXHidden',
    'AXOffscreen',
    'AXAllowsMultipleSelection',
    'AXHasPopup',
    'AXRole',
    'AXValue'
  ]
} as const satisfies Record<string, readonly string[]>;

// TODO(v0.2): expand action coverage beyond the first Bluefin/macOS subset.
export const rawToCanonicalAction = {
  AXPress: 'invoke',
  AXShowMenu: 'showMenu',
  AXIncrement: 'increment',
  AXDecrement: 'decrement',
  AXConfirm: 'confirm',
  AXCancel: 'cancel',
  AXRaise: 'raise'
} as const satisfies Record<string, string>;

const stateSources = new Set<string>(canonicalToRawAttributes.states);

export const attributes = {
  normalize,
  rawNamesFor,
  normalizeActions,
  rawToCanonical: rawToCanonicalAttribute,
  canonicalToRaw: canonicalToRawAttributes,
  roleMap
};

export function normalize(rawAttrs: RawAttributes): NormalizedAttributes {
  const normalized: NormalizedAttributes = {};

  for (const [rawName, rawValue] of Object.entries(rawAttrs)) {
    const canonicalName = rawToCanonicalAttribute[rawName as keyof typeof rawToCanonicalAttribute];
    if (!canonicalName) continue;

    const value = canonicalName === 'role' ? normalizeRole(rawValue) : rawValue;
    if (canonicalName === 'name') {
      assignIfPresent(normalized, 'name', value);
      continue;
    }

    assignIfPresent(normalized, canonicalName, value);

    if (rawName === 'AXDescription' && !hasMeaningfulValue(normalized.name)) {
      assignIfPresent(normalized, 'name', value);
    }
  }

  if (hasAnyStateSource(rawAttrs)) {
    normalized.states = composeStates(rawAttrs);
  }

  return normalized;
}

export function rawNamesFor(canonicalNames: readonly string[]): string[] {
  const rawNames = new Set<string>();

  for (const canonicalName of canonicalNames) {
    const names = canonicalToRawAttributes[canonicalName as keyof typeof canonicalToRawAttributes];
    if (!names) {
      throw new Error(`Unknown canonical attribute "${canonicalName}".`);
    }
    for (const name of names) rawNames.add(name);
  }

  return [...rawNames];
}

export function normalizeActions(rawActions: readonly string[]): string[] {
  return rawActions.map((action) => rawToCanonicalAction[action as keyof typeof rawToCanonicalAction] ?? action);
}

function composeStates(rawAttrs: RawAttributes): string[] {
  const states: string[] = [];

  pushState(states, 'focused', rawAttrs.AXFocused === true);
  pushState(states, 'focusable', rawAttrs.AXFocusable === true);
  pushState(states, 'selected', rawAttrs.AXSelected === true);
  pushState(states, 'selectable', rawAttrs.AXSelectable === true);
  pushState(states, 'expanded', rawAttrs.AXExpanded === true);
  pushState(states, 'pressed', rawAttrs.AXPressed === true || isPressedToggleValue(rawAttrs));
  pushState(states, 'disabled', rawAttrs.AXEnabled === false);
  pushState(states, 'required', rawAttrs.AXRequired === true);
  pushState(states, 'busy', rawAttrs.AXElementBusy === true);
  pushState(states, 'modal', rawAttrs.AXModal === true);
  pushState(states, 'hidden', rawAttrs.AXHidden === true);
  pushState(states, 'offscreen', rawAttrs.AXOffscreen === true);
  pushState(states, 'multiselect', rawAttrs.AXAllowsMultipleSelection === true);
  pushState(states, 'hasPopup', rawAttrs.AXHasPopup === true);

  return states;
}

function normalizeRole(value: unknown): unknown {
  if (typeof value !== 'string') return value;
  return roleMap[value] ?? value;
}

function isPressedToggleValue(rawAttrs: RawAttributes): boolean {
  if (rawAttrs.AXValue !== 1) return false;
  const role = rawAttrs.AXRole;
  return role === 'AXCheckBox' || role === 'AXRadioButton' || role === 'AXSwitch';
}

function hasAnyStateSource(rawAttrs: RawAttributes): boolean {
  return Object.keys(rawAttrs).some((name) => stateSources.has(name));
}

function pushState(states: string[], state: string, enabled: boolean): void {
  if (enabled) states.push(state);
}

function assignIfPresent(target: NormalizedAttributes, key: string, value: unknown): void {
  if (hasMeaningfulValue(value)) target[key] = value;
}

function hasMeaningfulValue(value: unknown): boolean {
  return value !== null && value !== undefined && value !== '';
}

async function loadCurrentmapRoles(): Promise<CurrentmapRoles> {
  try {
    const currentmap = await import('@cobd/currentmap');
    return currentmap.roles;
  } catch {
    return { toAria: {}, toNative: {} };
  }
}
