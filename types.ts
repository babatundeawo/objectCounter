
export interface Point {
  x: number;
  y: number;
}

export interface ItemInstance {
  id: string;
  boundingBox: [number, number, number, number]; // [ymin, xmin, ymax, xmax] in normalized 0-1000 coords
  mask: Point[]; // Polygon points
  confidence: number;
  areaPx: number;
  widthMm?: number;
  heightMm?: number;
  label: string;
}

export interface CalibrationData {
  referenceLengthMm: number;
  pixelsPerMm: number | null;
  startPoint: Point | null;
  endPoint: Point | null;
}

export enum ModelMode {
  PRO = 'gemini-3-pro-preview',
  FLASH = 'gemini-3-flash-preview'
}

export interface AnalysisResult {
  items: ItemInstance[];
  imageWidth: number;
  imageHeight: number;
  performance: {
    latencyMs: number;
    modelName: string;
    estimatedModelSizeMb: number;
  };
  summary: {
    totalCount: number;
    averageConfidence: number;
    totalAreaPx: number;
  };
}

export enum AppState {
  SETUP = 'SETUP',
  IDLE = 'IDLE',
  PROCESSING = 'PROCESSING',
  REVIEW = 'REVIEW',
  CALIBRATING = 'CALIBRATING'
}

export interface ItemMetadata {
  name: string;
  sampleImage: string | null;
}
