import { PromptHarnessStrategy, ExtendedPromptHarness, HarnessContext } from './types';
import { fetchVisualLibraryByProject } from '../db';
import { getGeminiClient } from '../gemini';

/**
 * Strategy 1: StaticReplaceStrategy
 * Standard substitution: replaces trigger keyword (e.g. "@Protagonist")
 * with visual description from the associated visual library item.
 */
export class StaticReplaceStrategy implements PromptHarnessStrategy {
  async evaluate(promptText: string, rule: ExtendedPromptHarness, context: HarnessContext): Promise<string> {
    if (!promptText || rule.active !== 1) return promptText;

    const trigger = rule.triggerKeyword || "";
    if (!trigger) return promptText;

    const visualAssets = await fetchVisualLibraryByProject(context.projectId);
    const parentAsset = visualAssets.find(v => v.id === rule.visualAssetId);
    if (!parentAsset) return promptText;

    const designDetails = [
      parentAsset.imagePrompt,
      parentAsset.videoPrompt
    ].filter(Boolean).join(", ");

    if (!designDetails.trim()) return promptText;

    let modified = promptText;
    const cleanTrigger = trigger.startsWith('@') ? trigger.slice(1) : trigger;
    
    // Process `@trigger` format first
    const tagRegex = new RegExp(`@${cleanTrigger}\\b`, 'gi');
    if (tagRegex.test(modified)) {
      const replacement = `${cleanTrigger} (${designDetails})`;
      modified = modified.replace(tagRegex, replacement);
    }

    // Process raw exact word match fallback (if not formatted with @ in trigger definition)
    if (modified.toLowerCase().includes(trigger.toLowerCase()) && !trigger.startsWith('@')) {
      const escapedTrigger = trigger.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&');
      const wordRegex = new RegExp(`\\b${escapedTrigger}\\b`, 'gi');
      modified = modified.replace(wordRegex, `${trigger} (${designDetails})`);
    }

    return modified;
  }
}

/**
 * Strategy 2: DynamicParameterStrategy
 * Parses function-like parameterized triggers, e.g. "@Hero(action="jumping", expression="brave")".
 * Renders the result using the rule's defined template, merging defaults from JSON parameters.
 */
export class DynamicParameterStrategy implements PromptHarnessStrategy {
  async evaluate(promptText: string, rule: ExtendedPromptHarness, context: HarnessContext): Promise<string> {
    if (!promptText || rule.active !== 1) return promptText;

    const trigger = rule.triggerKeyword || "";
    if (!trigger) return promptText;

    const cleanTrigger = trigger.startsWith('@') ? trigger.slice(1) : trigger;
    
    // Match `@Trigger(key="val", key2="val2")`
    const dynamicRegex = new RegExp(`@${cleanTrigger}\\s*\\(([^)]*)\\)`, 'gi');
    if (!dynamicRegex.test(promptText)) return promptText;

    // Reset regex index for matching
    dynamicRegex.lastIndex = 0;

    const visualAssets = await fetchVisualLibraryByProject(context.projectId);
    const parentAsset = visualAssets.find(v => v.id === rule.visualAssetId);
    
    // Parse default parameters from the harness rule
    let defaultParams: Record<string, string> = {};
    if (rule.parameters) {
      try {
        defaultParams = JSON.parse(rule.parameters);
      } catch (e) {
        console.warn('[DynamicParameterStrategy] Failed to parse rule parameters JSON:', e);
      }
    }

    // Base asset prompt details to include as default {base_prompt}
    const baseAssetPrompt = parentAsset ? ([parentAsset.imagePrompt, parentAsset.videoPrompt].filter(Boolean).join(", ")) : "";

    let modified = promptText;
    let match;

    // We do a loop replacement of all parameterized invocations
    while ((match = dynamicRegex.exec(promptText)) !== null) {
      const fullMatch = match[0];
      const paramStr = match[1] || "";

      // Parse current match parameters, e.g. action="jumping"
      const parsedParams: Record<string, string> = { ...defaultParams, base_prompt: baseAssetPrompt, name: cleanTrigger };
      
      const paramPairRegex = /(\w+)\s*=\s*["']([^"']*)["']/g;
      let pairMatch;
      while ((pairMatch = paramPairRegex.exec(paramStr)) !== null) {
        parsedParams[pairMatch[1]] = pairMatch[2];
      }

      // Render template
      const template = rule.template || "{base_prompt}, {action}";
      let rendered = template;
      
      // Interpolate all {keys}
      for (const [key, val] of Object.entries(parsedParams)) {
        rendered = rendered.replace(new RegExp(`{${key}}`, 'g'), val);
      }

      // Fallback clean-up of unreplaced template variables
      rendered = rendered.replace(/{\w+}/g, '').replace(/,\s*,/g, ',').trim();

      modified = modified.replace(fullMatch, rendered);
    }

    return modified;
  }
}

