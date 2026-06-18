import * as THREE from 'three';
import { useMemo, useRef, useCallback } from 'react';
import { useFrame } from '@react-three/fiber';
import { useHRPStore, speedToColor, SegmentSpeed } from '../../stores/hrpStore';
import { dist, Vec2 } from '../../utils/coordinate';

interface HRPEditor3DProps {
  robotX: number;
  robotZ: number;
}

function speedToLabel(speed: SegmentSpeed): string {
  return speed.toFixed(1);
}

function makeTextTexture(text: string, color: string, bgColor: string): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 64;
  canvas.height = 32;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = bgColor;
  ctx.fillRect(0, 0, 64, 32);
  ctx.fillStyle = color;
  ctx.font = 'bold 20px monospace';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, 32, 16);
  const tex = new THREE.CanvasTexture(canvas);
  tex.needsUpdate = true;
  return tex;
}

export function HRPEditor3D({ robotX, robotZ }: HRPEditor3DProps) {
  const path = useHRPStore((s) => s.path);
  const segmentSpeeds = useHRPStore((s) => s.segmentSpeeds);
  const blockedSegments = useHRPStore((s) => s.blockedSegments);
  const selectedSegment = useHRPStore((s) => s.selectedSegment);
  const toggleSegmentSpeed = useHRPStore((s) => s.toggleSegmentSpeed);
  const setSelectedSegment = useHRPStore((s) => s.setSelectedSegment);
  const connectorRef = useRef<any>(null);
  const dashOffset = useRef(0);

  const connectorPositions = useMemo(() => {
    if (path.length === 0) return null;
    const first = path[0];
    return new Float32Array([robotX, 0.05, robotZ, first.x, 0.05, first.z]);
  }, [path, robotX, robotZ]);

  const connectorColor = useMemo(() => {
    if (path.length === 0) return '#4caf50';
    const first = path[0];
    const d = dist({ x: robotX, z: robotZ }, { x: first.x, z: first.z });
    return d > 1 ? '#fdd835' : '#4caf50';
  }, [path, robotX, robotZ]);

  useFrame((_, delta) => {
    if (connectorRef.current) {
      const mat = connectorRef.current.material as THREE.LineDashedMaterial;
      if (mat.isLineDashedMaterial) {
        dashOffset.current -= delta * 0.5;
        (mat as any).dashOffset = dashOffset.current;
        mat.needsUpdate = true;
      }
      connectorRef.current.computeLineDistances();
    }
  });

  if (path.length === 0) return null;

  const geometryKey = path.map((p) => `${p.x.toFixed(2)},${p.z.toFixed(2)}`).join('|');

  return (
    <group>
      {path.length >= 2 && segmentSpeeds.map((speed, i) => {
        const from = path[i];
        const to = path[i + 1];
        if (!from || !to) return null;
        const color = speedToColor(speed);
        const isSelected = selectedSegment === i;
        return (
          <PathSegment
            key={`${geometryKey}-seg-${i}`}
            from={from}
            to={to}
            color={color}
            speed={speed}
            index={i}
            isSelected={isSelected}
            blocked={!!blockedSegments[i]}
            onClick={() => toggleSegmentSpeed(i)}
            onHover={(hovered) => setSelectedSegment(hovered ? i : null)}
          />
        );
      })}
      {connectorPositions && (
        <line ref={connectorRef} key={`conn-${geometryKey}-${connectorColor}`}>
          <bufferGeometry>
            <bufferAttribute
              attach="attributes-position"
              count={2}
              array={connectorPositions}
              itemSize={3}
            />
          </bufferGeometry>
          <lineDashedMaterial
            color={connectorColor}
            dashSize={0.2}
            gapSize={0.1}
            linewidth={2}
          />
        </line>
      )}
      {path.map((p, i) => (
        <mesh key={i} position={[p.x, 0.05, p.z]}>
          <sphereGeometry args={[0.05, 12, 12]} />
          <meshBasicMaterial color={i === 0 ? '#4caf50' : '#81c784'} />
        </mesh>
      ))}
    </group>
  );
}

interface PathSegmentProps {
  from: Vec2;
  to: Vec2;
  color: string;
  speed: SegmentSpeed;
  index: number;
  isSelected: boolean;
  blocked: boolean;
  onClick: () => void;
  onHover: (hovered: boolean) => void;
}

function PathSegment({ from, to, color, speed, index, isSelected, blocked, onClick, onHover }: PathSegmentProps) {
  const positions = useMemo(() => {
    return new Float32Array([from.x, 0.05, from.z, to.x, 0.05, to.z]);
  }, [from, to]);

  const midX = (from.x + to.x) / 2;
  const midZ = (from.z + to.z) / 2;
  const segDist = dist(from, to);

  const label = blocked ? 'X' : speedToLabel(speed);
  const displayColor = blocked ? '#dc2626' : color;
  const bgOpacity = isSelected ? 0.85 : 0.6;
  const texture = useMemo(() => makeTextTexture(label, '#ffffff', displayColor), [label, displayColor]);

  const handleClick = useCallback((e: any) => { e.stopPropagation(); onClick(); }, [onClick]);
  const handleOver = useCallback((e: any) => { e.stopPropagation(); onHover(true); }, [onHover]);
  const handleOut = useCallback(() => onHover(false), [onHover]);

  const lineRef = useRef<any>(null);

  useFrame((_, delta) => {
    if (blocked && lineRef.current) {
      const mat = lineRef.current.material as THREE.LineDashedMaterial;
      if (mat.isLineDashedMaterial) {
        (mat as any).dashOffset -= delta * 1.5;
        mat.needsUpdate = true;
      }
      lineRef.current.computeLineDistances();
    }
  });

  return (
    <group>
      <line
        ref={blocked ? lineRef : undefined}
        onPointerDown={handleClick}
        onPointerOver={handleOver}
        onPointerOut={handleOut}
      >
        <bufferGeometry>
          <bufferAttribute
            attach="attributes-position"
            count={2}
            array={positions}
            itemSize={3}
          />
        </bufferGeometry>
        {blocked ? (
          <lineDashedMaterial color="#dc2626" dashSize={0.15} gapSize={0.1} linewidth={isSelected ? 4 : 2} />
        ) : (
          <lineBasicMaterial color={color} linewidth={isSelected ? 4 : 2} />
        )}
      </line>
      {segDist > 0.2 && (
        <sprite position={[midX, 0.15, midZ]} scale={[0.5, 0.25, 1]} onPointerDown={handleClick}>
          <spriteMaterial map={texture} transparent opacity={bgOpacity} />
        </sprite>
      )}
      {segDist > 0.2 && (
        <mesh position={[midX, 0.08, midZ]} onClick={handleClick}>
          <planeGeometry args={[segDist * 0.8, 0.15]} />
          <meshBasicMaterial color={displayColor} transparent opacity={0.15} side={2} />
        </mesh>
      )}
    </group>
  );
}
