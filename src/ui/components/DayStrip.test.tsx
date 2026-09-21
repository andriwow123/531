import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, within, fireEvent } from '@testing-library/react';
import DayStrip from './DayStrip';

/** Matches the component's own HOLD_MS — how long a chip must be held before
 *  the gesture is promoted from a tap to a drag. */
const HOLD_MS = 400;

/** Stubs each button's getBoundingClientRect to lay them out left-to-right,
 *  100px apart — jsdom does no real layout, so pointer-drag target detection
 *  (which reads rects) needs deterministic stand-in geometry to be testable. */
function stubChipLayout(buttons: HTMLElement[]) {
  buttons.forEach((btn, i) => {
    vi.spyOn(btn, 'getBoundingClientRect').mockReturnValue({
      left: i * 100,
      right: i * 100 + 100,
      width: 100,
      top: 0,
      bottom: 40,
      height: 40,
      x: i * 100,
      y: 0,
      toJSON() {
        return {};
      },
    } as DOMRect);
  });
}

const LIFTS = [
  { key: 'press' as const, label: 'Press' },
  { key: 'bench' as const, label: 'Bench' },
  { key: 'squat' as const, label: 'Squat' },
  { key: 'deadlift' as const, label: 'Deadlift' },
];

describe('DayStrip', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('renders 4 labelled day buttons', () => {
    render(<DayStrip lifts={LIFTS} activeDay={0} doneKeys={new Set()} onSelect={() => {}} />);

    for (const label of ['Press', 'Bench', 'Squat', 'Deadlift']) {
      expect(screen.getByRole('button', { name: new RegExp(label) })).toBeTruthy();
    }
  });

  it('marks the activeDay button with aria-current, not the others', () => {
    render(<DayStrip lifts={LIFTS} activeDay={2} doneKeys={new Set()} onSelect={() => {}} />);

    const squatButton = screen.getByRole('button', { name: /Squat/ });
    expect(squatButton.getAttribute('aria-current')).toBe('true');

    for (const label of ['Press', 'Bench', 'Deadlift']) {
      const button = screen.getByRole('button', { name: new RegExp(label) });
      expect(button.getAttribute('aria-current')).toBeNull();
    }
  });

  it('calls onSelect with the clicked day index', () => {
    const onSelect = vi.fn();
    render(<DayStrip lifts={LIFTS} activeDay={0} doneKeys={new Set()} onSelect={onSelect} />);

    screen.getByRole('button', { name: /Deadlift/ }).click();

    expect(onSelect).toHaveBeenCalledWith(3);
  });

  it('shows a done marker only on buttons in doneKeys', () => {
    render(
      <DayStrip
        lifts={LIFTS}
        activeDay={0}
        doneKeys={new Set(['bench'])}
        onSelect={() => {}}
      />,
    );

    const benchButton = screen.getByRole('button', { name: /Bench/ });
    expect(within(benchButton).getByLabelText('done')).toBeTruthy();

    const pressButton = screen.getByRole('button', { name: /Press/ });
    expect(within(pressButton).queryByLabelText('done')).toBeNull();
  });

  it('sets touch-action: none and select-none (className + inline style) on each chip so a drag neither scrolls nor highlights text', () => {
    render(<DayStrip lifts={LIFTS} activeDay={0} doneKeys={new Set()} onSelect={() => {}} />);

    for (const label of ['Press', 'Bench', 'Squat', 'Deadlift']) {
      const button = screen.getByRole('button', { name: new RegExp(label) });
      expect(button.style.touchAction).toBe('none');
      expect(button.style.userSelect).toBe('none');
      expect(button.className).toContain('select-none');
    }
  });

  it('a tap (pointerdown then pointerup with no movement and no hold) calls onSelect with its index, not onReorder', () => {
    const onSelect = vi.fn();
    const onReorder = vi.fn();
    render(
      <DayStrip
        lifts={LIFTS}
        activeDay={0}
        doneKeys={new Set()}
        onSelect={onSelect}
        onReorder={onReorder}
      />,
    );

    const squatButton = screen.getByRole('button', { name: /Squat/ });
    fireEvent.pointerDown(squatButton, { pointerId: 1, clientX: 10 });
    // Released well before HOLD_MS elapses -> a plain tap.
    fireEvent.pointerUp(squatButton, { pointerId: 1, clientX: 10 });

    expect(onSelect).toHaveBeenCalledWith(2);
    expect(onReorder).not.toHaveBeenCalled();
  });

  it('a move beyond tolerance BEFORE the hold fires cancels the gesture: pointerup calls neither onSelect nor onReorder', () => {
    const onSelect = vi.fn();
    const onReorder = vi.fn();
    render(
      <DayStrip
        lifts={LIFTS}
        activeDay={0}
        doneKeys={new Set()}
        onSelect={onSelect}
        onReorder={onReorder}
      />,
    );

    const pressButton = screen.getByRole('button', { name: /Press/ });
    fireEvent.pointerDown(pressButton, { pointerId: 1, clientX: 10 });
    // Moved 15px (> the 8px tolerance) before HOLD_MS elapses -> a
    // swipe/scroll, not a hold. This must not become a drag or a tap.
    fireEvent.pointerMove(pressButton, { pointerId: 1, clientX: 25 });
    fireEvent.pointerUp(pressButton, { pointerId: 1, clientX: 25 });

    expect(onSelect).not.toHaveBeenCalled();
    expect(onReorder).not.toHaveBeenCalled();
  });

  it('holding past HOLD_MS then moving past another chip and releasing calls onReorder with the final drop index, not onSelect', () => {
    const onSelect = vi.fn();
    const onReorder = vi.fn();
    render(
      <DayStrip
        lifts={LIFTS}
        activeDay={0}
        doneKeys={new Set()}
        onSelect={onSelect}
        onReorder={onReorder}
      />,
    );

    const buttons = screen.getAllByRole('button');
    stubChipLayout(buttons);

    const pressButton = buttons[0];
    fireEvent.pointerDown(pressButton, { pointerId: 1, clientX: 10 });
    vi.advanceTimersByTime(HOLD_MS); // hold fires -> drag mode
    // Raw target: clientX 220 falls left of chip 2's midpoint (250) -> rawTarget 2.
    // finalDropIndex(0, 2) === 1 (post-removal index), same adjustment as OrderableList.
    fireEvent.pointerMove(pressButton, { pointerId: 1, clientX: 220 });
    fireEvent.pointerUp(pressButton, { pointerId: 1, clientX: 220 });

    expect(onReorder).toHaveBeenCalledWith(0, 1);
    expect(onSelect).not.toHaveBeenCalled();
  });

  it('a hold-drag that ends back at its start index calls neither onReorder nor onSelect', () => {
    const onSelect = vi.fn();
    const onReorder = vi.fn();
    render(
      <DayStrip
        lifts={LIFTS}
        activeDay={0}
        doneKeys={new Set()}
        onSelect={onSelect}
        onReorder={onReorder}
      />,
    );

    const buttons = screen.getAllByRole('button');
    stubChipLayout(buttons);

    const pressButton = buttons[0];
    fireEvent.pointerDown(pressButton, { pointerId: 1, clientX: 10 });
    vi.advanceTimersByTime(HOLD_MS); // hold fires -> drag mode
    // clientX 20 is still inside chip 0's own zone (0-100, midpoint 50) ->
    // rawTarget 0 -> same as startIndex.
    fireEvent.pointerMove(pressButton, { pointerId: 1, clientX: 20 });
    fireEvent.pointerUp(pressButton, { pointerId: 1, clientX: 20 });

    expect(onReorder).not.toHaveBeenCalled();
    expect(onSelect).not.toHaveBeenCalled();
  });

  it('dragging the second-to-last chip past every midpoint (past the end) reorders it to the LAST slot, not a no-op', () => {
    // Regression test for the shared off-by-one: `targetIndexFromX` used to
    // cap its past-all-midpoints fallback at `rects.length - 1`, so the raw
    // target for "past the end" was indistinguishable from "drop before the
    // last chip". For a drag that starts one-before-last (index 2 of 4),
    // `finalDropIndex(2, 3) === 2 === startIndex`, so `onReorder` was never
    // called — dragging squat to the very end silently did nothing.
    const onSelect = vi.fn();
    const onReorder = vi.fn();
    render(
      <DayStrip
        lifts={LIFTS}
        activeDay={0}
        doneKeys={new Set()}
        onSelect={onSelect}
        onReorder={onReorder}
      />,
    );

    const buttons = screen.getAllByRole('button');
    stubChipLayout(buttons);

    const squatButton = buttons[2];
    fireEvent.pointerDown(squatButton, { pointerId: 1, clientX: 210 });
    vi.advanceTimersByTime(HOLD_MS); // hold fires -> drag mode
    // clientX 1000 is past chip 3's midpoint (350) — past every chip.
    fireEvent.pointerMove(squatButton, { pointerId: 1, clientX: 1000 });
    fireEvent.pointerUp(squatButton, { pointerId: 1, clientX: 1000 });

    // Raw target must be rects.length (4), so finalDropIndex(2, 4) === 3 —
    // squat lands last, after deadlift.
    expect(onReorder).toHaveBeenCalledWith(2, 3);
    expect(onSelect).not.toHaveBeenCalled();
  });

  it('onPointerCancel after a hold fires does not call onSelect or onReorder (an interrupted gesture commits nothing)', () => {
    const onSelect = vi.fn();
    const onReorder = vi.fn();
    render(
      <DayStrip
        lifts={LIFTS}
        activeDay={0}
        doneKeys={new Set()}
        onSelect={onSelect}
        onReorder={onReorder}
      />,
    );

    const buttons = screen.getAllByRole('button');
    stubChipLayout(buttons);

    const pressButton = buttons[0];
    fireEvent.pointerDown(pressButton, { pointerId: 1, clientX: 10 });
    vi.advanceTimersByTime(HOLD_MS); // hold fires -> drag mode
    fireEvent.pointerMove(pressButton, { pointerId: 1, clientX: 220 });
    fireEvent.pointerCancel(pressButton, { pointerId: 1, clientX: 220 });

    expect(onSelect).not.toHaveBeenCalled();
    expect(onReorder).not.toHaveBeenCalled();
  });

  it('onPointerCancel before the hold fires also commits nothing', () => {
    const onSelect = vi.fn();
    const onReorder = vi.fn();
    render(
      <DayStrip
        lifts={LIFTS}
        activeDay={0}
        doneKeys={new Set()}
        onSelect={onSelect}
        onReorder={onReorder}
      />,
    );

    const squatButton = screen.getByRole('button', { name: /Squat/ });
    fireEvent.pointerDown(squatButton, { pointerId: 1, clientX: 10 });
    fireEvent.pointerCancel(squatButton, { pointerId: 1, clientX: 10 });

    expect(onSelect).not.toHaveBeenCalled();
    expect(onReorder).not.toHaveBeenCalled();
  });

  it('a plain click (no pointer events, e.g. keyboard activation) still calls onSelect once', () => {
    const onSelect = vi.fn();
    const onReorder = vi.fn();
    render(
      <DayStrip
        lifts={LIFTS}
        activeDay={0}
        doneKeys={new Set()}
        onSelect={onSelect}
        onReorder={onReorder}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: /Bench/ }));

    expect(onSelect).toHaveBeenCalledTimes(1);
    expect(onSelect).toHaveBeenCalledWith(1);
  });
});
