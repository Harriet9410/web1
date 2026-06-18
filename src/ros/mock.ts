import { useMapStore } from '../stores/mapStore';
import { useRosStore } from '../stores/rosStore';
import { useRobotPoseStore } from '../stores/robotPoseStore';
import { useNavTargetStore } from '../stores/navTargetStore';
import type { OccupancyGridData } from '../utils/mapRenderer';

const MAP_WIDTH = 500;
const MAP_HEIGHT = 500;
const RESOLUTION = 0.02;
const OCCUPIED = 254;
const ROBOT_RADIUS_CELLS = 8;

let mockTimer: ReturnType<typeof setInterval> | null = null;
let odomTimer: ReturnType<typeof setInterval> | null = null;

let robotX = 1.5;
let robotZ = 1.5;
let robotYaw = 0;
let smoothPath: { x: number; z: number }[] = [];
let pathIdx = 0;
let mockLog: string[] = [];
let logListeners: ((log: string[]) => void)[] = [];
let currentGrid: OccupancyGridData | null = null;
let customData: number[] | null = null;

function addLog(msg: string) {
  const ts = new Date().toLocaleTimeString();
  const entry = `[${ts}] ${msg}`;
  mockLog = [...mockLog.slice(-99), entry];
  logListeners.forEach((fn) => fn(mockLog));
}

export function onMockLog(fn: (log: string[]) => void): () => void {
  logListeners.push(fn);
  return () => {
    logListeners = logListeners.filter((l) => l !== fn);
  };
}

export function getMockLog(): string[] {
  return mockLog;
}

function generateMockGrid(): OccupancyGridData {
  const data: number[] = [];
  for (let row = 0; row < MAP_HEIGHT; row++) {
    for (let col = 0; col < MAP_WIDTH; col++) {
      const isBorder =
        row === 0 || row === MAP_HEIGHT - 1 || col === 0 || col === MAP_WIDTH - 1;
      const isInnerWall =
        (row >= 148 && row <= 152 && col >= 100 && col <= 350) ||
        (row >= 298 && row <= 302 && col >= 150 && col <= 400) ||
        (col >= 248 && col <= 252 && row >= 150 && row <= 300) ||
        (col >= 123 && col <= 127 && row >= 50 && row <= 200);
      const isObstacle =
        (row >= 375 && row <= 400 && col >= 50 && col <= 100) ||
        (row >= 200 && row <= 250 && col >= 350 && col <= 400);

      if (isBorder || isInnerWall || isObstacle) {
        data.push(OCCUPIED);
      } else {
        data.push(0);
      }
    }
  }
  return {
    width: MAP_WIDTH,
    height: MAP_HEIGHT,
    resolution: RESOLUTION,
    originX: 0,
    originY: 0,
    data,
  };
}

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

type AStarNode = { col: number; row: number; g: number; h: number; f: number; parent: AStarNode | null };

function aStar(
  grid: OccupancyGridData,
  startCol: number,
  startRow: number,
  endCol: number,
  endRow: number
): { col: number; row: number }[] {
  const key = (c: number, r: number) => `${c},${r}`;
  const open: AStarNode[] = [];
  const closed = new Set<string>();

  const h = (c: number, r: number) =>
    Math.abs(c - endCol) + Math.abs(r - endRow);

  const startNode: AStarNode = { col: startCol, row: startRow, g: 0, h: h(startCol, startRow), f: h(startCol, startRow), parent: null };
  open.push(startNode);

  const dirs = [
    [1, 0], [-1, 0], [0, 1], [0, -1],
    [1, 1], [-1, -1], [1, -1], [-1, 1],
  ];

  let iterations = 0;
  const maxIterations = 200000;

  while (open.length > 0 && iterations < maxIterations) {
    iterations++;
    open.sort((a, b) => a.f - b.f);
    const current = open.shift()!;
    const ck = key(current.col, current.row);

    if (closed.has(ck)) continue;
    closed.add(ck);

    if (current.col === endCol && current.row === endRow) {
      const path: { col: number; row: number }[] = [];
      let node: AStarNode | null = current;
      while (node) {
        path.unshift({ col: node.col, row: node.row });
        node = node.parent;
      }
      return path;
    }

    for (const [dc, dr] of dirs) {
      const nc = current.col + dc;
      const nr = current.row + dr;
      if (nc < 0 || nc >= grid.width || nr < 0 || nr >= grid.height) continue;
      if (closed.has(key(nc, nr))) continue;
      if (isInflatedOccupied(grid, nc, nr)) continue;

      const moveCost = (dc !== 0 && dr !== 0) ? 1.414 : 1;
      const g = current.g + moveCost;
      const hv = h(nc, nr);
      const existing = open.find((n) => n.col === nc && n.row === nr);
      if (existing) {
        if (g < existing.g) {
          existing.g = g;
          existing.f = g + hv;
          existing.parent = current;
        }
      } else {
        open.push({ col: nc, row: nr, g, h: hv, f: g + hv, parent: current });
      }
    }
  }

  return [];
}

