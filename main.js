import { MockServer } from './src/core/MockServer.js';
import { Viewport } from './src/core/Viewport.js';
import { Benchmark } from './src/core/Benchmark.js';
import { ThreeRenderer } from './src/renderers/ThreeRenderer.js';
import { CanvasRenderer } from './src/renderers/CanvasRenderer.js';
import { Pane } from 'tweakpane';

async function main() {
  const container = document.getElementById('container');
  const controlsContainer = document.getElementById('controls');

  // --- Configuration ---
  const config = {
    renderer: 'canvas', // or 'canvas'
    generator: 'random-walk',
    stressLevel: 'Normal (10M)',
    nSeries: 100,
    nPoints: 100000,
    showArea: true,
    lineWidth: 2,
    maxBins: 3000, // Cap for number of bins (dynamic based on width)
    gapThreshold: 100 // ms
  };

  const StressLevels = {
      'Normal (10M)': { nSeries: 100, nPoints: 100000 },
      'Heavy (50M)': { nSeries: 200, nPoints: 250000 },
      'Extreme (250M)': { nSeries: 500, nPoints: 500000 },
      'Ludicrous (1B)': { nSeries: 1000, nPoints: 1000000 },
      'Custom': {}
  };

  // --- Core ---
  const server = new MockServer(config.nSeries, config.nPoints);
  await server.init();

  const viewport = new Viewport(config.nPoints); // Use nPoints, not totalPoints
  const benchmark = new Benchmark(container);
  
  // --- Renderers ---
  let activeRenderer = null;
  let currentDataChunk = null; // Store for tooltip
  
  const threeRenderer = new ThreeRenderer(container, viewport);
  const canvasRenderer = new CanvasRenderer(container, viewport);

  const updateConfig = () => {
      threeRenderer.lineWidth = config.lineWidth;
      canvasRenderer.lineWidth = config.lineWidth;
  };

  // Initial Renderer
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
      
      // Trigger data refresh
      requestData();
  };
  
  const setGenerator = async (type) => {
      server.resize(config.nSeries, config.nPoints);
      await server.generateData(type);
      
      // Update config to match server (in case server clamped values, though it doesn't currently)
      // config.nSeries = server.nSeries; 
      
      pane.refresh();
      
      // Reset viewport to cover new range
      viewport.resize(config.nPoints);
      viewport.setRange(0, config.nPoints);
      pane.refresh();
      
      // Reset viewport?
      // Viewport is size nPoints. nPoints doesn't change here (100k).
      // But if we want to reset view:
      // viewport.start = 0; viewport.end = config.nPoints; viewport.notify();
      
      requestData();
  };
