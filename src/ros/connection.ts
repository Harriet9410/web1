import { Ros, Topic } from 'roslib';
import { useRosStore } from '../stores/rosStore';
import { useMapStore } from '../stores/mapStore';
import { useRobotPoseStore } from '../stores/robotPoseStore';
import { useNavPlanStore } from '../stores/navPlanStore';
import { OccupancyGridData } from '../utils/mapRenderer';
import { quaternionToYaw } from '../utils/coordinate';
import type { SegmentSpeed } from '../stores/hrpStore';
import type { RosMsg_OccupancyGrid, RosMsg_Odometry, RosMsg_Path } from './types';

let ros: Ros | null = null;
let mapSub: Topic | null = null;
let odomSub: Topic | null = null;
let navPlanSub: Topic | null = null;
let mapOriginX = 0;
let mapOriginY = 0;
let mapResolution = 0.05;
let mapHeight = 0;

function rosToScene(rx: number, ry: number): { x: number; z: number } {
  return {
    x: rx - mapOriginX,
    z: mapOriginY + mapHeight * mapResolution - ry,
  };
}

function sceneToRos(sx: number, sz: number): { x: number; y: number } {
  return {
    x: sx + mapOriginX,
    y: mapOriginY + mapHeight * mapResolution - sz,
  };
}

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
  if (navPlanSub) { navPlanSub.unsubscribe(); navPlanSub = null; }
  if (ros) { ros.close(); ros = null; }
  useRosStore.getState().setStatus('disconnected');
  useMapStore.getState().setGrid(null as unknown as OccupancyGridData);
  useRobotPoseStore.getState().setPose({ x: 2, z: 2, yaw: 0 });
  useNavPlanStore.getState().clearMoveBasePlan();
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
    mapOriginX = m.info.origin.position.x;
    mapOriginY = m.info.origin.position.y;
    mapResolution = m.info.resolution;
    mapHeight = m.info.height;
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
    const rosYaw = quaternionToYaw(q.x, q.y, q.z, q.w);
    const scenePos = rosToScene(p.x, p.y);
    useRobotPoseStore.getState().setPose({
      x: scenePos.x,
      z: scenePos.z,
      yaw: Math.PI / 2 - rosYaw,
    });
    useRobotPoseStore.getState().setVelocity(
      m.twist.twist.linear.x,
      m.twist.twist.angular.z
    );
  });

  navPlanSub = new Topic({
    ros,
    name: '/move_base/NavfnROS/plan',
    messageType: 'nav_msgs/Path',
    throttle_rate: 500,
  });

  navPlanSub.subscribe((msg: unknown) => {
    const m = msg as RosMsg_Path;
    const scenePath = m.poses.map((p) => rosToScene(p.pose.position.x, p.pose.position.y));
    useNavPlanStore.getState().setMoveBasePlan(scenePath);
  });
}

export function getRos(): Ros | null {
  return ros;
}

export function publishNavGoal(x: number, z: number, yaw: number = 0): void {
  if (!ros) return;
  const rosPos = sceneToRos(x, z);
  const rosYaw = Math.PI / 2 - yaw;
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
      position: { x: rosPos.x, y: rosPos.y, z: 0 },
      orientation: { x: 0, y: 0, z: Math.sin(rosYaw / 2), w: Math.cos(rosYaw / 2) },
    },
  };
  topic.publish(msg as never);
}

export function publishWaypointGoals(waypoints: { x: number; z: number }[]): void {
  if (!ros) return;
  const topic = new Topic({
    ros,
    name: '/waypoint_goals',
    messageType: 'std_msgs/String',
  });
  const data = waypoints.map((wp) => {
    const rosPos = sceneToRos(wp.x, wp.z);
    return { x: rosPos.x, y: rosPos.y };
  });
  topic.publish({ data: JSON.stringify(data) } as never);
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
    poses: poses.map((p) => {
      const rosPos = sceneToRos(p.x, p.z);
      return {
        pose: {
          position: { x: rosPos.x, y: rosPos.y, z: 0 },
          orientation: { x: 0, y: 0, z: 0, w: 1 },
        },
      };
    }),
  };
  topic.publish(pathMsg as never);
}

export function publishHRPSpeeds(speeds: SegmentSpeed[]): void {
  if (!ros) return;
  const topic = new Topic({
    ros,
    name: '/hrp_speeds',
    messageType: 'std_msgs/String',
  });
  topic.publish({ data: JSON.stringify(speeds) } as never);
}

export function publishCmdVel(linearX: number, angularZ: number): void {
  if (!ros) return;
  const topic = new Topic({
    ros,
    name: '/cmd_vel',
    messageType: 'geometry_msgs/Twist',
  });
  topic.publish({
    linear: { x: linearX, y: 0, z: 0 },
    angular: { x: 0, y: 0, z: angularZ },
  } as never);
}

export { Ros, Topic };
