export interface SubtitleStyleConfig {
  fontName: string;
  fontSize: number;
  primaryColor: string;      // RGB Hex (e.g. #FFFFFF)
  secondaryColor: string;    // Karaoke Highlight RGB Hex (e.g. #FF5D22)
  outlineColor: string;      // RGB Hex (e.g. #000000)
  backColor: string;         // RGB Hex (e.g. #111114)
  bold: boolean;
  italic: boolean;
  borderStyle: number;       // 1 = outline, 3 = opaque box
}

export const DEFAULT_SUBTITLE_STYLE: SubtitleStyleConfig = {
  fontName: 'Space Grotesk',
  fontSize: 54,
  primaryColor: '#FFFFFF',
  secondaryColor: '#FF5D22', // Neon Orange accent
  outlineColor: '#000000',
  backColor: '#000000',
  bold: true,
  italic: false,
  borderStyle: 1
};

/**
 * Converts standard RGB hex color string (e.g., "#FF5D22" or "FF5D22")
 * into the SSA/ASS representation format: &HAABBGGRR.
 * Alpha is normally "00" (fully opaque).
 */
export function hexToAssColor(hex: string, alphaHex: string = "00"): string {
  let clean = hex.replace("#", "");
  if (clean.length === 3) {
    clean = clean.split('').map(c => c + c).join('');
  }
  if (clean.length !== 6) {
    return "&H" + alphaHex + "FFFFFF"; // default fallback
  }
  // Hex order: RR GG BB -> ASS order: BB GG RR
  const r = clean.substring(0, 2);
  const g = clean.substring(2, 4);
  const b = clean.substring(4, 6);
  return `&H${alphaHex}${b}${g}${r}`;
}

export interface SubtitleDialogueLine {
  index: number;
  startSec: number;
  endSec: number;
  text: string;
  videoUrl?: string;
  audioUrl?: string;
}

/**
 * Parse standard SRT string to Dialogue array
 */
export function parseSRT(srt: string): SubtitleDialogueLine[] {
  const cleanSrt = srt.replace(/^\uFEFF/, "").replace(/\r/g, "");
  const lines = cleanSrt.split("\n");
  const result: SubtitleDialogueLine[] = [];
  let currentBlock: string[] = [];

  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed === "") {
      if (currentBlock.length >= 2) {
        const dialog = parseSRTBlock(currentBlock);
        if (dialog) result.push(dialog);
      }
      currentBlock = [];
    } else {
      currentBlock.push(trimmed);
    }
  }

  if (currentBlock.length >= 2) {
    const dialog = parseSRTBlock(currentBlock);
    if (dialog) result.push(dialog);
  }

  return result;
}

function parseSRTBlock(block: string[]): SubtitleDialogueLine | null {
  try {
    const indexStr = block[0].trim();
    const index = parseInt(indexStr, 10);
    if (isNaN(index)) return null;

    const timingLine = block[1].trim();
    const parts = timingLine.split(/\s*-->\s*/);
    if (parts.length < 2) return null;

    const parseTime = (timeStr: string): number | null => {
      const clean = timeStr.trim().replace(',', '.');
      const timeParts = clean.split(':');
      if (timeParts.length === 3) {
        const h = parseFloat(timeParts[0]);
        const m = parseFloat(timeParts[1]);
        const s = parseFloat(timeParts[2]);
        if (!isNaN(h) && !isNaN(m) && !isNaN(s)) {
          return h * 3600 + m * 60 + s;
        }
      } else if (timeParts.length === 2) {
        const m = parseFloat(timeParts[0]);
        const s = parseFloat(timeParts[1]);
        if (!isNaN(m) && !isNaN(s)) {
          return m * 60 + s;
        }
      } else if (timeParts.length === 1) {
        const s = parseFloat(timeParts[0]);
        if (!isNaN(s)) {
          return s;
        }
      }
      return null;
    };

    const startSec = parseTime(parts[0]);
    const endSec = parseTime(parts[1]);
    if (startSec === null || endSec === null) return null;

    const text = block.slice(2).join(" ").trim();
    return { index, startSec, endSec, text };
  } catch (e) {
    return null;
  }
}

