import { useEffect, useMemo, useState } from 'react';
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import type { DotItemDotProps, TooltipContentProps } from 'recharts';
import type { OneRmPoint, TmPoint, Unit } from '../../domain';

export interface ProgressChartProps {
  oneRm: OneRmPoint[];
  tm: TmPoint[];
  unit: Unit;
}

type Metric = 'oneRm' | 'tm';

const METRIC_ORDER: readonly Metric[] = ['oneRm', 'tm'];
const METRIC_LABEL: Record<Metric, string> = { oneRm: 'Est. 1RM', tm: 'Training Max' };

interface ChartPoint {
  x: string;
  label: string;
  est1RM?: number;
  tm?: number;
  isLatestOneRm?: boolean;
  isLatestTm?: boolean;
}

interface ChartColors {
  accent: string;
  muted: string;
  line: string;
  surface: string;
}

// Fallback colors mirror the light-theme tokens (src/ui/theme/tokens.css) and are
// only used when getComputedStyle can't resolve a CSS custom property (e.g. the
// stylesheet hasn't loaded, or we're under jsdom in tests) — see ruling P2-R1.
const FALLBACK_COLORS: ChartColors = {
  accent: '#E8721C',
  muted: '#6B6459',
  line: '#E4DDD4',
  surface: '#FFFFFF',
};

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** Formats an ISO date ("2026-01-01") as "Jan 1" without going through `Date`
 *  (which would shift by a day in timezones behind UTC). */
function formatAxisDate(iso: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  if (!match) return iso;
  const monthIdx = Number(match[2]) - 1;
  const month = MONTHS[monthIdx] ?? match[2];
  return `${month} ${Number(match[3])}`;
}

function readToken(name: string, fallback: string): string {
  if (typeof window === 'undefined' || typeof getComputedStyle !== 'function') return fallback;
  const value = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return value || fallback;
}

/** Resolves theme tokens to concrete color strings once on mount. Recharts SVG
 *  attributes (stroke/fill/tick colors) don't reliably honor `var(--token)`, so
 *  we read the computed values from `document.documentElement` instead (P2-R1). */
function useThemeColors(): ChartColors {
  const [colors, setColors] = useState<ChartColors>(FALLBACK_COLORS);
  useEffect(() => {
    setColors({
      accent: readToken('--accent', FALLBACK_COLORS.accent),
      muted: readToken('--muted', FALLBACK_COLORS.muted),
      line: readToken('--line', FALLBACK_COLORS.line),
      surface: readToken('--surface', FALLBACK_COLORS.surface),
    });
  }, []);
  return colors;
}

function buildChartData(oneRm: OneRmPoint[], tm: TmPoint[]): ChartPoint[] {
  const rowsByDate = new Map<string, ChartPoint>();
  for (const p of oneRm) {
    const row = rowsByDate.get(p.date) ?? { x: p.date, label: formatAxisDate(p.date) };
    row.est1RM = p.est1RM;
    rowsByDate.set(p.date, row);
  }
  for (const p of tm) {
    const row = rowsByDate.get(p.startedAt) ?? { x: p.startedAt, label: formatAxisDate(p.startedAt) };
    row.tm = p.tm;
    rowsByDate.set(p.startedAt, row);
  }
  const rows = [...rowsByDate.values()].sort((a, b) => a.x.localeCompare(b.x));

  let lastOneRmIdx = -1;
  let lastTmIdx = -1;
  rows.forEach((row, i) => {
    if (row.est1RM != null) lastOneRmIdx = i;
    if (row.tm != null) lastTmIdx = i;
  });
  if (lastOneRmIdx >= 0) rows[lastOneRmIdx].isLatestOneRm = true;
  if (lastTmIdx >= 0) rows[lastTmIdx].isLatestTm = true;
  return rows;
}

/** Headline series: invisible everywhere except an emphasized marker on the
 *  latest defined point (>=8px, series color, 2px surface-color ring). */
function makeHeadlineDot(color: string, ring: string, latestKey: 'isLatestOneRm' | 'isLatestTm') {
  return function HeadlineDot(props: DotItemDotProps) {
    const { cx, cy, payload, index } = props;
    const row = payload as ChartPoint | undefined;
    if (cx == null || cy == null || !row?.[latestKey]) return <g key={`hd-${index}`} />;
    return <circle key={`hd-${index}`} cx={cx} cy={cy} r={5} fill={color} stroke={ring} strokeWidth={2} />;
  };
}

/** Reference series: small, muted dots at every defined point so a sparse
 *  series (e.g. one training-max per cycle) still reads as data, not just a
 *  faint line. Handles the "single point renders as a dot" case gracefully. */
function makeReferenceDot(color: string) {
  return function ReferenceDot(props: DotItemDotProps) {
    const { cx, cy, value, index } = props;
    if (cx == null || cy == null || value == null) return <g key={`rd-${index}`} />;
    return <circle key={`rd-${index}`} cx={cx} cy={cy} r={3} fill={color} fillOpacity={0.7} />;
  };
}

