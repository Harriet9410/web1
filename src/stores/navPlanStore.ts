import { create } from 'zustand';
import { Vec2 } from '../utils/coordinate';

interface NavPlanState {
  moveBasePlan: Vec2[];
  setMoveBasePlan: (path: Vec2[]) => void;
  clearMoveBasePlan: () => void;
}

export const useNavPlanStore = create<NavPlanState>((set) => ({
  moveBasePlan: [],
  setMoveBasePlan: (path) => set({ moveBasePlan: path }),
  clearMoveBasePlan: () => set({ moveBasePlan: [] }),
}));
