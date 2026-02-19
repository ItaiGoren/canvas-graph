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
      // Logic handled in render or setData via camera properties?
      // Actually, we want the camera to map exactly to the data coordinates:
      // X: viewport.start to viewport.end
      // Y: -500 to 500 (approx random walk range)
      
      // X: 0 to (end-start) [Relative Mode]
      // Y: -500 to 500 (approx random walk range)
      
      const { start, end } = this.viewport.getRange();
      this.camera.left = 0; // Relative start
      this.camera.right = end - start; // Relative width
      // We need a fixed Y scale or dynamic? Fixed for now.
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
          gridPos[ptr++] = 0; gridPos[ptr++] = yVal; gridPos[ptr++] = 0;
          gridPos[ptr++] = end - start; gridPos[ptr++] = yVal; gridPos[ptr++] = 0;
      }
      
      // X-axis lines (vertical)
      for (const xVal of xTicks) {
          const rx = xVal - start;
          gridPos[ptr++] = rx; gridPos[ptr++] = Y_MIN; gridPos[ptr++] = 0;
          gridPos[ptr++] = rx; gridPos[ptr++] = Y_MAX; gridPos[ptr++] = 0;
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
               
               const gapThreshold = 100; // ms
               const relativeStart = start; // Subtract this from X to keep precision
               
               // Edge Heuristic: Start
               const firstX = seriesX[0];
               const distToStart = firstX - start;
               
               if (distToStart > gapThreshold) {
                   // Gap at start -> Start at (0 relative, 0) then (firstX relative, 0)
                   positions[ptr++] = 0; positions[ptr++] = 0; positions[ptr++] = 0;
                   positions[ptr++] = firstX - relativeStart; positions[ptr++] = 0; positions[ptr++] = 0;
               } else {
                   // Continuity -> Start at (0 relative, firstY)
                   positions[ptr++] = 0; positions[ptr++] = seriesData[0]; positions[ptr++] = 0;
               }
               
               positions[ptr++] = firstX - relativeStart; positions[ptr++] = seriesData[0]; positions[ptr++] = 0;
               
               for(let j=1; j<len; j++) {
                   const t = seriesX[j];
                   const prevT = seriesX[j-1];
                   const dt = t - prevT;
                   const val = seriesData[j];
                   
                   const rx = t - relativeStart;
                   
                   if (dt > gapThreshold) {
                       // Gap!
                       const prevRx = prevT - relativeStart;
                       // Drop to zero
                       positions[ptr++] = prevRx; positions[ptr++] = 0; positions[ptr++] = 0;
                       positions[ptr++] = rx; positions[ptr++] = 0; positions[ptr++] = 0;
                       positions[ptr++] = rx; positions[ptr++] = val; positions[ptr++] = 0;
                   } else {
                       positions[ptr++] = rx; positions[ptr++] = val; positions[ptr++] = 0;
                   }
               }
               
               // Edge Heuristic: End
               const lastX = seriesX[len-1];
               const distToEnd = end - lastX;
               if (distToEnd > gapThreshold) {
                   // Drop to zero at end
                   positions[ptr++] = lastX - relativeStart; positions[ptr++] = 0; positions[ptr++] = 0;
                   positions[ptr++] = end - relativeStart; positions[ptr++] = 0; positions[ptr++] = 0;
               } else {
                   // Continue
                   positions[ptr++] = end - relativeStart; positions[ptr++] = seriesData[len-1]; positions[ptr++] = 0;
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
                  // Relative X
                  positions[ptr++] = x - start; positions[ptr++] = y; positions[ptr++] = 0;
              }
              
              line.geometry.attributes.position.needsUpdate = true;
              line.geometry.setDrawRange(0, seriesLen);
              
          } else {
              // Aggregated: Area Fill + Perimeter Trace
              line.visible = true;
              mesh.visible = true;
              
              const step = dataChunk.step || 1;
              const binCount = seriesData.length / 2;
              
              // 1. Update MESH (Area Fill)
              const meshPos = mesh.geometry.attributes.position.array;
              const meshRange = mesh.geometry.attributes.aRange.array;
              let meshPtr = 0;
              let rangePtr = 0;
              
              for(let j=0; j<binCount - 1; j++) {
                  const x1 = start + j * step;
                  const x2 = start + (j+1) * step;
                  
                  // Relative X
                  const rx1 = x1 - start;
                  const rx2 = x2 - start;
                  
                  const min1 = seriesData[j*2];
                  const max1 = seriesData[j*2+1];
                  const range1 = max1 - min1;
                  
                  const min2 = seriesData[(j+1)*2];
                  const max2 = seriesData[(j+1)*2+1];
                  const range2 = max2 - min2;
                  
                  // Tri 1: (x1, max1), (x2, max2), (x1, min1)
                  meshPos[meshPtr++] = rx1; meshPos[meshPtr++] = max1; meshPos[meshPtr++] = 0;
                  meshRange[rangePtr++] = range1;
                  
                  meshPos[meshPtr++] = rx2; meshPos[meshPtr++] = max2; meshPos[meshPtr++] = 0;
                  meshRange[rangePtr++] = range2;
                  
                  meshPos[meshPtr++] = rx1; meshPos[meshPtr++] = min1; meshPos[meshPtr++] = 0;
                  meshRange[rangePtr++] = range1;
                  
                  // Tri 2: (x1, min1), (x2, max2), (x2, min2)
                  meshPos[meshPtr++] = rx1; meshPos[meshPtr++] = min1; meshPos[meshPtr++] = 0;
                  meshRange[rangePtr++] = range1;
                  
                  meshPos[meshPtr++] = rx2; meshPos[meshPtr++] = max2; meshPos[meshPtr++] = 0;
                  meshRange[rangePtr++] = range2;
                  
                  meshPos[meshPtr++] = rx2; meshPos[meshPtr++] = min2; meshPos[meshPtr++] = 0;
                  meshRange[rangePtr++] = range2;
              }
              
              mesh.geometry.attributes.position.needsUpdate = true;
              mesh.geometry.attributes.aRange.needsUpdate = true;
              mesh.geometry.setDrawRange(0, (binCount - 1) * 6);
              
              // 2. Update LINE (Perimeter Trace for 1px crispness)
              const linePos = line.geometry.attributes.position.array;
              let linePtr = 0;
              
              // Trace Top: (x, max)
              for(let j=0; j<binCount; j++) {
                   const x = start + j * step;
                   const rx = x - start;
                   const max = seriesData[j*2+1];
                   linePos[linePtr++] = rx; linePos[linePtr++] = max; linePos[linePtr++] = 0;
              }
              
              // Trace Bottom (Reverse): (x, min)
              for(let j=binCount-1; j>=0; j--) {
                  const x = start + j * step;
                  const rx = x - start;
                  const min = seriesData[j*2];
                  linePos[linePtr++] = rx; linePos[linePtr++] = min; linePos[linePtr++] = 0;
              }
              
              // Close loop?
              linePos[linePtr++] = 0; // Relative start
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
      this.updateGrid();
      this.renderer.render(this.scene, this.camera);
  }
}
