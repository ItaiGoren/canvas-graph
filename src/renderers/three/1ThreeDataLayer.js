
import * as THREE from 'three';

export class ThreeDataLayer {
    constructor(renderer) {
        this.renderer = renderer;
        this.scene = renderer.scene;
        
        this.group = new THREE.Group();
        this.scene.add(this.group);
        
        this.lines = []; // Pool of THREE.Line
        this.meshes = []; // Pool of THREE.Mesh
        
        // Materials
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
                float volatility = clamp(vRange / uYRange, 0.0, 1.0);
                float pattern = step(0.5, fract(gl_FragCoord.x / 2.0));
                float volatileAlpha = mix(0.2, 1.0, pattern);
                float finalAlpha = mix(1.0, volatileAlpha, volatility);
                gl_FragColor = vec4(uColor, finalAlpha);
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
    
    setLineWidth(width) {
        for(const line of this.lines) {
            line.material.linewidth = width;
        }
    }
    
    ensurePoolSize(count) {
          if (this.lines.length >= count) return;
          
          const currentSize = this.lines.length;
          const needed = count - currentSize;
          
          const maxPoints = 25000; 
          
          for(let i=0; i<needed; i++) {
            const idx = currentSize + i;
            
            // Line Buffer
            const lineGeo = new THREE.BufferGeometry();
            const bufferSize = maxPoints; 
            
            const positions = new Float32Array(bufferSize * 3);
            lineGeo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
            lineGeo.setDrawRange(0, 0);
            
            const line = new THREE.Line(lineGeo, this.lineMaterial.clone());
            line.visible = false;
            // Stagger colors
            line.material.color.setHSL((idx % 100) / 100, 0.8, 0.5); 
            this.lines.push(line);
            this.group.add(line);
            
            // Area Buffer
            const areaGeo = new THREE.BufferGeometry();
            const areaPos = new Float32Array(maxPoints * 6 * 3); 
            areaGeo.setAttribute('position', new THREE.BufferAttribute(areaPos, 3));
            
            const areaRange = new Float32Array(maxPoints * 6); 
            areaGeo.setAttribute('aRange', new THREE.BufferAttribute(areaRange, 1));
            
            const area = new THREE.Mesh(areaGeo, this.areaMaterial.clone());
            area.material = this.areaMaterial.clone();
            area.material.uniforms.uColor.value.setHSL((idx % 100) / 100, 0.8, 0.5);
            
            area.visible = false;
            this.meshes.push(area);
            this.group.add(area);
          }
    }
    
    setData(dataChunk, start, end) {
        if (!dataChunk) return;
        
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
  
            const seriesData = data[i]; 
           
            if (type === 'sparse' || type === 'raw') {
                 // Unified Line Logic
                 line.visible = true;
                 mesh.visible = false;
                 
                 const isSparse = (type === 'sparse');
                 const { x: dataX } = dataChunk;
                 const seriesX = isSparse ? dataX[i] : null; 
                 const len = seriesData.length;
                 
                 if (len === 0) continue;
  
                 const positions = line.geometry.attributes.position.array;
                 let ptr = 0;
                 
                 const gapThreshold = isSparse ? (dataChunk.sampleRate || 100) : Infinity; 
                 const absoluteStart = start; 
  
                 const getX = isSparse 
                      ? (j) => seriesX[j]
                      : (j) => start + j; 
  
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
                 
                 line.geometry.attributes.position.needsUpdate = true;
                 line.geometry.setDrawRange(0, ptr / 3);
                 
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
                    
                    const min = seriesData[j*2];
                    const max = seriesData[j*2+1];
                    const range = max - min;
                    
                    // Tri 1
                    meshPos[meshPtr++] = x1; meshPos[meshPtr++] = max; meshPos[meshPtr++] = 0;
                    meshRange[rangePtr++] = range;
                    meshPos[meshPtr++] = x2; meshPos[meshPtr++] = max; meshPos[meshPtr++] = 0;
                    meshRange[rangePtr++] = range;
                    meshPos[meshPtr++] = x1; meshPos[meshPtr++] = min; meshPos[meshPtr++] = 0;
                    meshRange[rangePtr++] = range;
                    
                    // Tri 2
                    meshPos[meshPtr++] = x1; meshPos[meshPtr++] = min; meshPos[meshPtr++] = 0;
                    meshRange[rangePtr++] = range;
                    meshPos[meshPtr++] = x2; meshPos[meshPtr++] = max; meshPos[meshPtr++] = 0;
                    meshRange[rangePtr++] = range;
                    meshPos[meshPtr++] = x2; meshPos[meshPtr++] = min; meshPos[meshPtr++] = 0;
                    meshRange[rangePtr++] = range;
                }
                
                mesh.geometry.attributes.position.needsUpdate = true;
                mesh.geometry.attributes.aRange.needsUpdate = true;
                mesh.geometry.setDrawRange(0, binCount * 6);
                
                // 2. Update LINE (Stepped Outline)
                const linePos = line.geometry.attributes.position.array;
                let linePtr = 0;
                
                // Trace Top
                for(let j=0; j<binCount; j++) {
                     const x = start + j * step;
                     const nextX = start + (j+1) * step;
                     const max = seriesData[j*2+1];
                     linePos[linePtr++] = x; linePos[linePtr++] = max; linePos[linePtr++] = 0;
                     linePos[linePtr++] = nextX; linePos[linePtr++] = max; linePos[linePtr++] = 0;
                }
                
                // Trace Bottom (Reverse)
                for(let j=binCount-1; j>=0; j--) {
                    const x = start + j * step;
                    const nextX = start + (j+1) * step;
                    const min = seriesData[j*2];
                    linePos[linePtr++] = nextX; linePos[linePtr++] = min; linePos[linePtr++] = 0;
                    linePos[linePtr++] = x; linePos[linePtr++] = min; linePos[linePtr++] = 0;
                }
                
                // Close loop
                linePos[linePtr++] = start;
                linePos[linePtr++] = seriesData[1]; // First Max
                linePos[linePtr++] = 0;
                
                line.geometry.attributes.position.needsUpdate = true;
                line.geometry.setDrawRange(0, binCount * 4 + 1);
            }
        }
    }
    
    destroy() {
         this.group.clear();
         this.lines = [];
         this.meshes = [];
         this.scene.remove(this.group);
    }
}
