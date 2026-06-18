import { useHRZStore } from '../../stores/hrzStore';
import { useHRPStore } from '../../stores/hrpStore';
import { useRosStore } from '../../stores/rosStore';
import { useNavTargetStore } from '../../stores/navTargetStore';
import { useMapEditorStore, MapTool } from '../../stores/mapEditorStore';
import { publishHRZZones, publishHRPPath } from '../../ros/connection';
import { mockPublishHRZZones, mockPublishHRPPath, mockCancelNav, mockResetMap, mockClearMap } from '../../ros/mock';
import { sceneToRos } from '../../utils/coordinate';
import type { AppMode } from '../ui/ModeSelector';

interface ActionPanelProps {
  mode: AppMode;
}

const mapTools: { key: MapTool; label: string; desc: string }[] = [
  { key: 'wall', label: 'Wall', desc: 'Draw walls (click & drag)' },
  { key: 'erase', label: 'Eraser', desc: 'Erase walls (click & drag)' },
  { key: 'rect', label: 'Rectangle', desc: 'Draw rectangular wall (click & drag)' },
  { key: 'robot', label: 'Place Robot', desc: 'Click to place robot' },
];

export function ActionPanel({ mode }: ActionPanelProps) {
  const hrz = useHRZStore();
  const hrp = useHRPStore();
  const isMock = useRosStore((s) => s.isMock);
  const isConnected = useRosStore((s) => s.status) === 'connected';
  const navigating = useNavTargetStore((s) => s.navigating);
  const navTarget = useNavTargetStore((s) => s.target);
  const editTool = useMapEditorStore((s) => s.tool);
  const brushSize = useMapEditorStore((s) => s.brushSize);

  const handlePublishHRZ = () => {
    const data = hrz.zones.map((z) => ({
      id: z.id,
      vertices: z.vertices.map((v) => sceneToRos(v.x, v.z)),
    }));
    const json = JSON.stringify(data);
    if (isMock) {
      mockPublishHRZZones(json);
    } else {
      publishHRZZones(json);
    }
  };

  const handlePublishHRP = () => {
    if (hrp.path.length < 2) return;
    const rosPoints = hrp.path.map((p) => sceneToRos(p.x, p.z));
    if (isMock) {
      mockPublishHRPPath(rosPoints);
    } else {
      publishHRPPath(rosPoints);
    }
  };

  const handleCancelNav = () => {
    if (isMock) {
      mockCancelNav();
    } else {
      useNavTargetStore.getState().clearNav();
    }
  };

  const canPublish = isConnected;

  return (
    <div className="space-y-3">
      {mode === 'navigate' && (
        <>
          {isMock ? (
            <>
              <div className="text-xs text-gray-400">
                Left-click on the map to set a target point. Robot will auto-plan an obstacle-free path via A*.
              </div>
              {navigating && navTarget && (
                <>
                  <div className="text-xs text-blue-400">
                    Navigating to ({navTarget.x.toFixed(1)}, {navTarget.z.toFixed(1)})...
                  </div>
                  <button
                    onClick={handleCancelNav}
                    className="w-full text-xs bg-red-600 hover:bg-red-700 text-white px-3 py-1.5 rounded"
                  >
                    Cancel Navigation
                  </button>
                </>
              )}
            </>
          ) : isConnected ? (
            <>
              <div className="text-xs text-gray-400">
                Left-click on the map to send a navigation goal. The robot will navigate via move_base.
              </div>
              {navTarget && (
                <>
                  <div className="text-xs text-blue-400">
                    Goal sent: ({navTarget.x.toFixed(1)}, {navTarget.z.toFixed(1)})
                  </div>
                  <button
                    onClick={handleCancelNav}
                    className="w-full text-xs bg-gray-600 hover:bg-gray-500 text-white px-3 py-1.5 rounded"
                  >
                    Clear Goal
                  </button>
                </>
              )}
            </>
          ) : (
            <div className="text-xs text-gray-400">
              Connect to ROS to enable navigation. Right-click to rotate, middle-click to pan, scroll to zoom.
            </div>
          )}
        </>
      )}
      {mode === 'mapedit' && isMock && (
        <>
          <div className="text-xs text-gray-400">Edit the map by drawing walls and obstacles.</div>
          <div className="space-y-1">
            {mapTools.map((t) => (
              <button
                key={t.key}
                onClick={() => useMapEditorStore.getState().setTool(t.key)}
                className={`w-full text-left text-xs px-2 py-1.5 rounded ${
                  editTool === t.key
                    ? 'bg-blue-600 text-white'
                    : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                }`}
              >
                <span className="font-medium">{t.label}</span>
                <span className="ml-1 text-gray-400">- {t.desc}</span>
              </button>
            ))}
          </div>
          {(editTool === 'wall' || editTool === 'erase') && (
            <div className="flex items-center gap-2">
              <span className="text-xs text-gray-400">Brush:</span>
              <input
                type="range"
                min={1}
                max={15}
                value={brushSize}
                onChange={(e) => useMapEditorStore.getState().setBrushSize(Number(e.target.value))}
                className="flex-1 h-1 accent-blue-500"
              />
              <span className="text-xs text-gray-300 w-4 text-right">{brushSize}</span>
            </div>
          )}
          <button
            onClick={mockResetMap}
            className="w-full text-xs bg-yellow-700 hover:bg-yellow-800 text-white px-3 py-1.5 rounded"
          >
            Reset Default Map
          </button>
          <button
            onClick={mockClearMap}
            className="w-full text-xs bg-red-700 hover:bg-red-800 text-white px-3 py-1.5 rounded"
          >
            Clear All Walls
          </button>
        </>
      )}
      {mode === 'hrz' && (
        <>
          <div className="text-xs text-gray-400">
            Left-click to add vertices. Click the first vertex (yellow) to close.
          </div>
          <button
            onClick={handlePublishHRZ}
            disabled={!canPublish || hrz.zones.length === 0}
            className="w-full text-xs bg-orange-600 hover:bg-orange-700 disabled:bg-gray-600 disabled:cursor-not-allowed text-white px-3 py-1.5 rounded"
          >
            {isMock ? 'Apply Zones to Map' : 'Publish HRZ Zones'} ({hrz.zones.length})
          </button>
          <button
            onClick={hrz.cancelDrawing}
            className="w-full text-xs bg-gray-700 hover:bg-gray-600 text-gray-300 px-3 py-1.5 rounded"
          >
            Cancel Drawing
          </button>
          <button
            onClick={hrz.clearAll}
            className="w-full text-xs bg-red-700 hover:bg-red-800 text-white px-3 py-1.5 rounded"
          >
            Clear All Zones
          </button>
          <div className="text-xs text-gray-500">
            Zones: {hrz.zones.length} | Drawing: {hrz.currentVertices.length} pts
          </div>
        </>
      )}
      {mode === 'hrp' && (
        <>
          <div className="text-xs text-gray-400">
            {isMock
              ? 'Draw a path by clicking & dragging. Robot will follow with obstacle avoidance.'
              : 'Draw a path by clicking & dragging, then publish to ROS.'}
          </div>
          <button
            onClick={handlePublishHRP}
            disabled={!canPublish || hrp.path.length < 2}
            className="w-full text-xs bg-green-600 hover:bg-green-700 disabled:bg-gray-600 disabled:cursor-not-allowed text-white px-3 py-1.5 rounded"
          >
            {isMock ? 'Follow Drawn Path' : 'Publish HRP Path'} ({hrp.path.length} pts)
          </button>
          <button
            onClick={hrp.clearPath}
            className="w-full text-xs bg-red-700 hover:bg-red-800 text-white px-3 py-1.5 rounded"
          >
            Clear Path
          </button>
          <div className="text-xs text-gray-500">
            Points: {hrp.path.length}
          </div>
        </>
      )}
    </div>
  );
}
