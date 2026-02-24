
import { Component, ElementRef, OnInit, OnDestroy, ViewChild, Input } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Subscription } from 'rxjs';
import { 
  GraphEngine, 
  ThreeRenderer, 
  GraphConfig, 
  ViewportRange, 
  DataChunk, 
  InteractionMode 
} from '@canvas-graph/engine';

@Component({
  selector: 'app-graph-view',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './graph-view.component.html',
  styleUrls: ['./graph-view.component.css']
})
export class GraphViewComponent implements OnInit, OnDestroy {
  @ViewChild('graphContainer', { static: true }) container!: ElementRef<HTMLDivElement>;
  
  public currentMode: 'pan' | 'box-zoom' | 'x-zoom' = 'pan'; 
  public statusMessage: string = 'Ready';
  
  private engine!: GraphEngine;
  private rangeSub!: Subscription;

  constructor() {}

  ngOnInit(): void {
      // Initialize Engine
      this.engine = new GraphEngine(this.container.nativeElement, {
          rendererType: 'three',
          lineWidth: 1,
          showMarkers: true
      } as GraphConfig);

      // Set Renderer
      // We pass the constructor of the specific renderer we want to use
      this.engine.setRenderer(ThreeRenderer);

      // Subscribe to Range Changes (from Engine)
      this.rangeSub = this.engine.range$.subscribe((range: ViewportRange) => {
          // Update status with range info (optional, or just keep mode)
          // For now, let's keep it simple to avoid spamming updates if performance is key, 
          // but showing range is useful debug info.
          // this.statusMessage = `Range: [${range.start.toFixed(0)}, ${range.end.toFixed(0)}]`;
      });
      
      // Handle Resize
      const resizeObserver = new ResizeObserver(entries => {
          for (let entry of entries) {
              const { width, height } = entry.contentRect;
              // Resize engine. Need to subtract toolbar? 
              // Using flexbox in CSS handles the layout, BUT Threejs canvas needs explicit size.
              // Since the container is 'flex: 1', its contentRect should be correct.
              this.engine.resize(width, height);
          }
      });
      resizeObserver.observe(this.container.nativeElement);
  }
  
  public setMode(modeStr: 'pan' | 'box-zoom' | 'x-zoom'): void {
      this.currentMode = modeStr;
      let mode = InteractionMode.PAN;
      
      if (modeStr === 'box-zoom') {
          mode = InteractionMode.BOX_ZOOM;
          this.statusMessage = 'Box Selection Mode';
      } else if (modeStr === 'x-zoom') {
          mode = InteractionMode.X_ZOOM;
          this.statusMessage = 'X-Axis Selection Mode';
      } else {
          this.statusMessage = 'Pan Mode';
      }
      
      this.engine.setMode(mode);
  }
  
  public resetZoom(): void {
      // Logic to reset zoom (e.g. back to 0-100 or full data range)
      this.engine.setRange(0, 100); 
  }
  
  // Public API for Parent Components to call
  public setData(data: any): void {
      this.engine.setData(data);
  }

  public setRange(start: number, end: number): void {
      this.engine.setRange(start, end);
  }

  public setMarkers(markers: any[]): void {
      this.engine.setMarkers(markers);
  }

  public setConfig(config: Partial<GraphConfig>): void {
      this.engine.updateConfig(config);
  }

  ngOnDestroy(): void {
      this.rangeSub?.unsubscribe();
      this.engine.destroy();
  }
}
