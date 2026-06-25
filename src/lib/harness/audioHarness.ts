import { fetchVocabularyByProject } from "../db";
import { Vocabulary } from "../../types";

export interface AudioHarnessResult {
  textToSpeak: string;
  speakerPrompt: string;
}

/**
 * Standard emotions mapping dictionary for the SSML & Emotion Harness.
 * Translates bracketed Chinese/English emotion terms into:
 * 1. Gemini LLM tone prompt instruction context.
 * 2. Qwen3-TTS / ComfyUI Voice Design prompt modifier.
 */
const EMOTION_MAPS: Record<string, { gemini: string; qwen: string }> = {
  "紧张": {
    gemini: "Tone: Tense, anxious, trembling, breathless, speaking slightly faster",
    qwen: ", speaking in a tense, nervous, rapid, breathless voice"
  },
  "tense": {
    gemini: "Tone: Tense, anxious, trembling, breathless, speaking slightly faster",
    qwen: ", speaking in a tense, nervous, rapid, breathless voice"
  },
  "悄悄话": {
    gemini: "Tone: Whispering, soft, quiet, intimate, secret",
    qwen: ", speaking in a quiet, soft, whispering, intimate tone"
  },
  "私语": {
    gemini: "Tone: Whispering, soft, quiet, intimate, secret",
    qwen: ", speaking in a quiet, soft, whispering, intimate tone"
  },
  "低声": {
    gemini: "Tone: Whispering, soft, quiet, intimate, secret",
    qwen: ", speaking in a quiet, soft, whispering, intimate tone"
  },
  "whisper": {
    gemini: "Tone: Whispering, soft, quiet, intimate, secret",
    qwen: ", speaking in a quiet, soft, whispering, intimate tone"
  },
  "激昂": {
    gemini: "Tone: Excited, energetic, loud, passionate, intense, speaking fast",
    qwen: ", speaking in an excited, energetic, passionate, intense, high-pitched voice"
  },
  "兴奋": {
    gemini: "Tone: Excited, energetic, loud, passionate, intense, speaking fast",
    qwen: ", speaking in an excited, energetic, passionate, intense, high-pitched voice"
  },
  "excited": {
    gemini: "Tone: Excited, energetic, loud, passionate, intense, speaking fast",
    qwen: ", speaking in an excited, energetic, passionate, intense, high-pitched voice"
  },
  "愤怒": {
    gemini: "Tone: Angry, furious, hostile, yelling, strong emotion",
    qwen: ", speaking in an angry, furious, hostile, shouting and aggressive voice"
  },
  "angry": {
    gemini: "Tone: Angry, furious, hostile, yelling, strong emotion",
    qwen: ", speaking in an angry, furious, hostile, shouting and aggressive voice"
  },
  "冷酷": {
    gemini: "Tone: Cold, serious, flat, slow, calm, clinical, unemotional",
    qwen: ", speaking in a cold, serious, flat, slow, calm voice"
  },
  "严肃": {
    gemini: "Tone: Cold, serious, flat, slow, calm, clinical, unemotional",
    qwen: ", speaking in a cold, serious, flat, slow, calm voice"
  },
  "calm": {
    gemini: "Tone: Cold, serious, flat, slow, calm, clinical, unemotional",
    qwen: ", speaking in a cold, serious, flat, slow, calm voice"
  },
  "悲伤": {
    gemini: "Tone: Sad, sobbing, weeping, slow, trembling, deeply emotional",
    qwen: ", speaking in a sad, emotional, weeping, trembling, slow voice"
  },
  "哭腔": {
    gemini: "Tone: Sad, sobbing, weeping, slow, trembling, deeply emotional",
    qwen: ", speaking in a sad, emotional, weeping, trembling, slow voice"
  },
  "sad": {
    gemini: "Tone: Sad, sobbing, weeping, slow, trembling, deeply emotional",
    qwen: ", speaking in a sad, emotional, weeping, trembling, slow voice"
  },
  "温柔": {
    gemini: "Tone: Warm, gentle, friendly, sweet, reassuring",
    qwen: ", speaking in a warm, gentle, friendly, sweet and reassuring tone"
  },
  "gentle": {
    gemini: "Tone: Warm, gentle, friendly, sweet, reassuring",
    qwen: ", speaking in a warm, gentle, friendly, sweet and reassuring tone"
  }
};