/**
 * Strategy 3: StylePresetStrategy
 * Injects overall mood/aesthetic presets globally when specific styled cues or characters appear.
 * E.g., triggers like cinematic, high-key, or when @Protagonist triggers a film noir grading.
 */
export class StylePresetStrategy implements PromptHarnessStrategy {
  async evaluate(promptText: string, rule: ExtendedPromptHarness, context: HarnessContext): Promise<string> {
    if (!promptText || rule.active !== 1) return promptText;

    const trigger = rule.triggerKeyword || "";
    const cleanTrigger = trigger.startsWith('@') ? trigger.slice(1) : trigger;
    
    // Check if prompt contains the trigger
    const containsTrigger = promptText.toLowerCase().includes(cleanTrigger.toLowerCase());
    if (!containsTrigger && trigger !== '*') return promptText; // '*' represents global style rule

    const stylePreset = rule.template || "cinematic lighting, highly detailed, professional grading";
    
    // If global style rule, append it
    if (trigger === '*') {
      return `${promptText}, ${stylePreset}`;
    }

    // Inject style near the trigger or append to the end
    return `${promptText}, [Style: ${stylePreset}]`;
  }
}

/**
 * Strategy 4: ModelAdapterStrategy
 * Formats/transforms prompts depending on the target generation engine (e.g. LTX-Video vs Stable Diffusion vs Qwen)
 */
export class ModelAdapterStrategy implements PromptHarnessStrategy {
  async evaluate(promptText: string, rule: ExtendedPromptHarness, context: HarnessContext): Promise<string> {
    if (!promptText || rule.active !== 1) return promptText;

    // Check if the context's target model matches the rule's specified model
    if (rule.targetModel && context.targetModel && rule.targetModel.toLowerCase() !== context.targetModel.toLowerCase()) {
      return promptText;
    }

    const adapterTemplate = rule.template;
    if (!adapterTemplate) return promptText;

    // Customize according to specific engine rules
    if (context.targetModel === 'ltx-video') {
      // LTX-Video loves motion words and starts with verbs, action-packed details
      return `Detailed video sequence of ${promptText}. Motion: ${adapterTemplate}`;
    } else if (context.targetModel === 'stable-diffusion') {
      // SD loves comma separated high resolution taglines
      return `${promptText}, masterwork, ultra-detailed, 8k resolution, ${adapterTemplate}`;
    }

    return promptText;
  }
}

/**
 * Strategy 5: AudioAmbientStrategy
 * Enhances/generates specific musical prompts or acoustic sound-effects
 */
export class AudioAmbientStrategy implements PromptHarnessStrategy {
  async evaluate(promptText: string, rule: ExtendedPromptHarness, context: HarnessContext): Promise<string> {
    if (!promptText || rule.active !== 1) return promptText;

    const trigger = rule.triggerKeyword || "";
    if (!trigger.startsWith('@audio')) return promptText;

    const cleanTrigger = trigger.replace('@audio-', '');
    if (promptText.toLowerCase().includes(cleanTrigger.toLowerCase())) {
      const sfxPrompt = rule.template || "ambient cinematic soundscape, immersive stereo mix";
      return `${promptText}. [Acoustics: ${sfxPrompt}]`;
    }

    return promptText;
  }
}

/**
 * Strategy 6: GenreHarnessStrategy
 * Applies genre-specific thematic writing constraints or scene description prompts.
 * Uses real-time Gemini LLM processing when available to rewrite/enhance the text to fit the literary genre,
 * with standard token-based appending/interpolation fallbacks.
 */
