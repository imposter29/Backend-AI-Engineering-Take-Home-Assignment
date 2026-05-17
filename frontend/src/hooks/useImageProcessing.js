/**
 * useImageProcessing
 *
 * State machine for the upload-and-poll flow:
 *
 *   idle
 *    │  upload(file)
 *    ▼
 *   uploading ──(error)──▶ error
 *    │
 *    │  POST /upload -> imageId
 *    ▼
 *   pending ──┐
 *             │ poll /status/:id every POLL_INTERVAL_MS
 *   processing┤
 *             │ status === 'completed' -> fetch /results/:id
 *             ▼
 *           completed   |   failed
 *
 * The hook owns:
 *   - upload progress (0-100)
 *   - current status string (pending|processing|completed|failed)
 *   - the full analysis payload once available
 *   - any normalised error encountered
 *
 * It exposes `upload(file)` and `reset()`. Polling stops automatically
 * once a terminal state is reached, and on unmount.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import * as api from '../services/api.js';

const POLL_INTERVAL_MS = 1500;
const TERMINAL = new Set(['completed', 'failed']);

const initialState = {
  phase: 'idle', // 'idle' | 'uploading' | 'polling' | 'done' | 'error'
  uploadProgress: 0,
  imageId: null,
  status: null, // backend job status
  statusMeta: null, // last full /status payload
  results: null, // full /results payload once available
  error: null,
};

export const useImageProcessing = () => {
  const [state, setState] = useState(initialState);
  const pollTimer = useRef(null);
  const cancelled = useRef(false);

  const clearPoll = () => {
    if (pollTimer.current) {
      clearTimeout(pollTimer.current);
      pollTimer.current = null;
    }
  };

  const reset = useCallback(() => {
    clearPoll();
    cancelled.current = false;
    setState(initialState);
  }, []);

  // Stop any pending poll if the component unmounts mid-flight.
  useEffect(() => {
    return () => {
      cancelled.current = true;
      clearPoll();
    };
  }, []);

  const fetchResults = useCallback(async (imageId) => {
    try {
      const results = await api.getResults(imageId);
      if (cancelled.current) return;
      setState((s) => ({ ...s, phase: 'done', results }));
    } catch (err) {
      if (cancelled.current) return;
      setState((s) => ({ ...s, phase: 'error', error: err }));
    }
  }, []);

  const pollOnce = useCallback(
    async (imageId) => {
      try {
        const statusDoc = await api.getStatus(imageId);
        if (cancelled.current) return;

        setState((s) => ({
          ...s,
          status: statusDoc.status,
          statusMeta: statusDoc,
        }));

        if (TERMINAL.has(statusDoc.status)) {
          clearPoll();
          await fetchResults(imageId);
          return;
        }
        // Not terminal — schedule the next tick.
        pollTimer.current = setTimeout(() => pollOnce(imageId), POLL_INTERVAL_MS);
      } catch (err) {
        if (cancelled.current) return;
        clearPoll();
        setState((s) => ({ ...s, phase: 'error', error: err }));
      }
    },
    [fetchResults],
  );

  const upload = useCallback(
    async (file) => {
      if (!file) return;
      cancelled.current = false;
      clearPoll();

      setState({ ...initialState, phase: 'uploading' });

      try {
        const { imageId, status } = await api.uploadImage(file, (percent) => {
          setState((s) => ({ ...s, uploadProgress: percent }));
        });
        if (cancelled.current) return;
        setState((s) => ({
          ...s,
          phase: 'polling',
          imageId,
          status,
        }));
        pollOnce(imageId);
      } catch (err) {
        if (cancelled.current) return;
        setState((s) => ({ ...s, phase: 'error', error: err }));
      }
    },
    [pollOnce],
  );

  return { ...state, upload, reset };
};

export default useImageProcessing;
