import { createContext, useCallback, useContext, useState, type ReactNode } from 'react';
import { CircleAlert, Check } from 'lucide-react';

type Kind = 'success' | 'error';
export interface ToastAction {
  label: string;
  run: () => void;
}
interface Toast {
  id: number;
  kind: Kind;
  text: string;
  action?: ToastAction;
}

type Show = (text: string, kind?: Kind, action?: ToastAction) => void;
const Ctx = createContext<Show>(() => {});

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const show = useCallback<Show>((text, kind = 'success', action) => {
    const id = Date.now() + Math.random();
    setToasts((t) => [...t, { id, kind, text, action }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), action ? 5500 : kind === 'error' ? 4500 : 2600);
  }, []);
  return (
    <Ctx.Provider value={show}>
      {children}
      <div className="pointer-events-none fixed inset-x-0 top-0 z-[100] flex flex-col items-center gap-2 px-4 pt-safe" role="status" aria-live="polite">
        {toasts.map((t) => (
          <div key={t.id} className="glass-strong toast-in pointer-events-auto mt-2 flex max-w-md items-center gap-2 rounded-2xl px-4 py-3 text-sm">
            {t.kind === 'error' ? <CircleAlert size={18} className="shrink-0 text-danger" /> : <Check size={18} className="shrink-0 text-primary" />}
            <span className="min-w-0 flex-1">{t.text}</span>
            {t.action && (
              <button
                className="shrink-0 rounded-full bg-[var(--primary-soft)] px-3 py-1 text-[13px] font-semibold text-primary"
                onClick={() => {
                  t.action!.run();
                  setToasts((x) => x.filter((y) => y.id !== t.id));
                }}
              >
                {t.action.label}
              </button>
            )}
          </div>
        ))}
      </div>
    </Ctx.Provider>
  );
}

export const useToast = () => useContext(Ctx);
