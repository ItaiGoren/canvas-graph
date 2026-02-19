import * as THREE from 'three';
import { Renderer } from './Renderer.js';
import { ThreeGrid } from './three/ThreeGrid.js';
import { ThreeMarkers } from './three/ThreeMarkers.js';
import { ThreeDataLayer } from './three/ThreeDataLayer.js';

export class ThreeRenderer extends Renderer {
  constructor(container, viewport) {
    super(container, viewport);
    
    // Scene Setup
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x222222);

    // Camera (Orthographic for 2D)
    this.camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 100);
    this.camera.position.z = 10;
    
    this.renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: 'high-performance' });
    this.renderer.setSize(this.width, this.height);
    this.container.appendChild(this.renderer.domElement);

    // Components
    this.grid = new ThreeGrid(this);
    this.markers = new ThreeMarkers(this);
    this.dataLayer = new ThreeDataLayer(this);
    
    // State
    this.isSparseData = false;
  }

  resize(width, height) {
    super.resize(width, height);
    this.renderer.setSize(width, height);
    this.updateCamera();
  }

  updateCamera() {
      const { start, end } = this.viewport.getRange();
      
      this.camera.left = start;
      this.camera.right = end;
      // this.group.position.x = 0; // Managed by components? No, components group is at 0, world coords used.
      
      this.camera.top = 2000; 
      this.camera.bottom = -2000;
      this.camera.updateProjectionMatrix();
  }
  
  // Convert world coords to screen pixels (used by components)
  worldToScreen(x, y) {
      const vec = new THREE.Vector3(x, y, 0);
      vec.project(this.camera);
      
      const screenX = (vec.x + 1) / 2 * this.width;
      const screenY = (-vec.y + 1) / 2 * this.height;
      
      if (screenX < 0 || screenX > this.width || screenY < 0 || screenY > this.height) {
          return null;
      }
      
      return { x: screenX, y: screenY };
  }

  setData(dataChunk) {
      if (!dataChunk) return;
      
      const { type, start, end } = dataChunk;
      this.isSparseData = (type === 'sparse' || type === 'sparse-aggregated');
      
      // Update Data Layer
      this.dataLayer.setData(dataChunk, start, end);
  }

  set lineWidth(value) {
      this._lineWidth = value;
      if (this.dataLayer) {
          this.dataLayer.setLineWidth(value);
      }
  }
  
  get lineWidth() {
      return this._lineWidth;
  }

  setMarkers(markers) {
      super.setMarkers(markers);
      if (this.markers) {
          this.markers.setMarkers(markers);
      }
  }

  render() {
      this.updateCamera();
      
      // Update Components
      this.grid.update(this.viewport);
      this.markers.update(this.viewport);
      
      this.renderer.render(this.scene, this.camera);
  }
  
  destroy() {
      this.grid.destroy();
      this.markers.destroy();
      this.dataLayer.destroy();
      this.renderer.dispose();
      // clean up scene children?
  }
}
