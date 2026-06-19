import { useEffect, useCallback, useRef, useMemo } from 'react';
import * as THREE from 'three';
import { Canvas, useThree } from '@react-three/fiber';
import { MapFloor } from './MapFloor';
import { RobotModel } from './RobotModel';
import { CameraControls } from './CameraControls';
import { HRZEditor3D } from '../editor/HRZEditor3D';
import { HRPEditor3D } from '../editor/HRPEditor3D';
import { NavPathVisual } from './NavPathVisual';
import { MapEditPreview } from './MapEditPreview';
import { MiniMapBridge, MiniMapOverlay } from './MiniMap';
import { BreadcrumbTrail } from './BreadcrumbTrail';
import type { AppMode } from '../ui/ModeSelector';
import { useHRZStore, HRZZone } from '../../stores/hrzStore';
import { useHRPStore } from '../../stores/hrpStore';
import { useRobotPoseStore } from '../../stores/robotPoseStore';
import { useRosStore } from '../../stores/rosStore';
import { useWaypointStore, Waypoint } from '../../stores/waypointStore';
import { useMapEditorStore } from '../../stores/mapEditorStore';
import { useDragStore } from '../../stores/dragStore';
import { useUndoStore } from '../../stores/undoStore';
import { useNavPlanStore } from '../../stores/navPlanStore';
import { mockPaintBrush, mockPaintRect, mockPlaceRobot } from '../../ros/mock';
import { publishNavGoal } from '../../ros/connection';
import { Vec2, dist } from '../../utils/coordinate';

const VERTEX_HIT_RADIUS = 0.15;
const GRID_SIZE = 0.5;

function snapToGrid(pt: Vec2): Vec2 {
  return {
    x: Math.round(pt.x / GRID_SIZE) * GRID_SIZE,
    z: Math.round(pt.z / GRID_SIZE) * GRID_SIZE,
  };
}

