# High Fidelity Time Series Benchmark

A vanilla JS benchmark comparing **ThreeJS** vs **Canvas2D** for rendering high-density time series data (100 series x 100k points).

## Getting Started

1.  **Install Dependencies**:
    ```bash
    npm install
    ```

2.  **Run Development Server**:
    ```bash
    npm run dev
    ```
    Open the URL (usually `http://localhost:5173`) in your browser.

## Features

-   **Mock Data Server**: Simulates async data fetching (100ms latency) and server-side binning (LOD).
-   **ThreeJS Renderer**:
    -   Uses `BufferGeometry` pooling.
    -   Renders `THREE.Line` for detail and `THREE.Mesh` (Triangle Strip logic) for aggregated views.
    -   Optimized for consistent 60fps.
-   **Canvas2D Renderer**:
    -   **Hybrid Rendering**: Uses "Frame Caching" during interaction (Pan/Zoom).
    -   Captures the canvas as an image and applies strict 2D transforms while dragging.
    -   Async refreshes high-fidelity paths only when interaction settles.
    -   Debounced updates.

## Controls

Use the Tweakpane control panel (top right) to:
-   **Renderer**: Switch between `ThreeJS` and `Canvas2D`.
-   **nSeries/nPoints**: View dataset statistics.

## Benchmarking

-   **FPS Panel**: Shows current Javascript/Render loop frame rate.
-   **MB Panel** (Chrome only): Shows used JS Heap Size.
