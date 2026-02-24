
import * as THREE from 'three';
import { Renderer } from '../../Renderer';
import { GraphConfig, ViewportRange } from '../../interfaces';

export class ThreeGrid<TConfig extends GraphConfig> {
    private gridLines: THREE.LineSegments;
    private labelContainer: HTMLDivElement;

    constructor(
        private renderer: Renderer<TConfig>,
        private scene: THREE.Scene,
        private container: HTMLElement
    ) {
        // Grid Lines
        const gridGeo = new THREE.BufferGeometry();
        const gridPos = new Float32Array(1000 * 3); // Max 500 lines
        gridGeo.setAttribute('position', new THREE.BufferAttribute(gridPos, 3));
        gridGeo.setDrawRange(0, 0);
        
        const gridMat = new THREE.LineBasicMaterial({ 
            color: 0xffffff, 
            opacity: 0.1, 
            transparent: true 
        });
        
        this.gridLines = new THREE.LineSegments(gridGeo, gridMat);
        this.scene.add(this.gridLines);
        
        // HTML Overlay
        this.labelContainer = document.createElement('div');
        Object.assign(this.labelContainer.style, {
            position: 'absolute',
            top: '0',
            left: '0',
            pointerEvents: 'none',
            color: 'rgba(255,255,255,0.7)',
            fontSize: '11px',
            fontFamily: 'monospace'
        });
        this.container.appendChild(this.labelContainer);
    }
    
    public update(range: ViewportRange, width: number, height: number, camera: THREE.Camera): void {
        const { start, end } = range;
        const Y_MIN = -2000;
        const Y_MAX = 2000;
        
        const yTicks = this.renderer.calculateNiceTicks(Y_MIN, Y_MAX, 8);
        const xTicks = this.renderer.calculateNiceTicks(start, end, 10);
        
        // Update grid lines geometry
        const gridPos = (this.gridLines.geometry.attributes['position'] as THREE.BufferAttribute).array as Float32Array;
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
        
        this.gridLines.geometry.attributes['position'].needsUpdate = true;
        this.gridLines.geometry.setDrawRange(0, ptr / 3);
        
        // Update HTML labels
        this.labelContainer.innerHTML = '';
        
        // Helper for World -> Screen
        const worldToScreen = (x: number, y: number) => {
             const vec = new THREE.Vector3(x, y, 0);
             vec.project(camera);
             const sx = (vec.x + 1) / 2 * width;
             const sy = (-vec.y + 1) / 2 * height;
             if (sx < 0 || sx > width || sy < 0 || sy > height) return null;
             return { x: sx, y: sy };
        };

        // Y-axis labels
        for (const yVal of yTicks) {
            const ndc = worldToScreen(start, yVal);
            if (!ndc) continue;
            
            const label = document.createElement('div');
            Object.assign(label.style, {
                position: 'absolute',
                left: '5px',
                top: `${ndc.y}px`
            });
            label.textContent = this.renderer.formatYLabel(yVal);
            this.labelContainer.appendChild(label);
        }
        
        // X-axis labels
        for (const xVal of xTicks) {
            const ndc = worldToScreen(xVal, Y_MIN);
            if (!ndc) continue;
            
            const label = document.createElement('div');
            Object.assign(label.style, {
                position: 'absolute',
                left: `${ndc.x}px`,
                top: `${height - 15}px`
            });
            label.textContent = Math.floor(xVal).toString();
            this.labelContainer.appendChild(label);
        }
    }
    
    public destroy(): void {
        this.labelContainer.remove();
        this.gridLines.geometry.dispose();
        
        if (Array.isArray(this.gridLines.material)) {
             this.gridLines.material.forEach(m => m.dispose());
        } else {
             this.gridLines.material.dispose();
        }
        
        this.scene.remove(this.gridLines);
    }
}
