import { useState, useEffect, useCallback } from 'react';
import { pieces as pieceApi } from '../services/api';
import { Piece, Connection, BottleneckReport } from '../types';

interface UsePiecesResult {
  pieces: Piece[];
  connections: Connection[];
  bottlenecks: BottleneckReport;
  refresh: () => Promise<void>;
}

const EMPTY_BOTTLENECKS: BottleneckReport = {
  stale_pieces: [],
  overloaded_users: [],
  blocked_chains: [],
};

export function usePieces(): UsePiecesResult {
  const [data, setData] = useState<UsePiecesResult>({
    pieces: [],
    connections: [],
    bottlenecks: EMPTY_BOTTLENECKS,
    refresh: async () => {},
  });

  const load = useCallback(async () => {
    try {
      const [ps, conns, bn] = await Promise.all([
        pieceApi.list(),
        pieceApi.getConnections(),
        pieceApi.getBottlenecks().catch(() => EMPTY_BOTTLENECKS),
      ]);
      // バックエンドが [] を返す場合もあるため、stale_pieces / overloaded_users を個別に保証
      const raw = bn as any;
      const safeBn: BottleneckReport = {
        stale_pieces:     Array.isArray(raw?.stale_pieces)     ? raw.stale_pieces     : [],
        overloaded_users: Array.isArray(raw?.overloaded_users) ? raw.overloaded_users : [],
        blocked_chains:   Array.isArray(raw?.blocked_chains)   ? raw.blocked_chains   : [],
      };
      setData(prev => ({
        ...prev,
        pieces: Array.isArray(ps) ? ps as Piece[] : [],
        connections: Array.isArray(conns) ? conns as Connection[] : [],
        bottlenecks: safeBn,
      }));
    } catch (e) {
      console.error('[usePieces] load error', e);
    }
  }, []);

  useEffect(() => {
    setData(prev => ({ ...prev, refresh: load }));
    load();
  }, [load]);

  return data;
}
