// @ts-nocheck
// TODO: Convert to strict TypeScript when stabilized
import seedrandom from 'seedrandom';

export class MockServer {
  nSeries: number;
  nPoints: number;
  totalPoints: number;
  data: Float32Array[];
  dataX: Float64Array[];
  rng: ReturnType<typeof seedrandom>;
  latency: number;

  constructor(nSeries = 100, nPoints = 100000) {
    this.nSeries = nSeries;
    this.nPoints = nPoints;
    this.totalPoints = nSeries * nPoints;
    this.data = [];
    this.dataX = [];
    this.rng = seedrandom('benchmark-seed');
    this.latency = 100;
  }

  async init() {
    await this.generateData('random-walk');
  }

  resize(nSeries: number, nPoints: number) {
      this.nSeries = nSeries;
      this.nPoints = nPoints;
      this.totalPoints = nSeries * nPoints;
  }

  async generateData(type: string) {
    console.time('Data Generation');
    this.data = [];
    this.dataX = [];
    
    this.rng = seedrandom('benchmark-seed');

    if (type === 'random-walk') {
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
        this.nSeries = 1;
        const series = new Float32Array(this.nPoints);
        const segmentSize = Math.floor(this.nPoints / 10);
        
        for(let s=0; s<10; s++) {
            let freq = 0.01;
            let amp = 100;
            
            if (s === 1) { freq = 1.5; amp = 1000; }
            else if (s === 5) { freq = 0.001; amp = 5; }
            else if (s === 8) { freq = 0.1; amp = 2000; }
            else { freq = 0.01 + this.rng() * 0.1; amp = 50 + this.rng() * 200; }
            
            const offset = s * segmentSize;
            for(let j=0; j<segmentSize; j++) {
                if (offset + j >= this.nPoints) break;
                const val = Math.sin(j * freq) * amp;
                const noise = (this.rng() - 0.5) * (amp * 0.1);
                series[offset + j] = val + noise;
            }
        }
        this.data.push(series);
    } 
    else if (type === 'pulse-wave') {
        this.nSeries = 1;
        const series = new Float32Array(this.nPoints);
        const regionSize = Math.floor(this.nPoints / 20);
        
        for(let r=0; r<20; r++) {
            const offset = r * regionSize;
            const isVolatile = r % 3 === 0;
            
            if (isVolatile) {
                for(let j=0; j<regionSize; j++) {
                    if (offset + j >= this.nPoints) break;
                    const phase = (j / regionSize) * 8;
                    const pulse = Math.sin(phase * Math.PI * 2) > 0.7 ? 1500 : -200;
                    const noise = (this.rng() - 0.5) * 400;
                    series[offset + j] = pulse + noise;
                }
            } else {
                const baseValue = (r / 20) * 400 - 200;
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
            const volatilityLevel = i / this.nSeries;
            const baseFreq = 0.001 + volatilityLevel * 0.05;
            const baseAmp = 50 + volatilityLevel * 1500;
            
            for (let j = 0; j < this.nPoints; j++) {
                const wave = Math.sin(j * baseFreq) * baseAmp;
                const noiseAmp = volatilityLevel * baseAmp * 0.3;
                const noise = (this.rng() - 0.5) * noiseAmp;
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
            const dt = 10 + (this.rng() - 0.5) * 2; 
            currentTime += dt;
            if (this.rng() > 0.995) {
                const gap = 1000 + this.rng() * 4000;
                currentTime += gap;
            }
            seriesX[j] = currentTime;
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

  async getData(startIndex: number, endIndex: number, lodLevel = 1, sampleRate = 100): Promise<any> {
    return new Promise((resolve) => {
      setTimeout(() => {
        resolve(this._processRequest(startIndex, endIndex, lodLevel, sampleRate));
      }, this.latency);
    });
  }

  _binarySearch(arr: Float64Array, target: number): number {
      let l = 0, r = arr.length - 1;
      while (l <= r) {
          const m = Math.floor((l + r) / 2);
          if (arr[m] < target) l = m + 1;
          else r = m - 1;
      }
      return l;
  }

  _processRequest(startArg: number, endArg: number, lodLevel: number, sampleRate = 100): any {
      if (!this.dataX || this.dataX.length === 0) {
          const start = Math.max(0, Math.floor(startArg));
          const end = Math.min(this.nPoints, Math.ceil(endArg));
          return this._processLegacyRequest(start, end, lodLevel);
      }
      
      const startTime = startArg;
      const endTime = endArg;
      const resultData: Float32Array[] = [];
      const resultX: Float64Array[] = [];
      const masterX = this.dataX[0];
      
      const startIndex = this._binarySearch(masterX, startTime);
      const endIndex = this._binarySearch(masterX, endTime);
      
      const rawStartIndex = Math.max(0, startIndex - 1);
      const rawEndIndex = Math.min(this.nPoints, endIndex + 1);
      
      if (lodLevel === 1 || lodLevel < sampleRate) {
          for(let i=0; i<this.nSeries; i++) {
              resultData.push(this.data[i].slice(rawStartIndex, rawEndIndex));
              resultX.push(this.dataX[i].slice(rawStartIndex, rawEndIndex));
          }
          return { type: 'sparse', data: resultData, x: resultX, start: startTime, end: endTime, sampleRate };
      }
      
      const binSizeMs = lodLevel;
      const alignedStartTime = Math.floor(startTime / binSizeMs) * binSizeMs;
      const binCount = Math.ceil((endTime - alignedStartTime) / binSizeMs);
      const resultAgg: Float32Array[] = [];
      
      for(let i=0; i<this.nSeries; i++) {
          const rawY = this.data[i];
          const rawX = this.dataX[i];
          const bins: number[] = [];
          let currentPtr = this._binarySearch(rawX, alignedStartTime); 
          
          for(let b=0; b<binCount; b++) {
              const binStartT = alignedStartTime + b * binSizeMs;
              const binEndT = binStartT + binSizeMs;
              let min = Infinity;
              let max = -Infinity;
              let hasPoints = false;
              let prevPointT = -Infinity;
              let gapDetected = false;

              while(currentPtr < rawX.length && rawX[currentPtr] < binEndT) {
                  if(rawX[currentPtr] >= binStartT) {
                      const t = rawX[currentPtr];
                      const val = rawY[currentPtr];
                      if (val < min) min = val;
                      if (val > max) max = val;
                      hasPoints = true;
                      if (prevPointT > -Infinity && (t - prevPointT) > sampleRate) {
                          gapDetected = true;
                      }
                      prevPointT = t;
                  }
                  currentPtr++;
              }
              
              if (hasPoints) {
                  if (gapDetected) {
                      if (0 < min) min = 0;
                      if (0 > max) max = 0;
                  }
                  bins.push(min, max);
              } else {
                  bins.push(0, 0); 
              }
          }
          resultAgg.push(new Float32Array(bins));
      }
      
      return { type: 'sparse-aggregated', data: resultAgg, start: alignedStartTime, end: endTime, step: binSizeMs, sampleRate };
  }

  _processLegacyRequest(startIndex: number, endIndex: number, lodLevel: number): any {
    const start = Math.max(0, Math.floor(startIndex));
    const end = Math.min(this.nPoints, Math.ceil(endIndex));
    
    if (lodLevel === 1) {
        const result: Float32Array[] = [];
        for(let i=0; i<this.nSeries; i++) {
            result.push(this.data[i].slice(start, end));
        }
        return { type: 'raw', data: result, start, end };
    }

    const chunkSize = Math.floor(lodLevel);
    const result: Float32Array[] = [];
    
    for(let i=0; i<this.nSeries; i++) {
        const raw = this.data[i];
        const bins: number[] = [];
        for(let j=start; j<end; j+=chunkSize) {
            let min = Infinity;
            let max = -Infinity;
            const chunkEnd = Math.min(end, j + chunkSize);
            for(let k=j; k<chunkEnd; k++) {
                const val = raw[k];
                if(val < min) min = val;
                if(val > max) max = val;
            }
            bins.push(min, max);
        }
        result.push(new Float32Array(bins));
    }
    
    return { type: 'aggregated', data: result, start, end, step: chunkSize };
  }
}
