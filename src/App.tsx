import { useState, useEffect, useRef } from 'react';
import { Sidebar } from './components/layout/Sidebar';
import { StatusBar } from './components/layout/StatusBar';
import { Scene3D } from './components/scene/Scene3D';
import { ToastOverlay } from './components/ui/ToastOverlay';
import type { AppMode } from './components/ui/ModeSelector';
import { useHRZStore } from './stores/hrzStore';
import { useHRPStore } from './stores/hrpStore';
import { useRosStore } from './stores/rosStore';
import { useUndoStore } from './stores/undoStore';
import { useTeleopStore } from './stores/teleopStore';
import { save, load } from './utils/persistence';

function App() {
  const [mode, setMode] = useState<AppMode>('navigate');
  const hrzZones = useHRZStore((s) => s.zones);
  const hrpPath = useHRPStore((s) => s.path);
  const loadZones = useHRZStore((s) => s.loadZones);
  const loadPath = useHRPStore((s) => s.loadPath);
  const isMock = useRosStore((s) => s.isMock);

  useEffect(() => {
    const data = load();
    if (data) {
      if (data.hrzZones) loadZones(data.hrzZones);
      if (data.hrpPath) loadPath(data.hrpPath);
    }
  }, []);

  useEffect(() => {
    save(hrzZones, hrpPath);
  }, [hrzZones, hrpPath]);

  useEffect(() => {
    if (!isMock && mode === 'mapedit') {
      setMode('navigate');
    }
  }, [isMock, mode]);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'z') {
        e.preventDefault();
        useUndoStore.getState().undo();
      }
      if ((e.ctrlKey || e.metaKey) && e.key === 'y') {
        e.preventDefault();
        useUndoStore.getState().redo();
      }
      useTeleopStore.getState().keyDown(e.key);
    };
    const onKeyUp = (e: KeyboardEvent) => {
      useTeleopStore.getState().keyUp(e.key);
    };
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
    };
  }, []);

  const teleopTickRef = useRef<ReturnType<typeof setInterval> | null>(null);
  useEffect(() => {
    teleopTickRef.current = setInterval(() => {
      useTeleopStore.getState().tick();
    }, 50);
    return () => {
      if (teleopTickRef.current) clearInterval(teleopTickRef.current);
    };
  }, []);

  const [followRobot, setFollowRobot] = useState(false);
  const teleopEnabled = useTeleopStore((s) => s.teleopEnabled);

  return (
    <div className="flex h-screen w-screen bg-gray-900 text-white">
      <Sidebar mode={mode} onModeChange={setMode} />
      <div className="flex-1 flex flex-col">
        <div className="flex-1">
          <Scene3D mode={mode} followRobot={followRobot} />
        </div>
        <StatusBar teleopEnabled={teleopEnabled} followRobot={followRobot} onToggleFollow={() => setFollowRobot((f) => !f)} />
      </div>
      <ToastOverlay />
    </div>
  );
}

export default App;
