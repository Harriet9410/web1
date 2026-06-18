import { Ros, Topic } from 'roslib';
import { useRosStore } from '../stores/rosStore';
import { useMapStore } from '../stores/mapStore';
import { useRobotPoseStore } from '../stores/robotPoseStore';
import { OccupancyGridData } from '../utils/mapRenderer';
import { quaternionToYaw } from '../utils/coordinate';
import type { RosMsg_OccupancyGrid, RosMsg_Odometry } from './types';

let ros: Ros | null = null;
let mapSub: Topic | null = null;
let odomSub: Topic | null = null;

export function connect(url?: string): void {
  const store = useRosStore.getState();
  const wsUrl = url || store.url;
  store.setStatus('connecting');

  ros = new Ros({ url: wsUrl });

  ros.on('connection', () => {
    useRosStore.getState().setStatus('connected');
    subscribeAll();
  });

  ros.on('error', () => {
    useRosStore.getState().setStatus('error');
  });

  ros.on('close', () => {
    const s = useRosStore.getState().status;
    if (s !== 'error') {
      useRosStore.getState().setStatus('disconnected');
    }
  });
}

export function disconnect(): void {
  if (mapSub) { mapSub.unsubscribe(); mapSub = null; }
  if (odomSub) { odomSub.unsubscribe(); odomSub = null; }
  if (ros) { ros.close(); ros = null; }
  useRosStore.getState().setStatus('disconnected');
  useMapStore.getState().setGrid(null as unknown as OccupancyGridData);
  useRobotPoseStore.getState().setPose({ x: 2, z: 2, yaw: 0 });
}

function subscribeAll(): void {
  if (!ros) return;

  mapSub = new Topic({
    ros,
    name: '/map',
    messageType: 'nav_msgs/OccupancyGrid',
    throttle_rate: 500,
  });

  mapSub.subscribe((msg: unknown) => {
    const m = msg as RosMsg_OccupancyGrid;
    const grid: OccupancyGridData = {
      width: m.info.width,
      height: m.info.height,
      resolution: m.info.resolution,
      originX: m.info.origin.position.x,
      originY: m.info.origin.position.y,
      data: m.data,
    };
    useMapStore.getState().setGrid(grid);
  });

  odomSub = new Topic({
    ros,
    name: '/odom',
    messageType: 'nav_msgs/Odometry',
    throttle_rate: 100,
  });

  odomSub.subscribe((msg: unknown) => {
    const m = msg as RosMsg_Odometry;
    const p = m.pose.pose.position;
    const q = m.pose.pose.orientation;
    useRobotPoseStore.getState().setPose({
      x: p.x,
      z: p.z,
      yaw: quaternionToYaw(q.x, q.y, q.z, q.w),
    });
  });
}

export function getRos(): Ros | null {
  return ros;
}

export function publishNavGoal(x: number, z: number, yaw: number = 0): void {
  if (!ros) return;
  const topic = new Topic({
    ros,
    name: '/move_base_simple/goal',
    messageType: 'geometry_msgs/PoseStamped',
  });
  const msg = {
    header: {
      frame_id: 'map',
      stamp: { secs: Math.floor(Date.now() / 1000), nsecs: 0 },
    },
    pose: {
      position: { x, y: 0, z },
      orientation: { x: 0, y: 0, z: Math.sin(yaw / 2), w: Math.cos(yaw / 2) },
    },
  };
  topic.publish(msg as never);
}

export function publishHRZZones(json: string): void {
  if (!ros) return;
  const topic = new Topic({
    ros,
    name: '/hrz_zones',
    messageType: 'std_msgs/String',
  });
  topic.publish({ data: json } as never);
}

export function publishHRPPath(poses: { x: number; z: number }[]): void {
  if (!ros) return;
  const topic = new Topic({
    ros,
    name: '/hrp_path',
    messageType: 'nav_msgs/Path',
  });
  const pathMsg = {
    header: { frame_id: 'map' },
    poses: poses.map((p) => ({
      pose: {
        position: { x: p.x, y: 0, z: p.z },
        orientation: { x: 0, y: 0, z: 0, w: 1 },
      },
    })),
  };
  topic.publish(pathMsg as never);
}

export { Ros, Topic };
