/** The signed-in member's card always comes first; everyone else keeps the points order. */
export function pinMeFirst<T extends { user_id: string }>(rows: T[], myUserId?: string | null): T[] {
  if (!myUserId) return rows;
  const mine = rows.filter((r) => r.user_id === myUserId);
  return mine.length ? [...mine, ...rows.filter((r) => r.user_id !== myUserId)] : rows;
}
