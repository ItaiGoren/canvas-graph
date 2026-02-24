
import { BehaviorSubject, Subject, Subscription } from 'rxjs';
import { DataChunk, GraphConfig, ViewportRange, MarkerConfig } from './interfaces';
import { Renderer } from './Renderer';
import { InputHandler, InteractionMode } from './InputHandler';

/**
 * The main entry point for the Graph Library.
 * Manages state, configuration, and the active renderer.
 */
export class GraphEngine<TConfig extends GraphConfig = GraphConfig> {
  // --- State Streams ---
  public readonly range$: BehaviorSubject<ViewportRange>;
  public readonly config$: BehaviorSubject<TConfig>;
  public readonly error$ = new Subject<Error>();
  
  // Internal
  private readonly destroy$ = new Subject<void>();
  private renderer: Renderer<TConfig> | null = null;
  private container: HTMLElement;
  private inputHandler: InputHandler;
  private rangeSub: Subscription;

  constructor(container: HTMLElement, initialConfig: TConfig) {
    this.container = container;
    this.config$ = new BehaviorSubject<TConfig>(initialConfig);
    this.range$ = new BehaviorSubject<ViewportRange>({ start: 0, end: 100 });
    
    // Initialize Input Handler
    this.inputHandler = new InputHandler(this.container, this);
    
    // Re-render on range changes (zoom, pan, etc.)
    this.rangeSub = this.range$.subscribe(() => {
      this.renderer?.render();
    });
  }

  /**
   * Sets (or switches) the active renderer.
   * Note: This usually requires importing specific renderers. 
   * To keep Core dependency-free, we might want to pass the Renderer Constructor?
   * Or just import them if they are part of the core package.
   */
  public setRenderer(rendererConstructor: new (c: HTMLElement, cfg: BehaviorSubject<TConfig>, rng: BehaviorSubject<ViewportRange>) => Renderer<TConfig>): void {
      if (this.renderer) {
          this.renderer.destroy();
      }
      try {
        this.renderer = new rendererConstructor(this.container, this.config$, this.range$);
        this.resize(this.container.clientWidth, this.container.clientHeight);
      } catch (err) {
          this.error$.next(err as Error);
      }
  }

  public setData<TData>(chunk: DataChunk<TData>): void {
    try {
        if (!this.renderer) return;
        this.renderer.setData(chunk);
    } catch (err) {
        this.error$.next(err as Error);
    }
  }

  public setMarkers(markers: MarkerConfig[]): void {
      this.renderer?.setMarkers(markers);
  }

  public resize(width: number, height: number): void {
      this.renderer?.resize(width, height);
  }

  public setRange(start: number, end: number): void {
      const cur = this.range$.getValue();
      this.range$.next({ ...cur, start, end });
  }

  public setMode(mode: InteractionMode): void {
      this.inputHandler.setMode(mode);
  }

  public updateConfig(partial: Partial<TConfig>): void {
      this.config$.next({ ...this.config$.value, ...partial });
  }

  public destroy(): void {
    this.rangeSub.unsubscribe();
    this.destroy$.next();
    this.destroy$.complete();
    this.renderer?.destroy();
    this.renderer = null;
    this.range$.complete();
    this.config$.complete();
  }
}