export class GenreHarnessStrategy implements PromptHarnessStrategy {
  async evaluate(promptText: string, rule: ExtendedPromptHarness, context: HarnessContext): Promise<string> {
    if (!promptText || rule.active !== 1) return promptText;

    const trigger = rule.triggerKeyword || "";
    const cleanTrigger = trigger.startsWith('@') ? trigger.slice(1) : trigger;
    const genreName = rule.template || "Cinematic Sci-Fi";

    // Only apply if the prompt contains the @genre triggers, or if it is a wildcard (*) global genre rule
    const isTriggered = trigger === '*' || promptText.toLowerCase().includes(cleanTrigger.toLowerCase());
    if (!isTriggered) return promptText;

    try {
      const ai = getGeminiClient();
      if (ai) {
        const aiPrompt = `You are an expert script writer and cinematic director. 
Rewrite and expand the following scene description or draft script to fit the literary genre style: "${genreName}".
Maintain the core action and content, but infuse it with vivid genre-specific vocabulary, atmosphere, and styling.
Keep any bracketed voice notes or cues intact.
Provide ONLY the newly styled text without any explanation, intro, or markdown codeblocks:
"${promptText}"`;

        const response = await ai.models.generateContent({
          model: 'gemini-3.5-flash',
          contents: aiPrompt,
        });

        const result = response.text?.trim();
        if (result) return result;
      }
    } catch (err) {
      console.warn("[GenreHarnessStrategy] Gemini enhancement failed, falling back to static append:", err);
    }

    // Fallback: append the genre style instructions
    const fallbackAdd = `styled in ${genreName} genre atmosphere`;
    if (trigger === '*') {
      return `${promptText}, ${fallbackAdd}`;
    }
    return promptText.replace(new RegExp(`@?${cleanTrigger}\\b`, 'gi'), `(${fallbackAdd})`);
  }
}

/**
 * Strategy 7: PersonaSpeechStrategy
 * Adapts character dialogues / speech lines to the precise voice, mannerism, and speaking tone of their character persona.
 * Leverages Gemini's roleplay prompting for dynamic tone styling, falling back to direct speaker tags.
 */
export class PersonaSpeechStrategy implements PromptHarnessStrategy {
  async evaluate(promptText: string, rule: ExtendedPromptHarness, context: HarnessContext): Promise<string> {
    if (!promptText || rule.active !== 1) return promptText;

    const trigger = rule.triggerKeyword || "";
    if (!trigger) return promptText;

    const cleanTrigger = trigger.startsWith('@') ? trigger.slice(1) : trigger;
    
    // We look for patterns like: @Sherlock: "Let's go." or Sherlock: "Let's go."
    const speakerRegex = new RegExp(`@?(${cleanTrigger})\\s*:\\s*["'“]([^"'”]+)["'”]|@?(${cleanTrigger})\\s*:\\s*([^\\n]+)`, 'i');
    const match = speakerRegex.exec(promptText);
    
    if (!match) return promptText;

    const rawSpeech = match[2] || match[4] || "";
    if (!rawSpeech.trim()) return promptText;

    const personaInstructions = rule.template || "A unique speaking voice matching the character's background.";

    try {
      const ai = getGeminiClient();
      if (ai) {
        const aiPrompt = `You are a creative dialogue doctor. 
Adapt the following raw speech or line to match the specific speaking tone, vocabulary, and mannerisms of this character persona.
Persona Guidelines: ${personaInstructions}
Raw dialogue line: "${rawSpeech}"
Ensure the spoken tone feels natural and deeply rooted in the persona. Do not change the underlying meaning or intent of the line.
Provide ONLY the polished dialogue line inside quotation marks, with no other text, commentary, or explanation:`;

        const response = await ai.models.generateContent({
          model: 'gemini-3.5-flash',
          contents: aiPrompt,
        });

        let rewrittenSpeech = response.text?.trim() || rawSpeech;
        // Strip outer quotes if the AI returned them
        if (rewrittenSpeech.startsWith('"') && rewrittenSpeech.endsWith('"')) {
          rewrittenSpeech = rewrittenSpeech.slice(1, -1);
        } else if (rewrittenSpeech.startsWith('“') && rewrittenSpeech.endsWith('”')) {
          rewrittenSpeech = rewrittenSpeech.slice(1, -1);
        }

        const fullMatch = match[0];
        const hasQuotes = fullMatch.includes('"') || fullMatch.includes('“') || fullMatch.includes("'");
        const replacedLine = hasQuotes 
          ? `${cleanTrigger}: "${rewrittenSpeech}"` 
          : `${cleanTrigger}: ${rewrittenSpeech}`;
        return promptText.replace(fullMatch, replacedLine);
      }
    } catch (err) {
      console.warn("[PersonaSpeechStrategy] Gemini roleplay alignment failed:", err);
    }

    // Fallback: return as bracketed tone guide
    return promptText.replace(match[0], `${cleanTrigger} [Tone: ${personaInstructions}]: "${rawSpeech}"`);
  }
}
