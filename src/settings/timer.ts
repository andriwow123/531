export interface TimerState {
  secondsLeft: number;
  running: boolean;
}

export type TimerAction =
  | { type: 'start'; seconds: number }
  | { type: 'tick' }
  | { type: 'pause' }
  | { type: 'reset'; seconds: number };

export function timerReducer(state: TimerState, action: TimerAction): TimerState {
  switch (action.type) {
    case 'start':
      return { secondsLeft: action.seconds, running: true };
    case 'tick':
      if (!state.running) return state;
      if (state.secondsLeft <= 0) return { secondsLeft: 0, running: false };
      if (state.secondsLeft === 1) return { secondsLeft: 0, running: false };
      return { secondsLeft: state.secondsLeft - 1, running: true };
    case 'pause':
      return { ...state, running: false };
    case 'reset':
      return { secondsLeft: action.seconds, running: false };
    default:
      return state;
  }
}

export const initialTimer = (seconds: number): TimerState => ({ secondsLeft: seconds, running: false });
