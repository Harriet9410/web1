export type Vec2 = {
  x: number;
  z: number;
};

export type Vec3 = {
  x: number;
  y: number;
  z: number;
};

const MAP_OFFSET_X = 0;
const MAP_OFFSET_Z = 0;

export function sceneToRos(sx: number, sz: number): Vec2 {
  return { x: sx + MAP_OFFSET_X, z: sz + MAP_OFFSET_Z };
}

export function rosToScene(rx: number, rz: number): Vec2 {
  return { x: rx - MAP_OFFSET_X, z: rz - MAP_OFFSET_Z };
}

export function quaternionToYaw(
  qx: number,
  qy: number,
  qz: number,
  qw: number
): number {
  const siny_cosp = 2 * (qw * qz + qx * qy);
  const cosy_cosp = 1 - 2 * (qy * qy + qz * qz);
  return Math.atan2(siny_cosp, cosy_cosp);
}

export function dist(a: Vec2, b: Vec2): number {
  const dx = a.x - b.x;
  const dz = a.z - b.z;
  return Math.sqrt(dx * dx + dz * dz);
}
