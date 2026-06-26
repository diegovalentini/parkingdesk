import { createContext, useCallback, useContext, useState } from 'react';

const ToastContext = createContext({ showToast: () => {} });

export function ToastProvider({ children }) {
  const [message, setMessage] = useState('');

  const showToast = useCallback((text) => {
    setMessage(text);
    window.clearTimeout(window.__eaToastTimer);
    window.__eaToastTimer = window.setTimeout(() => setMessage(''), 3200);
  }, []);

  return (
    <ToastContext.Provider value={{ showToast }}>
      {children}
      {message ? <div className="toast">{message}</div> : null}
    </ToastContext.Provider>
  );
}

export function useToast() {
  return useContext(ToastContext);
}
