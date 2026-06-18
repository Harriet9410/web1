import { create } from 'zustand';
import { Vec2 } from '../utils/coordinate';

export const SPEED_LEVELS = [0.05, 0.1, 0.15, 0.2, 0.3, 0.4, 0.5, 0.6, 0.8, 1.0, 1.2, 1.5, 2.0] as const;
export type SegmentSpeed = number;
export const DEFAULT_SPEED: SegmentSpeed = 0.5;

export function speedToColor(speed: SegmentSpeed): string {
  const min = SPEED_LEVELS[0];
  const max = SPEED_LEVELS[SPEED_LEVELS.length - 1];
  const t = Math.max(0, Math.min(1, (speed - min) / (max - min)));
  const r = Math.round(253 * (1 - t) + 76 * t);
  const g = Math.round(216 * (1 - t) + 175 * t);
  const b = Math.round(53 * (1 - t) + 80 * t);
  return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;
}

export function cycleSpeed(current: SegmentSpeed): SegmentSpeed {
  const idx = SPEED_LEVELS.indexOf(current as any);
  if (idx === -1) return DEFAULT_SPEED;
  return SPEED_LEVELS[(idx + 1) % SPEED_LEVELS.length];
}

interface HRPState {
  path: Vec2[];
  segmentSpeeds: SegmentSpeed[];
  blockedSegments: boolean[];
  isDrawing: boolean;
  selectedSegment: number | null;
  startDrawing: () => void;
  addPoint: (p: Vec2) => void;
  finishDrawing: () => void;
  cancelDrawing: () => void;
  loadPath: (path: Vec2[]) => void;
  clearPath: () => void;
  setSegmentSpeed: (index: number, speed: SegmentSpeed) => void;
  toggleSegmentSpeed: (index: number) => void;
  setSelectedSegment: (index: number | null) => void;
  setBlockedSegments: (blocked: boolean[]) => void;
}

export const useHRPStore = create<HRPState>((set) => ({
  path: [],
  segmentSpeeds: [],
  blockedSegments: [],
  isDrawing: false,
  selectedSegment: null,

  startDrawing: () => set({ isDrawing: true, path: [], segmentSpeeds: [], blockedSegments: [], selectedSegment: null }),

  addPoint: (p) =>
    set((s) => {
      if (!s.isDrawing) return s;
      const newPath = [...s.path, p];
      const newSpeeds = s.path.length > 0 ? [...s.segmentSpeeds, DEFAULT_SPEED] : s.segmentSpeeds;
      return { path: newPath, segmentSpeeds: newSpeeds, blockedSegments: [] };
    }),

  finishDrawing: () => set({ isDrawing: false }),

  cancelDrawing: () => set({ isDrawing: false, path: [], segmentSpeeds: [], blockedSegments: [], selectedSegment: null }),

  loadPath: (path) => set({ path, segmentSpeeds: path.length > 1 ? new Array(path.length - 1).fill(DEFAULT_SPEED) : [], blockedSegments: [], selectedSegment: null }),

  clearPath: () => set({ path: [], segmentSpeeds: [], blockedSegments: [], isDrawing: false, selectedSegment: null }),

  setSegmentSpeed: (index, speed) =>
    set((s) => {
      const newSpeeds = [...s.segmentSpeeds];
      if (index >= 0 && index < newSpeeds.length) {
        newSpeeds[index] = speed;
      }
      return { segmentSpeeds: newSpeeds, blockedSegments: [] };
    }),

  toggleSegmentSpeed: (index) =>
    set((s) => {
      const newSpeeds = [...s.segmentSpeeds];
      if (index >= 0 && index < newSpeeds.length) {
        newSpeeds[index] = cycleSpeed(newSpeeds[index]);
      }
      return { segmentSpeeds: newSpeeds };
    }),

  setSelectedSegment: (index) => set({ selectedSegment: index }),

  setBlockedSegments: (blocked) => set({ blockedSegments: blocked }),
}));
