/**
 * Minimal axis-aligned quadtree for 2D bounding boxes.
 *
 * Why a quadtree here
 * -------------------
 * `findBuildingAt` in OSMCity walks every building bbox on every click. For a
 * district with 5–15k polygons that's still fast, but the same index is also
 * the right primitive for upcoming spatial queries (nearest-tenant lookup,
 * radius selection, hover hit-testing). Centralising the structure here
 * keeps that future work to a single import.
 *
 * Design choices
 *  - Stores user-supplied `T` items, each with its own (minX,maxX,minZ,maxZ).
 *  - Insertion is the only mutation; the tree is rebuilt when the input set
 *    changes (cheap — `O(N log N)`), so we never invalidate references.
 *  - `query(rect, cb)` enumerates every item whose bbox intersects `rect`.
 *    Callback shape avoids allocating an output array for the common case
 *    where the caller filters again (e.g. precise polygon test).
 *  - No removal API — the use sites rebuild on data change anyway, so a
 *    remove method would be dead weight.
 */

export type QtBox = {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
};

type Node<T extends QtBox> = {
  bounds: QtBox;
  items: T[];
  children: [Node<T>, Node<T>, Node<T>, Node<T>] | null;
  depth: number;
};

const MAX_ITEMS = 8;
const MAX_DEPTH = 10;

function makeNode<T extends QtBox>(bounds: QtBox, depth: number): Node<T> {
  return { bounds, items: [], children: null, depth };
}

function intersects(a: QtBox, b: QtBox): boolean {
  return !(a.maxX < b.minX || a.minX > b.maxX || a.maxZ < b.minZ || a.minZ > b.maxZ);
}

function contains(outer: QtBox, inner: QtBox): boolean {
  return (
    inner.minX >= outer.minX &&
    inner.maxX <= outer.maxX &&
    inner.minZ >= outer.minZ &&
    inner.maxZ <= outer.maxZ
  );
}

function subdivide<T extends QtBox>(node: Node<T>): void {
  const { minX, maxX, minZ, maxZ } = node.bounds;
  const mx = (minX + maxX) / 2;
  const mz = (minZ + maxZ) / 2;
  const d = node.depth + 1;
  node.children = [
    makeNode<T>({ minX, maxX: mx, minZ, maxZ: mz }, d),
    makeNode<T>({ minX: mx, maxX, minZ, maxZ: mz }, d),
    makeNode<T>({ minX, maxX: mx, minZ: mz, maxZ }, d),
    makeNode<T>({ minX: mx, maxX, minZ: mz, maxZ }, d),
  ];
  // Re-distribute items into children when each fully contains them. Items
  // that straddle a child boundary stay on the parent — keeps queries
  // correct without per-item duplication.
  const remaining: T[] = [];
  for (const item of node.items) {
    let placed = false;
    for (const c of node.children) {
      if (contains(c.bounds, item)) {
        c.items.push(item);
        placed = true;
        break;
      }
    }
    if (!placed) remaining.push(item);
  }
  node.items = remaining;
}

function insertNode<T extends QtBox>(node: Node<T>, item: T): void {
  if (node.children) {
    for (const c of node.children) {
      if (contains(c.bounds, item)) {
        insertNode(c, item);
        return;
      }
    }
    // Straddles a boundary — keep at this level.
    node.items.push(item);
    return;
  }
  node.items.push(item);
  if (node.items.length > MAX_ITEMS && node.depth < MAX_DEPTH) {
    subdivide(node);
  }
}

function queryNode<T extends QtBox>(node: Node<T>, rect: QtBox, cb: (item: T) => void): void {
  if (!intersects(node.bounds, rect)) return;
  for (const item of node.items) {
    if (intersects(item, rect)) cb(item);
  }
  if (node.children) {
    for (const c of node.children) queryNode(c, rect, cb);
  }
}

export class Quadtree<T extends QtBox> {
  private root: Node<T>;

  constructor(bounds: QtBox) {
    this.root = makeNode<T>(bounds, 0);
  }

  insert(item: T): void {
    insertNode(this.root, item);
  }

  /** Visit every stored item whose bbox intersects `rect`. */
  query(rect: QtBox, cb: (item: T) => void): void {
    queryNode(this.root, rect, cb);
  }

  /** Convenience builder: derives world bounds from the input set. */
  static fromItems<T extends QtBox>(items: T[]): Quadtree<T> {
    if (items.length === 0) {
      return new Quadtree<T>({ minX: 0, maxX: 0, minZ: 0, maxZ: 0 });
    }
    let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
    for (const it of items) {
      if (it.minX < minX) minX = it.minX;
      if (it.maxX > maxX) maxX = it.maxX;
      if (it.minZ < minZ) minZ = it.minZ;
      if (it.maxZ > maxZ) maxZ = it.maxZ;
    }
    // Pad slightly so points exactly on the rim still land inside.
    const pad = 1;
    const qt = new Quadtree<T>({
      minX: minX - pad,
      maxX: maxX + pad,
      minZ: minZ - pad,
      maxZ: maxZ + pad,
    });
    for (const it of items) qt.insert(it);
    return qt;
  }
}
