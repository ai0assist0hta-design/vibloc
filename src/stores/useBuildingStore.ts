import { create } from 'zustand';
import type { Building, Tag, GenreKey } from '../types';
import { generateCity } from '../lib/geo/buildingGen';
import { generateDemoTags } from '../lib/app/demoSeed';

type BuildingStore = {
  buildings: Building[];
  tags: Map<string, Tag[]>;
  selectedBuildingId: string | null;

  initCity: () => void;
  selectBuilding: (id: string | null) => void;
  addTag: (buildingId: string, floor: number, genre: GenreKey) => void;
};

export const useBuildingStore = create<BuildingStore>((set, get) => ({
  buildings: [],
  tags: new Map(),
  selectedBuildingId: null,

  initCity: () => {
    const buildings = generateCity();
    const tags = new Map<string, Tag[]>();

    // Seed demo data
    const demoTags = generateDemoTags(buildings);
    for (const dt of demoTags) {
      const existing = tags.get(dt.buildingId) || [];
      existing.push({
        id: Math.random().toString(36).substring(2, 10),
        buildingId: dt.buildingId,
        floor: dt.floor,
        genre: dt.genre,
        vibeTags: [],
        userId: dt.userId,
        createdAt: dt.createdAt,
      });
      tags.set(dt.buildingId, existing);
    }

    set({ buildings, tags });
  },

  selectBuilding: (id) => {
    set({ selectedBuildingId: id });
  },

  addTag: (buildingId, floor, genre) => {
    const tags = new Map(get().tags);
    const buildingTags = [...(tags.get(buildingId) || [])];

    buildingTags.push({
      id: Math.random().toString(36).substring(2, 10),
      buildingId,
      floor,
      genre,
      vibeTags: [],
      userId: 'local-user',
      createdAt: new Date(),
    });

    tags.set(buildingId, buildingTags);
    set({ tags });
  },
}));
