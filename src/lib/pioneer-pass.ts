/** Pioneer Artists need this many uploaded tracks before their 15-day free submission unlocks. */
export const PIONEER_PASS_MIN_TRACKS = 5;
export const PIONEER_PASS_DAYS = 15;

/** True when a Pioneer has uploaded enough tracks to unlock the free pass. */
export function pioneerHasEnoughTracks(uploaded: number): boolean {
  return uploaded >= PIONEER_PASS_MIN_TRACKS;
}

/** How many more tracks a Pioneer must upload (never below zero). */
export function pioneerTracksNeeded(uploaded: number): number {
  return Math.max(0, PIONEER_PASS_MIN_TRACKS - Math.max(0, Math.floor(uploaded)));
}
