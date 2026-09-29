export const PRELUDE: string;
export function decode(v: unknown): unknown;
export function encode(v: unknown, depth?: number): unknown;
export function errorText(e: unknown): string;
export interface Loaded {
  target: unknown;
  isClass: boolean;
}
export function load(js: string, entry: string | null, consoleObject: unknown): Loaded | { error: string };
export function runCase(loaded: Loaded, rawArgs: unknown[]): { actual: unknown; error: string | null };
