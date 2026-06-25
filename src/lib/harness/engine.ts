import { ExtendedPromptHarness, HarnessContext, PromptHarnessStrategy, HarnessType } from './types';
import { 
  StaticReplaceStrategy, 
  DynamicParameterStrategy, 
  StylePresetStrategy, 
  ModelAdapterStrategy, 
  AudioAmbientStrategy,
  GenreHarnessStrategy,
  PersonaSpeechStrategy
} from './strategies';

export class PromptHarnessEngine {
  private static instance: PromptHarnessEngine;
  private strategies: Map<HarnessType, PromptHarnessStrategy> = new Map();

  private constructor() {
    // Register the strategies inside the factory/registry
    this.strategies.set('static', new StaticReplaceStrategy());
    this.strategies.set('dynamic', new DynamicParameterStrategy());
    this.strategies.set('style', new StylePresetStrategy());
    this.strategies.set('adapter', new ModelAdapterStrategy());
    this.strategies.set('audio', new AudioAmbientStrategy());
    this.strategies.set('genre', new GenreHarnessStrategy());
    this.strategies.set('persona', new PersonaSpeechStrategy());
  }

  public static getInstance(): PromptHarnessEngine {
    if (!PromptHarnessEngine.instance) {
      PromptHarnessEngine.instance = new PromptHarnessEngine();
    }
    return PromptHarnessEngine.instance;
  }

  /**
   * Evaluates a prompt text against a collection of harness rules.
   * Processed sequentially based on priority or type structure.
   */
  public async process(
    promptText: string, 
    rules: ExtendedPromptHarness[], 
    context: HarnessContext
  ): Promise<string> {
    if (!promptText || !promptText.trim() || rules.length === 0) {
      return promptText;
    }

    let result = promptText;

    // Sort rules: Dynamic and Static first (content changes), then style and adapters (enrichments)
    const sortedRules = [...rules].sort((a, b) => {
      const typePriority = (t?: HarnessType) => {
        if (t === 'persona') return 0; // Persona dialogue translation runs first
        if (t === 'dynamic') return 1;
        if (t === 'static') return 2;
        if (t === 'audio') return 3;
        if (t === 'genre') return 4;   // Genre styles apply after base changes
        if (t === 'style') return 5;
        if (t === 'adapter') return 6;
        return 9;
      };
      return typePriority(a.type) - typePriority(b.type);
    });

    for (const rule of sortedRules) {
      if (rule.active !== 1) continue;

      const type = rule.type || 'static';
      const strategy = this.strategies.get(type);

      if (strategy) {
        try {
          result = await strategy.evaluate(result, rule, context);
        } catch (err) {
          console.error(`[PromptHarnessEngine] Error in strategy '${type}' for rule id ${rule.id}:`, err);
        }
      }
    }

    return result;
  }
}