function smoothPathFn(
  grid: OccupancyGridData,
  rawPath: { col: number; row: number }[]
): { x: number; z: number }[] {
  if (rawPath.length === 0) return [];

  const result: { col: number; row: number }[] = [rawPath[0]];
  let current = 0;

  while (current < rawPath.length - 1) {
    let farthest = current + 1;
    for (let i = rawPath.length - 1; i > current + 1; i--) {
      if (lineOfSight(grid, rawPath[current], rawPath[i])) {
        farthest = i;
        break;
      }
    }
    result.push(rawPath[farthest]);
    current = farthest;
  }

  return result.map((p) => ({
    x: (p.col + 0.5) * RESOLUTION,
    z: (p.row + 0.5) * RESOLUTION,
  }));
}

function lineOfSight(
  grid: OccupancyGridData,
  from: { col: number; row: number },
  to: { col: number; row: number }
): boolean {
  let x0 = from.col;
  let y0 = from.row;
  const x1 = to.col;
  const y1 = to.row;
  const dx = Math.abs(x1 - x0);
  const dy = Math.abs(y1 - y0);
  const sx = x0 < x1 ? 1 : -1;
  const sy = y0 < y1 ? 1 : -1;
  let err = dx - dy;

  while (true) {
    if (isInflatedOccupied(grid, x0, y0)) return false;
    if (x0 === x1 && y0 === y1) break;
    const e2 = 2 * err;
    if (e2 > -dy) { err -= dy; x0 += sx; }
    if (e2 < dx) { err += dx; y0 += sy; }
  }
  return true;
}

function worldToGrid(x: number, z: number): { col: number; row: number } {
  return {
    col: Math.floor(x / RESOLUTION),
    row: Math.floor(z / RESOLUTION),
  };
}

function findNearestFreeCell(
  grid: OccupancyGridData,
  col: number,
  row: number,
  maxRadius: number = 10
): { col: number; row: number } | null {
  if (!isInflatedOccupied(grid, col, row)) return { col, row };
  for (let r = 1; r <= maxRadius; r++) {
    for (let dr = -r; dr <= r; dr++) {
      for (let dc = -r; dc <= r; dc++) {
        if (Math.abs(dr) !== r && Math.abs(dc) !== r) continue;
        const nc = col + dc;
        const nr = row + dr;
        if (nc < 0 || nc >= grid.width || nr < 0 || nr >= grid.height) continue;
        if (!isInflatedOccupied(grid, nc, nr)) return { col: nc, row: nr };
      }
    }
  }
  return null;
}

function planPath(targetX: number, targetZ: number): { x: number; z: number }[] {
  if (!currentGrid) return [{ x: targetX, z: targetZ }];

  const rawStart = worldToGrid(robotX, robotZ);
  const rawEnd = worldToGrid(targetX, targetZ);

  const start = findNearestFreeCell(currentGrid, rawStart.col, rawStart.row);
  if (!start) {
    addLog('Robot is trapped, no free cell nearby');
    return [];
  }

  const end = findNearestFreeCell(currentGrid, rawEnd.col, rawEnd.row);
  if (!end) {
    addLog('Target is trapped, no free cell nearby');
    return [];
  }

  const rawPath = aStar(currentGrid, start.col, start.row, end.col, end.row);
  if (rawPath.length === 0) {
    addLog('No path found to target (obstacle blocked)');
    return [];
  }

  const planned = smoothPathFn(currentGrid, rawPath);
  planned.unshift({ x: robotX, z: robotZ });
  planned.push({ x: targetX, z: targetZ });
  return planned;
}

function normalizeAngle(a: number): number {
  while (a > Math.PI) a -= 2 * Math.PI;
  while (a < -Math.PI) a += 2 * Math.PI;
  return a;
}

const MAX_LINEAR_SPEED = 0.5;
const MAX_ANGULAR_SPEED = 2.0;
const ANGLE_THRESHOLD = 0.15;
const ARRIVE_THRESHOLD = 0.04;

