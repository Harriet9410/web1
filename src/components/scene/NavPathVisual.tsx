import { useMemo } from 'react';
import { Vec2 } from '../../utils/coordinate';

interface NavPathVisualProps {
  path: Vec2[];
  color?: string;
  opacity?: number;
}

export function NavPathVisual({ path, color = '#ff4081', opacity = 1 }: NavPathVisualProps) {
  const linePositions = useMemo(() => {
    return new Float32Array(path.flatMap((p) => [p.x, 0.05, p.z]));
  }, [path]);

  if (path.length < 2) return null;

  return (
    <group>
      <line>
        <bufferGeometry>
          <bufferAttribute
            attach="attributes-position"
            count={path.length}
            array={linePositions}
            itemSize={3}
          />
        </bufferGeometry>
        <lineBasicMaterial color={color} linewidth={2} transparent opacity={opacity} />
      </line>
      {path.map((p, i) => {
        if (i === 0 || i === path.length - 1) return null;
        return (
          <mesh key={i} position={[p.x, 0.05, p.z]}>
            <sphereGeometry args={[0.03, 8, 8]} />
            <meshBasicMaterial color={color} transparent opacity={opacity * 0.6} />
          </mesh>
        );
      })}
    </group>
  );
}
