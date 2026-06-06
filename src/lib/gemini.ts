import { GoogleGenAI } from "@google/genai";

// Standard client-side wrapper in this SPA using the key bound during Vite compile
const getApiKey = (): string => {
  return (process.env.GEMINI_API_KEY as string) || "";
};

let aiClient: GoogleGenAI | null = null;

export function getGeminiClient(): GoogleGenAI {
  if (!aiClient) {
    const key = getApiKey();
    if (!key) {
      console.warn("GEMINI_API_KEY environment variable is not defined. Please set it in Settings > Secrets.");
    }
    aiClient = new GoogleGenAI({
      apiKey: key,
      httpOptions: {
        headers: {
          'User-Agent': 'aistudio-build',
        }
      }
    });
  }
  return aiClient;
}

/**
 * Translates a given script segment into the specified target language
 */
export async function translateTextGemini(text: string, targetLanguage: string): Promise<string> {
  const ai = getGeminiClient();
  try {
    const prompt = `Translate the following text into ${targetLanguage}. 
Keep any bracketed scene notes, layout tags, or cinematic directions (such as [Visual: xxx]) intact verbatim.
Provide ONLY the translated text without any explanation, preamble, or markdown wrapper like codeblocks:
"${text}"`;

    const response = await ai.models.generateContent({
      model: 'gemini-3.5-flash',
      contents: prompt,
    });

    return response.text?.trim() || "";
  } catch (e) {
    console.error("Gemini script translation failed:", e);
    throw e;
  }
}

/**
 * Transcribes audio data (in base64 format) into text using multi-modal transcription
 */
export async function transcribeAudioGemini(audioBase64: string, mimeType: string = 'audio/mp3'): Promise<string> {
  const ai = getGeminiClient();
  try {
    const response = await ai.models.generateContent({
      model: 'gemini-3.5-flash',
      contents: [
        {
          inlineData: {
            mimeType,
            data: audioBase64
          }
        },
        'Transcribe this audio. Please return ONLY the exact words spoken, utilizing correct capitalization and punctuation. Do not write any meta-labels, timing cues, or intros. Just output the verbatim transcript.'
      ]
    });

    return response.text?.trim() || "";
  } catch (e) {
    console.error("Gemini audio transcription (ASR) failed:", e);
    throw e;
  }
}

/**
 * Synthesizes text to speech with Gemini TTS and returns the audio as a base64 string
 */
export async function synthesizeSpeechGemini(text: string, voiceName: string = 'Kore'): Promise<string> {
  const ai = getGeminiClient();
  try {
    // voiceName options: 'Puck', 'Charon', 'Kore', 'Fenrir', 'Zephyr'
    const response = await ai.models.generateContent({
      model: "gemini-3.1-flash-tts-preview",
      contents: [{ parts: [{ text }] }],
      config: {
        responseModalities: ['AUDIO'],
        speechConfig: {
          voiceConfig: {
            prebuiltVoiceConfig: { voiceName },
          },
        },
      },
    });

    const base64Audio = response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
    if (!base64Audio) {
      throw new Error("No inline audio data returned by Gemini TTS");
    }
    return base64Audio;
  } catch (e) {
    console.error("Gemini Speech (TTS) generation failed:", e);
    throw e;
  }
}
