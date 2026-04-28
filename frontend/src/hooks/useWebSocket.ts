import { useEffect, useRef, useCallback } from 'react';
import { WSEvent } from '../types';

interface UseWebSocketReturn {
  send: (data: Record<string, unknown>) => void;
}

export function useWebSocket(onEvent: (event: WSEvent) => void): UseWebSocketReturn {
  const ws = useRef<WebSocket | null>(null);
  const onEventRef = useRef(onEvent);
  onEventRef.current = onEvent;

  const connect = useCallback(() => {
    const token = localStorage.getItem('token');
    if (!token) return;

    const wsUrl = `${window.location.protocol === 'https:' ? 'wss' : 'ws'}://${window.location.host}/ws?token=${token}`;
    ws.current = new WebSocket(wsUrl);

    ws.current.onmessage = (e) => {
      try {
        const event: WSEvent = JSON.parse(e.data);
        onEventRef.current(event);
      } catch { /* ignore malformed messages */ }
    };

    ws.current.onclose = () => {
      // 再接続（3秒後）
      setTimeout(connect, 3000);
    };
  }, []);

  useEffect(() => {
    connect();
    return () => ws.current?.close();
  }, [connect]);

  // サーバーへメッセージ送信（カーソル座標など）
  const send = useCallback((data: Record<string, unknown>) => {
    if (ws.current?.readyState === WebSocket.OPEN) {
      ws.current.send(JSON.stringify(data));
    }
  }, []);

  return { send };
}
