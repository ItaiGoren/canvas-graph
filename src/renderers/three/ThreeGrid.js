
import * as THREE from 'three';

export class ThreeGrid {
    constructor(renderer) {
        this.renderer = renderer;
        this.scene = renderer.scene;
        this.container = renderer.container;
        
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
    }
    
    update(viewport) {
        const { start, end } = viewport.getRange();
        const Y_MIN = -2000;
        const Y_MAX = 2000;
        
        const yTicks = this.renderer.calculateNiceTicks(Y_MIN, Y_MAX, 8);
        const xTicks = this.renderer.calculateNiceTicks(start, end, 10);
        
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
            const ndc = this.renderer.worldToScreen(start, yVal);
            if (!ndc) continue;
            
            const label = document.createElement('div');
            label.style.position = 'absolute';
            label.style.left = '5px';
            label.style.top = ndc.y + 'px';
            label.textContent = this.renderer.formatYLabel(yVal);
            this.labelContainer.appendChild(label);
        }
        
        // X-axis labels
        for (const xVal of xTicks) {
            const ndc = this.renderer.worldToScreen(xVal, Y_MIN);
            if (!ndc) continue;
            
            const label = document.createElement('div');
            label.style.position = 'absolute';
            label.style.left = ndc.x + 'px';
            label.style.top = (this.renderer.height - 15) + 'px';
            label.textContent = Math.floor(xVal).toString();
            this.labelContainer.appendChild(label);
        }
    }
    
    destroy() {
        if(this.labelContainer && this.labelContainer.parentNode) {
            this.labelContainer.parentNode.removeChild(this.labelContainer);
        }
        this.gridLines.geometry.dispose();
        this.gridLines.material.dispose();
        this.scene.remove(this.gridLines);
    }
}
