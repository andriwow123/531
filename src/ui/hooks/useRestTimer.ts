import { useEffect, useReducer } from 'react';
import { timerReducer, initialTimer } from '../../settings/timer';

export interface RestTimerControls {
  secondsLeft: number;
  running: boolean;
  start: () => void;
  pause: () => void;
  reset: () => void;
}

/**
 * Wraps `timerReducer` in a running countdown: while `running`, a 1s
 * interval dispatches `tick` (which the reducer itself stops at zero). The
 * interval is cleared whenever `running` goes false — on pause, on reaching
 * zero, and on unmount.
 */
export function useRestTimer(defaultSeconds: number): RestTimerControls {
  const [state, dispatch] = useReducer(timerReducer, defaultSeconds, initialTimer);

  useEffect(() => {
    if (!state.running) return;
    const id = setInterval(() => dispatch({ type: 'tick' }), 1000);
    return () => clearInterval(id);
  }, [state.running]);

  // Keeps the idle countdown in sync with `defaultSeconds` (e.g. once
  // settings finish loading asynchronously after this hook's first render)
  // without interrupting a timer that's actively counting down.
  useEffect(() => {
    if (!state.running) dispatch({ type: 'reset', seconds: defaultSeconds });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [defaultSeconds]);

  return {
    secondsLeft: state.secondsLeft,
    running: state.running,
    start: () => dispatch({ type: 'start', seconds: defaultSeconds }),
    pause: () => dispatch({ type: 'pause' }),
    reset: () => dispatch({ type: 'reset', seconds: defaultSeconds }),
  };
}
