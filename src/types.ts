
export interface SubtitleBlock {
  id: number;
  startTime: string;
  endTime: string;
  originalText: string;
  translatedText?: string;
  index: number; // The visual index (1-based)
}

export enum AppStatus {
  IDLE = 'IDLE',
  PARSING = 'PARSING',
  READY = 'READY',
  TRANSLATING = 'TRANSLATING',
  PAUSED = 'PAUSED',
  COMPLETED = 'COMPLETED',
  ERROR = 'ERROR',
  CANCELLED = 'CANCELLED'
}

// History tracking for Undo/Redo
export interface Modification {
  blockId: number;
  // Flexible state tracking (can track text, startTime, endTime, etc.)
  oldState: Partial<SubtitleBlock>;
  newState: Partial<SubtitleBlock>;
  // Group ID allows undoing multiple block changes as one action (e.g. Find/Replace)
  groupId?: string; 
  timestamp: string;
}

// New Interface for Multi-File Support
export interface SubtitleFile {
  id: string; // Unique UUID
  name: string;
  size: number;
  type: 'SRT' | 'VTT' | 'ASS';
  originalType: 'SRT' | 'VTT' | 'ASS';
  blocks: SubtitleBlock[];
  status: AppStatus;
  progress: number;
  progressMessage?: string;
  diagnostic?: TranslationDiagnostic | null;
  processingDuration?: string | null;
  netflixErrors?: NetflixError[];
  processedCount: number;
  activeTranslationBlockIds?: number[];
  
  // Undo/Redo History
  modificationsMade: Modification[];
  historyPointer: number;
}

export interface TranslationStats {
  totalBlocks: number;
  translatedBlocks: number;
  estimatedTimeRemaining: number; // in seconds
  startTime: number;
}

export interface BatchRequest {
  id: number;
  text: string;
  previousTranslatedText?: string;
  problemHint?: string;
}

export interface BatchResponse {
  id: number;
  translatedText: string;
}

export type DiagnosticSeverity = 'info' | 'warning' | 'error';

export interface TranslationDiagnostic {
  code: string;
  severity: DiagnosticSeverity;
  title: string;
  cause: string;
  recovery: string;
  technicalDetails?: string;
  timestamp: string;
}

export interface UserAPIKey {
  key: string;
  isValid: boolean;
  isRateLimited: boolean;
  addedAt: number;
  label?: string;
}

export interface GlossaryItem {
  term: string;
  translation: string;
}

export type ToneType = 'conversational' | 'formal' | 'news' | 'movie' | 'podcast';
export type TopicType = 'educational' | 'entertainment' | 'podcast' | 'news' | 'sports';
export type ModelType = 'standard' | 'professional' | 'flash' | 'flash_lite';
export type AIProvider = 'gemini' | 'lm_studio' | 'openai_compatible' | 'gtx' | 'edge' | 'deeplx';
export type TargetLanguage = 'fa' | 'en' | 'ru' | 'zh' | 'de' | 'es';
export type OutputStandard = 'normal' | 'netflix' | 'bbc' | 'broadcast';
export type TranslationMethod = 'default' | 'paragraph' | 'skeleton_str' | 'subtitle_translator';

export interface OpenAICompatibleService {
  id: string;
  name: string;
  baseUrl: string;
  apiKey: string;
  model: string;
}

export interface AppSettings {
  tone: ToneType;
  topic: TopicType;
  temperature: number; // New field for Translation Quality
  outputFormat: 'srt' | 'vtt' | 'ass';
  outputStandard: OutputStandard;
  translationMethod: TranslationMethod;
  model: ModelType;
  aiProvider: AIProvider;
  lmStudioBaseUrl: string;
  lmStudioModel: string;
  openAICompatibleServices: OpenAICompatibleService[];
  activeOpenAICompatibleServiceId?: string;
  customPrompt: string;
  apiKeys: UserAPIKey[];
  enableTranslationMemory: boolean;
  glossary: GlossaryItem[];
  doNotTranslateTerms: string;
  theme: 'dark' | 'light';
  targetLanguage: TargetLanguage;
}

export type TranslationJobStatus = 'queued' | 'running' | 'paused' | 'cancelled' | 'failed' | 'completed';

export interface TranslationJob {
  id: string;
  fileId: string;
  status: TranslationJobStatus;
  createdAt: string;
  startedAt?: string;
  completedAt?: string;
  error?: string;
}


// --- NEW TYPES FOR TIMING & QC ---

export type AdjustmentMode = 'seconds' | 'percent' | 'recalculate' | 'fixed';

export interface AdjustmentConfig {
  mode: AdjustmentMode;
  value: number; // Seconds (e.g. +/- 0.5), Percent (e.g. 110), or Fixed Seconds
  target: 'start' | 'end' | 'both' | 'shift'; // Shift moves both, others resize
}

export interface NetflixError {
  blockId: number;
  types: ('cps' | 'min_duration' | 'max_duration' | 'max_lines' | 'max_chars' | 'gap')[];
  message: string;
}

// --- NEW TYPES FOR STYLING & ASS ---

export interface StyleConfig {
  useStyles: boolean;
  templateId?: string;
  fontFamily: string;
  fontSize: number; // For ASS (e.g. 20)
  primaryColor: string; // Hex
  secondaryColor?: string; // Hex (Outline/Shadow)
  backgroundColor: string; // Hex (Box)
  backgroundOpacity: number; // 0-100 (0 = Transparent, 100 = Opaque)
  isBold: boolean;
  borderStyle: 'outline' | 'box' | 'none'; 
  outlineWidth: number;
  shadowDepth: number;
  alignment: number; // ASS alignment (2 = Bottom Center)
}

// VTT specific subset for compatibility
export interface VttStyleConfig {
  useStyles: boolean;
  fontFamily: string;
  fontSize: string; 
  color: string; 
  backgroundColor: string; 
  textShadow: string;
}

export interface StyleTemplate {
  id: string;
  name: string;
  config: StyleConfig;
}
