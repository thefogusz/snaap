export interface SetupChange { path: string; label: string; action: 'add' | 'remove' | 'change'; before?: unknown; after?: unknown; }
export function diffSetup(before: unknown, after: unknown): SetupChange[];
export function describeSetupValue(value: unknown): string;
