import { create } from 'zustand';
import { useRobotPoseStore } from './robotPoseStore';
import { useRosStore } from './rosStore';
import { publishCmdVel } from '../ros/connection';

const TELEOP_LINEAR = 0.3;
const TELEOP_ANGULAR = 0.8;

interface TeleopState {
  keys: Set<string>;
  teleopEnabled: boolean;
  setTeleopEnabled: (enabled: boolean) => void;
  keyDown: (key: string) => void;
  keyUp: (key: string) => void;
  tick: () => void;
}

export const useTeleopStore = create<TeleopState>((set, get) => ({
  keys: new Set(),
  teleopEnabled: false,

  setTeleopEnabled: (enabled) => set({ teleopEnabled: enabled }),

  keyDown: (key) => {
    const k = key.toLowerCase();
    if (!['w', 'a', 's', 'd'].includes(k)) return;
    set((s) => {
      const newKeys = new Set(s.keys);
      newKeys.add(k);
      return { keys: newKeys };
    });
  },

  keyUp: (key) => {
    const k = key.toLowerCase();
    set((s) => {
      const newKeys = new Set(s.keys);
      newKeys.delete(k);
      return { keys: newKeys };
    });
  },

  tick: () => {
    const { keys, teleopEnabled } = get();
    if (!teleopEnabled || keys.size === 0) {
      const isMock = useRosStore.getState().isMock;
      if (!isMock && teleopEnabled) publishCmdVel(0, 0);
      return;
    }

    let linear = 0;
    let angular = 0;
    if (keys.has('w')) linear += TELEOP_LINEAR;
    if (keys.has('s')) linear -= TELEOP_LINEAR;
    if (keys.has('a')) angular += TELEOP_ANGULAR;
    if (keys.has('d')) angular -= TELEOP_ANGULAR;

    const isMock = useRosStore.getState().isMock;
    if (isMock) {
      const dt = 0.05;
      const pose = useRobotPoseStore.getState().pose;
      const newYaw = pose.yaw + angular * dt;
      const newX = pose.x + Math.sin(pose.yaw) * linear * dt;
      const newZ = pose.z - Math.cos(pose.yaw) * linear * dt;
      useRobotPoseStore.getState().setPose({ x: newX, z: newZ, yaw: newYaw });
      useRobotPoseStore.getState().setVelocity(linear, angular);
    } else {
      publishCmdVel(linear, angular);
    }
  },
}));
