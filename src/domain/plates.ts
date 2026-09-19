export function computePlates(
  target: number, barWeight: number, plates: number[],
): { perSide: { plate: number; count: number }[]; leftover: number } {
  let perSideWeight = (target - barWeight) / 2;
  if (perSideWeight <= 0) return { perSide: [], leftover: 0 };
  const sorted = [...plates].sort((a, b) => b - a);
  const out: { plate: number; count: number }[] = [];
  const EPS = 1e-6;
  for (const p of sorted) {
    let count = 0;
    while (perSideWeight + EPS >= p) { perSideWeight -= p; count++; }
    if (count > 0) out.push({ plate: p, count });
  }
  return { perSide: out, leftover: perSideWeight < EPS ? 0 : Number(perSideWeight.toFixed(3)) };
}
