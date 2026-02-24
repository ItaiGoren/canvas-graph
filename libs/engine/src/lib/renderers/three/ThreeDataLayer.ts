
import * as THREE from 'three';
import { DataChunk } from '../../interfaces';

export class ThreeDataLayer {
    private group: THREE.Group;
    private lines: THREE.Line[] = [];
    private meshes: THREE.Mesh[] = [];
    private lineMaterial: THREE.LineBasicMaterial;
    private areaMaterial: THREE.ShaderMaterial;
    
    private readonly MAX_POINTS = 25000;

    constructor(
        private scene: THREE.Scene
    ) {
        this.group = new THREE.Group();
        this.scene.add(this.group);
        
        // Materials
        this.lineMaterial = new THREE.LineBasicMaterial({ 
            color: 0x00ff00, 
            transparent: true, 
            opacity: 0.8 
        });
        
        // Volatility Shader
        const vertexShader = `
            attribute float aRange;
            attribute float aAlphaMult;
            varying float vRange;
            varying float vAlphaMult;
            void main() {
                vRange = aRange;
                vAlphaMult = aAlphaMult;
                gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
            }
        `;
        
        const fragmentShader = `
            uniform vec3 uColor;
            uniform float uYRange;
            varying float vRange;
            varying float vAlphaMult;
            void main() {
                float volatility = clamp(vRange / uYRange, 0.0, 1.0);
                float pattern = step(0.5, fract(gl_FragCoord.x / 2.0));
                float volatileAlpha = mix(0.2, 1.0, pattern);
                float finalAlpha = mix(1.0, volatileAlpha, volatility);
                gl_FragColor = vec4(uColor, finalAlpha * vAlphaMult);
            }
        `;
    
        this.areaMaterial = new THREE.ShaderMaterial({
            uniforms: {
                uColor: { value: new THREE.Color(0x00ff00) },
                uYRange: { value: 4000 } 
            },
            vertexShader,
            fragmentShader,
            side: THREE.DoubleSide,
            transparent: true
        });
        
        this.ensurePoolSize(100);
    }
    
    public setLineWidth(width: number): void {
        for(const line of this.lines) {
            (line.material as THREE.LineBasicMaterial).linewidth = width;
        }
    }
    
    private ensurePoolSize(count: number): void {
          if (this.lines.length >= count) return;
          
          const currentSize = this.lines.length;
          const needed = count - currentSize;
          
          for(let i=0; i<needed; i++) {
            const idx = currentSize + i;
            
            // Line Buffer
            const lineGeo = new THREE.BufferGeometry();
            const positions = new Float32Array(this.MAX_POINTS * 3);
            lineGeo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
            lineGeo.setDrawRange(0, 0);
            
            const line = new THREE.Line(lineGeo, this.lineMaterial.clone());
            line.visible = false;
            (line.material as THREE.LineBasicMaterial).color.setHSL((idx % 100) / 100, 0.8, 0.5);
            this.lines.push(line);
            this.group.add(line);
            
            // Area Buffer
            const areaGeo = new THREE.BufferGeometry();
            const areaPos = new Float32Array(this.MAX_POINTS * 6 * 3); 
            areaGeo.setAttribute('position', new THREE.BufferAttribute(areaPos, 3));
            
            const areaRange = new Float32Array(this.MAX_POINTS * 6); 
            areaGeo.setAttribute('aRange', new THREE.BufferAttribute(areaRange, 1));
            
            const areaAlphaMult = new Float32Array(this.MAX_POINTS * 6);
            areaGeo.setAttribute('aAlphaMult', new THREE.BufferAttribute(areaAlphaMult, 1));
            
            const area = new THREE.Mesh(areaGeo, this.areaMaterial.clone());
            // Clone uniforms for unique color per mesh
            area.material = this.areaMaterial.clone();
            (area.material as THREE.ShaderMaterial).uniforms['uColor'].value.setHSL((idx % 100) / 100, 0.8, 0.5);
            
            area.visible = false;
            this.meshes.push(area);
            this.group.add(area);
          }
    }
    
