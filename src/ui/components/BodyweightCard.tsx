import { useEffect, useMemo, useState } from 'react';
import type { FormEvent } from 'react';
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
import { bodyweightSeries, latestWeight } from '../../domain';
import type { Unit } from '../../domain';
import { bodyweightRepo, profileRepo } from '../../data/repositories';
import type { BodyweightEntry } from '../../data/repositories';

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

/** Resolves theme tokens to concrete color strings, same approach as
 *  ProgressChart (P2-R1): Recharts SVG attributes don't reliably honor
 *  `var(--token)`, so we read computed values from `document.documentElement`. */
function resolveThemeColors(): ChartColors {
  return {
    accent: readToken('--accent', FALLBACK_COLORS.accent),
    muted: readToken('--muted', FALLBACK_COLORS.muted),
    line: readToken('--line', FALLBACK_COLORS.line),
    surface: readToken('--surface', FALLBACK_COLORS.surface),
  };
}

/** Resolves theme colors synchronously on first render (via a lazy `useState`
 *  initializer) so dark mode doesn't flash light-theme colors for one frame. */
function useThemeColors(): ChartColors {
  const [colors] = useState<ChartColors>(resolveThemeColors);
  return colors;
}

interface ChartPoint {
  x: string;
  label: string;
  weight: number;
  isLatest?: boolean;
}

function buildChartData(series: { date: string; weight: number }[]): ChartPoint[] {
  return series.map((p, i) => ({
    x: p.date,
    label: formatAxisDate(p.date),
    weight: p.weight,
    isLatest: i === series.length - 1,
  }));
}

/** Single accent line with an emphasized marker (>=8px diameter, series color,
 *  surface-color ring) on the latest point only — everywhere else invisible. */
function makeHeadlineDot(color: string, ring: string) {
  return function HeadlineDot(props: DotItemDotProps) {
    const { cx, cy, payload, index } = props;
    const row = payload as ChartPoint | undefined;
    if (cx == null || cy == null || !row?.isLatest) return <g key={`hd-${index}`} />;
    return <circle key={`hd-${index}`} cx={cx} cy={cy} r={5} fill={color} stroke={ring} strokeWidth={2} />;
  };
}

interface BwTooltipProps extends TooltipContentProps {
  unit: Unit;
}

function BwTooltip({ active, payload, label, unit }: BwTooltipProps) {
  if (!active || !payload || payload.length === 0) return null;
  const entry = payload[0];
  if (entry?.value == null) return null;
  return (
    <div className="rounded-[var(--r-card)] border border-[var(--line)] bg-[var(--surface)] px-3 py-2 text-[12px] shadow-lg">
      <div className="mb-1 font-semibold text-[var(--muted)]">{label}</div>
      <div className="font-bold tabular-nums text-[var(--text)]">
        {String(entry.value)}
        {unit}
      </div>
    </div>
  );
}

interface LoadedData {
  entries: BodyweightEntry[];
  unit: Unit;
}

/**
 * History-tab card: a "Log today" input, the latest logged weight, and a
 * trend line chart of all logged entries. Gated behind
 * `settings.bodyweightTracking` by the caller (History.tsx).
 */
export default function BodyweightCard() {
  const [data, setData] = useState<LoadedData | undefined>(undefined);
  const [input, setInput] = useState('');
  const colors = useThemeColors();

  async function load() {
    const [entries, profile] = await Promise.all([bodyweightRepo.all(), profileRepo.get()]);
    setData({ entries, unit: profile?.units ?? 'kg' });
  }

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const [entries, profile] = await Promise.all([bodyweightRepo.all(), profileRepo.get()]);
      if (cancelled) return;
      setData({ entries, unit: profile?.units ?? 'kg' });
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const unit: Unit = data?.unit ?? 'kg';
  const entries = data?.entries ?? [];
  const latest = latestWeight(entries);
  const chartData = useMemo(() => buildChartData(bodyweightSeries(entries)), [entries]);
  const hasData = chartData.length > 0;

  const headlineDot = useMemo(() => makeHeadlineDot(colors.accent, colors.surface), [colors.accent, colors.surface]);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    const weight = Number(input);
    if (!input.trim() || !Number.isFinite(weight) || weight <= 0) return;
    await bodyweightRepo.add({ date: new Date().toISOString().slice(0, 10), weight });
    setInput('');
    await load();
  }

  return (
    <section className="rounded-[var(--r-card)] border border-[var(--line)] bg-[var(--surface)] p-4">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-base font-extrabold">Bodyweight</h2>
        <span className="text-[13px] font-bold text-[var(--muted)]">
          Latest: {latest != null ? `${latest} ${unit}` : '—'}
        </span>
      </div>

      <form onSubmit={handleSubmit} className="mt-3 flex items-end gap-2">
        <label
          htmlFor="bodyweight-log-input"
          className="flex flex-col text-[12px] font-semibold text-[var(--muted)]"
        >
          Log today ({unit})
          <input
            id="bodyweight-log-input"
            type="number"
            inputMode="decimal"
            min={0}
            step="0.1"
            aria-label={`Log today's weight (${unit})`}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            className="mt-1 w-24 rounded-lg border border-[var(--line)] bg-[var(--surface-2)] px-2 py-1.5 text-center font-bold text-[var(--text)] focus:outline-none focus:ring-2 focus:ring-[var(--accent)]"
          />
        </label>
        <button
          type="submit"
          className="rounded-[var(--r-pill)] bg-[var(--accent)] px-4 py-2 text-[13px] font-extrabold text-[var(--on-accent)]"
        >
          Log
        </button>
      </form>

      {hasData ? (
        <div className="mt-4 h-[160px] w-full">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={chartData} margin={{ top: 8, right: 12, bottom: 0, left: 0 }}>
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
                width={36}
                domain={['auto', 'auto']}
              />
              <Tooltip
                content={(props) => <BwTooltip {...props} unit={unit} />}
                cursor={{ stroke: colors.line, strokeWidth: 1 }}
              />
              <Line
                dataKey="weight"
                name="Bodyweight"
                stroke={colors.accent}
                strokeWidth={2}
                dot={headlineDot}
                activeDot={{ r: 5, fill: colors.accent, stroke: colors.surface, strokeWidth: 2 }}
                connectNulls
                isAnimationActive={false}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      ) : (
        <p className="mt-4 text-sm text-[var(--muted)]">Log your bodyweight to see the trend.</p>
      )}
    </section>
  );
}
