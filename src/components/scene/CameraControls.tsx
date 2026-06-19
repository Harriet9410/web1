import { useRef, useEffect } from 'react';
import * as THREE from 'three';
import { useThree, useFrame } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import { useCameraStore } from '../../stores/cameraStore';
import { useRobotPoseStore } from '../../stores/robotPoseStore';

interface CameraControlsProps {
  mode: 'navigate' | 'hrz' | 'hrp' | 'mapedit';
  followRobot: boolean;
}

export function CameraControls({ mode, followRobot }: CameraControlsProps) {
  const controlsRef = useRef<any>(null);
  const { camera } = useThree();
  const camPos = useCameraStore((s) => s.position);
  const camTgt = useCameraStore((s) => s.target);
  const appliedRef = useRef<string>('');

  useEffect(() => {
    if (controlsRef.current) {
      controlsRef.current.mouseButtons = {
        LEFT: -1,
        MIDDLE: THREE.MOUSE.DOLLY,
        RIGHT: THREE.MOUSE.ROTATE,
      };
    }
  }, [mode]);

  useEffect(() => {
    const key = `${camPos.join(',')}-${camTgt.join(',')}`;
    if (key === appliedRef.current) return;
    if (controlsRef.current) {
      camera.position.set(...camPos);
      controlsRef.current.target.set(...camTgt);
      controlsRef.current.update();
      appliedRef.current = key;
    }
  }, [camPos, camTgt, camera]);

  useFrame(() => {
    if (controlsRef.current) {
      if (followRobot) {
        const pose = useRobotPoseStore.getState().pose;
        controlsRef.current.target.lerp(new THREE.Vector3(pose.x, 0, pose.z), 0.05);
      }
      const t = controlsRef.current.target;
      const p = camera.position;
      const key = `${p.x.toFixed(2)},${p.y.toFixed(2)},${p.z.toFixed(2)}-${t.x.toFixed(2)},${t.y.toFixed(2)},${t.z.toFixed(2)}`;
      if (key !== appliedRef.current) {
        useCameraStore.getState().setPosition([p.x, p.y, p.z]);
        useCameraStore.getState().setTarget([t.x, t.y, t.z]);
      }
    }
  });

  return (
    <OrbitControls
      ref={controlsRef}
      enableDamping
      dampingFactor={0.1}
      minDistance={1}
      maxDistance={100}
      maxPolarAngle={Math.PI / 2.1}
      target={camTgt}
    />
  );
}
