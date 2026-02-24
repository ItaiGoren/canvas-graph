
import { GraphEngine } from './GraphEngine';
import { ViewportRange } from './interfaces';

export enum InteractionMode {
    PAN = 'pan',
    BOX_ZOOM = 'box-zoom',
    X_ZOOM = 'x-zoom' // X-scale only
}

export class InputHandler {
    private isDragging = false;
    private startX = 0;
    private startY = 0;
    private initialRange: ViewportRange | null = null;
    
    // Selection Box Overlay
    private selectionBox: HTMLDivElement;
    
    public mode: InteractionMode = InteractionMode.PAN;

    constructor(
        private container: HTMLElement,
        private engine: GraphEngine<any>
    ) {
        // Selection Box Element
        this.selectionBox = document.createElement('div');
        Object.assign(this.selectionBox.style, {
            position: 'absolute',
            border: '1px solid rgba(0, 120, 215, 0.8)',
            backgroundColor: 'rgba(0, 120, 215, 0.2)',
            pointerEvents: 'none',
            display: 'none',
            zIndex: '100'
        });
        this.container.appendChild(this.selectionBox);

        this.bindEvents();
    }
    
    private bindEvents(): void {
        this.container.addEventListener('mousedown', this.onMouseDown.bind(this));
        window.addEventListener('mousemove', this.onMouseMove.bind(this));
        window.addEventListener('mouseup', this.onMouseUp.bind(this));
        this.container.addEventListener('wheel', this.onWheel.bind(this), { passive: false });
    }
    
    private getPoint(e: MouseEvent) {
        const rect = this.container.getBoundingClientRect();
        return {
            x: e.clientX - rect.left,
            y: e.clientY - rect.top,
            imgW: rect.width,
            imgH: rect.height
        };
    }

    // --- Mouse Down ---
    private onMouseDown(e: MouseEvent): void {
        this.isDragging = true;
        const p = this.getPoint(e);
        this.startX = p.x;
        this.startY = p.y;
        this.initialRange = { ...this.engine.range$.getValue() };
        
        if (this.mode === InteractionMode.BOX_ZOOM) {
            this.selectionBox.style.display = 'block';
            this.updateSelectionBox(p.x, p.y, 0, 0);
        }
    }
    
    // --- Mouse Move ---
    private onMouseMove(e: MouseEvent): void {
        if (!this.isDragging || !this.initialRange) return;
        const p = this.getPoint(e);
        const dx = p.x - this.startX;
        const dy = p.y - this.startY; // positive down

        if (this.mode === InteractionMode.PAN) {
            // Calculate scale
            const currentRange = this.engine.range$.getValue();
            const xRange = this.initialRange.end - this.initialRange.start;
            
            // X Pan
            const unitsPerPixelX = xRange / p.imgW;
            const newStart = this.initialRange.start - dx * unitsPerPixelX;
            const newEnd = this.initialRange.end - dx * unitsPerPixelX;
            
            // Y Pan
            const yStart = this.initialRange.yStart ?? -2000;
            const yEnd = this.initialRange.yEnd ?? 2000;
            const yRange = yEnd - yStart;
            
            // ThreeJS: Y is up, Screen Y is down. dy > 0 (down) -> should mean moving UP in world?
            // Dragging down moves view UP (camera moves down, so world moves up)
            // Wait, dragging world. Dragging Mouse Down -> map moves Down.
            // If I drag mouse down, I want to see what's above? No, standard pan: drag down -> view moves up (y increases).
            // Actually standard map: Drag Down -> Map moves Down. Camera moves Up.
            const unitsPerPixelY = yRange / p.imgH;
            const newYStart = yStart + dy * unitsPerPixelY; 
            const newYEnd = yEnd + dy * unitsPerPixelY;

            this.engine.setRange(newStart, newEnd);
            // We need setYRange or update range object
            this.engine.range$.next({
                start: newStart,
                end: newEnd,
                yStart: newYStart,
                yEnd: newYEnd
            });
            
        } else if (this.mode === InteractionMode.BOX_ZOOM) {
            this.updateSelectionBox(this.startX, this.startY, dx, dy);
        }
    }
    
