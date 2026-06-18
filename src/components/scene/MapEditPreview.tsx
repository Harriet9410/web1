import { useMemo } from 'react';
import { useMapEditorStore } from '../../stores/mapEditorStore';

export function MapEditPreview() {
  const tool = useMapEditorStore((s) => s.tool);
  const brushSize = useMapEditorStore((s) => s.brushSize);
  const rectStart = useMapEditorStore((s) => s.rectStart);

  const color = tool === 'wall' ? '#ff5722' : tool === 'erase' ? '#4caf50' : tool === 'rect' ? '#2196f3' : '#ffeb3b';
  const radius = brushSize * 0.02;

  const previewRings = useMemo(() => {
    if (tool === 'rect' && rectStart) {
      return null;
    }
    return { radius: Math.max(radius, 0.06), color };
  }, [tool, radius, color, rectStart]);

  return (
    <group>
      {previewRings && (
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.03, 0]}>
          <ringGeometry args={[previewRings.radius - 0.01, previewRings.radius, 32]} />
          <meshBasicMaterial color={previewRings.color} transparent opacity={0.6} side={2} />
        </mesh>
      )}
    </group>
  );
}
