/**
 * Prompt Generation Decorator Pattern Module
 * Implements the Decorator design pattern to build, optimize, and fuse 
 * multi-modal prompt inputs (Visual Style, IP, Scene, Lighting, Voice presets) 
 * for digital human and scene generation.
 */

// 1. Component Interface
export interface IPromptBuilder {
  build(basePrompt: string): string;
}

// 2. Concrete Base Component
export class BasePromptBuilder implements IPromptBuilder {
  build(basePrompt: string): string {
    return (basePrompt || "").trim();
  }
}

// 3. Abstract Decorator
export abstract class PromptDecorator implements IPromptBuilder {
  protected builder: IPromptBuilder;

  constructor(builder: IPromptBuilder) {
    this.builder = builder;
  }

  build(basePrompt: string): string {
    return this.builder.build(basePrompt);
  }
}

// 4. Visual Style Decorator
export class VisualStyleDecorator extends PromptDecorator {
  private styleVal: string;

  constructor(builder: IPromptBuilder, styleVal: string) {
    super(builder);
    this.styleVal = styleVal;
  }

  build(basePrompt: string): string {
    const previous = super.build(basePrompt);
    
    // Formatting the Visual Style as a structured prompt rule
    const styleDescriptions: Record<string, string> = {
      realism: "hyper-realistic photograph, 8k resolution, photorealistic skin texture, intricate lifelike details",
      scenery: "majestic breathtaking scenery, masterclass composition, rich nature colors, vivid details",
      movie: "cinematic film still, shot on 35mm lens, authentic film grain, depth of field, blockbuster movie aesthetic",
      anime: "modern anime illustration, crisp clean vector lines, dynamic colorful anime cell shading style",
      ghibli: "hand-painted studio ghibli anime illustration background, warm nostalgic watercolor feel, beautiful cozy aesthetic",
      cyberpunk: "cyberpunk futuristic science fiction aesthetic, glowing holographic elements, wet streets, neon-noir look"
    };

    const styleDesc = styleDescriptions[this.styleVal] || "";
    if (!styleDesc) return previous;

    return previous 
      ? `${previous}, Visual Style Rules: [${styleDesc}]` 
      : `Visual Style Rules: [${styleDesc}]`;
  }
}

// 5. IP/Character Decorator
export class IPDecorator extends PromptDecorator {
  private ipVal: string;

  constructor(builder: IPromptBuilder, ipVal: string) {
    super(builder);
    this.ipVal = ipVal;
  }

  build(basePrompt: string): string {
    const previous = super.build(basePrompt);

    const ipPresets: Record<string, string> = {
      none: "",
      cyber_agent: "IP Character: a futuristic cybernetic intelligence agent, sleek black carbon fiber armor, subtle glowing blue cyber-optics, cool detached expressions",
      sweet_girl: "IP Character: a heartwarming sweet anime girl, high-spirited innocent eyes, sporting a cute outfit with colorful accents, gentle and friendly smile",
      news_anchor: "IP Character: an articulate professional television news reporter, elegant tailored business attire, confident and composed presenting posture",
      tech_dev: "IP Character: a young tech explorer, modern casual hoodie, smart intelligent eyes, wireless headphones, tech enthusiast vibe"
    };

    const ipDesc = ipPresets[this.ipVal] || "";
    if (!ipDesc) return previous;

    return previous 
      ? `${previous}, Character Setup: {${ipDesc}}` 
      : `Character Setup: {${ipDesc}}`;
  }
}

// 6. Scene / Environment Decorator
export class ScenePresetDecorator extends PromptDecorator {
  private scenePresetVal: string;

  constructor(builder: IPromptBuilder, scenePresetVal: string) {
    super(builder);
    this.scenePresetVal = scenePresetVal;
  }