    // --- Mouse Up ---
    private onMouseUp(e: MouseEvent): void {
        if (!this.isDragging) return;
        this.isDragging = false;
        
        if (this.mode === InteractionMode.BOX_ZOOM) {
            this.selectionBox.style.display = 'none';
            
            const p = this.getPoint(e);
            
            // Threshold Check
            if (Math.abs(p.x - this.startX) < 5 && Math.abs(p.y - this.startY) < 5) return;
            
            // Calculate new range
            const currentRange = this.engine.range$.getValue();
            // Need current Y range too. If undefined, assume default?
            const curYStart = currentRange.yStart ?? -2000;
            const curYEnd = currentRange.yEnd ?? 2000;
            
            const xRange = currentRange.end - currentRange.start;
            const yRange = curYEnd - curYStart;
            
            // Screen coords (0,0) is top-left
            const x1 = Math.min(this.startX, p.x);
            const x2 = Math.max(this.startX, p.x);
            const y1 = Math.min(this.startY, p.y); // Top pixel
            const y2 = Math.max(this.startY, p.y); // Bottom pixel
            
            const leftRatio = x1 / p.imgW;
            const rightRatio = x2 / p.imgW;
            
            // Y: 0 is Top (Max Y World), imgH is Bottom (Min Y World)
            const topRatio = y1 / p.imgH;
            const bottomRatio = y2 / p.imgH;
            
            const newStart = currentRange.start + leftRatio * xRange;
            const newEnd = currentRange.start + rightRatio * xRange;
            
            // Y is inverted in screen vs world
            // Screen Top (0) -> World Max
            // Screen Bottom -> World Min
            // newMax = curMax - topRatio * range
            // newMin = curMax - bottomRatio * range
            
            const newYEnd = curYEnd - topRatio * yRange;
            const newYStart = curYEnd - bottomRatio * yRange;
            
            this.engine.range$.next({
                start: newStart,
                end: newEnd,
                yStart: newYStart,
                yEnd: newYEnd
            });
        }
    }
    
    // --- Wheel ---
    private onWheel(e: WheelEvent): void {
        e.preventDefault();
        const p = this.getPoint(e);
        const currentRange = this.engine.range$.getValue();
        const xRange = currentRange.end - currentRange.start;
        const zoomFactor = 1 + (e.deltaY * 0.001);
        const pivotRatio = p.x / p.imgW;
        const pivotX = currentRange.start + pivotRatio * xRange;
        let newRange = xRange * zoomFactor;
        
        // Clamp newRange (don't zoom in too far, don't zoom out too far)
        const MAX_TOTAL_RANGE = 2000000; // 2M
        const MIN_TOTAL_RANGE = 10;
        
        if (newRange > MAX_TOTAL_RANGE) newRange = MAX_TOTAL_RANGE;
        if (newRange < MIN_TOTAL_RANGE) newRange = MIN_TOTAL_RANGE;
        
        let newStart = pivotX - pivotRatio * newRange;
        let newEnd = pivotX + (1 - pivotRatio) * newRange;
        
        // Clamp positions to stay somewhat near the data (0 to 1M)
        const DATA_LIMIT_MIN = -500000;
        const DATA_LIMIT_MAX = 1500000;
        
        if (newStart < DATA_LIMIT_MIN) {
            newStart = DATA_LIMIT_MIN;
            newEnd = newStart + newRange;
        }
        if (newEnd > DATA_LIMIT_MAX) {
            newEnd = DATA_LIMIT_MAX;
            newStart = newEnd - newRange;
        }

        this.engine.range$.next({
            ...currentRange,
            start: newStart,
            end: newEnd
        });
    }

    private updateSelectionBox(x: number, y: number, w: number, h: number): void {
        const left = w < 0 ? x + w : x;
        const top = h < 0 ? y + h : y;
        const width = Math.abs(w);
        const height = Math.abs(h);
        
        this.selectionBox.style.left = `${left}px`;
        this.selectionBox.style.top = `${top}px`;
        this.selectionBox.style.width = `${width}px`;
        this.selectionBox.style.height = `${height}px`;
    }
    
    public setMode(mode: InteractionMode): void {
        this.mode = mode;
        this.container.style.cursor = mode === InteractionMode.PAN ? 'grab' : 'crosshair';
    }
    
    public destroy(): void {
        this.selectionBox.remove();
        // Remove listeners (needed if we want clean cleanup, but for now ignoring)
    }
}
