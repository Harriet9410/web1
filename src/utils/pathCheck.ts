import type { OccupancyGridData } from './mapRenderer';

const OCCUPIED = 254;
const ROBOT_RADIUS_CELLS = 8;

function isInflatedOccupied(grid: OccupancyGridData, col: number, row: number): boolean {
  for (let dr = -ROBOT_RADIUS_CELLS; dr <= ROBOT_RADIUS_CELLS; dr++) {
    for (let dc = -ROBOT_RADIUS_CELLS; dc <= ROBOT_RADIUS_CELLS; dc++) {
      if (dr * dr + dc * dc > ROBOT_RADIUS_CELLS * ROBOT_RADIUS_CELLS) continue;
      const r = row + dr;
      const c = col + dc;
      if (r < 0 || r >= grid.height || c < 0 || c >= grid.width) return true;
      if (grid.data[r * grid.width + c] === OCCUPIED) return true;
    }
  }
  return false;
}

function sceneToGrid(sx: number, sz: number, grid: OccupancyGridData): [number, number] {
  const col = Math.floor((sx - grid.originX) / grid.resolution);
  const row = Math.floor((sz - grid.originY) / grid.resolution);
  return [col, row];
}

function segmentCollides(
  grid: OccupancyGridData,
  fromX: number,
  fromZ: number,
  toX: number,
  toZ: number
): boolean {
  const [g1col, g1row] = sceneToGrid(fromX, fromZ, grid);
  const [g2col, g2row] = sceneToGrid(toX, toZ, grid);
  let x0 = g1col, y0 = g1row;
  const x1 = g2col, y1 = g2row;
  const dx = Math.abs(x1 - x0);
  const dy = Math.abs(y1 - y0);
  const sx = x0 < x1 ? 1 : -1;
  const sy = y0 < y1 ? 1 : -1;
  let err = dx - dy;

  while (true) {
    if (isInflatedOccupied(grid, x0, y0)) return true;
    if (x0 === x1 && y0 === y1) break;
    const e2 = 2 * err;
    if (e2 > -dy) { err -= dy; x0 += sx; }
    if (e2 < dx) { err += dx; y0 += sy; }
  }
  return false;
}

export function checkPathReachability(
  grid: OccupancyGridData,
  path: { x: number; z: number }[]
): boolean[] {
  const results: boolean[] = [];
  for (let i = 0; i < path.length - 1; i++) {
    const blocked = segmentCollides(grid, path[i].x, path[i].z, path[i + 1].x, path[i + 1].z);
    results.push(blocked);
  }
  return results;
}