function updateOdom() {
  if (smoothPath.length > 0 && pathIdx < smoothPath.length) {
    const target = smoothPath[pathIdx];
    const dx = target.x - robotX;
    const dz = target.z - robotZ;
    const d = Math.sqrt(dx * dx + dz * dz);

    if (d < ARRIVE_THRESHOLD) {
      pathIdx++;
      if (pathIdx >= smoothPath.length) {
        addLog('Robot reached destination');
        smoothPath = [];
        pathIdx = 0;
        const navStore = useNavTargetStore.getState();
        if (navStore.navigating) {
          navStore.clearNav();
        }
      }
    } else {
      const targetYaw = Math.atan2(dx, -dz);
      const angleError = normalizeAngle(targetYaw - robotYaw);
      const absAngle = Math.abs(angleError);

      let linearSpeed = 0;
      let angularSpeed = 0;

      if (absAngle > ANGLE_THRESHOLD) {
        angularSpeed = Math.sign(angleError) * Math.min(MAX_ANGULAR_SPEED, absAngle * 3);
        linearSpeed = MAX_LINEAR_SPEED * 0.1;
      } else {
        const turnFactor = 1 - absAngle / ANGLE_THRESHOLD;
        linearSpeed = MAX_LINEAR_SPEED * (0.3 + 0.7 * turnFactor);
        if (d < 0.3) linearSpeed *= d / 0.3;
        angularSpeed = angleError * 2.0;
      }

      const dt = 0.1;
      robotYaw = normalizeAngle(robotYaw + angularSpeed * dt);
      robotX += Math.sin(robotYaw) * linearSpeed * dt;
      robotZ -= Math.cos(robotYaw) * linearSpeed * dt;
    }
  }

  useRobotPoseStore.getState().setPose({ x: robotX, z: robotZ, yaw: robotYaw });
}

export function startMock(mapType: 'default' | 'blank' = 'default'): void {
  stopMock();
  mockLog = [];
  useRosStore.getState().setStatus('connected');

  if (mapType === 'blank') {
    customData = new Array(MAP_WIDTH * MAP_HEIGHT).fill(0);
    for (let col = 0; col < MAP_WIDTH; col++) {
      customData[col] = OCCUPIED;
      customData[(MAP_HEIGHT - 1) * MAP_WIDTH + col] = OCCUPIED;
    }
    for (let row = 0; row < MAP_HEIGHT; row++) {
      customData[row * MAP_WIDTH] = OCCUPIED;
      customData[row * MAP_WIDTH + MAP_WIDTH - 1] = OCCUPIED;
    }
  } else if (!customData) {
    const grid = generateMockGrid();
    customData = [...grid.data];
  }

  const grid: OccupancyGridData = {
    width: MAP_WIDTH,
    height: MAP_HEIGHT,
    resolution: RESOLUTION,
    originX: 0,
    originY: 0,
    data: [...customData],
  };
  currentGrid = grid;
  useMapStore.getState().setGrid(grid);
  addLog(`Mock map published to /map (${MAP_WIDTH}x${MAP_HEIGHT}, ${RESOLUTION}m res)`);
  addLog(mapType === 'blank' ? 'Blank map loaded' : 'Default map with obstacles loaded');
  addLog('Mock odometry started');
  addLog('A* pathfinding with obstacle avoidance enabled');

  robotX = 1.5;
  robotZ = 1.5;
  robotYaw = 0;
  useRobotPoseStore.getState().setPose({ x: robotX, z: robotZ, yaw: robotYaw });
  smoothPath = [];
  pathIdx = 0;

  odomTimer = setInterval(updateOdom, 100);
}

export function stopMock(): void {
  if (mockTimer) {
    clearInterval(mockTimer);
    mockTimer = null;
  }
  if (odomTimer) {
    clearInterval(odomTimer);
    odomTimer = null;
  }
  smoothPath = [];
  pathIdx = 0;
  currentGrid = null;
  useNavTargetStore.getState().clearNav();
  useRosStore.getState().setStatus('disconnected');
}

export function mockPublishHRZZones(json: string): void {
  const zones = JSON.parse(json);
  const count = Array.isArray(zones) ? zones.length : 0;
  addLog(`Published to /hrz_zones: ${count} zone(s)`);
  zones.forEach((z: { id: string; vertices: { x: number; z: number }[] }, i: number) => {
    addLog(`  Zone ${i + 1} (${z.id}): ${z.vertices.length} vertices`);
  });

  if (currentGrid && count > 0) {
    addLog('Inflating restricted zones into costmap');
    zones.forEach((z: { id: string; vertices: { x: number; z: number }[] }) => {
      fillZoneInGrid(z.vertices);
    });
    useMapStore.getState().setGrid({ ...currentGrid, data: [...currentGrid.data] });
    addLog('Costmap updated with restricted zones');
  }
}

