"""mulberry32: a small seedable PRNG, bit-compatible with the frontend's generator so
sample data is identical whichever side produces it. All arithmetic is done on
unsigned 32-bit values; XOR / OR / shifts agree with JavaScript's int32 semantics
once the result is masked."""

MASK = 0xFFFFFFFF


def mulberry32(seed: int):
    a = seed & MASK

    def rand() -> float:
        nonlocal a
        a = (a + 0x6D2B79F5) & MASK
        t = a
        t = ((t ^ (t >> 15)) * (t | 1)) & MASK
        t ^= (t + (((t ^ (t >> 7)) * (t | 61)) & MASK)) & MASK
        return ((t ^ (t >> 14)) & MASK) / 4294967296

    return rand
