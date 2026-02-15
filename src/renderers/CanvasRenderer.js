import { Renderer } from './Renderer.js';

export class CanvasRenderer extends Renderer {
  constructor(container, viewport) {
    super(container, viewport);
    
    this.canvas = document.createElement('canvas');
    this.canvas.width = this.width;
    this.canvas.height = this.height;
    this.canvas.style.width = '100%';
    this.canvas.style.height = '100%';
    this.container.appendChild(this.canvas);
    this.ctx = this.canvas.getContext('2d', { alpha: false });
    
    // Cache for interaction
    this.cacheCanvas = document.createElement('canvas');
    this.cacheCanvas.width = this.width;
    this.cacheCanvas.height = this.height;
    this.cacheCtx = this.cacheCanvas.getContext('2d', { alpha: false });
    
    this.lastRenderedState = { start: -1, end: -1 };
    this.isCached = false;
    
    // Data Store
    this.currentData = null;
    
    this.colors = [];
    for(let i=0; i<100; i++) {
        this.colors.push(`hsl(${Math.floor(i/100 * 360)}, 80%, 50%)`);
    }
  }

  resize(width, height) {
    super.resize(width, height);
    this.canvas.width = width;
    this.canvas.height = height;
    this.cacheCanvas.width = width;
    this.cacheCanvas.height = height;
    this.isCached = false;
  }

  setData(dataChunk) {
    this.currentData = dataChunk;
    this.isCached = false; // Invalidate cache
  }
  
  // Capture current high-quality render to cache
  capture() {
      if (this.isCached) return;
      this.cacheCtx.drawImage(this.canvas, 0, 0);
      this.lastRenderedState = { ...this.viewport.getRange() };
      this.isCached = true;
  }
  
