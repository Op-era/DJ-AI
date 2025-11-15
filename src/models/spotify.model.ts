// Basic interfaces for Spotify data
export interface SpotifyUser {
  display_name: string;
  id: string;
}

export interface SpotifyImage {
  url: string;
  height: number;
  width: number;
}

export interface SpotifyArtist {
  name: string;
  id: string;
}

export interface SpotifyAlbum {
  name: string;
  images: SpotifyImage[];
}

export interface SpotifyTrack {
  id: string;
  name: string;
  artists: SpotifyArtist[];
  album: SpotifyAlbum;
  uri: string;
  duration_ms: number;
}

export interface SpotifyPlayerState {
  track_window: {
    current_track: SpotifyTrack | null;
    next_tracks: SpotifyTrack[];
    previous_tracks: SpotifyTrack[];
  };
  paused: boolean;
  position: number; // in ms
  duration: number; // in ms
}

export interface SpotifyAudioFeatures {
  danceability: number;
  energy: number;
  key: number; // Pitch class notation (0=C, 1=C#, etc.)
  loudness: number;
  mode: number; // 0 for minor, 1 for major
  speechiness: number;
  acousticness: number;
  instrumentalness: number;
  liveness: number;
  valence: number;
  tempo: number; // BPM
  id: string;
  uri: string;
  track_href: string;
  analysis_url: string;
  duration_ms: number;
  time_signature: number;
}