/**
 * Strips bracketed descriptors from narration script for clean subtitles
 */
export function cleanNarrationText(text: string): string {
  return text
    .replace(/\[[^\]]*\]/g, "") // remove [Visual: ...] or [Sound: ...]
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Formats seconds into ASS time format: H:MM:SS.CC (centiseconds)
 */
export function formatAssTime(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  const cc = Math.floor((seconds % 1) * 100);

  const sh = String(h);
  const sm = String(m).padStart(2, '0');
  const ss = String(s).padStart(2, '0');
  const scc = String(cc).padStart(2, '0');

  return `${sh}:${sm}:${ss}.${scc}`;
}

/**
 * Generates an ASS file contents from dialogue lines,
 * embedding proportional word-by-word karaoke highlighters (\k<duration>)
 */
export function compileDialogueToASS(
  lines: SubtitleDialogueLine[], 
  style: SubtitleStyleConfig = DEFAULT_SUBTITLE_STYLE
): string {
  // Convert standard hex colors to ASS formatted variables
  const primaryAssColor = hexToAssColor(style.primaryColor);
  const secondaryAssColor = hexToAssColor(style.secondaryColor); // highlight
  const outlineAssColor = hexToAssColor(style.outlineColor);
  const backAssColor = hexToAssColor(style.backColor);

  const assHeader = `[Script Info]
; Script generated by AI Video Studio Subtitle Intelligence
Title: Synced Highlight Video Subtitles
ScriptType: v4.00+
WrapStyle: 0
PlayResX: 1920
PlayResY: 1080
ScaledBorderAndShadow: yes

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Default,${style.fontName},${style.fontSize},${primaryAssColor},${secondaryAssColor},${outlineAssColor},${backAssColor},${style.bold ? 1 : 0},${style.italic ? 1 : 0},0,0,100,100,0,0,${style.borderStyle},3,0,2,30,30,60,1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
`;

  let eventLines = "";

  for (const line of lines) {
    const startStr = formatAssTime(line.startSec);
    const endStr = formatAssTime(line.endSec);
    const cleanText = cleanNarrationText(line.text);
    
    if (!cleanText) continue;

    const words = cleanText.split(/\s+/).filter(Boolean);
    const totalDurationCentiseconds = Math.round((line.endSec - line.startSec) * 100);

    if (words.length <= 1 || totalDurationCentiseconds <= 0) {
      // Single word, keep simple karaoke or text
      const karaokeTag = totalDurationCentiseconds > 0 ? `{\\k${totalDurationCentiseconds}}` : "";
      eventLines += `Dialogue: 0,${startStr},${endStr},Default,,0,0,0,,${karaokeTag}${cleanText}\n`;
      continue;
    }

    // Allocate centiseconds proportionally based on word character length (weighted layout)
    const charLengths = words.map(w => w.length);
    const totalChars = charLengths.reduce((sum, len) => sum + len, 0);

    let allocatedSum = 0;
    const wordDurations = words.map((w, idx) => {
      if (idx === words.length - 1) {
        // Last word gets remainder to resolve rounding errors
        return totalDurationCentiseconds - allocatedSum;
      }
      const dur = Math.round((w.length / totalChars) * totalDurationCentiseconds);
      allocatedSum += dur;
      return dur;
    });

    // Build Karaoke string: {\k34}Word1 {\k28}Word2 etc.
    let karaokeBody = "";
    for (let i = 0; i < words.length; i++) {
      const dur = wordDurations[i];
      // \k specifies duration of this syllable/word in centiseconds
      karaokeBody += `{\\k${dur}}${words[i]}${i < words.length - 1 ? " " : ""}`;
    }

    eventLines += `Dialogue: 0,${startStr},${endStr},Default,,0,0,0,,${karaokeBody}\n`;
  }

  return assHeader + eventLines;
}
