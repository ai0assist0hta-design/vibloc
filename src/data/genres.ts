import type { GenreKey, GenreColor } from '../types';

export const GENRE_COLORS: Record<GenreKey, GenreColor> = {
  jazz: { name: 'jazz', color: '#ff9500', label: 'Jazz / Soul / Lofi', feel: 'Warm, analog' },
  electronic: { name: 'electronic', color: '#00c7be', label: 'Electronic / Techno', feel: 'Cold, digital' },
  pop: { name: 'pop', color: '#ff2d55', label: 'Pop / K-pop', feel: 'Energetic, bold' },
  rnb: { name: 'rnb', color: '#af52de', label: 'R&B / Hip-hop', feel: 'Deep, nocturnal' },
  indie: { name: 'indie', color: '#34c759', label: 'Indie / Folk', feel: 'Organic, earthy' },
  rock: { name: 'rock', color: '#ff453a', label: 'Rock / Metal', feel: 'Raw, aggressive' },
  classical: { name: 'classical', color: '#ffcc00', label: 'Classical', feel: 'Refined, golden' },
};

export const VIBE_TAGS = [
  'Chill', 'Trendy', 'Ethereal', 'Rainy-day',
  'Hidden gem', 'Energetic', 'Dramatic', 'Flow',
] as const;
