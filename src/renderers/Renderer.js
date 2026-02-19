export class Renderer {
  constructor(container, viewport) {
    this.container = container;
    this.viewport = viewport;
    this.width = container.clientWidth;
    this.height = container.clientHeight;
    this.lineWidth = 1;

    // Shared: Colors
    this.colors = [];
    for(let i=0; i<100; i++) {
        this.colors.push(`hsl(${Math.floor(i/100 * 360)}, 80%, 50%)`);
    }

    // Shared: Markers
    this.markersConfig = [];
  }

  async init() {
    throw new Error('Method not implemented.');
  }

  render() {
    throw new Error('Method not implemented.');
  }

  setData(data) {
     throw new Error('Method not implemented.');
  }

  resize(width, height) {
    this.width = width;
    this.height = height;
  }
  
  destroy() {
      // cleanup
  }

  // --- Shared Helpers ---

  setMarkers(markers) {
      this.markersConfig = markers || [];
      // Subclasses should override if they need to react immediately (like rebuilding meshes), 
      // otherwise they can just use this.markersConfig in render()
  }

  calculateNiceTicks(min, max, targetCount = 8) {
      const range = max - min;
      if (range === 0) return [min];
      
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

  formatYLabel(value) {
      const abs = Math.abs(value);
      if (abs >= 1e6) return (value / 1e6).toFixed(1) + 'M';
      if (abs >= 1e3) return (value / 1e3).toFixed(1) + 'K';
      return value.toFixed(0);
  }
}
