
import * as THREE from 'three';

export class ThreeMarkers {
    constructor(renderer) {
        this.renderer = renderer;
        this.scene = renderer.scene;
        this.container = renderer.container;
        
        this.markerGroup = new THREE.Group();
        this.scene.add(this.markerGroup);
        
        // Markers have their own label container or share? 
        // Previously shared but cleared by grid.
        // Let's create a dedicated one on top.
        this.labelContainer = document.createElement('div');
        this.labelContainer.style.position = 'absolute';
        this.labelContainer.style.top = '0';
        this.labelContainer.style.left = '0';
        this.labelContainer.style.pointerEvents = 'none';
        this.labelContainer.style.zIndex = '10'; // Above grid/axis labels
        this.container.appendChild(this.labelContainer);
        
        this.markersConfig = [];
    }
    
    setMarkers(markers) {
        this.markersConfig = markers || [];
        this.updateGeometry();
    }
    
    updateGeometry() {
        this.markerGroup.clear();
        this.labelContainer.innerHTML = ''; // Clear old labels if any remain
        
        if (this.markersConfig.length === 0) return;
        
        const Y_TOP = 2000;
        const Y_BOTTOM = -2000;
        
        const mat = new THREE.MeshBasicMaterial({ 
            color: 0x0088ff, 
            transparent: true, 
            opacity: 0.1, 
            side: THREE.DoubleSide,
            depthWrite: false
        });
        const lineMat = new THREE.LineBasicMaterial({
            color: 0x0088ff,
            transparent: true,
            opacity: 0.6
        });

        this.markersConfig.forEach(m => {
            const width = m.end - m.start;
            const center = m.start + width / 2;
            
            // Box
            const planeGeo = new THREE.PlaneGeometry(width, Y_TOP - Y_BOTTOM);
            const mesh = new THREE.Mesh(planeGeo, mat.clone()); // Clone to share but safe
            mesh.position.set(center, 0, -1); 
            mesh.position.z = -5;
            this.markerGroup.add(mesh);
            
            // Vertical Lines
            const points = [
                new THREE.Vector3(m.start, Y_TOP, 0),
                new THREE.Vector3(m.start, Y_BOTTOM, 0),
                new THREE.Vector3(m.end, Y_TOP, 0),
                new THREE.Vector3(m.end, Y_BOTTOM, 0)
            ];
            // Left Line
            const leftGeo = new THREE.BufferGeometry().setFromPoints([points[0], points[1]]);
            const leftLine = new THREE.Line(leftGeo, lineMat.clone());
            leftLine.position.z = -4; 
            this.markerGroup.add(leftLine);
            
            // Right Line
            const rightGeo = new THREE.BufferGeometry().setFromPoints([points[2], points[3]]);
            const rightLine = new THREE.Line(rightGeo, lineMat.clone());
            rightLine.position.z = -4;
            this.markerGroup.add(rightLine);
        });
    }
    
    update(viewport) {
        if (!this.markersConfig || this.markersConfig.length === 0) return;
        
        this.labelContainer.innerHTML = '';
        const { start, end } = viewport.getRange();
        const Y_TOP = 2000;
        
        for(const m of this.markersConfig) {
            // Check visibility
            if (m.end < start || m.start > end) continue;
            
            const center = m.start + (m.end - m.start) / 2;
            const ndc = this.renderer.worldToScreen(center, Y_TOP);
            
            if (!ndc) continue;
            
            const label = document.createElement('div');
            label.style.position = 'absolute';
            label.style.left = ndc.x + 'px';
            label.style.top = '10px'; 
            label.style.transform = 'translateX(-50%)';
            label.style.color = 'rgba(0, 136, 255, 0.8)';
            label.style.fontSize = '12px';
            label.style.fontWeight = 'bold';
            label.style.fontFamily = 'monospace';
            label.style.pointerEvents = 'none';
            label.style.whiteSpace = 'nowrap';
            label.textContent = m.label;
            this.labelContainer.appendChild(label);
        }
    }
    
    destroy() {
        if(this.labelContainer && this.labelContainer.parentNode) {
            this.labelContainer.parentNode.removeChild(this.labelContainer);
        }
        this.markerGroup.clear();
        this.scene.remove(this.markerGroup);
    }
}
