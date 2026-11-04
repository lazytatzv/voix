/**
 * Deterministic, dependency-free 64-bit FNV-1a style hash.
 * Used for stable TTS/audio cache keys so projects can be reloaded
 * without hitting the TTS engine again.
 */
export function stableHash(input: string): string {
  let h1 = 0x811c9dc5;
  let h2 = 0x01000193;
  for (let i = 0; i < input.length; i++) {
    const code = input.charCodeAt(i);
    h1 ^= code;
    h1 = Math.imul(h1, 0x01000193) >>> 0;
    h2 = Math.imul(h2 ^ code, 0x85ebca6b) >>> 0;
  }
  const a = h1.toString(16).padStart(8, '0');
  const b = h2.toString(16).padStart(8, '0');
  return `${a}${b}`;
}

export function makeCacheKey(parts: Array<string | number | undefined | null>): string {
  return stableHash(parts.map((p) => String(p ?? '')).join('\u0001'));
}
