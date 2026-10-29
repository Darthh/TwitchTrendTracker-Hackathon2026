import { useEffect, useRef, useState } from 'react';
import * as echarts from 'echarts/core';
import { LineChart, BarChart, TreemapChart, ScatterChart, HeatmapChart, SankeyChart } from 'echarts/charts';
import {
  GridComponent,
  TooltipComponent,
  VisualMapComponent,
  MarkPointComponent,
  AriaComponent,
} from 'echarts/components';
import { CanvasRenderer } from 'echarts/renderers';
import type { EChartsCoreOption } from 'echarts/core';
import type { Point, Range } from '../../src/shared/types';
import { compact } from './lib';
echarts.use([
  LineChart,
  BarChart,
  TreemapChart,
  ScatterChart,
  HeatmapChart,
  SankeyChart,
  GridComponent,
  TooltipComponent,
  VisualMapComponent,
  MarkPointComponent,
  AriaComponent,
  CanvasRenderer,
]);
export function Chart({
  option,
  label,
  height = 210,
  table,
  onClick,
}: {
  option: EChartsCoreOption;
  label: string;
  height?: number;
  table?: { name: string; value: number }[];
  onClick?: (name: string) => void;
}) {
  const ref = useRef<HTMLDivElement>(null),
    [show, setShow] = useState(false);
  useEffect(() => {
    if (!ref.current) return;
    const chart = echarts.init(ref.current, undefined, { renderer: 'canvas' });
    const css = getComputedStyle(document.documentElement);
    const colors: Record<string, string> = {
      '#797989': '--subtle',
      '#adadb8': '--muted',
      '#39dca0': '--green',
      '#ff687b': '--red',
      '#b88aff': '--accent-text',
      '#a970ff': '--accent-text',
      '#18181b': '--panel',
      '#26262c': '--hover',
      '#efeff1': '--text',
    };
    const themed = (value: unknown): unknown => {
      if (typeof value === 'string' && colors[value.slice(0, 7)])
        return css.getPropertyValue(colors[value.slice(0, 7)]).trim() + value.slice(7);
      if (Array.isArray(value)) return value.map(themed);
      if (value && typeof value === 'object')
        return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, themed(v)]));
      return value;
    };
    chart.setOption({
      animation: !window.matchMedia('(prefers-reduced-motion: reduce)').matches,
      animationDuration: 500,
      textStyle: { fontFamily: 'Inter, sans-serif' },
      aria: { enabled: true },
      ...(themed(option) as EChartsCoreOption),
    });
    if (onClick) chart.on('click', (p) => onClick(p.name));
    const observer = new ResizeObserver(() => chart.resize());
    observer.observe(ref.current);
    return () => {
      observer.disconnect();
      chart.dispose();
    };
  }, [option, onClick]);
  return (
    <div className="chart-wrap">
      <div ref={ref} role="img" aria-label={label} style={{ height, width: '100%' }} />
      {table && (
        <>
          <button className="data-toggle" onClick={() => setShow(!show)}>
            {show ? 'Hide' : 'View'} data table
          </button>
          {show && (
            <div className="table-scroll">
              <table>
                <thead>
                  <tr>
                    <th>Item</th>
                    <th>Value</th>
                  </tr>
                </thead>
                <tbody>
                  {table.map((r, i) => (
                    <tr key={i}>
                      <td>{r.name}</td>
                      <td>{r.value.toLocaleString()}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </div>
  );
}
export function areaOption(
  points: Point[],
  range: Range,
  color = '#39dca0',
  compactChart = false,
): EChartsCoreOption {
  const date = new Intl.DateTimeFormat(
    'en-US',
    range === 'week' ? { weekday: 'short' } : { month: 'short', day: 'numeric' },
  );
  return {
    animation: false,
    grid: { top: 20, left: 0, right: compactChart ? 0 : 40, bottom: compactChart ? 0 : 25 },
    tooltip: {
      trigger: 'axis',
      confine: true,
      backgroundColor: '#26262c',
      borderWidth: 0,
      textStyle: { color: '#efeff1' },
      valueFormatter: (v: unknown) => compact(Number(v)),
      axisPointer: { type: 'cross', label: { show: false } },
    },
    xAxis: {
      type: 'category',
      data: points.map((p) => date.format(p.ts)),
      boundaryGap: false,
      show: !compactChart,
      axisLabel: { color: '#797989', interval: Math.max(0, Math.floor(points.length / 7)) },
      axisTick: { show: false },
      axisLine: { show: false },
    },
    yAxis: {
      type: 'value',
      position: 'right',
      show: !compactChart,
      min: (v: { min: number }) => Math.floor(v.min * 0.7),
      splitNumber: 3,
      axisLabel: { color: '#797989', formatter: (v: number) => compact(v, 0) },
      splitLine: { lineStyle: { color: '#79798922', type: 'dashed' } },
    },
    series: [
      {
        type: 'line',
        data: points.map((p) => Math.round(p.value)),
        smooth: 0.35,
        showSymbol: false,
        lineStyle: { color, width: compactChart ? 2 : 2.5 },
        itemStyle: { color },
        areaStyle: {
          color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
            { offset: 0, color: `${color}45` },
            { offset: 1, color: `${color}00` },
          ]),
        },
        ...(points.length && !compactChart
          ? {
              markPoint: {
                symbol: 'circle',
                symbolSize: 7,
                itemStyle: { color, borderWidth: 5, borderColor: `${color}33` },
                data: [{ coord: [points.length - 1, Math.round(points.at(-1)!.value)] }],
              },
            }
          : {}),
      },
    ],
  };
}
export function barOption(rows: { name: string; value: number }[], color = '#a970ff'): EChartsCoreOption {
  return {
    grid: { left: 145, right: 35, top: 10, bottom: 25 },
    tooltip: { trigger: 'axis', confine: true },
    xAxis: {
      type: 'value',
      axisLabel: { color: '#797989' },
      splitLine: { lineStyle: { color: '#79798922', type: 'dashed' } },
    },
    yAxis: {
      type: 'category',
      inverse: true,
      data: rows.map((x) => x.name),
      axisTick: { show: false },
      axisLine: { show: false },
      axisLabel: { color: '#adadb8', width: 130, overflow: 'truncate' },
    },
    series: [
      {
        type: 'bar',
        data: rows.map((x) => ({
          value: x.value,
          itemStyle: { color: x.value >= 0 ? color : '#ff687b', borderRadius: [0, 4, 4, 0] },
        })),
        barMaxWidth: 18,
      },
    ],
  };
}
