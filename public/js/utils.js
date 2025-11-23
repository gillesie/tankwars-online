export function seededRandom(seedObj) {
    // Expects an object { val: number } to act as a mutable reference if needed, 
    // but the original code used a global. We'll implement a simple one.
    let t = seedObj.val += 0x6D2B79F5;
    t = Math.imul(t ^ t >>> 15, t | 1);
    t ^= t + Math.imul(t ^ t >>> 7, t | 61);
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
}

export function rand(min, max, seedObj) {
    const r = seededRandom(seedObj);
    return r * (max - min) + min;
}

export const fxRand = (min, max) => Math.random() * (max - min) + min;
export const clamp = (val, min, max) => Math.min(Math.max(val, min), max);
export const dist = (x1, y1, x2, y2) => Math.sqrt((x2-x1)**2 + (y2-y1)**2);