import { create } from "zustand";
import type { CaptionProvider } from "../types";

interface CaptionSegment {
  start: number;
  end: number;
  text: string;
}

interface CaptionsState {
  // Settings
  enabled: boolean;
  provider: CaptionProvider;
  apiKey: string;
  model: string;
  burnIn: boolean;
  ollamaUrl: string;
  lmStudioUrl: string;

  // Results
  captions: CaptionSegment[];
  isGenerating: boolean;
  error: string | null;

  // Actions
  setEnabled: (enabled: boolean) => void;
  setProvider: (provider: CaptionProvider) => void;
  setApiKey: (key: string) => void;
  setModel: (model: string) => void;
  setBurnIn: (burnIn: boolean) => void;
  setOllamaUrl: (url: string) => void;
  setLmStudioUrl: (url: string) => void;
  setCaptions: (captions: CaptionSegment[]) => void;
  setIsGenerating: (generating: boolean) => void;
  setError: (error: string | null) => void;
  reset: () => void;
}

export const PROVIDER_INFO: Record<
  CaptionProvider,
  { label: string; description: string; requiresKey: boolean; models: string[] }
> = {
  openrouter: {
    label: "OpenRouter",
    description: "Cloud — Multiple AI models via OpenRouter API (free tier available)",
    requiresKey: true,
    models: ["openai/whisper-large-v3", "openai/whisper-1"],
  },
  cerebras: {
    label: "Cerebras",
    description: "Cloud — Ultra-fast inference (free tier available)",
    requiresKey: true,
    models: ["whisper-large-v3"],
  },
  groq: {
    label: "Groq",
    description: "Cloud — Fast inference on LPU hardware (free tier available)",
    requiresKey: true,
    models: ["whisper-large-v3-turbo", "whisper-large-v3"],
  },
  ollama: {
    label: "Ollama (Local)",
    description: "Local — Runs on your machine. Low resource models recommended.",
    requiresKey: false,
    models: ["whisper:base", "whisper:small", "whisper:medium"],
  },
  lmstudio: {
    label: "LM Studio (Local)",
    description: "Local — Runs on your machine via LM Studio server.",
    requiresKey: false,
    models: ["whisper-base", "whisper-small"],
  },
};

export const useCaptionsStore = create<CaptionsState>((set) => ({
  enabled: false,
  provider: "groq",
  apiKey: "",
  model: "whisper-large-v3-turbo",
  burnIn: false,
  ollamaUrl: "http://localhost:11434",
  lmStudioUrl: "http://localhost:1234",
  captions: [],
  isGenerating: false,
  error: null,

  setEnabled: (enabled) => set({ enabled }),
  setProvider: (provider) => {
    const defaultModel = PROVIDER_INFO[provider].models[0];
    set({ provider, model: defaultModel });
  },
  setApiKey: (apiKey) => set({ apiKey }),
  setModel: (model) => set({ model }),
  setBurnIn: (burnIn) => set({ burnIn }),
  setOllamaUrl: (ollamaUrl) => set({ ollamaUrl }),
  setLmStudioUrl: (lmStudioUrl) => set({ lmStudioUrl }),
  setCaptions: (captions) => set({ captions }),
  setIsGenerating: (isGenerating) => set({ isGenerating }),
  setError: (error) => set({ error }),
  reset: () =>
    set({
      captions: [],
      isGenerating: false,
      error: null,
    }),
}));
