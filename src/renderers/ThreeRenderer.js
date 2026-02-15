import * as THREE from 'three';
import { Renderer } from './Renderer.js';

export class ThreeRenderer extends Renderer {
  constructor(container, viewport) {
    super(container, viewport);
    
    // Scene Setup
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x222222);

    // Camera (Orthographic for 2D)
    // Left, Right, Top, Bottom, Near, Far
    // We map viewport.start -> viewport.end to Camera Left -> Right
    // And Data Y range to Bottom -> Top
    this.camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 100);
    this.camera.position.z = 10;
    
    this.renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: 'high-performance' });
    this.renderer.setSize(this.width, this.height);
    this.container.appendChild(this.renderer.domElement);

    // Pool of objects
    // We need 100 series max.
    this.maxSeries = 100;
    this.lines = []; // Array of THREE.Line
    this.meshes = []; // Array of THREE.Mesh (for areas)
    this.group = new THREE.Group();
    this.scene.add(this.group);

    // Initialize Pool
    // Materials
    const lineMaterial = new THREE.LineBasicMaterial({ color: 0x00ff00, transparent: true, opacity: 0.8 });
    const areaMaterial = new THREE.MeshBasicMaterial({ color: 0x00ff00, side: THREE.DoubleSide, opacity: 0.5, transparent: true });

    for(let i=0; i<this.maxSeries; i++) {
        // Line Buffer (Raw View) - True THREE.Line
        const lineGeo = new THREE.BufferGeometry();
        // Max points
        const maxPoints = 25000; // Covers maxBins (10k) * 2 for perimeter trace 
        const bufferSize = maxPoints; // 1 vert per point
        
        const positions = new Float32Array(bufferSize * 3);
        lineGeo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
        lineGeo.setDrawRange(0, 0);
        
        const line = new THREE.Line(lineGeo, lineMaterial.clone());
        line.visible = false;
        // Stagger colors
        line.material.color.setHSL(i / this.maxSeries, 0.8, 0.5);
        this.lines.push(line);
        this.group.add(line);
        
        // Area Buffer
        const areaGeo = new THREE.BufferGeometry();
        const areaPos = new Float32Array(maxPoints * 6 * 3); // 2 triangles per bin
        areaGeo.setAttribute('position', new THREE.BufferAttribute(areaPos, 3));
        
        const area = new THREE.Mesh(areaGeo, areaMaterial.clone());
        area.material.color.setHSL(i / this.maxSeries, 0.8, 0.5);
        area.visible = false;
        this.meshes.push(area);
        this.group.add(area);
    }
  }

  resize(width, height) {
    super.resize(width, height);
    this.renderer.setSize(width, height);
    this.updateCamera();
  }

  updateCamera() {
      // Logic handled in render or setData via camera properties?
      // Actually, we want the camera to map exactly to the data coordinates:
      // X: viewport.start to viewport.end
      // Y: -500 to 500 (approx random walk range)
      
      const { start, end } = this.viewport.getRange();
      this.camera.left = start;
      this.camera.right = end;
      // We need a fixed Y scale or dynamic? Fixed for now.
      this.camera.top = 2000; 
      this.camera.bottom = -2000;
      this.camera.updateProjectionMatrix();
  }

  setData(dataChunk) {
      if (!dataChunk) return;
      
      const { type, data, start, end } = dataChunk;
      
      // Update camera horizontal bounds
      // NOTE: This might ideally happen every frame in render() if we want smooth pan,
      // but setData is called when data arrives.
      // If we are panning locally, we might not get new data immediately (async).
      // So camera update should be separate from pure data update.
      
      // Update Buffers
      for(let i=0; i<this.maxSeries; i++) {
          const line = this.lines[i];
          const mesh = this.meshes[i];

          if (i >= data.length) {
              line.visible = false;
              mesh.visible = false;
              continue;
          }

          const seriesData = data[i]; // Float32Array
          
          if (type === 'raw') {
              line.visible = true;
              mesh.visible = false;
              
              const positions = line.geometry.attributes.position.array;
              let ptr = 0;
              const seriesLen = seriesData.length;
              
              for(let j=0; j<seriesLen; j++) {
                  const x = start + j;
                  const y = seriesData[j];
                  positions[ptr++] = x; positions[ptr++] = y; positions[ptr++] = 0;
              }
              
              line.geometry.attributes.position.needsUpdate = true;
              line.geometry.setDrawRange(0, seriesLen);
              
          } else {
              // Aggregated: [min, max, min, max...]
              line.visible = true; // SHOW LINE to encapsulate
              mesh.visible = true;
              
              const step = dataChunk.step || 1;
              const binCount = seriesData.length / 2;
              
              // 1. Update MESH (Area Fill)
              const meshPos = mesh.geometry.attributes.position.array;
              let meshPtr = 0;
              
              // We need quads/tris connecting bin j to bin j+1
              // But if binCount is large (screen width), we might have many Tris.
              
              // NOTE: For 'Aggegrated', we want the area between Min and Max.
              // Just a quad per bin? Or connected? Connected is better.
              
              for(let j=0; j<binCount - 1; j++) {
                  const x1 = start + j * step;
                  const x2 = start + (j+1) * step;
                  
                  const min1 = seriesData[j*2];
                  const max1 = seriesData[j*2+1];
                  const min2 = seriesData[(j+1)*2];
                  const max2 = seriesData[(j+1)*2+1];
                  
                  // Tri 1
                  meshPos[meshPtr++] = x1; meshPos[meshPtr++] = max1; meshPos[meshPtr++] = 0;
                  meshPos[meshPtr++] = x2; meshPos[meshPtr++] = max2; meshPos[meshPtr++] = 0;
                  meshPos[meshPtr++] = x1; meshPos[meshPtr++] = min1; meshPos[meshPtr++] = 0;
                  
                  // Tri 2
                  meshPos[meshPtr++] = x1; meshPos[meshPtr++] = min1; meshPos[meshPtr++] = 0;
                  meshPos[meshPtr++] = x2; meshPos[meshPtr++] = max2; meshPos[meshPtr++] = 0;
                  meshPos[meshPtr++] = x2; meshPos[meshPtr++] = min2; meshPos[meshPtr++] = 0;
              }
              
              mesh.geometry.attributes.position.needsUpdate = true;
              mesh.geometry.setDrawRange(0, (binCount - 1) * 6);
              
              // 2. Update LINE (Perimeter Trace for 1px crispness)
              const linePos = line.geometry.attributes.position.array;
              let linePtr = 0;
              
              // Trace Top: (x, max)
              for(let j=0; j<binCount; j++) {
                   const x = start + j * step;
                   const max = seriesData[j*2+1];
                   linePos[linePtr++] = x; linePos[linePtr++] = max; linePos[linePtr++] = 0;
              }
              
              // Connect to Bottom? Or just jump?
              // THREE.Line connects. We want to go back.
              
              // Trace Bottom (Reverse): (x, min)
              for(let j=binCount-1; j>=0; j--) {
                  const x = start + j * step;
                  const min = seriesData[j*2];
                  linePos[linePtr++] = x; linePos[linePtr++] = min; linePos[linePtr++] = 0;
              }
              
              // Close loop?
              linePos[linePtr++] = start;
              linePos[linePtr++] = seriesData[1]; // First Max
              linePos[linePtr++] = 0;
              
              line.geometry.attributes.position.needsUpdate = true;
              line.geometry.setDrawRange(0, binCount * 2 + 1);
          }
      }
  }

  set lineWidth(value) {
      this._lineWidth = value;
      // Safety check
      if (!this.lines) return; 
      
      // Update materials
      for(const line of this.lines) {
          line.material.linewidth = value;
      }
      // Re-render if strictly needed, but data update handles mesh expansion
  }
  
  get lineWidth() {
      return this._lineWidth;
  }

  render() {
      // Sync camera with viewport exactly
      this.updateCamera();
      this.renderer.render(this.scene, this.camera);
  }
}
