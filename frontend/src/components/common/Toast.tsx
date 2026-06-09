import { useState, useCallback } from 'react';

export interface ToastMessage {
  id: string;
  text: string;
  type?: 'info' | 'success' | 'error';
}

export function useToast() {
  const [messages, setMessages] = useState<ToastMessage[]>([]);

  const push = useCallback((text: string, type: ToastMessage['type'] = 'info') => {
    const id = Math.random().toString(36).slice(2);
    setMessages(prev => [...prev, { id, text, type }]);
    setTimeout(() => setMessages(prev => prev.filter(m => m.id !== id)), 4000);
  }, []);

  const dismiss = useCallback((id: string) => {
    setMessages(prev => prev.filter(m => m.id !== id));
  }, []);

  return { messages, push, dismiss };
}

export function ToastContainer({
  messages,
  onDismiss,
}: {
  messages: ToastMessage[];
  onDismiss: (id: string) => void;
}) {
  if (messages.length === 0) return null;
  return (
    <div style={{
      position: 'fixed', bottom: 24, right: 24,
      display: 'flex', flexDirection: 'column', gap: 8,
      zIndex: 9999, pointerEvents: 'none',
    }}>
      {messages.map(m => (
        <div
          key={m.id}
          onClick={() => onDismiss(m.id)}
          style={{
            padding: '10px 16px',
            background: m.type === 'error' ? '#EF4444' : m.type === 'success' ? '#10B981' : '#1E293B',
            color: '#fff',
            borderRadius: 8,
            fontSize: 13,
            fontWeight: 500,
            boxShadow: '0 4px 12px rgba(0,0,0,0.25)',
            pointerEvents: 'auto',
            cursor: 'pointer',
            maxWidth: 320,
          }}
        >
          {m.text}
        </div>
      ))}
    </div>
  );
}
