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
    nSeries: 100,
    nPoints: 100000,
    showArea: true,
    lineWidth: 2,
    maxBins: 3000, // Cap for number of bins (dynamic based on width)
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
      await server.generateData(type);
      config.nSeries = server.nSeries;
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
          'Random Walk (100)': 'random-walk', 
          'Variable Sine (1)': 'variable-sine',
          'Pulse Wave (1)': 'pulse-wave',
          'Multi Wave (20)': 'multi-wave'
      }
  }).on('change', (ev) => {
      setGenerator(ev.value);
  });
  
  pane.addBinding(config, 'nSeries', { readonly: true });
  pane.addBinding(config, 'lineWidth', { min: 1, max: 10, step: 1 })
      .on('change', () => {
          updateConfig();
          if (config.renderer === 'three') requestData(); 
          else activeRenderer.render();
      });



  pane.addBinding(config, 'maxBins', { min: 100, max: 10000, step: 100 })
      .on('change', () => {
          requestData();
      });


  // --- Interaction & Event Loop ---
  let isInteracting = false;
  let debounceTimer = null;

  const requestData = async () => {
    const range = viewport.getRange();
    
    // Determine LOD
    // User logic: Bins = Canvas Width (CSS pixels), clamped by maxBins
    const canvasWidth = container.clientWidth;
    const targetBins = Math.min(canvasWidth, config.maxBins || 3000);
    
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
      
      // Map x to data index
      // x / width = (index - start) / range
      const dataIndex = start + (x / width) * range;
      
      // Find index in currentDataChunk
      // chunk.start is the 0-th element in arrays
      const localIndex = Math.floor(dataIndex - currentDataChunk.start);
      
      if (localIndex < 0) return;
      
      // Find closest series
      // Y mapping: height - ((v - Y_MIN) / Y_RANGE * height) = pixelY
      // v = Y_MIN + (height - pixelY) / height * Y_RANGE
      const Y_MIN = -2000;
      const Y_RANGE = 4000;
      const dataY = Y_MIN + ((height - y) / height) * Y_RANGE;

      let bestDist = Infinity;
      let bestSeries = -1;
      let bestVal = 0;
      
      const { data, type } = currentDataChunk;
      
      // If aggregated, data has 2 values per step [min, max]
      // step is implicitly passed or handled.
      // If agg, indices are 2x.
      
      const isAgg = type === 'aggregated';
      const step = currentDataChunk.step || 1;
      // If agg, one visual bin = step points.
      // localIndex is in "raw points".
      // binIndex = localIndex / step
      const binIndex = isAgg ? Math.floor(localIndex / step) : localIndex;
      
      for(let i=0; i<data.length; i++) {
          const series = data[i];
          let val;
          if (isAgg) {
              if (binIndex * 2 + 1 >= series.length) continue;
              // Take average of min/max? Or closest?
              const min = series[binIndex * 2];
              const max = series[binIndex * 2 + 1];
              // If mouse is between min/max, dist is 0
              if (dataY >= min && dataY <= max) {
                  val = dataY; // Inside area
              } else {
                  val = (dataY < min) ? min : max;
              }
          } else {
              if (localIndex >= series.length) continue;
              val = series[localIndex];
          }
          
          const dist = Math.abs(val - dataY);
          if (dist < bestDist) {
              bestDist = dist;
              bestSeries = i;
              bestVal = isAgg ? ((series[binIndex*2] + series[binIndex*2+1])/2) : val;
          }
      }
      
      if (bestSeries !== -1) {
          tooltip.style.display = 'block';
          tooltip.style.left = (clientX + 10) + 'px';
          tooltip.style.top = (clientY + 10) + 'px';
          tooltip.textContent = `Series: ${bestSeries}\nValue: ${bestVal.toFixed(2)}\nIndex: ${Math.floor(dataIndex)}`;
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
