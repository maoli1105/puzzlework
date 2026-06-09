/**
 * useNarrativeProjection — React hook
 *
 * 特定 Piece の「なぜこうなったか」を /pieces/:id/narrative から取得する。
 *
 * 呼び出し側は pieceId が変わるたびに自動で再取得される。
 * null を渡すと何もしない（パネルが閉じているとき）。
 */

import { useEffect, useRef, useState } from 'react';
import api from '../../services/api';
import type { NarrativeProjection, NarrativeEvent, NarrativeSummary, NarrativeResidueItem } from './types';

export type { NarrativeProjection } from './types';

const EMPTY_SUMMARY: NarrativeSummary = {
  headline:   '',
  openIssues: [],
  patterns:   [],
  momentum:   'idle',
};

export function useNarrativeProjection(pieceId: string | null): NarrativeProjection {
  const [state, setState] = useState<Omit<NarrativeProjection, 'pieceId'>>({
    events:  [],
    summary: EMPTY_SUMMARY,
    residue: [],
    loading: false,
    error:   null,
  });
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    if (!pieceId) {
      setState({ events: [], summary: EMPTY_SUMMARY, residue: [], loading: false, error: null });
      return;
    }

    abortRef.current?.abort();
    const ctrl = new AbortController();
    abortRef.current = ctrl;

    setState(prev => ({ ...prev, loading: true, error: null }));

    (api as unknown as {
      get: (url: string, opts?: { signal?: AbortSignal }) => Promise<{
        data: { events: NarrativeEvent[]; summary: NarrativeSummary; residue?: NarrativeResidueItem[] }
      }>
    })
      .get(`/pieces/${pieceId}/narrative`, { signal: ctrl.signal })
      .then(r => {
        setState({
          events:  r.data.events,
          summary: r.data.summary,
          residue: r.data.residue ?? [],
          loading: false,
          error:   null,
        });
      })
      .catch((err: Error) => {
        if (err.name === 'CanceledError' || err.name === 'AbortError') return;
        setState(prev => ({ ...prev, loading: false, error: err.message ?? 'fetch error' }));
      });

    return () => ctrl.abort();
  }, [pieceId]);

  return { pieceId: pieceId ?? '', ...state };
}