function SceneEvents({ mode }: { mode: AppMode }) {
  const { gl, camera } = useThree();
  const raycaster = useMemo(() => new THREE.Raycaster(), []);
  const groundPlane = useMemo(() => new THREE.Plane(new THREE.Vector3(0, 1, 0), 0), []);
  const lastPathPoint = useRef<Vec2 | null>(null);
  const isDrawingMap = useRef(false);
  const dragState = useRef<{
    type: 'hrz' | 'hrp';
    zoneId?: string;
    vertexIndex: number;
  } | null>(null);

  const getScenePoint = useCallback(
    (e: PointerEvent, snap: boolean = false): Vec2 | null => {
      const rect = gl.domElement.getBoundingClientRect();
      const ndcX = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      const ndcY = -((e.clientY - rect.top) / rect.height) * 2 + 1;
      raycaster.setFromCamera(new THREE.Vector2(ndcX, ndcY), camera);
      const hit = new THREE.Vector3();
      const result = raycaster.ray.intersectPlane(groundPlane, hit);
      if (!result) return null;
      const pt: Vec2 = { x: hit.x, z: hit.z };
      if (snap && e.shiftKey) return snapToGrid(pt);
      return pt;
    },
    [gl, camera, raycaster, groundPlane]
  );

  useEffect(() => {
    const canvas = gl.domElement;

    const onPointerDown = (e: PointerEvent) => {
      if (e.button !== 0) return;

      const snapMode = mode === 'hrz' || mode === 'hrp';
      const pt = getScenePoint(e, snapMode);
      if (!pt) return;

      if (mode === 'hrz') {
        const store = useHRZStore.getState();
        if (!store.isDrawing) {
          let closestDist = VERTEX_HIT_RADIUS;
          let closestZone: HRZZone | null = null;
          let closestIdx = -1;
          for (const zone of store.zones) {
            for (let vi = 0; vi < zone.vertices.length; vi++) {
              const d = dist(pt, zone.vertices[vi]);
              if (d < closestDist) {
                closestDist = d;
                closestZone = zone;
                closestIdx = vi;
              }
            }
          }
          if (closestZone && closestIdx >= 0) {
            useUndoStore.getState().pushUndo();
            dragState.current = { type: 'hrz', zoneId: closestZone.id, vertexIndex: closestIdx };
            useDragStore.getState().setDragInfo({ type: 'hrz', zoneId: closestZone.id, vertexIndex: closestIdx });
            return;
          }
        }
        useUndoStore.getState().pushUndo();
        store.addVertex(pt);
      } else if (mode === 'hrp') {
        const store = useHRPStore.getState();
        if (!store.isDrawing && store.path.length > 0) {
          let closestDist = VERTEX_HIT_RADIUS;
          let closestIdx = -1;
          for (let i = 0; i < store.path.length; i++) {
            const d = dist(pt, store.path[i]);
            if (d < closestDist) {
              closestDist = d;
              closestIdx = i;
            }
          }
          if (closestIdx >= 0) {
            useUndoStore.getState().pushUndo();
            dragState.current = { type: 'hrp', vertexIndex: closestIdx };
            useDragStore.getState().setDragInfo({ type: 'hrp', vertexIndex: closestIdx });
            return;
          }
        }
        useUndoStore.getState().pushUndo();
        store.startDrawing();
        store.addPoint(pt);
        lastPathPoint.current = pt;
      } else if (mode === 'navigate') {
        const rosStore = useRosStore.getState();
        const wpStore = useWaypointStore.getState();
        if (rosStore.isMock) {
          if (wpStore.navigating) return;
          wpStore.addWaypoint(pt);
        } else if (rosStore.status === 'connected') {
          publishNavGoal(pt.x, pt.z);
          wpStore.addWaypoint(pt);
          wpStore.setCurrentWaypointIdx(0);
          wpStore.setNavigating(true);
        }
      } else if (mode === 'mapedit') {
        const isMock = useRosStore.getState().isMock;
        if (!isMock) return;
        const editStore = useMapEditorStore.getState();
        const tool = editStore.tool;

        if (tool === 'rect') {
          const col = Math.floor(pt.x / 0.02);
          const row = Math.floor(pt.z / 0.02);
          editStore.setRectStart({ col, row });
        } else if (tool === 'robot') {
          mockPlaceRobot(pt.x, pt.z);
        } else {
          isDrawingMap.current = true;
          const occupied = tool === 'wall';
          mockPaintBrush(pt.x, pt.z, editStore.brushSize, occupied);
        }
      }
    };

    const onPointerMove = (e: PointerEvent) => {
      const pt = getScenePoint(e, mode === 'hrz' || mode === 'hrp');
      if (!pt) return;

      if (dragState.current) {
        if (e.buttons !== 1) {
          dragState.current = null;
          useDragStore.getState().setDragInfo(null);
          return;
        }
        const ds = dragState.current;
        if (ds.type === 'hrz') {
          useHRZStore.getState().moveVertex(ds.zoneId!, ds.vertexIndex, pt);
        } else if (ds.type === 'hrp') {
          useHRPStore.getState().movePoint(ds.vertexIndex, pt);
        }
        return;
      }

      if (mode === 'hrp') {
        const store = useHRPStore.getState();
        if (!store.isDrawing) return;
        if (e.buttons !== 1) return;
        if (lastPathPoint.current && dist(pt, lastPathPoint.current) < 0.1) return;
        store.addPoint(pt);
        lastPathPoint.current = pt;
        return;
      }

      if (mode === 'mapedit' && isDrawingMap.current) {
        if (!pt) return;
        const editStore = useMapEditorStore.getState();
        const occupied = editStore.tool === 'wall';
        mockPaintBrush(pt.x, pt.z, editStore.brushSize, occupied);
      }
    };

    const onPointerUp = (e: PointerEvent) => {
      if (e.button !== 0) return;

      if (dragState.current) {
        dragState.current = null;
        useDragStore.getState().setDragInfo(null);
        return;
      }

      if (mode === 'hrp') {
        const store = useHRPStore.getState();
        if (store.isDrawing) store.finishDrawing();
      }

      if (mode === 'mapedit') {
        const editStore = useMapEditorStore.getState();
        if (editStore.tool === 'rect' && editStore.rectStart) {
          const pt = getScenePoint(e);
          if (pt) {
            const start = editStore.rectStart;
            const sx = (start.col + 0.5) * 0.02;
            const sz = (start.row + 0.5) * 0.02;
            mockPaintRect(sx, sz, pt.x, pt.z, true);
            editStore.setRectStart(null);
          }
        }
        isDrawingMap.current = false;
      }
    };

    canvas.addEventListener('pointerdown', onPointerDown);
    canvas.addEventListener('pointermove', onPointerMove);
    canvas.addEventListener('pointerup', onPointerUp);

    return () => {
      canvas.removeEventListener('pointerdown', onPointerDown);
      canvas.removeEventListener('pointermove', onPointerMove);
      canvas.removeEventListener('pointerup', onPointerUp);
    };
  }, [mode, getScenePoint, gl]);

  return null;
}