function fillZoneInGrid(vertices: { x: number; z: number }[]) {
  if (!currentGrid || vertices.length < 3) return;

  let minCol = MAP_WIDTH, maxCol = 0, minRow = MAP_HEIGHT, maxRow = 0;
  const gVerts = vertices.map((v) => {
    const g = worldToGrid(v.x, v.z);
    minCol = Math.min(minCol, g.col);
    maxCol = Math.max(maxCol, g.col);
    minRow = Math.min(minRow, g.row);
    maxRow = Math.max(maxRow, g.row);
    return g;
  });

  for (let row = minRow; row <= maxRow; row++) {
    for (let col = minCol; col <= maxCol; col++) {
      if (col < 0 || col >= MAP_WIDTH || row < 0 || row >= MAP_HEIGHT) continue;
      if (pointInPolygon(col, row, gVerts)) {
        for (let dr = -1; dr <= 1; dr++) {
          for (let dc = -1; dc <= 1; dc++) {
            const r = row + dr;
            const c = col + dc;
            if (r >= 0 && r < MAP_HEIGHT && c >= 0 && c < MAP_WIDTH) {
              currentGrid.data[r * currentGrid.width + c] = OCCUPIED;
            }
          }
        }
      }
    }
  }
}

function pointInPolygon(
  px: number,
  py: number,
  polygon: { col: number; row: number }[]
): boolean {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const xi = polygon[i].col, yi = polygon[i].row;
    const xj = polygon[j].col, yj = polygon[j].row;
    if (((yi > py) !== (yj > py)) && (px < ((xj - xi) * (py - yi)) / (yj - yi) + xi)) {
      inside = !inside;
    }
  }
  return inside;
}