/**
 * Applies both Emotion/SSML Harness and Pronunciation Phonetic Harness
 * @param originalText The raw script or dialogue line
 * @param projectId The database project UUID
 * @param baseSpeakerPrompt The current base Qwen voice design or speaker prompt
 */
export async function applyAudioHarness(
  originalText: string,
  projectId: string,
  baseSpeakerPrompt: string = ""
): Promise<AudioHarnessResult> {
  let textToSpeak = originalText;
  let speakerPrompt = baseSpeakerPrompt;

  // --- PART 1: PRONUNCIATION PHONETIC HARNESS ---
  try {
    const vocabList = await fetchVocabularyByProject(projectId);
    
    // Sort vocabList by word length descending so we replace longer/more specific words first
    const sortedVocab = [...vocabList]
      .filter(v => v.word && v.phoneticSymbols && v.phoneticSymbols.trim())
      .sort((a, b) => b.word.length - a.word.length);

    for (const item of sortedVocab) {
      const cleanWord = item.word.trim();
      const phonetic = item.phoneticSymbols!.trim();
      if (!cleanWord || !phonetic) continue;

      // Handle word matching. If word is e.g. "Qwen", we can match both "@Qwen" and "Qwen"
      const triggers = [cleanWord];
      if (cleanWord.startsWith("@")) {
        triggers.push(cleanWord.substring(1));
      } else {
        triggers.push(`@${cleanWord}`);
      }

      for (const trigger of triggers) {
        // Escaping for regex safety
        const escaped = trigger.replace(/[-\/\\^$*+?.()|[\]{}]/g, "\\$&");
        // We match with boundary markers to prevent partial word substitution, 
        // but for Chinese characters or custom triggers we can use wider matches
        let regex: RegExp;
        if (/^[A-Za-z0-9_@]+$/.test(trigger)) {
          // English word or tag
          regex = new RegExp(`\\b${escaped}\\b|${escaped}`, "gi");
        } else {
          // Chinese word
          regex = new RegExp(escaped, "g");
        }

        if (regex.test(textToSpeak)) {
          console.log(`[AudioHarness] Pronunciation Match: replacing "${trigger}" with phonetic alignment "${phonetic}"`);
          textToSpeak = textToSpeak.replace(regex, phonetic);
        }
      }
    }
  } catch (err) {
    console.error("[AudioHarness] Pronunciation database cross-reference skipped/failed:", err);
  }

  // --- PART 2: EMOTION & SSML HARNESS ---
  // Detect brackets like [紧张], [悄悄话], [whisper], [excited]
  const bracketRegex = /\[([^\]]+)\]/g;
  const matches = [...textToSpeak.matchAll(bracketRegex)];

  if (matches.length > 0) {
    const detectedEmotions: string[] = [];
    
    for (const match of matches) {
      const emotionText = match[1].trim();
      detectedEmotions.push(emotionText);
    }

    // Cleanse brackets from final textToSpeak so they aren't spoken literally!
    textToSpeak = textToSpeak.replace(bracketRegex, "").trim();

    // Generate style instructions for active engines
    const geminiMoodInstructions: string[] = [];
    const qwenMoodInstructions: string[] = [];

    for (const emo of detectedEmotions) {
      const mapped = EMOTION_MAPS[emo.toLowerCase()];
      if (mapped) {
        geminiMoodInstructions.push(mapped.gemini);
        qwenMoodInstructions.push(mapped.qwen);
      } else {
        // Dynamic fallback mapping for unregistered emotion tags
        geminiMoodInstructions.push(`Tone: ${emo}`);
        qwenMoodInstructions.push(`, speaking in a ${emo} voice`);
      }
    }

    if (geminiMoodInstructions.length > 0) {
      // Prepend Gemini emotional contextual instructions
      const geminiInstructionString = `[${geminiMoodInstructions.join("; ")}] `;
      textToSpeak = `${geminiInstructionString}"${textToSpeak}"`;
    }

    if (qwenMoodInstructions.length > 0) {
      // Append voice design description modifier
      speakerPrompt = `${speakerPrompt}${qwenMoodInstructions.join("")}`;
    }
  }

  return {
    textToSpeak,
    speakerPrompt
  };
}
