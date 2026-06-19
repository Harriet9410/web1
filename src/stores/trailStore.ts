import { create } from 'zustand';
import { Vec2 } from '../utils/coordinate';

const MAX_TRAIL = 2000;
const SAMPLE_DIST = 0.05;

interface TrailState {
  trail: Vec2[];
  addPoint: (p: Vec2) => void;
  clearTrail: () => void;
}

let lastTrailPoint: Vec2 | null = null;

export const useTrailStore = create<TrailState>((set) => ({
  trail: [],
  addPoint: (p) => {
    if (lastTrailPoint) {
      const dx = p.x - lastTrailPoint.x;
      const dz = p.z - lastTrailPoint.z;
      if (dx * dx + dz * dz < SAMPLE_DIST * SAMPLE_DIST) return;
    }
    lastTrailPoint = p;
    set((s) => {
      const newTrail = [...s.trail, p];
      if (newTrail.length > MAX_TRAIL) {
        return { trail: newTrail.slice(newTrail.length - MAX_TRAIL) };
      }
      return { trail: newTrail };
    });
  },
  clearTrail: () => {
    lastTrailPoint = null;
    set({ trail: [] });
  },
}));