// ...
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
          // Debounce/Delay regeneration? Or just button?
          // Adding a button for explicit regeneration when Custom
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

  folderView.addBinding(config, 'gapThreshold', { min: 10, max: 5000, step: 10 })
      .on('change', () => {
          // We might need to pass this to renderers
          if (activeRenderer) activeRenderer.render(); 
      });


  // --- Interaction & Event Loop ---
  let isInteracting = false;
  let debounceTimer = null;

  const requestData = async () => {
    const range = viewport.getRange();
    
    // Determine LOD
    // User logic: Bins = Canvas Width (CSS pixels), clamped by maxBins
    const canvasWidth = container.clientWidth;
    const targetBins = config.maxBins;
    
    // We calculate lod (chunk size) to aim for 'targetBins' total bins in the current view
    const lod = Math.max(1, Math.ceil(range.range / targetBins)); 
    
    const data = await server.getData(range.start, range.end, lod);
    currentDataChunk = data; // Store for tooltip
    
    if (activeRenderer) {
        activeRenderer.setData(data);
        // Force full render
        activeRenderer.render(); 
        // For Canvas2D: capture (data+grid) then render axis on top
        if (activeRenderer instanceof CanvasRenderer) {
            activeRenderer.capture();
        }
    }
  };

  // Viewport Listener
  viewport.onChange(() => {
     // If canvas, we might be interacting
     if (config.renderer === 'canvas' && isInteracting && activeRenderer instanceof CanvasRenderer) {
         // Fast render using cache
         activeRenderer.renderInteraction();
     } else {
         // ThreeJS handles continuous update well usually, 
         // but we want to fetch data only on settle to simulate async?
         // Actually, ThreeJS can just update camera instantly.
         activeRenderer.render();
     }
  });

  // Debounced Data Fetch
  const onSettle = () => {
      isInteracting = false;
      // Invalidate cache on stabilize -> Removed to prevent flash
      // if (activeRenderer instanceof CanvasRenderer) {
      //     activeRenderer.isCached = false;
      // }
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
      debounceTimer = setTimeout(onSettle, 200); // 200ms debounce
  };

  // --- Tooltip Logic ---
  const tooltip = document.getElementById('tooltip');
  
  // Helper: Binary Search for closest time
  const binarySearchClosest = (arr, target) => {
      let l = 0, r = arr.length - 1;
      while (l <= r) {
          const m = Math.floor((l + r) / 2);
          if (arr[m] < target) l = m + 1;
          else r = m - 1;
      }
      // l is insertion point. Check l and l-1
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
      
      // Get mouse pos relative to container
      const rect = container.getBoundingClientRect();
      const x = clientX - rect.left;
      const y = clientY - rect.top;
      
      // Check bounds
      if (x < 0 || x > rect.width || y < 0 || y > rect.height) {
          tooltip.style.display = 'none';
          return;
      }

      const { start, end } = viewport.getRange();
      const range = end - start;
      const width = rect.width;
      const height = rect.height;
      const { data, type, x: dataX } = currentDataChunk;
      
      // Y mapping Helper
      const Y_MIN = -2000;
      const Y_RANGE = 4000;
      const mouseDataY = Y_MIN + ((height - y) / height) * Y_RANGE;

      let bestDist = Infinity;
      let bestSeries = -1;
      let bestVal = 0;
      let displayIndexOrTime = 0;

      if (type === 'sparse' || type === 'sparse-aggregated') {
           // Time Based
           const cursorTime = start + (x / width) * range;
           displayIndexOrTime = cursorTime;
           
           for(let i=0; i<data.length; i++) {
               const seriesY = data[i];
               const seriesX = dataX ? dataX[i] : null; 
               
               let val;
               
               if (type === 'sparse') { // Raw Sparse
                   // Binary Search in X
                   if (!seriesX) continue;
                   const idx = binarySearchClosest(seriesX, cursorTime);
                   if (idx === -1) continue;
                   
                   // Check if looking at a gap?
                   // If closest point is > gapThreshold away, maybe show nothing or 0?
                   // For tooltip, showing closest point value is usually fine, 
                   // but maybe indicate if it's far.
                   
                   val = seriesY[idx];
               } else {
                   // Sparse Aggregated (bins)
                   // step is binSizeMs
                   const step = currentDataChunk.step || 10;
                   const relTime = cursorTime - start;
                   const binIdx = Math.floor(relTime / step);
                   
                   if (binIdx < 0 || binIdx * 2 >= seriesY.length) continue;
                   
                   const min = seriesY[binIdx * 2];
                   const max = seriesY[binIdx * 2 + 1];
                   
                   // If gap (0,0), min/max are 0.
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
          // Legacy Index Based (Index = X)
          // Map x to data index
          const dataIndex = start + (x / width) * range;
          displayIndexOrTime = Math.floor(dataIndex);
          
          // Find index in currentDataChunk
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
  // Wheel / Pan
  // Simple Wheel Zoom
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

  // Pan (Mouse Drag)
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
          
          // Convert Px to Points
          const { range } = viewport.getRange();
          const pointsPerPx = range / container.clientWidth;
          
          viewport.pan(deltaPx * pointsPerPx);
          interactionStart(); // Keep resetting debounce
          interactionEnd();
      }
      
      updateTooltip(e.clientX, e.clientY);
  });

  // --- Animation Loop ---
  function animate() {
      requestAnimationFrame(animate);
      benchmark.begin();
      if (activeRenderer) {
          // Continuous render for animation loop
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
  requestData(); // Initial data
}

main().catch(console.error);
