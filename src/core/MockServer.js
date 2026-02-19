import seedrandom from 'seedrandom';

export class MockServer {
  constructor(nSeries = 100, nPoints = 100000) {
    this.nSeries = nSeries;
    this.nPoints = nPoints;
    this.totalPoints = nSeries * nPoints;
    this.data = []; // Array of Float32Arrays (Y values)
    this.dataX = []; // Array of Float64Arrays (X timestamps)
    this.rng = seedrandom('benchmark-seed');
    this.latency = 100; // ms
  }

  async init() {
    await this.generateData('random-walk');
  }

  resize(nSeries, nPoints) {
      this.nSeries = nSeries;
      this.nPoints = nPoints;
      this.totalPoints = nSeries * nPoints;
  }

  async generateData(type) {
    console.time('Data Generation');
    this.data = [];
    this.dataX = [];
    
    // Reset rng
    this.rng = seedrandom('benchmark-seed');

    if (type === 'random-walk') {
        // this.nSeries = 100; // Removed hard reset to allow stress testing
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
    else if (type === 'pulse-wave') {
        this.nSeries = 1;
        const series = new Float32Array(this.nPoints);
        
        // Create alternating regions of calm and chaos
        const regionSize = Math.floor(this.nPoints / 20); // 20 regions
        
        for(let r=0; r<20; r++) {
            const offset = r * regionSize;
            const isVolatile = r % 3 === 0; // Every 3rd region is volatile
            
            if (isVolatile) {
                // Chaotic spikes - high volatility
                for(let j=0; j<regionSize; j++) {
                    if (offset + j >= this.nPoints) break;
                    // Sharp pulses
                    const phase = (j / regionSize) * 8; // 8 pulses per region
                    const pulse = Math.sin(phase * Math.PI * 2) > 0.7 ? 1500 : -200;
                    const noise = (this.rng() - 0.5) * 400;
                    series[offset + j] = pulse + noise;
                }
            } else {
                // Calm region - low volatility
                const baseValue = (r / 20) * 400 - 200; // Slight drift
                for(let j=0; j<regionSize; j++) {
                    if (offset + j >= this.nPoints) break;
                    const smoothWave = Math.sin((j / regionSize) * Math.PI) * 30;
                    const tinyNoise = (this.rng() - 0.5) * 5;
                    series[offset + j] = baseValue + smoothWave + tinyNoise;
                }
            }
        }
        this.data.push(series);
    }
    else if (type === 'multi-wave') {
        this.nSeries = 20;
        
        for (let i = 0; i < this.nSeries; i++) {
            const series = new Float32Array(this.nPoints);
            
            // Each series has different characteristics
            const volatilityLevel = i / this.nSeries; // 0 to 1
            const baseFreq = 0.001 + volatilityLevel * 0.05;
            const baseAmp = 50 + volatilityLevel * 1500;
            
            for (let j = 0; j < this.nPoints; j++) {
                // Smooth wave with increasing volatility
                const wave = Math.sin(j * baseFreq) * baseAmp;
                
                // Add noise proportional to volatility
                const noiseAmp = volatilityLevel * baseAmp * 0.3;
                const noise = (this.rng() - 0.5) * noiseAmp;
                
                // Occasional spikes for high volatility series
                let spike = 0;
                if (volatilityLevel > 0.5 && this.rng() > 0.98) {
                    spike = (this.rng() - 0.5) * baseAmp * 2;
                }
                
                series[j] = wave + noise + spike;
            }
            
            this.data.push(series);
        }
    }
    else if (type === 'sparse-sine') {
        this.nSeries = 1;
        const seriesY = new Float32Array(this.nPoints);
        const seriesX = new Float64Array(this.nPoints);
        
        let currentTime = 0;
        
        for (let j = 0; j < this.nPoints; j++) {
            // Jittered sample rate (avg 10ms)
            const dt = 10 + (this.rng() - 0.5) * 2; 
            currentTime += dt;
            
            // Random chance for a gap (> 1s)
            // 0.5% chance per point
            if (this.rng() > 0.995) {
                const gap = 1000 + this.rng() * 4000; // 1s to 5s gap
                currentTime += gap;
            }
            
            seriesX[j] = currentTime;
            
            // Value
            const val = Math.sin(currentTime * 0.001) * 500;
            const noise = (this.rng() - 0.5) * 50;
            seriesY[j] = val + noise;
        }
        
        this.data.push(seriesY);
        this.dataX.push(seriesX);
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

  // Helper: Binary Search for Time Index
  _binarySearch(arr, target) {
      let l = 0, r = arr.length - 1;
      while (l <= r) {
          const m = Math.floor((l + r) / 2);
          if (arr[m] < target) l = m + 1;
          else r = m - 1;
      }
      return l; // Returns split point
  }

  _processRequest(startArg, endArg, lodLevel) {
      if (!this.dataX || this.dataX.length === 0) {
          // Fallback for non-sparse types (assume index = time)
          const start = Math.max(0, Math.floor(startArg));
          const end = Math.min(this.nPoints, Math.ceil(endArg));
          return this._processLegacyRequest(start, end, lodLevel);
      }
      
      // Sparse Logic: Arguments are TIME (ms)
      const startTime = startArg;
      const endTime = endArg;
      
      const resultData = [];
      const resultX = [];
      
      // We assume all series share the same X for now for 'sparse-sine'
      // But structure allows independent X.
      // Let's assume dataX[0] is the master time for now if nSeries=1
      
      // For now, let's just handle the first series X for search bounds
      const masterX = this.dataX[0];
      
      // Binary Search
      let startIndex = this._binarySearch(masterX, startTime);
      let endIndex = this._binarySearch(masterX, endTime);
      
      // Clamp
      startIndex = Math.max(0, Math.min(startIndex, this.nPoints));
      endIndex = Math.max(0, Math.min(endIndex, this.nPoints));
      
      // Raw Return
      if (lodLevel === 1) {
          for(let i=0; i<this.nSeries; i++) {
              resultData.push(this.data[i].slice(startIndex, endIndex));
              resultX.push(this.dataX[i].slice(startIndex, endIndex));
          }
          return { type: 'sparse', data: resultData, x: resultX, start: startTime, end: endTime };
      }
      
      // Time-Based Aggregation
      // Target: (endTime - startTime) / lodLevel bins? 
      // Actually lodLevel usually means "pixels per bin" or "points per bin".
      // Let's interpret 'lodLevel' as 'ms per bin'.
      
      const binSizeMs = lodLevel;
      const binCount = Math.ceil((endTime - startTime) / binSizeMs);
      
      const resultAgg = [];
      // X for aggregation? We can just send start/end/step.
      
      for(let i=0; i<this.nSeries; i++) {
          const rawY = this.data[i];
          const rawX = this.dataX[i];
          
          const bins = []; // Each bin: [min, max] or [0, 0] (gap)
          
          let currentPtr = startIndex;
          
          for(let b=0; b<binCount; b++) {
              const binStartT = startTime + b * binSizeMs;
              const binEndT = binStartT + binSizeMs;
              
              let min = Infinity;
              let max = -Infinity;
              let hasPoints = false;
              
              // Scan points in this time window
              while(currentPtr < rawX.length && rawX[currentPtr] < binEndT) {
                  // Only include if >= binStartT
                  if(rawX[currentPtr] >= binStartT) {
                      const val = rawY[currentPtr];
                      if (val < min) min = val;
                      if (val > max) max = val;
                      hasPoints = true;
                  }
                  currentPtr++;
              }
              
              if (hasPoints) {
                  bins.push(min, max);
              } else {
                  // Gap / Empty Bin
                  // Push marker? Or just 0,0?
                  // Providing 0,0 is easiest visually
                  bins.push(0, 0); 
              }
          }
          resultAgg.push(new Float32Array(bins));
      }
      
      return { type: 'sparse-aggregated', data: resultAgg, start: startTime, end: endTime, step: binSizeMs };
  }

  // Original Logic renamed
  _processLegacyRequest(startIndex, endIndex, lodLevel) {
    // ... Copy of original logic ...
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
