export interface OccupancyGridData {
  width: number;
  height: number;
  resolution: number;
  originX: number;
  originY: number;
  data: number[];
}

const UNKNOWN = 205;
const FREE = 0;
const OCCUPIED = 254;

export function renderMapToCanvas(
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
    if (val === UNKNOWN) {
      gray = 128;
    } else if (val === FREE) {
      gray = 254;
    } else if (val === OCCUPIED) {
      gray = 0;
    } else {
      gray = 254 - val;
    }
    imgData.data[i * 4] = gray;
    imgData.data[i * 4 + 1] = gray;
    imgData.data[i * 4 + 2] = gray;
    imgData.data[i * 4 + 3] = 255;
  }
  ctx.putImageData(imgData, 0, 0);
}
