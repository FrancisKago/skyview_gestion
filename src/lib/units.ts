export function round3(n: number): number {
  return Math.round(n * 1000) / 1000;
}

export function packsToBase(packs: number, packSize: number): number {
  return round3(packs * packSize);
}

export function totalBase(input: { packs: number; units: number; packSize: number | null }): number {
  const fromPacks = input.packSize ? packsToBase(input.packs, input.packSize) : 0;
  return round3(fromPacks + input.units);
}