function segmentCollides(
  grid: OccupancyGridData,
  fromX: number,
  fromZ: number,
  toX: number,
  toZ: number
): boolean {
  const g1 = worldToGrid(fromX, fromZ);
  const g2 = worldToGrid(toX, toZ);
  let x0 = g1.col, y0 = g1.row;
  const x1 = g2.col, y1 = g2.row;
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

function planPathAlongWaypoints(waypoints: { x: number; z: number }[]): { x: number; z: number }[] {
  if (!currentGrid || waypoints.length < 2) return waypoints;

  const result: { x: number; z: number }[] = [];
  let i = 0;

  while (i < waypoints.length - 1) {
    const from = waypoints[i];

    if (!segmentCollides(currentGrid, from.x, from.z, waypoints[i + 1].x, waypoints[i + 1].z)) {
      result.push(from);
      i++;
      continue;
    }

    let detourEnd = i + 1;
    for (let j = i + 2; j < waypoints.length; j++) {
      if (segmentCollides(currentGrid, from.x, from.z, waypoints[j].x, waypoints[j].z)) {
        detourEnd = j;
      } else {
        break;
      }
    }

    const to = waypoints[detourEnd];
    addLog(`Path segment (${i}->${detourEnd}) crosses obstacle, planning A* detour...`);

    const rawStart = worldToGrid(from.x, from.z);
    const rawEnd = worldToGrid(to.x, to.z);
    const startCell = findNearestFreeCell(currentGrid, rawStart.col, rawStart.row);
    const endCell = findNearestFreeCell(currentGrid, rawEnd.col, rawEnd.row);

    if (startCell && endCell) {
      const rawAPath = aStar(currentGrid, startCell.col, startCell.row, endCell.col, endCell.row);
      if (rawAPath.length > 0) {
        const detour = smoothPathFn(currentGrid, rawAPath);
        result.push(from);
        result.push(...detour);
        i = detourEnd;
        continue;
      }
    }

    addLog(`A* detour failed, skipping to next waypoint`);
    result.push(from);
    i++;
  }

  result.push(waypoints[waypoints.length - 1]);
  return result;
}

export function mockPublishHRPPath(poses: { x: number; z: number }[]): void {
  if (poses.length === 0) return;
  addLog(`Published to /hrp_path: ${poses.length} waypoints`);

  const waypoints = [{ x: robotX, z: robotZ }, ...poses];
  const checked = planPathAlongWaypoints(waypoints);
  const collisionCount = waypoints.length - checked.length;

  if (collisionCount > 0) {
    addLog(`Detoured around ${Math.abs(collisionCount)} obstacle crossing(s)`);
  }

  smoothPath = checked;
  pathIdx = 0;
  useNavTargetStore.getState().clearNav();
  addLog(`Following path with ${checked.length} waypoints...`);
}

export function mockNavigateTo(targetX: number, targetZ: number): void {
  addLog(`Navigate to target (${targetX.toFixed(1)}, ${targetZ.toFixed(1)})`);
  addLog('Planning A* path...');

  const planned = planPath(targetX, targetZ);
  if (planned.length > 0) {
    smoothPath = planned;
    pathIdx = 0;
    useNavTargetStore.getState().setTarget({ x: targetX, z: targetZ });
    useNavTargetStore.getState().setPlannedPath(planned);
    useNavTargetStore.getState().setNavigating(true);
    addLog(`Path found: ${planned.length} waypoints, navigating...`);
  } else {
    smoothPath = [];
    pathIdx = 0;
  }
}

export function mockCancelNav(): void {
  smoothPath = [];
  pathIdx = 0;
  useNavTargetStore.getState().clearNav();
  addLog('Navigation cancelled');
}

export function mockPaintBrush(worldX: number, worldZ: number, radius: number, occupied: boolean): void {
  if (!currentGrid) return;
  const center = worldToGrid(worldX, worldZ);
  let changed = false;
  for (let dr = -radius; dr <= radius; dr++) {
    for (let dc = -radius; dc <= radius; dc++) {
      if (dr * dr + dc * dc > radius * radius) continue;
      const r = center.row + dr;
      const c = center.col + dc;
      if (r < 0 || r >= MAP_HEIGHT || c < 0 || c >= MAP_WIDTH) continue;
      const idx = r * MAP_WIDTH + c;
      const val = occupied ? OCCUPIED : 0;
      if (currentGrid.data[idx] !== val) {
        currentGrid.data[idx] = val;
        if (customData) customData[idx] = val;
        changed = true;
      }
    }
  }
  if (changed) {
    useMapStore.getState().setGrid({ ...currentGrid, data: [...currentGrid.data] });
  }
}

export function mockPaintRect(
  startWorldX: number, startWorldZ: number,
  endWorldX: number, endWorldZ: number,
  occupied: boolean
): void {
  if (!currentGrid) return;
  const g1 = worldToGrid(startWorldX, startWorldZ);
  const g2 = worldToGrid(endWorldX, endWorldZ);
  const minC = Math.min(g1.col, g2.col);
  const maxC = Math.max(g1.col, g2.col);
  const minR = Math.min(g1.row, g2.row);
  const maxR = Math.max(g1.row, g2.row);
  const val = occupied ? OCCUPIED : 0;

  for (let r = minR; r <= maxR; r++) {
    for (let c = minC; c <= maxC; c++) {
      if (r < 0 || r >= MAP_HEIGHT || c < 0 || c >= MAP_WIDTH) continue;
      const idx = r * MAP_WIDTH + c;
      currentGrid.data[idx] = val;
      if (customData) customData[idx] = val;
    }
  }
  useMapStore.getState().setGrid({ ...currentGrid, data: [...currentGrid.data] });
  addLog(`Painted rect (${minC},${minR})->(${maxC},${maxR}) ${occupied ? 'wall' : 'free'}`);
}

export function mockPlaceRobot(worldX: number, worldZ: number): void {
  robotX = worldX;
  robotZ = worldZ;
  robotYaw = 0;
  smoothPath = [];
  pathIdx = 0;
  useRobotPoseStore.getState().setPose({ x: robotX, z: robotZ, yaw: robotYaw });
  useNavTargetStore.getState().clearNav();
  addLog(`Robot placed at (${worldX.toFixed(1)}, ${worldZ.toFixed(1)})`);
}

export function mockResetMap(): void {
  const grid = generateMockGrid();
  customData = [...grid.data];
  currentGrid = { ...grid, data: [...grid.data] };
  useMapStore.getState().setGrid({ ...currentGrid, data: [...currentGrid.data] });
  addLog('Map reset to default');
}

export function mockClearMap(): void {
  if (!currentGrid) return;
  const data = new Array(MAP_WIDTH * MAP_HEIGHT).fill(0);
  for (let col = 0; col < MAP_WIDTH; col++) {
    data[col] = OCCUPIED;
    data[(MAP_HEIGHT - 1) * MAP_WIDTH + col] = OCCUPIED;
  }
  for (let row = 0; row < MAP_HEIGHT; row++) {
    data[row * MAP_WIDTH] = OCCUPIED;
    data[row * MAP_WIDTH + MAP_WIDTH - 1] = OCCUPIED;
  }
  customData = [...data];
  currentGrid = { ...currentGrid, data: [...data] };
  useMapStore.getState().setGrid({ ...currentGrid, data: [...currentGrid.data] });
  addLog('Map cleared (only borders remain)');
}