    public setData<TData>(dataChunk: DataChunk<TData>, start: number, end: number): void {
        const { type, data } = dataChunk;
        this.ensurePoolSize(data.length);
        
        for(let i=0; i<this.lines.length; i++) {
            const line = this.lines[i];
            const mesh = this.meshes[i];
  
            if (i >= data.length) {
                line.visible = false;
                mesh.visible = false;
                continue;
            }
  
            const seriesData = data[i] as unknown as Float32Array; // Assume Float32Array for now or handle generic TData mapping?
            // Since TData is generic, we need to know how to read it. 
            // For this implementation, let's assume TData is number-like or we cast it to array-like access.
            // Safe assumption for graph engine: Float32Array or number[]
           
            if (type === 'sparse' || type === 'raw') {
                 // Unified Line Logic
                 line.visible = true;
                 mesh.visible = false;
                 
                 const isSparse = (type === 'sparse');
                 // For sparse, we need X data. In the previous JS, dataChunk had `.x` ?
                 // The DataChunk interface defined in previous steps has `data: TData[]`.
                 // It doesn't explicitly have `x` array if user provides separate X.
                 // In JS `setData`: `const { x: dataX } = dataChunk;`
                 // I should update Interface or cast `dataChunk` to `any` to access extra properties not strictly typed in base interface?
                 // Or add `x?: Float64Array[]` to DataChunk interface.
                 // I'll cast for now.
                 
                 const extraChunk = dataChunk as any;
                 const seriesX = isSparse ? extraChunk.x[i] : null; 
                 const len = seriesData.length;
                 
                 if (len === 0) continue;
  
                 const positions = (line.geometry.attributes['position'] as THREE.BufferAttribute).array as Float32Array;
                 let ptr = 0;
                 
                 const gapThreshold = isSparse ? (dataChunk.sampleRate || 100) : Infinity; 
                 const absoluteStart = start; 
  
                 const getX = isSparse 
                      ? (j: number) => seriesX[j]
                      : (j: number) => start + j; 
  
                 // Edge Heuristic: Start
                 const firstX = getX(0);
                 const distToStart = firstX - absoluteStart;
                 
                 if (distToStart > gapThreshold) {
                     positions[ptr++] = absoluteStart; positions[ptr++] = 0; positions[ptr++] = 0;
                     positions[ptr++] = firstX; positions[ptr++] = 0; positions[ptr++] = 0;
                 } else {
                     positions[ptr++] = absoluteStart; positions[ptr++] = seriesData[0]; positions[ptr++] = 0;
                 }
                 
                 positions[ptr++] = firstX; positions[ptr++] = seriesData[0]; positions[ptr++] = 0;
                 
                 for(let j=1; j<len; j++) {
                     const t = getX(j);
                     const prevT = getX(j-1);
                     const dt = t - prevT;
                     const val = seriesData[j];
                     
                     if (dt > gapThreshold) {
                         // Gap!
                         const prevAx = prevT; 
                         positions[ptr++] = prevAx; positions[ptr++] = 0; positions[ptr++] = 0;
                         positions[ptr++] = t; positions[ptr++] = 0; positions[ptr++] = 0;
                         positions[ptr++] = t; positions[ptr++] = val; positions[ptr++] = 0;
                     } else {
                         positions[ptr++] = t; positions[ptr++] = val; positions[ptr++] = 0;
                     }
                 }
                 
                 // Edge Heuristic: End
                 const lastX = getX(len-1);
                 const distToEnd = end - lastX;
                 if (distToEnd > gapThreshold) {
                     positions[ptr++] = lastX; positions[ptr++] = 0; positions[ptr++] = 0;
                     positions[ptr++] = end; positions[ptr++] = 0; positions[ptr++] = 0;
                 } else {
                     positions[ptr++] = end; positions[ptr++] = seriesData[len-1]; positions[ptr++] = 0;
                 }
                 
                 line.geometry.attributes['position'].needsUpdate = true;
                 line.geometry.setDrawRange(0, ptr / 3);
                 
            } else {
                // Aggregated
                line.visible = true;
                mesh.visible = true;
                
                const step = dataChunk.step || 1;
                const binCount = seriesData.length / 2;
                
                // 1. Update MESH (Area Fill)
                const meshPos = (mesh.geometry.attributes['position'] as THREE.BufferAttribute).array as Float32Array;
                const meshRange = (mesh.geometry.attributes['aRange'] as THREE.BufferAttribute).array as Float32Array;
                const meshAlphaMult = (mesh.geometry.attributes['aAlphaMult'] as THREE.BufferAttribute).array as Float32Array;
                let meshPtr = 0;
                let rangePtr = 0;
                
                for(let j=0; j<binCount; j++) {
                    const x1 = start + j * step;
                    const x2 = start + (j+1) * step;
                    
                    const min = seriesData[j*2];
                    const max = seriesData[j*2+1];
                    const range = max - min;
                    
                    // Tri 1
                    meshPos[meshPtr++] = x1; meshPos[meshPtr++] = max; meshPos[meshPtr++] = 0;
                    meshAlphaMult[rangePtr] = 1.0; meshRange[rangePtr++] = range;
                    meshPos[meshPtr++] = x2; meshPos[meshPtr++] = max; meshPos[meshPtr++] = 0;
                    meshAlphaMult[rangePtr] = 1.0; meshRange[rangePtr++] = range;
                    meshPos[meshPtr++] = x1; meshPos[meshPtr++] = min; meshPos[meshPtr++] = 0;
                    meshAlphaMult[rangePtr] = 0.5; meshRange[rangePtr++] = range;
                    
                    // Tri 2
                    meshPos[meshPtr++] = x1; meshPos[meshPtr++] = min; meshPos[meshPtr++] = 0;
                    meshAlphaMult[rangePtr] = 0.5; meshRange[rangePtr++] = range;
                    meshPos[meshPtr++] = x2; meshPos[meshPtr++] = max; meshPos[meshPtr++] = 0;
                    meshAlphaMult[rangePtr] = 1.0; meshRange[rangePtr++] = range;
                    meshPos[meshPtr++] = x2; meshPos[meshPtr++] = min; meshPos[meshPtr++] = 0;
                    meshAlphaMult[rangePtr] = 0.5; meshRange[rangePtr++] = range;
                }
                
                mesh.geometry.attributes['position'].needsUpdate = true;
                mesh.geometry.attributes['aRange'].needsUpdate = true;
                mesh.geometry.attributes['aAlphaMult'].needsUpdate = true;
                mesh.geometry.setDrawRange(0, binCount * 6);
                
                // 2. Update LINE
                const linePos = (line.geometry.attributes['position'] as THREE.BufferAttribute).array as Float32Array;
                let linePtr = 0;
                
                // Trace Top
                for(let j=0; j<binCount; j++) {
                     const x = start + j * step;
                     const nextX = start + (j+1) * step;
                     const max = seriesData[j*2+1];
                     linePos[linePtr++] = x; linePos[linePtr++] = max; linePos[linePtr++] = 0;
                     linePos[linePtr++] = nextX; linePos[linePtr++] = max; linePos[linePtr++] = 0;
                }
                
                // Trace Bottom
                for(let j=binCount-1; j>=0; j--) {
                    const x = start + j * step;
                    const nextX = start + (j+1) * step;
                    const min = seriesData[j*2];
                    linePos[linePtr++] = nextX; linePos[linePtr++] = min; linePos[linePtr++] = 0;
                    linePos[linePtr++] = x; linePos[linePtr++] = min; linePos[linePtr++] = 0;
                }
                
                // Close loop
                linePos[linePtr++] = start;
                linePos[linePtr++] = seriesData[1]; 
                linePos[linePtr++] = 0;
                
                line.geometry.attributes['position'].needsUpdate = true;
                line.geometry.setDrawRange(0, binCount * 4 + 1);
            }
        }
    }
    
    public destroy(): void {
         this.group.clear();
         this.lines = [];
         this.meshes = [];
         this.scene.remove(this.group);
    }
}
