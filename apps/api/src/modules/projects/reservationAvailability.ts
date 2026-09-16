/** Reservations use half-open intervals: an item returned at t is free at t. */
export function peakBookedQuantity(
  reservations: ReadonlyArray<{ starts_at: Date; ends_at: Date; qty: number }>,
): number {
  const events = reservations.flatMap(({ starts_at, ends_at, qty }) => [
    { at: starts_at.getTime(), change: qty },
    { at: ends_at.getTime(), change: -qty },
  ]);
  events.sort((a, b) => a.at - b.at || a.change - b.change);
  let booked = 0;
  let peak = 0;
  for (const event of events) {
    booked += event.change;
    peak = Math.max(peak, booked);
  }
  return peak;
}
