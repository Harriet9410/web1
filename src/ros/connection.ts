import { Ros, Topic } from 'roslib';
import { useRosStore } from '../stores/rosStore';
import { useMapStore } from '../stores/mapStore';
import { OccupancyGridData } from '../utils/mapRenderer';
import { quaternionToYaw, rosToScene } from '../utils/coordinate';
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
}

export function getRos(): Ros | null {
  return ros;
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
