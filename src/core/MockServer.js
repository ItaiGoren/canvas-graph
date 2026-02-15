import seedrandom from 'seedrandom';

export class MockServer {
  constructor(nSeries = 100, nPoints = 100000) {
    this.nSeries = nSeries;
    this.nPoints = nPoints;
    this.totalPoints = nSeries * nPoints;
    this.data = []; // Array of Float32Arrays
    this.rng = seedrandom('benchmark-seed');
    this.latency = 100; // ms
  }

  async init() {
    await this.generateData('random-walk');
  }

  async generateData(type) {
    console.time('Data Generation');
    this.data = [];
    
    // Reset rng
    this.rng = seedrandom('benchmark-seed');

    if (type === 'random-walk') {
        this.nSeries = 100; // Reset to default
        for (let i = 0; i < this.nSeries; i++) {
            const series = new Float32Array(this.nPoints);
            let y = 0;
            for (let j = 0; j < this.nPoints; j++) {
                y += (this.rng() - 0.5) * 2;
                series[j] = y;
            }
            this.data.push(series);
        }
    } 
    else if (type === 'variable-sine') {
        this.nSeries = 1; // Single series
        const series = new Float32Array(this.nPoints);
        
        // 10 Segments
        const segmentSize = Math.floor(this.nPoints / 10);
        
        for(let s=0; s<10; s++) {
            // Segment Properties
            let freq = 0.01;
            let amp = 100;
            
            // Define specific segments for demonstration
            if (s === 1) {
                // High Freq, High Amp (Big Min/Max) - "Solid Block"
                freq = 1.5; 
                amp = 1000; 
            } else if (s === 5) {
                // Low Freq, Low Amp (Small Min/Max) - "Flat Line"
                freq = 0.001; 
                amp = 5; 
            } else if (s === 8) {
                // Medium Freq, Huge Amp
                freq = 0.1;
                amp = 2000;
            } else {
                // Random variations
                freq = 0.01 + this.rng() * 0.1;
                amp = 50 + this.rng() * 200;
            }
            
            const offset = s * segmentSize;
            for(let j=0; j<segmentSize; j++) {
                if (offset + j >= this.nPoints) break;
                // Sinus with noise
                const val = Math.sin(j * freq) * amp;
                // Add some noise so it's not perfect
                const noise = (this.rng() - 0.5) * (amp * 0.1);
                series[offset + j] = val + noise;
            }
        }
        this.data.push(series);
    }
    
    this.totalPoints = this.nSeries * this.nPoints;
    console.timeEnd('Data Generation');
    console.log(`Generated ${this.totalPoints.toLocaleString()} points (${type}).`);
  }

  // Simulate network request
  async getData(startIndex, endIndex, lodLevel = 1) {
    return new Promise((resolve) => {
      setTimeout(() => {
        resolve(this._processRequest(startIndex, endIndex, lodLevel));
      }, this.latency);
    });
  }

  _processRequest(startIndex, endIndex, lodLevel) {
    // Clamp
    const start = Math.max(0, Math.floor(startIndex));
    const end = Math.min(this.nPoints, Math.ceil(endIndex));
    
    // If LOD is 1, return raw data
    if (lodLevel === 1) {
        // Return slice of all series
        // For performance, we might return a view, but in a real server we'd clone/serialize
        // Here we'll return a structure: { seriesIndex: [Float32Array slice] }
        const result = [];
        for(let i=0; i<this.nSeries; i++) {
            result.push(this.data[i].slice(start, end));
        }
        return { type: 'raw', data: result, start, end };
    }

    // Interactive/Zoomed out: Return Bins
    // We want roughly (end-start) / lodLevel bins
    // e.g. if we want 1 bin per 10 pixels, lodLevel implies aggregation factor
    
    // Simple Binner: chunk size = lodLevel
    const chunkSize = Math.floor(lodLevel);
    const result = [];
    
    for(let i=0; i<this.nSeries; i++) {
        const raw = this.data[i];
        const bins = [];
        for(let j=start; j<end; j+=chunkSize) {
            let min = Infinity;
            let max = -Infinity;
            const chunkEnd = Math.min(end, j + chunkSize);
            for(let k=j; k<chunkEnd; k++) {
                const val = raw[k];
                if(val < min) min = val;
                if(val > max) max = val;
            }
            bins.push(min, max); // Interleaved min, max
        }
        result.push(new Float32Array(bins));
    }
    
    return { type: 'aggregated', data: result, start, end, step: chunkSize };
  }
}
