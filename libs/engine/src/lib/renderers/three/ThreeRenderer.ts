
import * as THREE from 'three';
import { BehaviorSubject } from 'rxjs';
import { Renderer } from '../../Renderer';
import { DataChunk, MarkerConfig, GraphConfig, ViewportRange } from '../../interfaces';
import { ThreeGrid } from './ThreeGrid';
import { ThreeMarkers } from './ThreeMarkers';
import { ThreeDataLayer } from './ThreeDataLayer';

export class ThreeRenderer<TConfig extends GraphConfig> extends Renderer<TConfig> {
  private scene: THREE.Scene;
  private camera: THREE.OrthographicCamera;
  private renderer: THREE.WebGLRenderer;
  
  private grid: ThreeGrid<TConfig>;
  private markers: ThreeMarkers;
  private dataLayer: ThreeDataLayer;

  constructor(
      container: HTMLElement, 
      config$: BehaviorSubject<TConfig>,
      range$: BehaviorSubject<ViewportRange>
  ) {
    super(container, config$, range$);
    
    // Scene Setup
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x222222);

    // Camera
    this.camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 100);
    this.camera.position.z = 10;
    
    this.renderer = new THREE.WebGLRenderer({ 
        antialias: true, 
        powerPreference: 'high-performance' 
    });
    this.renderer.setSize(this.width, this.height);
    this.container.appendChild(this.renderer.domElement);

    // Components
    this.grid = new ThreeGrid(this, this.scene, this.container);
    this.markers = new ThreeMarkers(this.scene, this.container);
    this.dataLayer = new ThreeDataLayer(this.scene);
    
    // Initial Render
    this.render();
  }

  override resize(width: number, height: number): void {
    super.resize(width, height);
    this.renderer.setSize(width, height);
    this.render();
  }

  private updateCamera(range: ViewportRange): void {
      const { start, end, yStart, yEnd } = range;
      this.camera.left = start;
      this.camera.right = end;
      this.camera.top = (yEnd !== undefined) ? yEnd : 2000; 
      this.camera.bottom = (yStart !== undefined) ? yStart : -2000;
      this.camera.updateProjectionMatrix();
  }

  setData<TData>(chunk: DataChunk<TData>): void {
      if (!chunk) return;
      console.time('ThreeRenderer: setData');
      console.log(`[ThreeRenderer] setData called - start: ${chunk.start}, end: ${chunk.end}`);
      this.dataLayer.setData(chunk, chunk.start, chunk.end);
      console.timeEnd('ThreeRenderer: setData');
      this.render();
  }

  setMarkers(markers: MarkerConfig[]): void {
      this.markers.setMarkers(markers);
      this.render();
  }

  render(): void {
      console.time('ThreeRenderer: render');
      // Get latest state
      const range = this.range$.getValue();
      
      this.updateCamera(range);
      
      // Update Components with latest view state
      // Note: setData handles data updates separately
      this.grid.update(range, this.width, this.height, this.camera);
      this.markers.update(range, this.width, this.height, this.camera);
      
      this.renderer.render(this.scene, this.camera);
      console.timeEnd('ThreeRenderer: render');
  }
  
  destroy(): void {
      this.grid.destroy();
      this.markers.destroy();
      this.dataLayer.destroy();
      this.renderer.dispose();
      this.container.removeChild(this.renderer.domElement); // Clean up DOM
  }
}
