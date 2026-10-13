function decimalPlaces(value: number): number {
  for (let places = 0; places <= 6; places++) {
    const scaled = value * 10 ** places;
    if (
      Math.abs(scaled - Math.round(scaled)) <=
      Number.EPSILON * Math.max(1, Math.abs(scaled)) * 16
    )
      return places;
  }
  return 6;
}

export function formatNumericValue(
  min: number,
  max: number,
  step = 0,
): (value: number) => string {
  const range = Math.abs(max - min);
  const basePrecision =
    step > 0
      ? decimalPlaces(step)
      : range > 0
        ? Math.min(6, Math.max(2, 2 + Math.ceil(-Math.log10(range))))
        : 2;
  const precision = Math.max(
    basePrecision,
    decimalPlaces(min),
    decimalPlaces(max),
  );
  return (value) =>
    Number.isFinite(value) ? value.toFixed(precision) : String(value);
}
