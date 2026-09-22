/**
 * Small rotating disclosure chevron for full-bar toggle buttons (ExerciseDemo,
 * SupportingLifts, LiftCard's note control). Purely decorative — `aria-hidden`
 * — the button it sits in carries the accessible name; `open` rotates it to
 * point up instead of down.
 */
export default function Chevron({ open }: { open: boolean }) {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className={`flex-none shrink-0 text-[var(--muted)] transition-transform ${open ? 'rotate-180' : ''}`}
    >
      <path d="m6 9 6 6 6-6" />
    </svg>
  );
}
