import { useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import { useRobotPoseStore } from '../../stores/robotPoseStore';
import { useTrailStore } from '../../stores/trailStore';

export function BreadcrumbTrail() {
  const trail = useTrailStore((s) => s.trail);
  const addPoint = useTrailStore((s) => s.addPoint);

  useFrame(() => {
    const pose = useRobotPoseStore.getState().pose;
    addPoint({ x: pose.x, z: pose.z });
  });

  const positions = useMemo(() => {
    if (trail.length < 2) return null;
    return new Float32Array(trail.flatMap((p) => [p.x, 0.03, p.z]));
  }, [trail]);

  if (!positions || trail.length < 2) return null;

  return (
    <line>
      <bufferGeometry>
        <bufferAttribute
          attach="attributes-position"
          count={trail.length}
          array={positions}
          itemSize={3}
        />
      </bufferGeometry>
      <lineBasicMaterial color="#ff9800" transparent opacity={0.4} />
    </line>
  );
}
