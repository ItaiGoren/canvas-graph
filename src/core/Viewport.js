export class Viewport {
  constructor(totalPoints, initialZoom = 1.0) {
    this.totalPoints = totalPoints;
    this.min = 0;
    this.max = totalPoints;
    
    // Visible range
    this.start = 0;
    this.end = totalPoints;
    
    this.listeners = [];
  }

  // Zoom at a specific normalized pivot (0 to 1)
  zoom(factor, pivot = 0.5) {
    const currentRange = this.end - this.start;
    const newRange = currentRange * factor;
    
    // Clamp zoom
    if (newRange < 10) return; // Minimum 10 points
    if (newRange > this.totalPoints) return; // Max zoom out

    const pivotPoint = this.start + (currentRange * pivot);
    
    this.start = Math.max(0, pivotPoint - (newRange * pivot));
    this.end = Math.min(this.totalPoints, this.start + newRange);
    
    // Re-clamp if we hit right edge
    if (this.start < 0) this.start = 0;
    if (this.end > this.totalPoints) {
       this.end = this.totalPoints;
       this.start = Math.max(0, this.end - newRange);
    }

    this.notify();
  }

  pan(deltaPoints) {
    const currentRange = this.end - this.start;
    let newStart = this.start + deltaPoints;
    let newEnd = this.end + deltaPoints;

    if (newStart < 0) {
      newStart = 0;
      newEnd = currentRange;
    }
    if (newEnd > this.totalPoints) {
      newEnd = this.totalPoints;
      newStart = this.totalPoints - currentRange;
    }

    this.start = newStart;
    this.end = newEnd;
    this.notify();
  }

  onChange(callback) {
    this.listeners.push(callback);
  }

  notify() {
    this.listeners.forEach(cb => cb(this.start, this.end));
  }
  
  getRange() {
      return { start: this.start, end: this.end, range: this.end - this.start };
  }

  resize(totalPoints) {
      this.totalPoints = totalPoints;
      this.max = totalPoints;
  }

  setRange(start, end) {
      this.start = Math.max(0, start);
      this.end = Math.min(this.totalPoints, end);
      this.notify();
  }
}
