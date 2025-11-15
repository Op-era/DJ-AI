export interface SoundCloudTrack {
  id: number;
  title: string;
  artist: string;
  url: string;
  artwork_url: string;
  bpm: number;
  key: string;
  match_score: number; // 0-100
}
