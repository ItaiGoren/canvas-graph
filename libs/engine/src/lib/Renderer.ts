
import { BehaviorSubject } from 'rxjs';
import { DataChunk, MarkerConfig, GraphConfig, ViewportRange } from './interfaces';

export abstract class Renderer<TConfig extends GraphConfig> {
  protected width: number;
  protected height: number;
  
  constructor(
    protected container: HTMLElement,
    protected config$: BehaviorSubject<TConfig>,
    protected range$: BehaviorSubject<ViewportRange>
  ) {
      this.width = container.clientWidth;
      this.height = container.clientHeight;
  }

  abstract setData<TData>(chunk: DataChunk<TData>): void;
  abstract setMarkers(markers: MarkerConfig[]): void;
  abstract render(): void;
  
  resize(width: number, height: number): void {
    this.width = width;
    this.height = height;
  }

  abstract destroy(): void;

  public calculateNiceTicks(min: number, max: number, targetCount: number = 8): number[] {
      const range = max - min;
      if (range === 0) return [min];
      
      const rawStep = range / targetCount;
      const magnitude = Math.pow(10, Math.floor(Math.log10(rawStep)));
      const normalized = rawStep / magnitude;
      
      let niceStep;
      if (normalized < 1.5) niceStep = 1;
      else if (normalized < 3) niceStep = 2;
      else if (normalized < 7) niceStep = 5;
      else niceStep = 10;
      
      niceStep *= magnitude;
      
      // Fix floating point issues
      const start = Math.ceil(min / niceStep) * niceStep;
      const ticks: number[] = [];
      
      // Safety guard loop
      if (niceStep <= 0) return [min, max];

      for (let val = start; val <= max; val += niceStep) {
          ticks.push(val);
      }
      return ticks;
  }

  public formatYLabel(value: number): string {
      const abs = Math.abs(value);
      if (abs >= 1e6) return (value / 1e6).toFixed(1) + 'M';
      if (abs >= 1e3) return (value / 1e3).toFixed(1) + 'K';
      return value.toFixed(0);
  }
}
