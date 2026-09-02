export interface CFUserProfile {
  handle: string;
  /** `null` for unrated users (no rated contests yet). */
  rating: number | null;
  maxRating: number | null;
  rank: string | null;
  maxRank: string | null;
  contribution: number;
  titlePhoto: string | null;
}
