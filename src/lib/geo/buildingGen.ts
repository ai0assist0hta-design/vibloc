import type { Building } from '../../types';

function randomRange(min: number, max: number): number {
  return Math.random() * (max - min) + min;
}

function generateId(): string {
  return Math.random().toString(36).substring(2, 10);
}

export function generateCity(gridSize: number = 12, blockSize: number = 3.5, gap: number = 1.2): Building[] {
  const buildings: Building[] = [];
  const half = (gridSize * (blockSize + gap)) / 2;

  for (let row = 0; row < gridSize; row++) {
    for (let col = 0; col < gridSize; col++) {
      // Skip some spots for roads/parks
      if (Math.random() < 0.15) continue;

      const x = col * (blockSize + gap) - half + randomRange(-0.3, 0.3);
      const z = row * (blockSize + gap) - half + randomRange(-0.3, 0.3);

      const width = randomRange(1.8, blockSize);
      const depth = randomRange(1.8, blockSize);

      // Height distribution: mostly low, some tall
      let height: number;
      const r = Math.random();
      if (r < 0.5) height = randomRange(2, 6);
      else if (r < 0.8) height = randomRange(6, 14);
      else if (r < 0.95) height = randomRange(14, 25);
      else height = randomRange(25, 45);

      const levels = Math.max(1, Math.floor(height / 3));

      buildings.push({
        id: generateId(),
        name: `Building ${buildings.length + 1}`,
        position: [x, height / 2, z],
        width,
        depth,
        height,
        levels,
        isLandmark: height > 35,
      });
    }
  }

  return buildings;
}