interface ChartTooltipProps extends TooltipContentProps {
  unit: Unit;
}

function ChartTooltip({ active, payload, label, unit }: ChartTooltipProps) {
  if (!active || !payload || payload.length === 0) return null;
  const rows = payload.filter((entry) => entry.value != null);
  if (rows.length === 0) return null;
  return (
    <div className="rounded-[var(--r-card)] border border-[var(--line)] bg-[var(--surface)] px-3 py-2 text-[12px] shadow-lg">
      <div className="mb-1 font-semibold text-[var(--muted)]">{label}</div>
      {rows.map((entry) => (
        <div key={String(entry.dataKey)} className="flex items-center gap-1.5">
          <span aria-hidden className="inline-block h-[2px] w-2.5" style={{ background: entry.color ?? 'currentColor' }} />
          <span className="text-[var(--muted)]">{entry.name}</span>
          <span className="ml-auto font-bold tabular-nums text-[var(--text)]">
            {String(entry.value)}
            {unit}
          </span>
        </div>
      ))}
    </div>
  );
}

/**
 * Per-lift progress line chart with a segmented toggle choosing the headline
 * metric (Estimated 1RM or Training Max). The headline series draws as the
 * prominent accent line with an emphasized latest point; the other metric
 * draws as a faint muted reference line so both stay visible on one shared
 * weight scale.
 */
export default function ProgressChart({ oneRm, tm, unit }: ProgressChartProps) {
  const [metric, setMetric] = useState<Metric>('oneRm');
  const colors = useThemeColors();
  const data = useMemo(() => buildChartData(oneRm, tm), [oneRm, tm]);
  const hasData = data.length > 0;

  const otherMetric: Metric = metric === 'oneRm' ? 'tm' : 'oneRm';
  const headlineKey: 'est1RM' | 'tm' = metric === 'oneRm' ? 'est1RM' : 'tm';
  const referenceKey: 'est1RM' | 'tm' = metric === 'oneRm' ? 'tm' : 'est1RM';
  const headlineLatestFlag: 'isLatestOneRm' | 'isLatestTm' = metric === 'oneRm' ? 'isLatestOneRm' : 'isLatestTm';

  return (
    <div>
      <div role="group" aria-label="Headline metric" className="inline-flex rounded-[var(--r-pill)] bg-[var(--surface-2)] p-1">
        {METRIC_ORDER.map((m) => (
          <button
            key={m}
            type="button"
            aria-pressed={metric === m}
            onClick={() => setMetric(m)}
            className={
              'rounded-[var(--r-pill)] px-3 py-1.5 text-[13px] font-bold transition-colors ' +
              (metric === m ? 'bg-[var(--accent)] text-[var(--on-accent)]' : 'text-[var(--muted)]')
            }
          >
            {METRIC_LABEL[m]}
          </button>
        ))}
      </div>

      <div className="mt-3 h-[220px] w-full">
        {hasData && (
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={data} margin={{ top: 8, right: 12, bottom: 0, left: 0 }}>
              <CartesianGrid stroke={colors.line} strokeDasharray="none" vertical={false} />
              <XAxis
                dataKey="label"
                tick={{ fill: colors.muted, fontSize: 11 }}
                tickLine={false}
                axisLine={{ stroke: colors.line }}
                minTickGap={24}
              />
              <YAxis
                tick={{ fill: colors.muted, fontSize: 11 }}
                tickLine={false}
                axisLine={false}
                width={44}
                domain={['auto', 'auto']}
                label={{ value: `Weight (${unit})`, angle: -90, position: 'insideLeft', style: { fill: colors.muted, fontSize: 11 } }}
              />
              <Tooltip
                content={(props) => <ChartTooltip {...props} unit={unit} />}
                cursor={{ stroke: colors.line, strokeWidth: 1 }}
              />
              <Line
                key="reference-line"
                dataKey={referenceKey}
                name={METRIC_LABEL[otherMetric]}
                stroke={colors.muted}
                strokeWidth={2}
                strokeOpacity={0.55}
                dot={makeReferenceDot(colors.muted)}
                activeDot={{ r: 4, fill: colors.muted, stroke: colors.surface, strokeWidth: 2 }}
                connectNulls
                isAnimationActive={false}
              />
              <Line
                key="headline-line"
                dataKey={headlineKey}
                name={METRIC_LABEL[metric]}
                stroke={colors.accent}
                strokeWidth={2}
                dot={makeHeadlineDot(colors.accent, colors.surface, headlineLatestFlag)}
                activeDot={{ r: 5, fill: colors.accent, stroke: colors.surface, strokeWidth: 2 }}
                connectNulls
                isAnimationActive={false}
              />
            </LineChart>
          </ResponsiveContainer>
        )}
      </div>
    </div>
  );
}
