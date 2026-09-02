"use client";

import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { MonthlyTrendPoint } from "@/lib/dashboard/monthly-trend";

// Colors follow the dataviz skill's validated categorical palette
// (references/palette.md): two series -> slot 1 (blue) and slot 2 (orange),
// the fixed opening pair of the passing 8-hue order (adjacent CVD Delta E
// 9.1, normal-vision 19.6 — both clear of the floors). Never hand-picked.
const COLOR_HADIR = "#2a78d6"; // categorical slot 1 (blue)
const COLOR_TERLAMBAT = "#eb6834"; // categorical slot 2 (orange)

// Chrome tokens from the same reference: hairline gridlines/axis one step
// off the chart surface, muted ink for axis ticks — recessive by design so
// the two lines stay the only loud thing on the chart. These chrome vars are
// theme-reactive via CSS custom properties.
const COLOR_GRID = "var(--chart-grid)";
const COLOR_AXIS = "var(--chart-axis)";

function formatDayLabel(dateStr: string) {
  // "2026-10-07" -> "07"; keeps the x-axis to a compact day-of-month tick.
  return dateStr.slice(-2);
}

export function AttendanceTrendChart({ data }: { data: MonthlyTrendPoint[] }) {
  return (
    <div className="h-80 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 8, right: 16, left: 0, bottom: 0 }}>
          <CartesianGrid vertical={false} stroke={COLOR_GRID} strokeWidth={1} />
          <XAxis
            dataKey="date"
            tickFormatter={formatDayLabel}
            tick={{ fill: COLOR_AXIS, fontSize: 12 }}
            axisLine={{ stroke: COLOR_AXIS }}
            tickLine={false}
          />
          <YAxis
            allowDecimals={false}
            tick={{ fill: COLOR_AXIS, fontSize: 12 }}
            axisLine={false}
            tickLine={false}
            width={32}
          />
          <Tooltip
            contentStyle={{
              borderRadius: 8,
              border: "1px solid var(--border)",
              background: "var(--popover)",
              color: "var(--popover-foreground)",
              fontSize: 12,
            }}
            labelStyle={{ color: "var(--foreground)" }}
          />
          <Legend
            verticalAlign="top"
            align="right"
            iconType="line"
            wrapperStyle={{ fontSize: 12, color: "var(--muted-foreground)" }}
          />
          <Line
            type="monotone"
            dataKey="hadir"
            name="Hadir"
            stroke={COLOR_HADIR}
            strokeWidth={2}
            dot={{ r: 4, fill: COLOR_HADIR, strokeWidth: 2, stroke: "var(--chart-dot-halo)" }}
            activeDot={{ r: 6, strokeWidth: 2, stroke: "var(--chart-dot-halo)" }}
          />
          <Line
            type="monotone"
            dataKey="terlambat"
            name="Terlambat"
            stroke={COLOR_TERLAMBAT}
            strokeWidth={2}
            dot={{ r: 4, fill: COLOR_TERLAMBAT, strokeWidth: 2, stroke: "var(--chart-dot-halo)" }}
            activeDot={{ r: 6, strokeWidth: 2, stroke: "var(--chart-dot-halo)" }}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
