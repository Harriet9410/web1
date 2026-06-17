import { Vec2 } from './coordinate';

const STORAGE_KEY = 'mrrep-web-persistence';

interface PersistedData {
  hrzZones: { id: string; vertices: Vec2[] }[];
  hrpPath: Vec2[];
}

export function save(hrzZones: { id: string; vertices: Vec2[] }[], hrpPath: Vec2[]): void {
  try {
    const data: PersistedData = { hrzZones, hrpPath };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  } catch {}
}

export function load(): PersistedData | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as PersistedData;
  } catch {
    return null;
  }
}
