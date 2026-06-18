import { useRef, useEffect, useCallback } from 'react';
import * as THREE from 'three';
import { useThree, useFrame } from '@react-three/fiber';
import { useMapStore } from '../../stores/mapStore';
import { useRobotPoseStore } from '../../stores/robotPoseStore';
import { useWaypointStore } from '../../stores/waypointStore';
import { renderMapToCanvas } from '../../utils/mapRenderer';

const MINIMAP_SIZE = 180;
const PADDING = 8;

export function MiniMap() {
  const grid = useMapStore((s) => s.grid);
  const { camera, gl } = useThree();
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const mapCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const mapDirtyRef = useRef(true);
  const sizeRef = useRef({ mapW: 0, mapH: 0, res: 0.02 });

  useEffect(() => {
    if (!grid) return;
    const offscreen = document.createElement('canvas');
    renderMapToCanvas(offscreen, grid);
    mapCanvasRef.current = offscreen;
    sizeRef.current = { mapW: grid.width * grid.resolution, mapH: grid.height * grid.resolution, res: grid.resolution };
    mapDirtyRef.current = true;
  }, [grid]);

  const getViewportCorners = useCallback(() => {
    const raycaster = new THREE.Raycaster();
    const corners: { x: number; z: number }[] = [];
    const ndcCorners = [
      [-1, -1],
      [1, -1],
      [1, 1],
      [-1, 1],
    ];
    const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
    for (const [nx, ny] of ndcCorners) {
      raycaster.setFromCamera(new THREE.Vector2(nx, ny), camera);
      const hit = new THREE.Vector3();
      if (raycaster.ray.intersectPlane(plane, hit)) {
        corners.push({ x: hit.x, z: hit.z });
      }
    }
    return corners;
  }, [camera]);

  useFrame(() => {
    const canvas = canvasRef.current;
    if (!canvas || !mapCanvasRef.current) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const { mapW, mapH } = sizeRef.current;
    const scale = MINIMAP_SIZE / Math.max(mapW, mapH);
    const drawW = mapW * scale;
    const drawH = mapH * scale;

    if (mapDirtyRef.current) {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.fillStyle = '#1a1a2e';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(mapCanvasRef.current, 0, 0, drawW, drawH);
      mapDirtyRef.current = false;
    } else {
      const prev = ctx.getImageData(0, 0, canvas.width, canvas.height);
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.fillStyle = '#1a1a2e';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.putImageData(prev, 0, 0);
    }

    const robotPose = useRobotPoseStore.getState().pose;
    const rx = robotPose.x * scale;
    const rz = robotPose.z * scale;
    ctx.fillStyle = '#ff4081';
    ctx.beginPath();
    ctx.arc(rx, rz, 3, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#ff4081';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(rx, rz);
    ctx.lineTo(rx + Math.sin(robotPose.yaw) * 8, rz - Math.cos(robotPose.yaw) * 8);
    ctx.stroke();

    const waypoints = useWaypointStore.getState().waypoints;
    if (waypoints.length > 0) {
      ctx.strokeStyle = '#42a5f5';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(waypoints[0].x * scale, waypoints[0].z * scale);
      for (let i = 1; i < waypoints.length; i++) {
        ctx.lineTo(waypoints[i].x * scale, waypoints[i].z * scale);
      }
      ctx.stroke();
      for (let i = 0; i < waypoints.length; i++) {
        ctx.fillStyle = '#42a5f5';
        ctx.beginPath();
        ctx.arc(waypoints[i].x * scale, waypoints[i].z * scale, 2.5, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    const corners = getViewportCorners();
    if (corners.length === 4) {
      ctx.strokeStyle = '#fdd835';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(corners[0].x * scale, corners[0].z * scale);
      for (let i = 1; i < 4; i++) {
        ctx.lineTo(corners[i].x * scale, corners[i].z * scale);
      }
      ctx.closePath();
      ctx.stroke();
    }
  });

  if (!grid) return null;

  const { mapW, mapH } = sizeRef.current;
  const scale = MINIMAP_SIZE / Math.max(mapW, mapH);
  const drawW = mapW * scale;
  const drawH = mapH * scale;

  return (
    <div
      ref={containerRef}
      style={{
        position: 'absolute',
        top: PADDING,
        right: PADDING,
        width: drawW + 2,
        height: drawH + 2,
        border: '1px solid rgba(255,255,255,0.3)',
        borderRadius: 4,
        overflow: 'hidden',
        pointerEvents: 'none',
        zIndex: 10,
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