  // Helper: Calculate nice tick values
  calculateNiceTicks(min, max, targetCount = 8) {
      const range = max - min;
      if (range === 0) return [min];
      
      // Find a "nice" step size
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
  
  // Helper: Format Y-axis labels
  formatYLabel(value) {
      const abs = Math.abs(value);
      if (abs >= 1e6) return (value / 1e6).toFixed(1) + 'M';
      if (abs >= 1e3) return (value / 1e3).toFixed(1) + 'K';
      return value.toFixed(0);
  }
  
  // Draw grid and axis labels
  drawGrid(toX, toY, width, height, start, end) {
      const Y_MIN = -2000;
      const Y_MAX = 2000;
      
      // Calculate ticks
      const yTicks = this.calculateNiceTicks(Y_MIN, Y_MAX, 8);
      const xTicks = this.calculateNiceTicks(start, end, 10);
      
      this.ctx.save();
      this.ctx.strokeStyle = 'rgba(255, 255, 255, 0.1)';
      this.ctx.fillStyle = 'rgba(255, 255, 255, 0.7)';
      this.ctx.font = '11px monospace';
      this.ctx.lineWidth = 1;
      
      // Draw Y-axis grid and labels
      for (const yVal of yTicks) {
          const y = toY(yVal);
          if (y < 0 || y > height) continue;
          
          // Grid line
          this.ctx.beginPath();
          this.ctx.moveTo(0, y);
          this.ctx.lineTo(width, y);
          this.ctx.stroke();
          
          // Label
          const label = this.formatYLabel(yVal);
          this.ctx.fillText(label, 5, y - 3);
      }
      
      // Draw X-axis grid and labels
      for (const xVal of xTicks) {
          const x = toX(xVal);
          if (x < 0 || x > width) continue;
          
          // Grid line
          this.ctx.beginPath();
          this.ctx.moveTo(x, 0);
          this.ctx.lineTo(x, height);
          this.ctx.stroke();
          
          // Label
          const label = Math.floor(xVal).toString();
          this.ctx.fillText(label, x + 2, height - 5);
      }
      
      this.ctx.restore();
  }

  // Fast render using cache
  renderInteraction() {
      if (!this.isCached) return; // Fallback?

      const { start, end } = this.viewport.getRange();
      const oldStart = this.lastRenderedState.start;
      const oldEnd = this.lastRenderedState.end;
      const oldRange = oldEnd - oldStart;
      const newRange = end - start;
      
      // Calculate Transform
      // Scale = oldRange / newRange
      // Translate X.
      
      const scaleX = oldRange / newRange;
      // We want to map oldStart to newStart relative to screen?
      // actually, we simply want to project the cached image onto the new viewport.
      
      // The cached image covers [oldStart, oldEnd] -> [0, width]
      // The new viewport is [start, end] -> [0, width]
      
      // Where does the cached image start in the new coordinate system?
      // x = (value - start) / (end - start) * width
      
      // limit left: x_oldStart = (oldStart - start) / newRange * width
      // width: w_new = (oldRange / newRange) * width
      
      const x = (oldStart - start) / newRange * this.width;
      const w = (oldRange / newRange) * this.width;
      
      this.ctx.fillStyle = '#222';
      this.ctx.fillRect(0, 0, this.width, this.height);
      
      this.ctx.drawImage(this.cacheCanvas, 0, 0, this.width, this.height, x, 0, w, this.height);
  }

  render() {
      this.isCached = false;
      const { width, height } = this;
      const { start, end } = this.viewport.getRange();
      const range = end - start;
      
      // Clear
      this.ctx.fillStyle = '#222';
      this.ctx.fillRect(0, 0, width, height);
      
      if (!this.currentData) return;
      
      const { data, type, step } = this.currentData;
      
      // Transform Helper
      // x = (val - start) / range * width
      // y = (val - min) / (max - min) * height ... (inverted)
      // data y range is approx -2000 to 2000
      const Y_MIN = -2000;
      const Y_MAX = 2000;
      const Y_RANGE = 4000;
      
      const toX = (v) => (v - start) / range * width;
      const toY = (v) => height - ((v - Y_MIN) / Y_RANGE * height);
      
      // Draw grid first (behind data)
      this.drawGrid(toX, toY, width, height, start, end);
      
      this.ctx.lineWidth = 1;
      
      for(let i=0; i<data.length; i++) {
          const series = data[i];
          this.ctx.strokeStyle = this.colors[i];
          this.ctx.fillStyle = this.colors[i]; // for area
          this.ctx.globalAlpha = type === 'aggregated' ? 0.5 : 1.0;
          this.ctx.beginPath();
          
          if (type === 'raw') {
              // Raw Line
              // Optimized loop
              // We should only draw points within bounds (logic handled by core data fetcher essentially, 
              // but we have start/end logic here too if data is wider than viewport)
              
              const len = series.length;
              const dataStart = this.currentData.start; 
              
              this.ctx.beginPath();
              this.ctx.lineWidth = 1; // Strict 1px
              
              // Softening (less crisp)
              this.ctx.lineJoin = 'round';
              this.ctx.lineCap = 'round';
              
              let first = true;
              
              for(let j=0; j<len; j++) {
                  const globalIdx = dataStart + j;
                  // Simple Cull
                  if (globalIdx < start - range || globalIdx > end + range) continue; 
                  
                  const px = toX(globalIdx);
                  const py = toY(series[j]);
                  
                  if (first) {
                      this.ctx.moveTo(px, py);
                      first = false;
                  } else {
                      this.ctx.lineTo(px, py);
                  }
              }
              this.ctx.stroke();
              
          } else {
              // Aggregated (Area/Bar)
              // series = [min, max, min, max...]
              // step = bins size
              const binCount = series.length / 2;
              const dataStart = this.currentData.start;
              const chunkStep = step || 1;
              
              // Draw as a path? Or rects?
              // Area polygon is nicer.
              // Top line, then bottom line reversed.
              
              // Draw top line
              // Move to first
              let first = true;
              
              // Helper to get screen Y with min-height enforcement
              // We need to do this per-bin?
              // Only affects 'Area' filling.
              
              const pixelHeight = this.lineWidth || 1; 
              
              for(let j=0; j<binCount; j++) {
                  const globalIdx = dataStart + j * chunkStep;
                  const x = toX(globalIdx + chunkStep/2); 
                  
                  let min = series[j*2];
                  let max = series[j*2+1];
                  
                  // Convert to screen pixels to check difference
                  // toY inverts: 0 is top, height is bottom.
                  let yMin = toY(min);
                  let yMax = toY(max);
                  
                  // yMin is physically "lower" on screen (higher value) than yMax if min < max?
                  // toY(-2000) = height (bottom). toY(2000) = 0 (top).
                  // So yMin (value -2000) is e.g. 300. yMax (value 2000) is 0.
                  // yMin > yMax.
                  
                  if (Math.abs(yMin - yMax) < pixelHeight) {
                      // Center it?
                      const center = (yMin + yMax) / 2;
                      yMin = center + 0.5;
                      yMax = center - 0.5;
                  }
                  
                  // We need to keep consistency for the "Top Line" and "Bottom Line" loops.
                  // This is tricky because we have two loops...
                  // Better to iterate and build a path set?
                  // Or just store the computed screen points?
              }
              
              
              
              // Re-approach: Build two arrays of points first
              const topPoints = [];
              const bottomPoints = [];
              
              for(let j=0; j<binCount; j++) {
                  const globalIdx = dataStart + j * chunkStep;
                  const x = toX(globalIdx + chunkStep/2);
                  const minVal = series[j*2];
                  const maxVal = series[j*2+1];
                  
                  let pyMin = toY(minVal); // Higher pixel value (bottom)
                  let pyMax = toY(maxVal); // Lower pixel value (top)
                  
                  if (pyMin - pyMax < 1) {
                      const mid = (pyMin + pyMax) / 2;
                      pyMin = mid + 0.5;
                      pyMax = mid - 0.5;
                  }
                  
                  topPoints.push(x, pyMax);
                  bottomPoints.push(x, pyMin);
              }
              
              this.ctx.beginPath();
              
              // Trace Top
              this.ctx.moveTo(topPoints[0], topPoints[1]);
              for(let j=1; j<binCount; j++) {
                  this.ctx.lineTo(topPoints[j*2], topPoints[j*2+1]);
              }
              
              // Trace Bottom (Reverse)
              for(let j=binCount-1; j>=0; j--) {
                  this.ctx.lineTo(bottomPoints[j*2], bottomPoints[j*2+1]);
              }
              
              this.ctx.closePath();
              
              this.ctx.lineWidth = 1; 
              this.ctx.fill();
              this.ctx.stroke(); // Encapsulate
          }
      }
      
      // After render, we are effectively 'cached' if we capture immediately? 
      // No, let main loop decide when to capture (e.g. onInteractionStart)
  }
}
