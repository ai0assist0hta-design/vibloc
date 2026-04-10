import type { Tag, GenreKey } from '../types';
import { GENRE_COLORS } from '../data/genres';

export function getTimeDecayWeight(createdAt: Date): number {
  const days = (Date.now() - createdAt.getTime()) / 86400000;
  return Math.exp(-0.01 * days);
}

export function getBuildingColor(tags: Tag[]): string {
  if (tags.length === 0) return '#d0d4de';

  const genreWeights: Partial<Record<GenreKey, number>> = {};

  for (const tag of tags) {
    const weight = getTimeDecayWeight(tag.createdAt);
    genreWeights[tag.genre] = (genreWeights[tag.genre] || 0) + weight;
  }

  const sorted = Object.entries(genreWeights).sort(([, a], [, b]) => b - a);
  // Defensive: a stale tag.genre (e.g. cached pre-migration) may not
  // be a current GenreKey. Fall back to neutral instead of crashing.
  const top = GENRE_COLORS[sorted[0][0] as GenreKey];
  return (top ?? GENRE_COLORS.pop).color;
}

export function getBuildingOpacity(tagCount: number): number {
  if (tagCount === 0) return 0;
  if (tagCount <= 5) return 0.12;
  if (tagCount <= 20) return 0.28;
  return 0.5;
}

export function getBuildingState(tagCount: number): 'empty' | 'hinted' | 'forming' | 'full' {
  if (tagCount === 0) return 'empty';
  if (tagCount <= 5) return 'hinted';
  if (tagCount <= 20) return 'forming';
  return 'full';
}

export function getFloorColor(tags: Tag[], floor: number): string {
  const floorTags = tags.filter((t) => t.floor === floor);
  if (floorTags.length === 0) return '#d0d4de';
  return getBuildingColor(floorTags);
}

export function getFloorTagCount(tags: Tag[], floor: number): number {
  return tags.filter((t) => t.floor === floor).length;
}