  build(basePrompt: string): string {
    const previous = super.build(basePrompt);

    const scenePresets: Record<string, string> = {
      none: "",
      cozy_bedroom: "Environment: a cozy indoor bedroom filled with wooden bookshelves, small potted plants, soft blankets, warm ambient details",
      neon_city: "Environment: a bustling cyberpunk city street corner at night, towering skyscrapers, rain-soaked asphalt with glowing colorful neon reflections",
      studio_broadcasting: "Environment: a state-of-the-art virtual live-streaming broadcasting studio stage, sleek screens showing graphics, modern futuristic pod",
      fantasy_forest: "Environment: a mystical pastel enchanted forest, glowing fairy lights, giant hollow ancient tree trunks, surreal colorful moss and flora"
    };

    const sceneDesc = scenePresets[this.scenePresetVal] || "";
    if (!sceneDesc) return previous;

    return previous 
      ? `${previous}, Environment Setup: {${sceneDesc}}` 
      : `Environment Setup: {${sceneDesc}}`;
  }
}

// 7. Lighting Decorator
export class LightingDecorator extends PromptDecorator {
  private lightingVal: string;

  constructor(builder: IPromptBuilder, lightingVal: string) {
    super(builder);
    this.lightingVal = lightingVal;
  }

  build(basePrompt: string): string {
    const previous = super.build(basePrompt);

    const lightingPresets: Record<string, string> = {
      none: "",
      volumetric: "Lighting Style: dramatic volumetric lighting, dusty sunbeams cutting through background, strong light shafts, high contrast chiaroscuro",
      soft_studio: "Lighting Style: professional high-key soft studio ring lighting, diffuse flawless shadows, crisp reflection in pupils, portrait beauty setup",
      neon_glow: "Lighting Style: cyber neon-noir glow, strong dual-tone purple and cyan ambient lighting, stark high contrast backlight rims",
      golden_hour: "Lighting Style: warm soft golden hour sunset sunlight, low angular sun rays, beautiful lens flare, romantic dreamlike backlight"
    };

    const lightDesc = lightingPresets[this.lightingVal] || "";
    if (!lightDesc) return previous;

    return previous 
      ? `${previous}, Lighting: {${lightDesc}}` 
      : `Lighting: {${lightDesc}}`;
  }
}

// 8. Voice Character/Tone Decorator
export class VoicePresetDecorator extends PromptDecorator {
  private voiceId: string;

  constructor(builder: IPromptBuilder, voiceId: string) {
    super(builder);
    this.voiceId = voiceId;
  }

  build(basePrompt: string): string {
    const previous = super.build(basePrompt);

    const voicePresets: Record<string, string> = {
      vox_female_news: "Audio Character Tone: articulate professional news anchor voice, elegant and clear presentation cadence, mid-range warm broadcast voice",
      vox_male_tech: "Audio Character Tone: deep rich tech narrator baritone, authoritative yet highly engaging voice, slow steady exposition cadence",
      vox_ghibli_boy: "Audio Character Tone: bright youthful energetic boyish voice, high enthusiasm, pure heartwarming and adventurous expressions",
      vox_sweet_girl: "Audio Character Tone: soft sweet melodic high-pitched girl voice, bubbly cuteness, whispering soothing narrative tone",
      vox_cyber_agent: "Audio Character Tone: cybernetic cool agent voice, slightly electronic vocal modulation, detached modern intelligence feel"
    };

    const voiceDesc = voicePresets[this.voiceId] || "";
    if (!voiceDesc) return previous;

    return previous 
      ? `${previous}, Audio/Voice Identity Matching: [${voiceDesc}]` 
      : `Audio/Voice Identity Matching: [${voiceDesc}]`;
  }
}

/**
 * Prompt fusion manager that builds the full decorated prompt chain
 */
export function buildFusedPrompt(params: {
  basePrompt: string;
  visualStyle: string;
  ipPreset: string;
  scenePreset: string;
  lightingPreset: string;
  voicePreset: string;
}): string {
  let builder: IPromptBuilder = new BasePromptBuilder();

  // Apply visual style decorator
  builder = new VisualStyleDecorator(builder, params.visualStyle);

  // Apply character IP decorator
  builder = new IPDecorator(builder, params.ipPreset);

  // Apply scene environment decorator
  builder = new ScenePresetDecorator(builder, params.scenePreset);

  // Apply lighting decorator
  builder = new LightingDecorator(builder, params.lightingPreset);

  // Apply audio voice decorator
  builder = new VoicePresetDecorator(builder, params.voicePreset);

  // Execute the builder chain with the base scene prompt
  return builder.build(params.basePrompt);
}

