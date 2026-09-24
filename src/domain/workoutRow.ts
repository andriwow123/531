import type { SetKind, TemplateKey } from './types';

/** Stable identity for an in-progress set row. Warm-up and main sets are the
 *  same under every template; supplemental sets are template-specific, so BBB
 *  and FSL back-off progress never bleed into each other. */
export function workoutRowKey(kind: SetKind, kindIndex: number, template: TemplateKey): string {
  return kind === 'supplemental' ? `${template}:supplemental:${kindIndex}` : `${kind}:${kindIndex}`;
}
