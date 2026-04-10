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

/**
 * GenreKey mirrors Apple Music's top-level genre taxonomy as exposed
 * by the iTunes Search API's `primaryGenreName` field. This is NOT a
 * hand-rolled palette — every key here corresponds 1:1 with a category
 * Apple itself ships in its iTunes Genre Catalog (parent id 34
 * "Music"). Adding/removing keys means a real change to which Apple
 * categories we can render, not just a UI rename.
 */
export type GenreKey =
  | 'pop'           // "Pop"
  | 'rock'          // "Rock"
  | 'hiphop'        // "Hip-Hop/Rap"
  | 'rnb'           // "R&B/Soul"
  | 'electronic'    // "Dance" / "Electronic"
  | 'alternative'   // "Alternative"
  | 'jazz'          // "Jazz"
  | 'classical'     // "Classical"
  | 'country'       // "Country"
  | 'latin'         // "Latin"
  | 'kpop'          // "K-Pop"
  | 'jpop'          // "J-Pop"
  | 'soundtrack'    // "Soundtrack" (film/TV/musical)
  | 'singer'        // "Singer/Songwriter"
  | 'reggae'        // "Reggae"
  | 'world'         // "World"
  | 'blues'         // "Blues"
  | 'anime';        // "Anime"

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
