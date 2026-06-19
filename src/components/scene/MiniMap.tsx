import { useRef, useEffect } from 'react';
import * as THREE from 'three';
import { useThree, useFrame } from '@react-three/fiber';
import { useMapStore } from '../../stores/mapStore';
import { useRobotPoseStore } from '../../stores/robotPoseStore';
import { useWaypointStore } from '../../stores/waypointStore';
import { useHRPStore } from '../../stores/hrpStore';
import { useNavPlanStore } from '../../stores/navPlanStore';
import type { OccupancyGridData } from '../../utils/mapRenderer';

const MINIMAP_SIZE = 180;
const UNKNOWN = 205;
const FREE = 0;
const OCCUPIED = 254;

function renderMiniMapCanvas(
  canvas: HTMLCanvasElement,
  grid: OccupancyGridData
): void {
  const { width, height, data } = grid;
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  const imgData = ctx.createImageData(width, height);
  for (let i = 0; i < data.length; i++) {
    const val = data[i];
    let gray: number;
    if (val === UNKNOWN) gray = 128;
    else if (val === FREE) gray = 254;
    else if (val === OCCUPIED) gray = 0;
    else gray = 254 - val;
    imgData.data[i * 4] = gray;
    imgData.data[i * 4 + 1] = gray;
    imgData.data[i * 4 + 2] = gray;
    imgData.data[i * 4 + 3] = 255;
  }
  ctx.putImageData(imgData, 0, 0);
}

export function MiniMapBridge() {
  const grid = useMapStore((s) => s.grid);
  const { camera } = useThree();
  const mapCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const sizeRef = useRef({ mapW: 10, mapH: 10 });

  useEffect(() => {
    if (!grid) return;
    const offscreen = document.createElement('canvas');
    renderMiniMapCanvas(offscreen, grid);
    mapCanvasRef.current = offscreen;
    sizeRef.current = { mapW: grid.width * grid.resolution, mapH: grid.height * grid.resolution };
  }, [grid]);

  useFrame(() => {
    const mapC = mapCanvasRef.current;
    if (!mapC) return;

    const { mapW, mapH } = sizeRef.current;
    const scale = MINIMAP_SIZE / Math.max(mapW, mapH);

    const robotPose = useRobotPoseStore.getState().pose;
    const wpStore = useWaypointStore.getState();
    const hrpStore = useHRPStore.getState();
    const navPlanStore = useNavPlanStore.getState();

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
    miniMapData.waypoints = wpStore.waypoints;
    miniMapData.plannedPath = wpStore.navigating ? wpStore.plannedPath : [];
    miniMapData.hrpPath = hrpStore.path;
    miniMapData.moveBasePlan = navPlanStore.moveBasePlan;
    miniMapData.viewportCorners = viewportCorners;
    miniMapData.mapW = mapW;
    miniMapData.mapH = mapH;
    miniMapData.scale = scale;
    miniMapData.version++;
  });

  return null;
}

interface MiniMapDataObj {
  mapCanvas: HTMLCanvasElement | null;
  robotX: number;
  robotZ: number;
  robotYaw: number;
  waypoints: { x: number; z: number }[];
  plannedPath: { x: number; z: number }[];
  hrpPath: { x: number; z: number }[];
  moveBasePlan: { x: number; z: number }[];
  viewportCorners: { x: number; z: number }[];
  mapW: number;
  mapH: number;
  scale: number;
  version: number;
}

const miniMapData: MiniMapDataObj = {
  mapCanvas: null,
  robotX: 0,
  robotZ: 0,
  robotYaw: 0,
  waypoints: [],
  plannedPath: [],
  hrpPath: [],
  moveBasePlan: [],
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
      const ry = d.robotZ * d.scale;
      ctx.fillStyle = '#ff4081';
      ctx.beginPath();
      ctx.arc(rx, ry, 3, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#ff4081';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(rx, ry);
      ctx.lineTo(rx + Math.sin(d.robotYaw) * 8, ry + Math.cos(d.robotYaw) * 8);
      ctx.stroke();

      if (d.plannedPath.length >= 2) {
        ctx.strokeStyle = '#ff4081';
        ctx.lineWidth = 1;
        ctx.setLineDash([2, 2]);
        ctx.beginPath();
        ctx.moveTo(d.plannedPath[0].x * d.scale, d.plannedPath[0].z * d.scale);
        for (let i = 1; i < d.plannedPath.length; i++) {
          ctx.lineTo(d.plannedPath[i].x * d.scale, d.plannedPath[i].z * d.scale);
        }
        ctx.stroke();
        ctx.setLineDash([]);
      }

      if (d.hrpPath.length >= 2) {
        ctx.strokeStyle = '#4caf50';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(d.hrpPath[0].x * d.scale, d.hrpPath[0].z * d.scale);
        for (let i = 1; i < d.hrpPath.length; i++) {
          ctx.lineTo(d.hrpPath[i].x * d.scale, d.hrpPath[i].z * d.scale);
        }
        ctx.stroke();
      }

      if (d.moveBasePlan.length >= 2) {
        ctx.strokeStyle = 'rgba(255,255,255,0.6)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(d.moveBasePlan[0].x * d.scale, d.moveBasePlan[0].z * d.scale);
        for (let i = 1; i < d.moveBasePlan.length; i++) {
          ctx.lineTo(d.moveBasePlan[i].x * d.scale, d.moveBasePlan[i].z * d.scale);
        }
        ctx.stroke();
      }

      if (d.waypoints.length > 0) {
        ctx.strokeStyle = '#42a5f5';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(d.waypoints[0].x * d.scale, d.waypoints[0].z * d.scale);
        for (let i = 1; i < d.waypoints.length; i++) {
          ctx.lineTo(d.waypoints[i].x * d.scale, d.waypoints[i].z * d.scale);
        }
        ctx.stroke();
        for (const wp of d.waypoints) {
          ctx.fillStyle = '#42a5f5';
          ctx.beginPath();
          ctx.arc(wp.x * d.scale, wp.z * d.scale, 2.5, 0, Math.PI * 2);
          ctx.fill();
        }
      }

      if (d.viewportCorners.length === 4) {
        ctx.strokeStyle = '#fdd835';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(d.viewportCorners[0].x * d.scale, d.viewportCorners[0].z * d.scale);
        for (let i = 1; i < 4; i++) {
          ctx.lineTo(d.viewportCorners[i].x * d.scale, d.viewportCorners[i].z * d.scale);
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
