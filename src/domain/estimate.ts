export function estimate1RM(weight: number, reps: number): number {
  if (reps <= 0) return weight;
  return weight * (1 + reps / 30);
}
