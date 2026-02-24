
import { Observable, BehaviorSubject, Subject } from 'rxjs';

/**
 * Represents a chunk of data arriving from the server or generator.
 * @template TData - The type of the data array elements (default: Float32Array)
 */
export interface DataChunk<TData = Float32Array> {
  type: 'raw' | 'sparse' | 'sparse-aggregated';
  data: TData[]; 
  start: number;
  end: number;
  sampleRate?: number;
  step?: number;
}

/**
 * Represents the visible range of the graph.
 */
export interface ViewportRange {
  start: number;
  end: number;
  yStart?: number;
  yEnd?: number;
}

/**
 * Configuration for a specific marker region.
 * @template TMetadata - Optional custom metadata associated with the marker.
 */
export interface MarkerConfig<TMetadata = any> {
  start: number;
  end: number;
  label: string;
  metadata?: TMetadata;
}

/**
 * Base configuration for the graph engine.
 */
export interface GraphConfig {
  rendererType: 'three' | 'canvas';
  lineWidth?: number;
  showMarkers?: boolean;
  showArea?: boolean;
  // Add more config options as needed
}

/**
 * Specialized config for Three.js renderer
 */
export interface ThreeGraphConfig extends GraphConfig {
    antialias?: boolean;
    pixelRatio?: number;
}
