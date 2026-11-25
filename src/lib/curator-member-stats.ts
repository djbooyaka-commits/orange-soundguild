export type MemberSubmission = {
  curator_playlist_id: string;
  submitter_user_id: string;
  created_at: string;
  cost_points: number;
  status: string;
};

export function memberSubmissionStats(rows: MemberSubmission[], playlistId: string, userId: string, now = Date.now()) {
  const cutoff = now - 30 * 24 * 60 * 60 * 1000;
  const submissions = rows.filter((row) => row.curator_playlist_id === playlistId && row.submitter_user_id === userId && row.status !== "rejected" && Date.parse(row.created_at) >= cutoff);
  return { count: submissions.length, points: submissions.reduce((sum, row) => sum + Number(row.cost_points || 0), 0), submissions };
}