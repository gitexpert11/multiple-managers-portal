/** Small, fast, seedable PRNG (32-bit state) used by the deterministic sample-data generators. */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function randInt(rand: () => number, min: number, max: number): number {
  return min + Math.floor(rand() * (max - min + 1));
}

export function pick<T>(rand: () => number, list: readonly T[]): T {
  return list[Math.floor(rand() * list.length)] as T;
}

export function pickDistinct<T>(rand: () => number, list: readonly T[], n: number): T[] {
  const pool = [...list];
  const picked: T[] = [];
  while (picked.length < n && pool.length) picked.push(pool.splice(Math.floor(rand() * pool.length), 1)[0] as T);
  return picked;
}