export function Scene3D({ mode, followRobot }: { mode: AppMode; followRobot: boolean }) {
  const robotPose = useRobotPoseStore((s) => s.pose);
  const waypoints = useWaypointStore((s) => s.waypoints);
  const currentWaypointIdx = useWaypointStore((s) => s.currentWaypointIdx);
  const navigating = useWaypointStore((s) => s.navigating);
  const plannedPath = useWaypointStore((s) => s.plannedPath);
  const moveBasePlan = useNavPlanStore((s) => s.moveBasePlan);

  return (
    <div style={{ position: 'relative', width: '100%', height: '100%' }}>
    <Canvas
      camera={{ position: [5, 15, 15], fov: 50, near: 0.1, far: 500 }}
      style={{ background: '#1a1a2e' }}
    >
      <ambientLight intensity={0.6} />
      <directionalLight position={[10, 20, 10]} intensity={0.8} />
      <MapFloor />
      <RobotModel x={robotPose.x} z={robotPose.z} yaw={robotPose.yaw} />
      <SceneEvents mode={mode} />
      {(mode === 'hrz') && <HRZEditor3D />}
      {(mode === 'hrp') && (
        <>
          <HRZEditor3D />
          <HRPEditor3D robotX={robotPose.x} robotZ={robotPose.z} />
        </>
      )}
      {mode === 'mapedit' && <MapEditPreview />}
      {(mode === 'navigate') && waypoints.map((wp, i) => (
        <WaypointMarker
          key={wp.id}
          waypoint={wp}
          index={i}
          isCurrent={navigating && i === currentWaypointIdx}
          isReached={navigating && i < currentWaypointIdx}
        />
      ))}
      {(mode === 'navigate') && waypoints.length >= 2 && (
        <WaypointLines waypoints={waypoints} navigating={navigating} currentIdx={currentWaypointIdx} />
      )}
      {plannedPath.length >= 2 && navigating && (
        <NavPathVisual path={plannedPath} color="#ff4081" />
      )}
      {moveBasePlan.length >= 2 && !useRosStore.getState().isMock && (
        <NavPathVisual path={moveBasePlan} color="#ffffff" opacity={0.5} />
      )}
      <CameraControls mode={mode} followRobot={followRobot} />
      <MiniMapBridge />
      <BreadcrumbTrail />
      <gridHelper args={[50, 50, '#555', '#333']} position={[5, 0, 5]} />
    </Canvas>
    <MiniMapOverlay />
    </div>
  );
}

function makeNumberTexture(num: number, bgColor: string): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 64;
  canvas.height = 64;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = bgColor;
  ctx.beginPath();
  ctx.arc(32, 32, 28, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 32px monospace';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(String(num + 1), 32, 33);
  const tex = new THREE.CanvasTexture(canvas);
  tex.needsUpdate = true;
  return tex;
}

function WaypointMarker({ waypoint, index, isCurrent, isReached }: {
  waypoint: Waypoint;
  index: number;
  isCurrent: boolean;
  isReached: boolean;
}) {
  const bgColor = isReached ? '#666666' : isCurrent ? '#ff4081' : '#42a5f5';
  const texture = useMemo(() => makeNumberTexture(index, bgColor), [index, bgColor]);

  return (
    <group position={[waypoint.x, 0.02, waypoint.z]}>
      <sprite position={[0, 0.5, 0]} scale={[0.5, 0.5, 1]}>
        <spriteMaterial map={texture} transparent opacity={isReached ? 0.4 : 0.9} />
      </sprite>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.01, 0]}>
        <ringGeometry args={[0.1, 0.16, 24]} />
        <meshBasicMaterial color={bgColor} side={2} transparent opacity={isReached ? 0.3 : 0.7} />
      </mesh>
    </group>
  );
}

function WaypointLines({ waypoints, navigating, currentIdx }: {
  waypoints: Waypoint[];
  navigating: boolean;
  currentIdx: number;
}) {
  return (
    <group>
      {waypoints.slice(0, -1).map((wp, i) => {
        const next = waypoints[i + 1];
        const reached = navigating && i < currentIdx;
        const active = navigating && i === currentIdx;
        const positions = new Float32Array([wp.x, 0.05, wp.z, next.x, 0.05, next.z]);
        const color = reached ? '#666666' : active ? '#ff4081' : '#42a5f5';
        return (
          <line key={`${wp.id}-${next.id}`}>
            <bufferGeometry>
              <bufferAttribute
                attach="attributes-position"
                count={2}
                array={positions}
                itemSize={3}
              />
            </bufferGeometry>
            <lineDashedMaterial
              color={color}
              dashSize={0.15}
              gapSize={0.08}
              transparent
              opacity={reached ? 0.3 : 0.7}
            />
          </line>
        );
      })}
    </group>
  );
}
