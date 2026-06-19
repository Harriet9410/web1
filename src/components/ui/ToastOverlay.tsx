import { useToastStore } from '../../stores/toastStore';

export function ToastOverlay() {
  const toasts = useToastStore((s) => s.toasts);

  if (toasts.length === 0) return null;

  const colorMap = {
    success: 'bg-green-600 border-green-400',
    warning: 'bg-yellow-600 border-yellow-400',
    error: 'bg-red-600 border-red-400',
    info: 'bg-blue-600 border-blue-400',
  };

  return (
    <div className="fixed top-4 right-4 z-50 flex flex-col gap-2 pointer-events-none">
      {toasts.map((t) => (
        <div
          key={t.id}
          className={`px-4 py-2 rounded text-white text-sm border ${colorMap[t.type]} shadow-lg animate-fade-in`}
        >
          {t.message}
        </div>
      ))}
    </div>
  );
}
