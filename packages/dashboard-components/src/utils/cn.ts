/**
 * Minimal classname concatenator — avoids pulling in `clsx`/`tailwind-merge`
 * for components that don't need conditional merging. Accepts strings or
 * falsy values and returns a single space-joined string.
 */
export function cn(...inputs: Array<string | false | null | undefined>): string {
  return inputs.filter(Boolean).join(' ')
}
