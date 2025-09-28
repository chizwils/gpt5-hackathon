export interface HighlightCapture {
  text: string;
  color?: string;
}

export interface FormEventCapture {
  type: 'start' | 'submit';
  timestamp: string;
  formId?: string;
  action?: string;
  fieldCount?: number;
}

export interface PipEventCapture {
  type: 'enter' | 'leave';
  timestamp: string;
  mediaType?: string;
}

export interface ContentCapturePayload {
  url: string;
  title: string;
  canonicalUrl?: string;
  description?: string;
  language?: string;
  text: string;
  wordCount: number;
  startedAt: string;
  finishedAt: string;
  scrollDepth: number;
  highlights: HighlightCapture[];
  reasons: string[];
  readingTimeSeconds: number;
  formEvents: FormEventCapture[];
  pipEvents: PipEventCapture[];
  incognitoContext: boolean;
}

export interface CaptureInitPing {
  url: string;
  title: string;
  startedAt: string;
}

export type ContentScriptMessage =
  | { type: 'semantic-memory:init'; payload: CaptureInitPing }
  | { type: 'semantic-memory:capture'; payload: ContentCapturePayload };
