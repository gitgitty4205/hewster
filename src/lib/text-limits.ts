export const TEXT_LIMITS = {
  shortName: 40,
  mediumText: 150,
  dose: 40,
  note: 150,
} as const;

export function clampText(value: string, limit: number) {
  return value.slice(0, limit);
}
