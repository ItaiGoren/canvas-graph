// @ts-nocheck
// This is the original benchmark demo, minimally adapted to use library imports.
import { MockServer } from '@canvas-graph/mock-server';
import { Viewport, Benchmark, ThreeRenderer } from '@canvas-graph/engine';
import { CanvasRenderer } from '@canvas-graph/old-renderers/CanvasRenderer.js';
import { Pane } from 'tweakpane';
import { BehaviorSubject } from 'rxjs';

async function main() {
  const container = document.getElementById('container');
  const controlsContainer = document.getElementById('controls');

  // --- Configuration ---
  const config = {
    renderer: 'canvas',
    generator: 'random-walk',
    stressLevel: 'Normal (10M)',
    nSeries: 100,
    nPoints: 100000,
    showArea: true,
    lineWidth: 2,
    maxBins: 3000,
    sampleRate: 100,
    showMarkers: true
  };

  const StressLevels = {
      'Normal (10M)': { nSeries: 100, nPoints: 100000 },
      'Heavy (50M)': { nSeries: 200, nPoints: 250000 },
      'Extreme (250M)': { nSeries: 500, nPoints: 500000 },
      'Ludicrous (1B)': { nSeries: 1000, nPoints: 1000000 },
      'Custom': {}
  };

  // --- Mock Data ---
  const markers = [];
  const generateMarkers = () => {
    markers.length = 0;
    for(let i=0; i<3; i++) {
        const start = Math.floor(Math.random() * (config.nPoints * 0.8));
        const width = Math.floor(Math.random() * (config.nPoints * 0.1) + 1000);
        markers.push({
            start: start,
            end: start + width,
            label: `Area ${i+1}`
        });
    }
  };
  generateMarkers();

  // --- Core ---
  const server = new MockServer(config.nSeries, config.nPoints);
  await server.init();

  const viewport = new Viewport(config.nPoints);
  const benchmark = new Benchmark(container);
  
  // --- Renderers ---
  let activeRenderer = null;
  let currentDataChunk = null;

  const config$ = new BehaviorSubject(config);
  const range$ = new BehaviorSubject({ start: 0, end: config.nPoints, yStart: -2000, yEnd: 2000 });
  
  viewport.onChange((start, end) => {
      range$.next({ start, end, yStart: -2000, yEnd: 2000 });
  });
  
  const threeRenderer = new ThreeRenderer(container, config$, range$);
  const canvasRenderer = new CanvasRenderer(container, viewport);

  const updateConfig = () => {
      config$.next({ ...config });
      // threeRenderer.lineWidth = config.lineWidth; // Handled via config$ in new engine (not fully implemented in ThreeDataLayer yet, but prevents error)
      canvasRenderer.lineWidth = config.lineWidth;
      
      const activeMarkers = config.showMarkers ? markers : [];
      threeRenderer.setMarkers(activeMarkers);
      canvasRenderer.setMarkers(activeMarkers);
  };

  const setRenderer = (type) => {
      if (type === 'three') {
          activeRenderer = threeRenderer;
          threeRenderer.renderer.domElement.style.display = 'block';
          canvasRenderer.canvas.style.display = 'none';
      } else {
          activeRenderer = canvasRenderer;
          canvasRenderer.canvas.style.display = 'block';
          threeRenderer.renderer.domElement.style.display = 'none';
      }
      activeRenderer.resize(container.clientWidth, container.clientHeight);
      updateConfig();
      requestData();
  };
  
  const setGenerator = async (type) => {
      server.resize(config.nSeries, config.nPoints);
      await server.generateData(type);
      pane.refresh();
      viewport.resize(config.nPoints);
      viewport.setRange(0, config.nPoints);
      pane.refresh();
      requestData();
  };
  
  updateConfig();

  // --- GUI ---
  const pane = new Pane({ container: controlsContainer });
  pane.addBinding(config, 'renderer', {
      options: { Canvas2D: 'canvas',  ThreeJS: 'three' }
  }).on('change', (ev) => {
      setRenderer(ev.value);
  });
  
  pane.addBinding(config, 'generator', {
      options: { 
          'Random Walk': 'random-walk', 
          'Variable Sine': 'variable-sine',
          'Pulse Wave': 'pulse-wave',
          'Multi Wave': 'multi-wave',
          'Sparse Sine': 'sparse-sine'
      }
  }).on('change', (ev) => {
      setGenerator(ev.value);
  });
  
  const folderStress = pane.addFolder({ title: 'Stress Test' });
  
  folderStress.addBinding(config, 'stressLevel', {
      options: {
          'Normal (10M)': 'Normal (10M)', 
          'Heavy (50M)': 'Heavy (50M)',
          'Extreme (250M)': 'Extreme (250M)',
          'Ludicrous (1B)': 'Ludicrous (1B)',
          'Custom': 'Custom'
      }
  }).on('change', (ev) => {
      if (ev.value !== 'Custom') {
          const settings = StressLevels[ev.value];
          config.nSeries = settings.nSeries;
          config.nPoints = settings.nPoints;
          setGenerator(config.generator);
      }
  });

  folderStress.addBinding(config, 'nSeries', { min: 1, max: 2000, step: 1 })
      .on('change', () => {
          config.stressLevel = 'Custom';
          pane.refresh();
      });
      
  folderStress.addBinding(config, 'nPoints', { min: 1000, max: 2000000, step: 1000 })
      .on('change', () => {
          config.stressLevel = 'Custom';
          pane.refresh();
      });

  folderStress.addButton({ title: 'Regenerate Data' }).on('click', () => {
      setGenerator(config.generator);
  });

  const folderView = pane.addFolder({ title: 'View Settings' });

  folderView.addBinding(config, 'lineWidth', { min: 1, max: 10, step: 1 })
      .on('change', () => {
          updateConfig();
          if (config.renderer === 'three') requestData(); 
          else activeRenderer.render();
      });

  folderView.addBinding(config, 'maxBins', { min: 100, max: 10000, step: 100 })
      .on('change', () => {
          requestData();
      });

  folderView.addBinding(config, 'showMarkers', { label: 'Show Area Markers' })
      .on('change', () => {
          updateConfig();
          if (activeRenderer instanceof CanvasRenderer) {
              activeRenderer.isCached = false;
          }
          activeRenderer.render();
      });

  // --- Interaction & Event Loop ---
  let isInteracting = false;
  let debounceTimer = null;

  const requestData = async () => {
    const range = viewport.getRange();
    const canvasWidth = container.clientWidth;
    const targetBins = config.maxBins;
    const lod = Math.max(1, Math.ceil(range.range / targetBins)); 
    const data = await server.getData(range.start, range.end, lod, config.sampleRate);
    currentDataChunk = data;
    
    if (activeRenderer) {
        activeRenderer.setData(data);
        activeRenderer.render(); 
        if (activeRenderer instanceof CanvasRenderer) {
            activeRenderer.capture();
        }
    }
  };

  viewport.onChange(() => {
     if (config.renderer === 'canvas' && isInteracting && activeRenderer instanceof CanvasRenderer) {
         activeRenderer.renderInteraction();
     } else {
         activeRenderer.render();
     }
  });

  const onSettle = () => {
      isInteracting = false;
      requestData();
  };
  
  const interactionStart = () => {
      isInteracting = true;
      if (debounceTimer) clearTimeout(debounceTimer);
      if (activeRenderer instanceof CanvasRenderer) {
          activeRenderer.capture();
      }
  };
  
  const interactionEnd = () => {
      if (debounceTimer) clearTimeout(debounceTimer);
      debounceTimer = setTimeout(onSettle, 200);
  };

  // --- Tooltip Logic ---
  const tooltip = document.getElementById('tooltip');
  
  const binarySearchClosest = (arr, target) => {
      let l = 0, r = arr.length - 1;
      while (l <= r) {
          const m = Math.floor((l + r) / 2);
          if (arr[m] < target) l = m + 1;
          else r = m - 1;
      }
      const i1 = l;
      const i2 = l - 1;
      let bestI = -1;
      let minDiff = Infinity;
      if (i1 >= 0 && i1 < arr.length) {
          const diff = Math.abs(arr[i1] - target);
          if (diff < minDiff) { minDiff = diff; bestI = i1; }
      }
      if (i2 >= 0 && i2 < arr.length) {
          const diff = Math.abs(arr[i2] - target);
          if (diff < minDiff) { minDiff = diff; bestI = i2; }
      }
      return bestI;
  };

  const updateTooltip = (clientX, clientY) => {
      if (isInteracting || !currentDataChunk) {
          tooltip.style.display = 'none';
          return;
      }
      
      const rect = container.getBoundingClientRect();
      const x = clientX - rect.left;
      const y = clientY - rect.top;
      
      if (x < 0 || x > rect.width || y < 0 || y > rect.height) {
          tooltip.style.display = 'none';
          return;
      }

      const { start, end } = viewport.getRange();
      const range = end - start;
      const width = rect.width;
      const height = rect.height;
      const { data, type, x: dataX } = currentDataChunk;
      
      const Y_MIN = -2000;
      const Y_RANGE = 4000;
      const mouseDataY = Y_MIN + ((height - y) / height) * Y_RANGE;

      let bestDist = Infinity;
      let bestSeries = -1;
      let bestVal = 0;
      let displayIndexOrTime = 0;

      if (type === 'sparse' || type === 'sparse-aggregated') {
           const cursorTime = start + (x / width) * range;
           displayIndexOrTime = cursorTime;
           
           for(let i=0; i<data.length; i++) {
               const seriesY = data[i];
               const seriesX = dataX ? dataX[i] : null; 
               let val;
               
               if (type === 'sparse') {
                   if (!seriesX) continue;
                   const idx = binarySearchClosest(seriesX, cursorTime);
                   if (idx === -1) continue;
                   val = seriesY[idx];
               } else {
                   const step = currentDataChunk.step || 10;
                   const relTime = cursorTime - start;
                   const binIdx = Math.floor(relTime / step);
                   if (binIdx < 0 || binIdx * 2 >= seriesY.length) continue;
                   const min = seriesY[binIdx * 2];
                   const max = seriesY[binIdx * 2 + 1];
                   if (min === 0 && max === 0) val = 0;
                   else {
                      if (mouseDataY >= min && mouseDataY <= max) val = mouseDataY;
                      else val = (mouseDataY < min) ? min : max;
                   }
               }
               
               const dist = Math.abs(val - mouseDataY);
               if (dist < bestDist) {
                   bestDist = dist;
                   bestSeries = i;
                   bestVal = val;
               }
           }
      } else {
          const dataIndex = start + (x / width) * range;
          displayIndexOrTime = Math.floor(dataIndex);
          const localIndex = Math.floor(dataIndex - currentDataChunk.start);
          if (localIndex < 0) return;
          
          const isAgg = type === 'aggregated';
          const step = currentDataChunk.step || 1;
          const binIndex = isAgg ? Math.floor(localIndex / step) : localIndex;
          
          for(let i=0; i<data.length; i++) {
              const series = data[i];
              let val;
              if (isAgg) {
                  if (binIndex * 2 + 1 >= series.length) continue;
                  const min = series[binIndex * 2];
                  const max = series[binIndex * 2 + 1];
                  if (mouseDataY >= min && mouseDataY <= max) {
                      val = mouseDataY; 
                  } else {
                      val = (mouseDataY < min) ? min : max;
                  }
              } else {
                  if (localIndex >= series.length) continue;
                  val = series[localIndex];
              }
              
              const dist = Math.abs(val - mouseDataY);
              if (dist < bestDist) {
                  bestDist = dist;
                  bestSeries = i;
                  bestVal = isAgg ? ((series[binIndex*2] + series[binIndex*2+1])/2) : val;
              }
          }
      }
      
      if (bestSeries !== -1) {
          tooltip.style.display = 'block';
          tooltip.style.left = (clientX + 10) + 'px';
          tooltip.style.top = (clientY + 10) + 'px';
          const label = (type === 'sparse' || type === 'sparse-aggregated') ? 'Time' : 'Index';
          const valLabel = (type === 'sparse' || type === 'sparse-aggregated') ? displayIndexOrTime.toFixed(2) + 'ms' : displayIndexOrTime;
          tooltip.textContent = `Series: ${bestSeries}\nValue: ${bestVal.toFixed(2)}\n${label}: ${valLabel}`;
      } else {
          tooltip.style.display = 'none';
      }
  };

  // Bind Events
  container.addEventListener('wheel', (e) => {
      e.preventDefault();
      interactionStart();
      const rect = container.getBoundingClientRect();
      const pivot = (e.clientX - rect.left) / rect.width;
      const zoomFactor = 1 + (e.deltaY * 0.001);
      viewport.zoom(zoomFactor, pivot); 
      interactionEnd();
      updateTooltip(e.clientX, e.clientY);
  }, { passive: false });

  let isDragging = false;
  let lastX = 0;
  
  container.addEventListener('mousedown', (e) => {
      isDragging = true;
      lastX = e.clientX;
      interactionStart();
  });
  
  window.addEventListener('mouseup', () => {
      if(isDragging) {
          isDragging = false;
          interactionEnd();
      }
  });
  
  window.addEventListener('mousemove', (e) => {
      if (isDragging) {
          const deltaPx = lastX - e.clientX;
          lastX = e.clientX;
          const { range } = viewport.getRange();
          const pointsPerPx = range / container.clientWidth;
          viewport.pan(deltaPx * pointsPerPx);
          interactionStart();
          interactionEnd();
      }
      updateTooltip(e.clientX, e.clientY);
  });

  // --- Animation Loop ---
  function animate() {
      requestAnimationFrame(animate);
      benchmark.begin();
      if (activeRenderer) {
          if (config.renderer === 'three') {
              activeRenderer.render();
          }
      }
      benchmark.end();
  }
  
  // Resize Handler
  window.addEventListener('resize', () => {
      const w = container.clientWidth;
      const h = container.clientHeight;
      if(activeRenderer) activeRenderer.resize(w, h);
      requestData();
  });

  // Init
  setRenderer('canvas');
  animate();
  requestData();
}

main().catch(console.error);
