import { PromptHarness } from '../../types';

export type HarnessType = 'static' | 'dynamic' | 'style' | 'adapter' | 'audio' | 'genre' | 'persona';

export interface HarnessContext {
  projectId: string;
  targetModel?: string; // e.g., 'ltx-video', 'stable-diffusion', 'qwen'
  extraParams?: Record<string, string>;
}

export interface PromptHarnessStrategy {
  evaluate(promptText: string, rule: ExtendedPromptHarness, context: HarnessContext): Promise<string>;
}

export type ExtendedPromptHarness = PromptHarness;