/**
 * Resolves visual style and visual library items for images or videos.
 * It prepends the visual style and replaces any @name markers inside the basePrompt.
 */
export function getDecoratedPrompt(
  basePrompt: string,
  isVideo: boolean,
  visualLibraryItems: any[],
  project: any,
  promptHarnesses?: any[]
): string {
  if (!basePrompt) return '';

  // 1. Find the project's visual style prompt from the loaded promptHarnesses (from database)
  let stylePrompt = '';
  const styleVal = project?.visualStyle || 'Cinematic';

  if (project && promptHarnesses) {
    const styleHarness = promptHarnesses.find(
      h => h.triggerKeyword === styleVal && h.type === 'visual_style'
    );
    if (styleHarness) {
      stylePrompt = isVideo ? (styleHarness.parameters || '') : (styleHarness.template || '');
    }
  }

  // Fallback to loaded @Style item from visualLibraryItems
  if (!stylePrompt) {
    const styleItem = visualLibraryItems?.find(item => item.shortName === '@Style');
    if (styleItem) {
      stylePrompt = isVideo ? (styleItem.videoPrompt || '') : (styleItem.imagePrompt || '');
    }
  }

  // Fallback to static style mappings if not found in database or visualLibraryItems yet
  if (!stylePrompt && project) {
    // Static descriptions for image styles
    const styleDescriptionsImage: Record<string, string> = {
      'Cinematic': "classic 35mm photograph, shallow depth of field, warm cinematic lighting, ultra-detailed photorealistic, shot on ARRI Alexa",
      '电影': "classic 35mm photograph, shallow depth of field, warm cinematic lighting, ultra-detailed photorealistic, shot on ARRI Alexa",
      'Animation': "Pixar style 3D animation, soft clay render, stylized big expressive eyes, bright colorful lighting, sub-surface scattering skin",
      '动画': "Pixar style 3D animation, soft clay render, stylized big expressive eyes, bright colorful lighting, sub-surface scattering skin",
      'Comic': "vibrant anime manga comic illustration, ink lineart, halftone dots, bold line weight, screentone shading overlay",
      '漫画': "vibrant anime manga comic illustration, ink lineart, halftone dots, bold line weight, screentone shading overlay",
      'Ghibli': "Studio Ghibli aesthetic watercolor handpainted anime wallpaper, nostalgic rich color scheme, gorgeous scenery master keyframe",
      '吉卜力': "Studio Ghibli aesthetic watercolor handpainted anime wallpaper, nostalgic rich color scheme, gorgeous scenery master keyframe",
      'Pixar': "high-end 3D Disney Pixar animation render, cute stylized character, extremely expressive eyes, realistic hair groom, sub-surface scattering skin, cinematic colorful keyframe, smooth 3D render",
      '皮克斯动画': "high-end 3D Disney Pixar animation render, cute stylized character, extremely expressive eyes, realistic hair groom, sub-surface scattering skin, cinematic colorful keyframe, smooth 3D render",
      'PixarClay': "claymation cute animation style, handcrafted cozy clay texture, soft matte finish, cute round proportions, miniature diorama set, stop-motion aesthetic",
      '皮克斯粘土': "claymation cute animation style, handcrafted cozy clay texture, soft matte finish, cute round proportions, miniature diorama set, stop-motion aesthetic",
      'Cyberpunk': "futuristic cyberpunk cityscape portrait, glowing neon signs, vibrant pink and cyan highlights, wet rainy pavement reflections, detailed cybernetic enhancements, high-tech dark atmosphere",
      '赛博朋克': "futuristic cyberpunk cityscape portrait, glowing neon signs, vibrant pink and cyan highlights, wet rainy pavement reflections, detailed cybernetic enhancements, high-tech dark atmosphere",
      'OilPainting': "classical oil painting aesthetic, textured brush strokes, impasto technique, rich deep color palette, masterwork gallery level detail, fine canvas texture",
      '写实油画': "classical oil painting aesthetic, textured brush strokes, impasto technique, rich deep color palette, masterwork gallery level detail, fine canvas texture",
      'UkiyoE': "classic Japanese Ukiyo-e woodblock print style, handpainted mineral pigments, elegant dark ink outlines, flat solid color planes, vintage mulberry paper texture, flowing woodblock artwork",
      '传统浮世绘': "classic Japanese Ukiyo-e woodblock print style, handpainted mineral pigments, elegant dark ink outlines, flat solid color planes, vintage mulberry paper texture, flowing woodblock artwork",
      'UnrealEngine': "photorealistic ultra-detailed render, Unreal Engine 5 aesthetic, global illumination, hyper-detailed skin pores and fabric weave, ray-traced shadows, gorgeous cinematography",
      '虚幻写实': "photorealistic ultra-detailed render, Unreal Engine 5 aesthetic, global illumination, hyper-detailed skin pores and fabric weave, ray-traced shadows, gorgeous cinematography"
    };

    // Static descriptions for video styles
    const styleDescriptionsVideo: Record<string, string> = {
      'Cinematic': "35mm cinema camera film grain, dramatic high contrast, photorealistic cinematic movement",
      '电影': "35mm cinema camera film grain, dramatic high contrast, photorealistic cinematic movement",
      'Animation': "3D stylized animation keyframes, soft render movement, vibrant colors",
      '动画': "3D stylized animation keyframes, soft render movement, vibrant colors",
      'Comic': "dynamic visual novel anime style cells, bold outline transition",
      '漫画': "dynamic visual novel anime style cells, bold outline transition",
      'Ghibli': "nostalgic hand-painted watercolor anime scene landscape panning, retro aesthetic",
      '吉卜力': "nostalgic hand-painted watercolor anime scene landscape panning, retro aesthetic",
      'Pixar': "smooth cinematic 3D character animation, playful expressions, classic Pixar storytelling camera pan",
      '皮克斯动画': "smooth cinematic 3D character animation, playful expressions, classic Pixar storytelling camera pan",
      'PixarClay': "stop-motion claymation character movement, subtle playful clay deformation, tactile cozy animations",
      '皮克斯粘土': "stop-motion claymation character movement, subtle playful clay deformation, tactile cozy animations",
      'Cyberpunk': "cinematic neon lighting reflection, rain trickling down, high-speed camera sweep with lens flares",
      '赛博朋克': "cinematic neon lighting reflection, rain trickling down, high-speed camera sweep with lens flares",
      'OilPainting': "slow moving camera panning across a fine-art oil canvas, artistic organic motion",
      '写实油画': "slow moving camera panning across a fine-art oil canvas, artistic organic motion",
      'UkiyoE': "stylized woodblock flat illustration camera panning, gentle organic paper ripples, retro hand-drawn frames",
      '传统浮世绘': "stylized woodblock flat illustration camera panning, gentle organic paper ripples, retro hand-drawn frames",
      'UnrealEngine': "epic cinematic tracking shot, hyper-realistic physics engine movement, crisp focus pulling, atmospheric details",
      '虚幻写实': "epic cinematic tracking shot, hyper-realistic physics engine movement, crisp focus pulling, atmospheric details"
    };

    stylePrompt = isVideo ? (styleDescriptionsVideo[styleVal] || '') : (styleDescriptionsImage[styleVal] || '');
  }

  // 2. Resolve @name markers from visual library items in basePrompt
  const tagRegex = /@([a-zA-Z0-9_\-\u4e00-\u9fa5]+)/g;
  let resolvedPrompt = basePrompt.replace(tagRegex, (match, name) => {
    const matchedItem = visualLibraryItems?.find(item => {
      const cleanShortName = item.shortName ? item.shortName.replace(/^@/, '').toLowerCase() : '';
      const cleanTargetName = name.toLowerCase();
      return cleanShortName === cleanTargetName;
    });

    if (matchedItem) {
      const itemPrompt = isVideo ? (matchedItem.videoPrompt || '') : (matchedItem.imagePrompt || '');
      return itemPrompt ? `${itemPrompt}` : match;
    }
    return match;
  });

  // 3. Prepend style prompt
  if (stylePrompt) {
    if (!resolvedPrompt.includes(stylePrompt)) {
      return `${stylePrompt}, ${resolvedPrompt}`;
    }
  }
  return resolvedPrompt;
}

