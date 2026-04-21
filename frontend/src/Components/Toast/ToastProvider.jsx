import { createContext, useCallback, useContext, useState } from "react";
import { createPortal } from "react-dom";
import s from "./Toast.module.css";

const ToastContext = createContext(null);

let _id = 0;
const nextId = () => ++_id;

const ICONS = {
  success: "✓",
  error:   "✕",
  warning: "⚠",
  info:    "ℹ",
};

const AUTO_DISMISS_MS = 4000;

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);

  const dismiss = useCallback((id) => {
    setToasts((prev) =>
      prev.map((t) => (t.id === id ? { ...t, leaving: true } : t))
    );
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 300);
  }, []);

  const push = useCallback(
    (type, message) => {
      const id = nextId();
      setToasts((prev) => [...prev, { id, type, message, leaving: false }]);
      setTimeout(() => dismiss(id), AUTO_DISMISS_MS);
    },
    [dismiss]
  );

  const toast = {
    success: (msg) => push("success", msg),
    error:   (msg) => push("error",   msg),
    warning: (msg) => push("warning", msg),
    info:    (msg) => push("info",    msg),
  };

  return (
    <ToastContext.Provider value={toast}>
      {children}
      {createPortal(
        <div className={s.container}>
          {toasts.map((t) => (
            <div
              key={t.id}
              className={`${s.toast} ${s[t.type]} ${t.leaving ? s.leaving : ""}`}
            >
              <span className={s.icon}>{ICONS[t.type]}</span>
              <span className={s.msg}>{t.message}</span>
              <button
                type="button"
                className={s.close}
                onClick={() => dismiss(t.id)}
              >
                ✕
              </button>
            </div>
          ))}
        </div>,
        document.body
      )}
    </ToastContext.Provider>
  );
}

export const useToast = () => {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast must be used inside <ToastProvider>");
  return ctx;
};
