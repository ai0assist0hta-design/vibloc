import type { Building, GenreKey } from '../types';

const GENRES: GenreKey[] = ['jazz', 'electronic', 'pop', 'rnb', 'indie', 'rock', 'classical'];
const DEMO_USERS = ['minjae', 'yuna', 'hyunwoo', 'soyeon', 'jiwon', 'taeho', 'eunji'];

function pick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

function randomDaysAgo(maxDays: number): Date {
  const d = new Date();
  d.setDate(d.getDate() - Math.floor(Math.random() * maxDays));
  return d;
}

export function generateDemoTags(buildings: Building[]) {
  const tags: { buildingId: string; floor: number; genre: GenreKey; userId: string; createdAt: Date }[] = [];

  // Seed ~30% of buildings with tags
  for (const b of buildings) {
    if (Math.random() > 0.35) continue;

    // Each seeded building gets 2-15 tags
    const tagCount = Math.floor(Math.random() * 13) + 2;
    // Pick a dominant genre for this building (70% chance for each tag)
    const dominant = pick(GENRES);

    for (let i = 0; i < tagCount; i++) {
      const genre = Math.random() < 0.7 ? dominant : pick(GENRES);
      const floor = Math.floor(Math.random() * b.levels) + 1;
      tags.push({
        buildingId: b.id,
        floor,
        genre,
        userId: pick(DEMO_USERS),
        createdAt: randomDaysAgo(60),
      });
    }
  }

  return tags;
}
