export type Building = {
  id: string;
  name: string;
  position: [number, number, number];
  width: number;
  depth: number;
  height: number;
  levels: number;
  isLandmark: boolean;
};

export type Tag = {
  id: string;
  buildingId: string;
  floor: number;
  genre: GenreKey;
  trackName?: string;
  artistName?: string;
  artworkUrl?: string;
  previewUrl?: string;
  comment?: string;
  vibeTags: string[];
  userId: string;
  createdAt: Date;
};

export type GenreKey =
  | 'jazz'
  | 'electronic'
  | 'pop'
  | 'rnb'
  | 'indie'
  | 'rock'
  | 'classical';

export type GenreColor = {
  name: string;
  color: string;
  label: string;
  feel: string;
};

export type User = {
  id: string;
  displayName: string;
  level: number;
  xp: number;
  vibeCredits: number;
};
