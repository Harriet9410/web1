import { create } from 'zustand';

interface RobotPose {
  x: number;
  z: number;
  yaw: number;
}

interface RobotPoseState {
  pose: RobotPose;
  linearVelocity: number;
  angularVelocity: number;
  setPose: (pose: RobotPose) => void;
  setVelocity: (linear: number, angular: number) => void;
}

export const useRobotPoseStore = create<RobotPoseState>((set) => ({
  pose: { x: 2, z: 2, yaw: 0 },
  linearVelocity: 0,
  angularVelocity: 0,
  setPose: (pose) => set({ pose }),
  setVelocity: (linear, angular) => set({ linearVelocity: linear, angularVelocity: angular }),
}));
