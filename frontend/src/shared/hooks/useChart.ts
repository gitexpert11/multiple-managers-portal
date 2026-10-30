import { Chart, type ChartConfiguration, type ChartData, type ChartOptions, type ChartType } from 'chart.js';
import { useEffect, useRef, type RefObject } from 'react';

/**
 * Bind a Chart.js chart to a <canvas>. The chart is created on first use
 * (when a 2D context is available — jsdom has none, in which case nothing is
 * drawn and the rest of the component keeps working) and updated in place
 * whenever the data or options change, so animations stay smooth.
 */
export function useChart<T extends ChartType>(type: T, data: ChartData<T>, options: ChartOptions<T>): { canvasRef: RefObject<HTMLCanvasElement | null>; chartRef: RefObject<Chart<T> | null> } {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const chartRef = useRef<Chart<T> | null>(null);

  useEffect(() => {
    const existing = chartRef.current;
    if (existing) {
      existing.data = data;
      existing.options = options as Chart<T>['options'];
      existing.update();
      return;
    }
    const ctx = canvasRef.current?.getContext?.('2d');
    if (!ctx) return;
    chartRef.current = new Chart(ctx, { type, data, options } as ChartConfiguration<T>);
  }, [type, data, options]);

  // Destroy on unmount only.
  useEffect(
    () => () => {
      chartRef.current?.destroy();
      chartRef.current = null;
    },
    [],
  );

  return { canvasRef, chartRef };
}
