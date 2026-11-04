import { createContext, useCallback, useContext, useState, type ReactNode } from 'react';
import { CircleAlert, Check } from 'lucide-react';

type Kind = 'success' | 'error';
interface Toast {
  id: number;
  kind: Kind;
  text: string;
}

const Ctx = createContext<(text: string, kind?: Kind) => void>(() => {});

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const show = useCallback((text: string, kind: Kind = 'success') => {
    const id = Date.now() + Math.random();
    setToasts((t) => [...t, { id, kind, text }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), kind === 'error' ? 4500 : 2600);
  }, []);
  return (
    <Ctx.Provider value={show}>
      {children}
      <div className="pointer-events-none fixed inset-x-0 top-0 z-[100] flex flex-col items-center gap-2 px-4 pt-safe">
        {toasts.map((t) => (
          <div key={t.id} className="glass-strong toast-in mt-2 flex max-w-md items-start gap-2 rounded-2xl px-4 py-3 text-sm">
            {t.kind === 'error' ? (
              <CircleAlert size={18} className="mt-0.5 shrink-0 text-danger" />
            ) : (
              <Check size={18} className="mt-0.5 shrink-0 text-primary" />
            )}
            <span>{t.text}</span>
          </div>
        ))}
      </div>
    </Ctx.Provider>
  );
}

export const useToast = () => useContext(Ctx);
