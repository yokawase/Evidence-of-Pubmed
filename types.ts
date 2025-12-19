
export interface AnalysisResult {
  isJapanese: boolean;
  englishText: string;
  meshTerms: string[];
}

export interface PubMedArticle {
  id: string;
  pmid: string;
  title: string;
  titleJa?: string;
  authors: string;
  journal: string;
  pubdate: string;
  abstract?: string;
  fullText?: string | null;
}

export interface SearchResult {
  count: number;
  ids: string[];
}

export enum ProcessStatus {
  IDLE = 'idle',
  LOADING = 'loading',
  SUCCESS = 'success',
  ERROR = 'error'
}
