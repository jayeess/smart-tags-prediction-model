import { createContext, useContext, useState, useCallback, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { CheckCircle2, AlertTriangle, Info, X } from "lucide-react";

/* ── Types ──────────────────────────────────────────────── */

type ToastType = "success" | "error" | "info";

interface Toast {
  id: number;
  message: string;
  type: ToastType;
}

interface ToastContextValue {
  toast: (message: string, type?: ToastType) => void;
}

const ToastContext = createContext<ToastContextValue>({
  toast: () => {},
});

export const useToast = () => useContext(ToastContext);

/* ── Provider ───────────────────────────────────────────── */

export default function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const counterRef = useRef(0);

  const removeToast = useCallback((id: number) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const toast = useCallback(
    (message: string, type: ToastType = "success") => {
      const id = ++counterRef.current;
      setToasts((prev) => [...prev, { id, message, type }]);
      setTimeout(() => removeToast(id), 4000);
    },
    [removeToast]
  );

  return (
    <ToastContext.Provider value={{ toast }}>
      {children}

      {/* Toast Container */}
      <div className="fixed bottom-20 md:bottom-6 right-4 z-[100] flex flex-col gap-2 pointer-events-none">
        <AnimatePresence>
          {toasts.map((t) => (
            <motion.div
              key={t.id}
              initial={{ opacity: 0, x: 80, scale: 0.9 }}
              animate={{ opacity: 1, x: 0, scale: 1 }}
              exit={{ opacity: 0, x: 80, scale: 0.9 }}
              className={`
                pointer-events-auto flex items-center gap-2.5 px-4 py-3 rounded-xl
                backdrop-blur-xl border shadow-2xl min-w-[260px] max-w-[360px]
                ${
                  t.type === "success"
                    ? "bg-emerald-500/10 border-emerald-500/20 text-emerald-400"
                    : t.type === "error"
                    ? "bg-red-500/10 border-red-500/20 text-red-400"
                    : "bg-indigo-500/10 border-indigo-500/20 text-indigo-400"
                }
              `}
            >
              {t.type === "success" ? (
                <CheckCircle2 className="w-4 h-4 shrink-0" />
              ) : t.type === "error" ? (
                <AlertTriangle className="w-4 h-4 shrink-0" />
              ) : (
                <Info className="w-4 h-4 shrink-0" />
              )}
              <span className="text-xs font-medium flex-1">{t.message}</span>
              <button
                onClick={() => removeToast(t.id)}
                className="shrink-0 opacity-50 hover:opacity-100 transition-opacity"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </ToastContext.Provider>
  );
}
