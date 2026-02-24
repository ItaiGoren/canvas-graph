
import * as THREE from 'three';
import { MarkerConfig, ViewportRange } from '../../interfaces';

export class ThreeMarkers {
    private markerGroup: THREE.Group;
    private labelContainer: HTMLDivElement;
    private markersConfig: MarkerConfig[] = [];

    constructor(
        private scene: THREE.Scene,
        private container: HTMLElement
    ) {
        this.markerGroup = new THREE.Group();
        this.scene.add(this.markerGroup);
        
        this.labelContainer = document.createElement('div');
        Object.assign(this.labelContainer.style, {
            position: 'absolute',
            top: '0',
            left: '0',
            pointerEvents: 'none',
            zIndex: '10'
        });
        this.container.appendChild(this.labelContainer);
    }
    
    public setMarkers(markers: MarkerConfig[]): void {
        this.markersConfig = markers || [];
        this.updateGeometry();
    }
    
    private updateGeometry(): void {
        this.markerGroup.clear();
        this.labelContainer.innerHTML = ''; 
        
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
            const mesh = new THREE.Mesh(planeGeo, mat.clone()); 
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
    
    public update(
        range: ViewportRange, 
        width: number, 
        height: number, 
        camera: THREE.Camera
    ): void {
        if (!this.markersConfig || this.markersConfig.length === 0) return;
        
        this.labelContainer.innerHTML = '';
        const { start, end } = range;
        const Y_TOP = 2000;
        
        const worldToScreen = (x: number, y: number) => {
             const vec = new THREE.Vector3(x, y, 0);
             vec.project(camera);
             const sx = (vec.x + 1) / 2 * width;
             const sy = (-vec.y + 1) / 2 * height;
             if (sx < 0 || sx > width || sy < 0 || sy > height) return null;
             return { x: sx, y: sy };
        };
        
        for(const m of this.markersConfig) {
            // Check visibility
            if (m.end < start || m.start > end) continue;
            
            const center = m.start + (m.end - m.start) / 2;
            const ndc = worldToScreen(center, Y_TOP);
            
            if (!ndc) continue;
            
            const label = document.createElement('div');
            Object.assign(label.style, {
                position: 'absolute',
                left: `${ndc.x}px`,
                top: '10px',
                transform: 'translateX(-50%)',
                color: 'rgba(0, 136, 255, 0.8)',
                fontSize: '12px',
                fontWeight: 'bold',
                fontFamily: 'monospace',
                pointerEvents: 'none',
                whiteSpace: 'nowrap'
            });
            label.textContent = m.label;
            this.labelContainer.appendChild(label);
        }
    }
    
    public destroy(): void {
        this.labelContainer.remove();
        this.markerGroup.clear();
        this.scene.remove(this.markerGroup);
    }
}
