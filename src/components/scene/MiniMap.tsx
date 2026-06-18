import { useRef, useEffect } from 'react';
import * as THREE from 'three';
import { useThree, useFrame } from '@react-three/fiber';
import { useMapStore } from '../../stores/mapStore';
import { useRobotPoseStore } from '../../stores/robotPoseStore';
import { useWaypointStore } from '../../stores/waypointStore';
import { renderMapToCanvas } from '../../utils/mapRenderer';

const MINIMAP_SIZE = 180;

export function MiniMapBridge() {
  const grid = useMapStore((s) => s.grid);
  const { camera } = useThree();
  const mapCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const sizeRef = useRef({ mapW: 10, mapH: 10 });

  useEffect(() => {
    if (!grid) return;
    const offscreen = document.createElement('canvas');
    renderMapToCanvas(offscreen, grid);
    mapCanvasRef.current = offscreen;
    sizeRef.current = { mapW: grid.width * grid.resolution, mapH: grid.height * grid.resolution };
  }, [grid]);

  useFrame(() => {
    const mapC = mapCanvasRef.current;
    if (!mapC) return;

    const { mapW, mapH } = sizeRef.current;
    const scale = MINIMAP_SIZE / Math.max(mapW, mapH);

    const robotPose = useRobotPoseStore.getState().pose;
    const waypoints = useWaypointStore.getState().waypoints;

    const raycaster = new THREE.Raycaster();
    const ndcCorners: [number, number][] = [[-1, -1], [1, -1], [1, 1], [-1, 1]];
    const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
    const viewportCorners: { x: number; z: number }[] = [];
    for (const [nx, ny] of ndcCorners) {
      raycaster.setFromCamera(new THREE.Vector2(nx, ny), camera);
      const hit = new THREE.Vector3();
      if (raycaster.ray.intersectPlane(plane, hit)) {
        viewportCorners.push({ x: hit.x, z: hit.z });
      }
    }

    miniMapData.mapCanvas = mapC;
    miniMapData.robotX = robotPose.x;
    miniMapData.robotZ = robotPose.z;
    miniMapData.robotYaw = robotPose.yaw;
    miniMapData.waypoints = waypoints;
    miniMapData.viewportCorners = viewportCorners;
    miniMapData.mapW = mapW;
    miniMapData.mapH = mapH;
    miniMapData.scale = scale;
    miniMapData.version++;
  });

  return null;
}

export interface MiniMapData {
  mapCanvas: HTMLCanvasElement | null;
  robotX: number;
  robotZ: number;
  robotYaw: number;
  waypoints: { x: number; z: number }[];
  viewportCorners: { x: number; z: number }[];
  mapW: number;
  mapH: number;
  scale: number;
  version: number;
}

export const miniMapData: MiniMapData = {
  mapCanvas: null,
  robotX: 0,
  robotZ: 0,
  robotYaw: 0,
  waypoints: [],
  viewportCorners: [],
  mapW: 10,
  mapH: 10,
  scale: 1,
  version: 0,
};

export function MiniMapOverlay() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const grid = useMapStore((s) => s.grid);
  const rafRef = useRef(0);
  const lastVersion = useRef(0);

  useEffect(() => {
    const draw = () => {
      const canvas = canvasRef.current;
      if (!canvas) { rafRef.current = requestAnimationFrame(draw); return; }

      const d = miniMapData;
      if (!d.mapCanvas) { rafRef.current = requestAnimationFrame(draw); return; }

      if (d.version === lastVersion.current) {
        rafRef.current = requestAnimationFrame(draw);
        return;
      }
      lastVersion.current = d.version;

      const drawW = Math.round(d.mapW * d.scale);
      const drawH = Math.round(d.mapH * d.scale);
      if (canvas.width !== drawW || canvas.height !== drawH) {
        canvas.width = drawW;
        canvas.height = drawH;
      }

      const ctx = canvas.getContext('2d');
      if (!ctx) { rafRef.current = requestAnimationFrame(draw); return; }

      ctx.clearRect(0, 0, drawW, drawH);
      ctx.drawImage(d.mapCanvas, 0, 0, drawW, drawH);

      const rx = d.robotX * d.scale;
      const rz = drawH - d.robotZ * d.scale;
      ctx.fillStyle = '#ff4081';
      ctx.beginPath();
      ctx.arc(rx, rz, 3, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#ff4081';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(rx, rz);
      ctx.lineTo(rx + Math.sin(d.robotYaw) * 8, rz + Math.cos(d.robotYaw) * 8);
      ctx.stroke();

      if (d.waypoints.length > 0) {
        ctx.strokeStyle = '#42a5f5';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(d.waypoints[0].x * d.scale, drawH - d.waypoints[0].z * d.scale);
        for (let i = 1; i < d.waypoints.length; i++) {
          ctx.lineTo(d.waypoints[i].x * d.scale, drawH - d.waypoints[i].z * d.scale);
        }
        ctx.stroke();
        for (const wp of d.waypoints) {
          ctx.fillStyle = '#42a5f5';
          ctx.beginPath();
          ctx.arc(wp.x * d.scale, drawH - wp.z * d.scale, 2.5, 0, Math.PI * 2);
          ctx.fill();
        }
      }

      if (d.viewportCorners.length === 4) {
        ctx.strokeStyle = '#fdd835';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(d.viewportCorners[0].x * d.scale, drawH - d.viewportCorners[0].z * d.scale);
        for (let i = 1; i < 4; i++) {
          ctx.lineTo(d.viewportCorners[i].x * d.scale, drawH - d.viewportCorners[i].z * d.scale);
        }
        ctx.closePath();
        ctx.stroke();
      }

      rafRef.current = requestAnimationFrame(draw);
    };

    rafRef.current = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(rafRef.current);
  }, []);

  if (!grid) return null;

  const s = miniMapData.mapW > 0 ? MINIMAP_SIZE / Math.max(miniMapData.mapW, miniMapData.mapH) : 1;
  const drawW = Math.round(miniMapData.mapW * s);
  const drawH = Math.round(miniMapData.mapH * s);

  return (
    <div
      style={{
        position: 'absolute',
        top: 8,
        right: 8,
        width: drawW + 2,
        height: drawH + 2,
        border: '1px solid rgba(255,255,255,0.3)',
        borderRadius: 4,
        overflow: 'hidden',
        background: '#1a1a2e',
        zIndex: 10,
        pointerEvents: 'none',
      }}
    >
      <canvas
        ref={canvasRef}
        width={drawW}
        height={drawH}
        style={{ display: 'block' }}
      />
    </div>
  );
}
