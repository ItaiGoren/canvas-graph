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
    this.lines = []; // Array of THREE.Line
    this.meshes = []; // Array of THREE.Mesh (for areas)
    this.group = new THREE.Group();
    this.scene.add(this.group);
    
    // For sparse data: store the reference start time so we can offset the group
    this.dataStartOffset = 0;
    this.isSparseData = false;
    
    // Grid Lines
    const gridGeo = new THREE.BufferGeometry();
    const gridPos = new Float32Array(1000 * 3); // Max 500 lines (1000 vertices)
    gridGeo.setAttribute('position', new THREE.BufferAttribute(gridPos, 3));
    gridGeo.setDrawRange(0, 0);
    const gridMat = new THREE.LineBasicMaterial({ color: 0xffffff, opacity: 0.1, transparent: true });
    this.gridLines = new THREE.LineSegments(gridGeo, gridMat);
    this.scene.add(this.gridLines);
    
    // HTML Overlay for labels
    this.labelContainer = document.createElement('div');
    this.labelContainer.style.position = 'absolute';
    this.labelContainer.style.top = '0';
    this.labelContainer.style.left = '0';
    this.labelContainer.style.pointerEvents = 'none';
    this.labelContainer.style.color = 'rgba(255,255,255,0.7)';
    this.labelContainer.style.fontSize = '11px';
    this.labelContainer.style.fontFamily = 'monospace';
    this.container.appendChild(this.labelContainer);

    // Initialize Materials
    this.lineMaterial = new THREE.LineBasicMaterial({ color: 0x00ff00, transparent: true, opacity: 0.8 });
    
    // Volatility Shader
    const vertexShader = `
        attribute float aRange;
        varying float vRange;
        void main() {
            vRange = aRange;
            gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
    `;
    
    const fragmentShader = `
        uniform vec3 uColor;
        uniform float uYRange;
        varying float vRange;
        void main() {
            // Volatility factor (0.0 to 1.0)
            // Calculate as ratio: bin height / canvas height
            // 100% = bin fills entire canvas, 0% = flat line
            float volatility = clamp(vRange / uYRange, 0.0, 1.0);
            
            // Stripe Pattern (1px stripe every 2px)
            // Period = 2.0. Duty cycle = 0.5 (1px on, 1px off).
            // This creates a 0.0 or 1.0 square wave per pixel.
            float pattern = step(0.5, fract(gl_FragCoord.x / 2.0));
            
            // Volatile Alpha:
            // "Stripe of 1px stripe every 2 px. switch between 40% (0.4) and 80% (0.8)"
            // Use the pattern to mix between 0.2 and 1.0
            float volatileAlpha = mix(0.2, 1.0, pattern);
            
            // Final Alpha:
            // Mix between Stable (1.0) and Volatile Pattern based on volatility factor
            float finalAlpha = mix(1.0, volatileAlpha, volatility);
            
            gl_FragColor = vec4(uColor, finalAlpha);
        }
    `;

    this.areaMaterial = new THREE.ShaderMaterial({
        uniforms: {
            uColor: { value: new THREE.Color(0x00ff00) },
            uYRange: { value: 4000 } // Y range is -2000 to 2000
        },
        vertexShader,
        fragmentShader,
        side: THREE.DoubleSide,
        transparent: true
    });
    
    // Initial Ensure
    this.ensurePoolSize(100);
  }

  ensurePoolSize(count) {
      if (this.lines.length >= count) return;
      
      const currentSize = this.lines.length;
      const needed = count - currentSize;
      
      const maxPoints = 25000; // Covers maxBins (10k) * 2 for perimeter trace 
      
      for(let i=0; i<needed; i++) {
        const idx = currentSize + i;
        
        // Line Buffer (Raw View) - True THREE.Line
        const lineGeo = new THREE.BufferGeometry();
        const bufferSize = maxPoints; 
        
        const positions = new Float32Array(bufferSize * 3);
        lineGeo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
        lineGeo.setDrawRange(0, 0);
        
        const line = new THREE.Line(lineGeo, this.lineMaterial.clone());
        line.visible = false;
        // Stagger colors
        // Use golden angle approximation or something to vary colors even for large N
        line.material.color.setHSL((idx % 100) / 100, 0.8, 0.5); 
        this.lines.push(line);
        this.group.add(line);
        
        // Area Buffer
        const areaGeo = new THREE.BufferGeometry();
        const areaPos = new Float32Array(maxPoints * 6 * 3); // 2 triangles per bin
        areaGeo.setAttribute('position', new THREE.BufferAttribute(areaPos, 3));
        
        // Volatility Attribute
        const areaRange = new Float32Array(maxPoints * 6); // 1 float per vert
        areaGeo.setAttribute('aRange', new THREE.BufferAttribute(areaRange, 1));
        
        const area = new THREE.Mesh(areaGeo, this.areaMaterial.clone());
        area.material = this.areaMaterial.clone();
        area.material.uniforms.uColor.value.setHSL((idx % 100) / 100, 0.8, 0.5);
        
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
      const { start, end } = this.viewport.getRange();
      
      // Always use absolute coordinates — data vertices are always absolute
      this.camera.left = start;
      this.camera.right = end;
      this.group.position.x = 0;
      
      this.camera.top = 2000; 
      this.camera.bottom = -2000;
      this.camera.updateProjectionMatrix();
  }
  
  // Helper: Calculate nice tick values (same as CanvasRenderer)
  calculateNiceTicks(min, max, targetCount = 8) {
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
      
      const start = Math.ceil(min / niceStep) * niceStep;
      const ticks = [];
      for (let val = start; val <= max; val += niceStep) {
          ticks.push(val);
      }
      return ticks;
  }
  
  formatYLabel(value) {
      const abs = Math.abs(value);
      if (abs >= 1e6) return (value / 1e6).toFixed(1) + 'M';
      if (abs >= 1e3) return (value / 1e3).toFixed(1) + 'K';
      return value.toFixed(0);
  }
  
  updateGrid() {
      const { start, end } = this.viewport.getRange();
      const Y_MIN = -2000;
      const Y_MAX = 2000;
      
      const yTicks = this.calculateNiceTicks(Y_MIN, Y_MAX, 8);
      const xTicks = this.calculateNiceTicks(start, end, 10);
      
      // Update grid lines geometry
      const gridPos = this.gridLines.geometry.attributes.position.array;
      let ptr = 0;
      
       // Y-axis lines (horizontal)
       for (const yVal of yTicks) {
           gridPos[ptr++] = start; gridPos[ptr++] = yVal; gridPos[ptr++] = 0;
           gridPos[ptr++] = end; gridPos[ptr++] = yVal; gridPos[ptr++] = 0;
       }
       
       // X-axis lines (vertical)
       for (const xVal of xTicks) {
           gridPos[ptr++] = xVal; gridPos[ptr++] = Y_MIN; gridPos[ptr++] = 0;
           gridPos[ptr++] = xVal; gridPos[ptr++] = Y_MAX; gridPos[ptr++] = 0;
       }
      
      this.gridLines.geometry.attributes.position.needsUpdate = true;
      this.gridLines.geometry.setDrawRange(0, ptr / 3);
      
      // Update HTML labels
      this.labelContainer.innerHTML = '';
      
      // Y-axis labels
      for (const yVal of yTicks) {
          const ndc = this.worldToScreen(start, yVal);
          if (!ndc) continue;
          
          const label = document.createElement('div');
          label.style.position = 'absolute';
          label.style.left = '5px';
          label.style.top = ndc.y + 'px';
          label.textContent = this.formatYLabel(yVal);
          this.labelContainer.appendChild(label);
      }
      
      // X-axis labels
      for (const xVal of xTicks) {
          const ndc = this.worldToScreen(xVal, Y_MIN);
          if (!ndc) continue;
          
          const label = document.createElement('div');
          label.style.position = 'absolute';
          label.style.left = ndc.x + 'px';
          label.style.top = (this.height - 15) + 'px';
          label.textContent = Math.floor(xVal).toString();
          this.labelContainer.appendChild(label);
      }
  }
  
  // Convert world coords to screen pixels
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
      
      const { type, data, start, end } = dataChunk;
      
      // Track if this is sparse data for camera mode
      this.isSparseData = (type === 'sparse' || type === 'sparse-aggregated');
      if (this.isSparseData) {
          this.dataStartOffset = start; // Store the reference offset
      }
      
      // Update camera horizontal bounds
      // NOTE: This might ideally happen every frame in render() if we want smooth pan,
      // but setData is called when data arrives.
      // If we are panning locally, we might not get new data immediately (async).
      // So camera update should be separate from pure data update.
      
      // Update Buffers
      this.ensurePoolSize(data.length);
      
      for(let i=0; i<this.lines.length; i++) {
          const line = this.lines[i];
          const mesh = this.meshes[i];

          if (i >= data.length) {
              line.visible = false;
              mesh.visible = false;
              continue;
          }

          const seriesData = data[i]; // Float32Array
         
          if (type === 'sparse') {
               // Sparse Raw Line (Float64 X + Float32 Y)
               line.visible = true;
               mesh.visible = false;
               
               const { x: dataX } = dataChunk;
               const seriesX = dataX[i];
               const len = seriesData.length;
               
               if (len === 0) continue;
               
               // Re-allocate if needed? 
               // We might need MORE points than len due to gap drops (2 extra per gap + 2 edge)
               // Max possible expansion = len * 3 (worst case every point is a gap)
               // For now assume buffer is big enough (25k), or resize?
               // The pool init size was 25000. If we have more points, we need to resize.
               // TODO: Dynamic resize buffer if len > current capacity
               
               const positions = line.geometry.attributes.position.array;
               let ptr = 0;
               
                const gapThreshold = dataChunk.sampleRate || 100; // ms
                const absoluteStart = start; // Use absolute coordinates for vertices
               
               // Edge Heuristic: Start
               const firstX = seriesX[0];
               const distToStart = firstX - absoluteStart;
               
               if (distToStart > gapThreshold) {
                   // Gap at start -> Start at (absoluteStart, 0) then (firstX, 0)
                   positions[ptr++] = absoluteStart; positions[ptr++] = 0; positions[ptr++] = 0;
                   positions[ptr++] = firstX; positions[ptr++] = 0; positions[ptr++] = 0;
               } else {
                   // Continuity -> Start at (absoluteStart, firstY)
                   positions[ptr++] = absoluteStart; positions[ptr++] = seriesData[0]; positions[ptr++] = 0;
               }
               
               positions[ptr++] = firstX; positions[ptr++] = seriesData[0]; positions[ptr++] = 0;
               
               for(let j=1; j<len; j++) {
                   const t = seriesX[j];
                   const prevT = seriesX[j-1];
                   const dt = t - prevT;
                   const val = seriesData[j];
                   
                   const ax = t; // Absolute X
                   
                   if (dt > gapThreshold) {
                       // Gap!
                       const prevAx = prevT; // Absolute X
                       // Drop to zero
                       positions[ptr++] = prevAx; positions[ptr++] = 0; positions[ptr++] = 0;
                       positions[ptr++] = ax; positions[ptr++] = 0; positions[ptr++] = 0;
                       positions[ptr++] = ax; positions[ptr++] = val; positions[ptr++] = 0;
                   } else {
                       positions[ptr++] = ax; positions[ptr++] = val; positions[ptr++] = 0;
                   }
               }
               
               // Edge Heuristic: End
               const lastX = seriesX[len-1];
               const distToEnd = end - lastX;
               if (distToEnd > gapThreshold) {
                   // Drop to zero at end
                   positions[ptr++] = lastX; positions[ptr++] = 0; positions[ptr++] = 0;
                   positions[ptr++] = end; positions[ptr++] = 0; positions[ptr++] = 0;
               } else {
                   // Continue
                   positions[ptr++] = end; positions[ptr++] = seriesData[len-1]; positions[ptr++] = 0;
               }
               
               line.geometry.attributes.position.needsUpdate = true;
               line.geometry.setDrawRange(0, ptr / 3);
               
          } else if (type === 'raw') {
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
              // Aggregated: Area Fill + Perimeter Trace
              line.visible = true;
              mesh.visible = true;
              
              const step = dataChunk.step || 1;
              const binCount = seriesData.length / 2;
              
              // 1. Update MESH (Area Fill) - Stepped Quads
              const meshPos = mesh.geometry.attributes.position.array;
              const meshRange = mesh.geometry.attributes.aRange.array;
              let meshPtr = 0;
              let rangePtr = 0;
              
              for(let j=0; j<binCount; j++) {
                  const x1 = start + j * step;
                  const x2 = start + (j+1) * step;
                  
                  // Use bin values for the whole width [x1, x2]
                  const min = seriesData[j*2];
                  const max = seriesData[j*2+1];
                  const range = max - min;
                  
                  // Quad 1: Top (x1, max) -> (x2, max) -> (x1, min)
                  // Note: To make a full quad we use 2 tris
                  
                  // Tri 1: (x1, max), (x2, max), (x1, min)
                  meshPos[meshPtr++] = x1; meshPos[meshPtr++] = max; meshPos[meshPtr++] = 0;
                  meshRange[rangePtr++] = range;
                  
                  meshPos[meshPtr++] = x2; meshPos[meshPtr++] = max; meshPos[meshPtr++] = 0;
                  meshRange[rangePtr++] = range;
                  
                  meshPos[meshPtr++] = x1; meshPos[meshPtr++] = min; meshPos[meshPtr++] = 0;
                  meshRange[rangePtr++] = range;
                  
                  // Tri 2: (x1, min), (x2, max), (x2, min)
                  meshPos[meshPtr++] = x1; meshPos[meshPtr++] = min; meshPos[meshPtr++] = 0;
                  meshRange[rangePtr++] = range;
                  
                  meshPos[meshPtr++] = x2; meshPos[meshPtr++] = max; meshPos[meshPtr++] = 0;
                  meshRange[rangePtr++] = range;
                  
                  meshPos[meshPtr++] = x2; meshPos[meshPtr++] = min; meshPos[meshPtr++] = 0;
                  meshRange[rangePtr++] = range;
              }
              
              mesh.geometry.attributes.position.needsUpdate = true;
              mesh.geometry.attributes.aRange.needsUpdate = true;
              // Each bin contributes 6 vertices (2 tris) -> binCount * 6
              mesh.geometry.setDrawRange(0, binCount * 6);
              
              // 2. Update LINE (Stepped Outline)
              // We draw: (x, y) -> (x+step, y) for each bin
              // Connections between bins happen automatically via LineStrip
              
              const linePos = line.geometry.attributes.position.array;
              let linePtr = 0;
              
              // Trace Top: (x, max) -> (x+step, max)
              for(let j=0; j<binCount; j++) {
                   const x = start + j * step;
                   const nextX = start + (j+1) * step;
                   const max = seriesData[j*2+1];
                   
                   linePos[linePtr++] = x; linePos[linePtr++] = max; linePos[linePtr++] = 0;
                   linePos[linePtr++] = nextX; linePos[linePtr++] = max; linePos[linePtr++] = 0;
              }
              
              // Trace Bottom (Reverse): (x+step, min) -> (x, min)
              for(let j=binCount-1; j>=0; j--) {
                  const x = start + j * step;
                  const nextX = start + (j+1) * step;
                  const min = seriesData[j*2];
                  
                  linePos[linePtr++] = nextX; linePos[linePtr++] = min; linePos[linePtr++] = 0;
                  linePos[linePtr++] = x; linePos[linePtr++] = min; linePos[linePtr++] = 0;
              }
              
              // Close loop?
              // Connect last point (start, min[0]) to first point (start, max[0])
              linePos[linePtr++] = start;
              linePos[linePtr++] = seriesData[1]; // First Max
              linePos[linePtr++] = 0;
              
              line.geometry.attributes.position.needsUpdate = true;
              // Total points: (binCount * 2 top) + (binCount * 2 bottom) + 1 closure
              line.geometry.setDrawRange(0, binCount * 4 + 1);
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
      this.updateGrid();
      this.renderer.render(this.scene, this.camera);
  }
}
