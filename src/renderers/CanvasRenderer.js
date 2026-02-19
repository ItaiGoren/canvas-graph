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
    
    this.markersConfig = [];
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
  
  // Capture current render to cache (includes data + grid, but NOT axis labels)
  // Capture removed - render() now writes directly to cache.
  capture() {
      // No-op
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


  
  // Draw grid lines only (no labels)
  drawGrid(ctx, toX, toY, width, height, start, end) {
      const Y_MIN = -2000;
      const Y_MAX = 2000;
      
      // Calculate ticks
      const yTicks = this.calculateNiceTicks(Y_MIN, Y_MAX, 8);
      const xTicks = this.calculateNiceTicks(start, end, 10);
      
      ctx.save();
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.1)';
      ctx.lineWidth = 1;
      // Draw Y-axis grid lines only
      for (const yVal of yTicks) {
          const y = toY(yVal);
          if (y < 0 || y > height) continue;
          
          ctx.beginPath();
          ctx.moveTo(0, y);
          ctx.lineTo(width, y);
          ctx.stroke();
      }
      
      // Draw X-axis grid lines only
      for (const xVal of xTicks) {
          const x = toX(xVal);
          if (x < 0 || x > width) continue;
          
          ctx.beginPath();
          ctx.moveTo(x, 0);
          ctx.lineTo(x, height);
          ctx.stroke();
      }
      
      ctx.restore();
  }

  clearFrame(){
    this.ctx.fillStyle = '#222';
    this.ctx.fillRect(0, 0, this.width, this.height);
  }

  // Fast render using cache
  renderInteraction() {
      const { start, end } = this.viewport.getRange();
      const oldStart = this.lastRenderedState.start;
      const oldEnd = this.lastRenderedState.end;
      const oldRange = oldEnd - oldStart;
      const newRange = end - start;
      
      const x = (oldStart - start) / newRange * this.width;
      const w = (oldRange / newRange) * this.width;
      
      this.ctx.save();
      this.ctx.globalAlpha = 1.0; // Ensure full opacity
      this.ctx.fillStyle = '#222';
      this.ctx.fillRect(0, 0, this.width, this.height);
      
      if (this.isCached) {
        this.ctx.drawImage(this.cacheCanvas, 0, 0, this.width, this.height, x, 0, w, this.height);
      }
      this.ctx.restore();
      
      // Draw axis labels on top (not cached)
      this.renderAxisLabels();
  }

  render() {
      // 1. Render content DIRECTLY to cache (Offscreen)
      this.cacheCtx.globalAlpha = 1.0; // Reset alpha before clearing!
      this.cacheCtx.fillStyle = '#222';
      this.cacheCtx.fillRect(0, 0, this.width, this.height);
      
      if (!this.currentData) {
          this.isCached = true;
          this.lastRenderedState = { ...this.viewport.getRange() };
          this.renderInteraction(); 
          return;
      }
      
      const { width, height } = this;
      const { start, end } = this.viewport.getRange();
      const range = end - start;
      
      // Transform Helper
      const Y_MIN = -2000;
      const Y_MAX = 2000;
      const Y_RANGE = 4000;
      
      const toX = (v) => (v - start) / range * width;
      const toY = (v) => height - ((v - Y_MIN) / Y_RANGE * height);
      
      // Draw to Cache
      // Order: Grid -> Markers -> Data
      this.drawGrid(this.cacheCtx, toX, toY, width, height, start, end);
      this.drawMarkers(this.cacheCtx, toX, toY, width, height, start, end);
      this.renderData(this.cacheCtx, toX, toY, width, height, start, end);
      
      // Finalize Cache
      this.isCached = true;
      this.lastRenderedState = { ...this.viewport.getRange() };
      
      // 2. Composite Cache + UI to Screen
      this.renderInteraction();
  }

  renderData(ctx, toX, toY, width, height, start, end) {
    const range = end - start;
     const { data, type, step } = this.currentData;
    ctx.lineWidth = 1;

      for(let i=0; i<data.length; i++) {
          const series = data[i];
          ctx.strokeStyle = this.colors[i];
          ctx.fillStyle = this.colors[i]; // for area
          ctx.globalAlpha = type === 'aggregated' ? 0.5 : 1.0;
          ctx.beginPath();
          
          if (type === 'raw') {
              // Raw Line
              const len = series.length;
              const dataStart = this.currentData.start; 
              
              ctx.beginPath();
              ctx.lineWidth = 1; // Strict 1px
              
              ctx.lineJoin = 'round';
              ctx.lineCap = 'round';
              
              let first = true;
              
              for(let j=0; j<len; j++) {
                  const globalIdx = dataStart + j;
                  // Simple Cull
                  if (globalIdx < start - range || globalIdx > end + range) continue; 
                  
                  const px = toX(globalIdx);
                  const py = toY(series[j]);
                  
                  if (first) {
                      ctx.moveTo(px, py);
                      first = false;
                  } else {
                      ctx.lineTo(px, py);
                  }
              }
              ctx.stroke();
              
          } else if (type === 'sparse') {
              // Sparse Line
              const { x: dataX } = this.currentData;
              const seriesX = dataX[i]; // Float64Array
              const len = series.length;
              
              if (len === 0) continue;
              
              ctx.beginPath();
              ctx.lineWidth = 1.5; 
              ctx.lineJoin = 'round';
              ctx.lineCap = 'round';
              
              const gapThreshold = 100; // ms. Todo: make configurable
              
              // Edge Heuristic: 
              // Check distance of first point from viewport start
              const firstX = seriesX[0];
              const distToStart = firstX - start;
              
              if (distToStart > gapThreshold) {
                  // Gap at start -> Move to (start, 0) then (firstX, 0)
                  ctx.moveTo(toX(start), toY(0));
                  ctx.lineTo(toX(firstX), toY(0));
              } else {
                  // Continuity -> Move to (start, firstY) - approximating
                  ctx.moveTo(toX(start), toY(series[0]));
              }
              
              ctx.lineTo(toX(firstX), toY(series[0]));
              
              for(let j=1; j<len; j++) {
                  const t = seriesX[j];
                  const prevT = seriesX[j-1];
                  const dt = t - prevT;
                  
                  const px = toX(t);
                  const py = toY(series[j]);
                  
                  if (dt > gapThreshold) {
                      // Gap detected! Drop to zero
                      const prevPx = toX(prevT);
                      const zeroY = toY(0);
                      
                      ctx.lineTo(prevPx, zeroY);
                      ctx.lineTo(px, zeroY);
                      ctx.lineTo(px, py);
                  } else {
                      ctx.lineTo(px, py);
                  }
              }
              
              // Trailing Edge Heuristic
              const lastX = seriesX[len-1];
              const distToEnd = end - lastX;
              if (distToEnd > gapThreshold) {
                  ctx.lineTo(toX(lastX), toY(0));
                  ctx.lineTo(toX(end), toY(0));
              } else {
                  ctx.lineTo(toX(end), toY(series[len-1]));
              }

              ctx.stroke();

          } else {
              // Aggregated (Area/Bar) or Sparse-Aggregated
              // ... existing aggregation logic ...
              // We need to handle 'sparse-aggregated' which has time-step bins
              
              const isSparseAgg = type === 'sparse-aggregated';
              const chunkStep = step || 1;
              const binCount = isSparseAgg ? series.length / 2 : series.length / 2;
              
              // ... existing buffer build ...
              // Reuse logic but ensure X mapping uses bin index mapped to time or index
              
              const topPoints = [];
              const bottomPoints = [];
              
              for(let j=0; j<binCount; j++) {
                   let globalIdx, x;
                   if (isSparseAgg) {
                       // step is binSizeMs
                       // start is startTime
                       const time = start + j * step + step/2;
                       x = toX(time);
                   } else {
                       globalIdx = this.currentData.start + j * chunkStep;
                       x = toX(globalIdx + chunkStep/2);
                   }
                   
                  const minVal = series[j*2];
                  const maxVal = series[j*2+1];
                  
                  // If gap (0,0), we might want to collapse
                  // But visual 0 is fine
                  
                  let pyMin = toY(minVal); 
                  let pyMax = toY(maxVal); 
                  
                  if (pyMin - pyMax < 1) {
                      const mid = (pyMin + pyMax) / 2;
                      pyMin = mid + 0.5;
                      pyMax = mid - 0.5;
                  }
                  
                  topPoints.push(x, pyMax);
                  bottomPoints.push(x, pyMin);
              }
              
              ctx.beginPath();
              
              // Trace Top
              if (topPoints.length > 0) {
                  ctx.moveTo(topPoints[0], topPoints[1]);
                  for(let j=1; j<binCount; j++) {
                      ctx.lineTo(topPoints[j*2], topPoints[j*2+1]);
                  }
                  
                  // Trace Bottom (Reverse)
                  for(let j=binCount-1; j>=0; j--) {
                      ctx.lineTo(bottomPoints[j*2], bottomPoints[j*2+1]);
                  }
                  
                  ctx.closePath();
                  ctx.lineWidth = 1; 
                  ctx.fill();
                  ctx.stroke(); 
              }
          }
      }
  }
  
  // Render axis labels separately (not cached)
  renderAxisLabels() {
      const { start, end } = this.viewport.getRange();
      const range = end - start;
      const Y_MIN = -2000;
      const Y_MAX = 2000;
      const Y_RANGE = 4000;
      const width = this.width;
      const height = this.height;
      const toX = (v) => (v - start) / range * width;
      const toY = (v) => height - ((v - Y_MIN) / Y_RANGE * height);
      
      const yTicks = this.calculateNiceTicks(Y_MIN, Y_MAX, 8);
      const xTicks = this.calculateNiceTicks(start, end, 10);
      
      this.ctx.save();
      this.ctx.fillStyle = 'rgba(255, 255, 255, 0.7)';
      this.ctx.font = '11px monospace';
      
      // Y-axis labels only
      for (const yVal of yTicks) {
          const y = toY(yVal);
          if (y < 0 || y > height) continue;
          const label = this.formatYLabel(yVal);
          this.ctx.fillText(label, 5, y - 3);
      }
      
      // X-axis labels only
      for (const xVal of xTicks) {
          const x = toX(xVal);
          if (x < 0 || x > width) continue;
          const label = Math.floor(xVal).toString();
          this.ctx.fillText(label, x + 2, height - 5);
      }
      
      // Marker Labels (on top of everything)
       if (this.markersConfig) {
          this.ctx.textAlign = 'center';
          this.ctx.fillStyle = 'rgba(0, 136, 255, 0.8)';
          this.ctx.font = 'bold 12px monospace';
          
          for(const m of this.markersConfig) {
               // Check bounds roughly
               if (m.end < start || m.start > end) continue;
               
               const center = m.start + (m.end - m.start) / 2;
               const x = toX(center);
               
               // Clip?
               // if (x < 0 || x > width) ... let it clip naturally
               
               this.ctx.fillText(m.label, x, 20);
          }
      }

      this.ctx.restore();
  }

  setMarkers(markers) {
      this.markersConfig = markers || [];
      this.isCached = false; // Invalidate cache to redraw markers (since we draw them in drawMarkers -> cache)
  }

  drawMarkers(ctx, toX, toY, width, height, start, end) {
      if (!this.markersConfig || this.markersConfig.length === 0) return;

      const Y_MIN = -2000;
      const Y_MAX = 2000;
      
      ctx.save();
      
      for(const m of this.markersConfig) {
          if (m.end < start || m.start > end) continue;

          const x1 = toX(m.start);
          const x2 = toX(m.end);
          const w = x2 - x1;
          
          // Fill
          ctx.fillStyle = 'rgba(0, 136, 255, 0.1)';
          ctx.fillRect(x1, 0, w, height);
          
          // Side Lines
          ctx.strokeStyle = 'rgba(0, 136, 255, 0.5)';
          ctx.lineWidth = 1;
          
          ctx.beginPath();
          ctx.moveTo(x1, 0);
          ctx.lineTo(x1, height);
          ctx.stroke();
          
          ctx.beginPath();
          ctx.moveTo(x2, 0);
          ctx.lineTo(x2, height);
          ctx.stroke();
      }
      
      ctx.restore();
  }
}
