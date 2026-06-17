# AI Generation Blueprint: Prompt / Context / Harness (PCH) Engineering Solutions
### Multi-modal Consistency & High-Efficiency Pipeline Architecture Playbook

This playbook outlines the official solutions and engineering specifications for the **Prompt, Context, and Harness (PCH)** ecosystem integrated within this full-stack workspace. These protocols resolve persistent multi-modal consistency gaps in AI-generated imagery, voices, and animations.

---

## 1. The Core Architecture of PCH Engineering

The application's AI production workflow separates creative output into three decoupled layers:

```
                            +-------------------------------------------+
                            |            USER SCRIPT / STORY            |
                            | ("@Protagonist wears jacket in neon city")|
                            +--------------------+----------------------+
                                                 |
                                                 v
                     +---------------------------+---------------------------+
                     |           PROMPT & CONTEXT INTEGRATION LAYER             |
                     |  - Global Project Prompts & Artistic Seeds appended  |
                     +---------------------------+---------------------------+
                                                 |
                                                 v
                     +---------------------------+---------------------------+
                     |           PROMPT CONSISTENCY HARNESS RESOLVER          |
                     |  - Scans script. Replaces triggers matching rules.   |
                     |  - Injects target Visual Layer high-fidelity prompt. |
                     |    e.g. "@Protagonist" -> "cyberpunk neon clothing"  |
                     +---------------------------+---------------------------+
                                                 |
                                                 v
                     +---------------------------+---------------------------+
                     |              MULTI-MODAL RUNTIME EXECUTION                |
                     |  Images: Flux/SDXL  | Audio: F5 TTS | Video: LTX-3     |
                     +-------------------+---------+------------+------------+
```

| Layer | Component | Functional Protocol | Key Ecosystem Implementation |
| :--- | :--- | :--- | :--- |
| **P** | **Prompt Engine** | The semantic foundation of a scene generation request. Highly descriptive, using physical object coordinates, precise spatial positions, camera models, and lighting modifiers. | Textareas for `qwenImagePrompt` and `ltx23Prompt` with real-time token helpers in the Web-UI. |
| **C** | **Context Engine** | High-level rules that bind a collection of scenes. Context shapes the global style (artistic era, watercolor vs. photograph, aspect ratio) so individual assets share a single aesthetic root. | Global project-level prompts merged at execution time. |
| **H** | **Harness Engine** | Restores entity consistency across multi-frame generations by mapping specific trigger keyword tokens (e.g. `@Character`, `@Location`) to detailed visual attributes. | SQLite `prompt_harness` entity mappings and the `applyPromptHarnessRules` parser in `src/lib/db.ts`. |

---

## 2. Decoupled Consistency Solutions

### 2.1 Visual & Character IP Consistency Protocol
* **The Challenge**: Standard generative diffusion models (e.g., Stable Diffusion, FLUX.1) exhibit severe "semantic drift," making a character's face, clothes, and signature weapons change completely between frames.
* **The PCH Solution**:
  1. Define a Master Visual Asset in the **Visual Asset Database** (`visual_library` table) with structured descriptor prompt chains.
  2. Create a **Prompt Harness Rule** that binds an identifier token (e.g., `@Protagonist`, `@MechaKey`) to this asset.
  3. During script execution, the harness resolver compiles the prompt, scanning for keywords case-insensitively and appending the detailed visual description to prevent neural hallucination.

### 2.2 Voice & Vocal Identity (Audio) Consistency Protocol
* **The Challenge**: Text-to-Speech (TTS) models shift tonality, pitch, and speech rates when vocal prompts are generated independently, breaking narrative vocal identity.
* **The PCH Solution**:
  1. **Speaker Reference Audio Integration**: Utilize fixed 10-15s WAV/MP3 reference audios (`@Narration_Max`) stored under the project path `/audio` for zero-shot speaker cloning.
  2. **Prosody Tuning Headers**: Append uniform speed factors and expressive tone indicators as context metadata inside the TTS task parser.

### 2.3 Temporal Fluidity & Camera Movement (Video) Consistency Protocol
* **The Challenge**: Stitching static image frames into videos using diffusion models like LTX-3 can lead to jarring frame jumps, visual artifacts, or erratic camera shifts.
* **The PCH Solution**:
  1. **Directional Camera Anchors**: Bind camera movement prompts to the Visual DB item or the Scene Config (e.g., `slow horizontal pan`, `cinematic focus pull`).
  2. **Prompt-Guided Motion Control**: Inject structural motion constraints alongside the prompt harness, such as specifying FPS, high-frequency motion coefficients, and seed-locking parameters.

---

## 3. High-Concept Style Profile Blueprint Collections

This ecosystem defines five preloaded, high-concept visual profile blueprints. Activating these packages creates a reference visual asset and a matching trigger word in one click:

### Blueprint 1: Cyberpunk Neon-Glow Persona & Mood (`@Cyberpunk`)
* **Core Style**: High-intensity chromatic contrast, fluorescent backlighting, and intricate high-tech industrial fibers.
* **Imagery Directive**: `cyberpunk portrait, high-tech cybernetic clothing, ambient neon lighting, deep blue and hot magenta highlights, detailed reflections in eyes, volumetric smoke, ray-traced, ultra-detailed, octane render, Unreal Engine 5 aesthetic, photorealistic 8k`
* **Movement Directive**: `slow camera dolly forward, micro-dust particles swirling in neon beams, dramatic slow-motion eye blink, depth of field`

### Blueprint 2: 3D Pixar-Style Whimsical Charm (`@Pixar`)
* **Core Style**: Soft, stylized organic lighting, cute expressive features, and clay-render skin modeling.
* **Imagery Directive**: `3d animated cute character, soft Pixar lighting, clay render finish, big expressive eyes, masterfully detailed hair groom, pastel colored background, sub-surface scattering skin, Disney model aesthetic, high-fidelity render`
* **Movement Directive**: `subtle comical head tilt, slow expressive eye contact, background soft focal shift, whimsical animation physics`

### Blueprint 3: Studio Ghibli Watercolor Nostalgia (`@Ghibli`)
* **Core Style**: Gentle hand-drawn brushstrokes, nostalgic watercolor tones, and bright natural lighting.
* **Imagery Directive**: `Studio Ghibli painting style, hand-drawn watercolor aesthetic, lush summer clouds, direct brilliant sunlight, gentle nostalgic wind rustling green grass, warm saturated palette, anime-movie keyframe, high-fidelity classic animation`
* **Movement Directive**: `gentle slow breeze shifting clover field petals, clouds drifting across blue atmosphere, nostalgic watercolor animation timing`

### Blueprint 4: Cinematic Noir & Chiaroscuro Shadows (`@FilmNoir`)
* **Core Style**: Severe dark monochrome gradients, Venetian light bars, and retro smoky detective aesthetics.
* **Imagery Directive**: `classic 1950s film noir cinematography, high-contrast chiaroscuro shadows, Venetian blind light bars on walls, wet asphalt, dark trench coat, retro detective office mood, professional monochrome black and white photography, smoky atmosphere`
* **Movement Directive**: `slow panning shot, cigarette smoke curling upwards into soft lighting, crisp vintage camera lens focus pull`

### Blueprint 5: Traditional Oriental Woodblock Art (`@UkiyoE`)
* **Core Style**: Flat organic pigments, ink-wash border lines, and Edo-period paper canvas texture.
* **Imagery Directive**: `traditional Ukiyo-e woodblock print aesthetic, elegant ink wash outlines, flat organic colors, vintage textured mulberry paper, flowing silk robes, iconic wave and pine leaf motifs, classic Edo-period flat illustration style`
* **Movement Directive**: `flat horizontal 2D camera pan, stylized ink ripples flowing softly, subtle paper texture jitter animating organic lines`

---

## 4. Developer API and Schema Specification

The `prompt_harness` table is critical to the Context Engine. Below is its schema representation:

```sql
CREATE TABLE IF NOT EXISTS prompt_harness (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    project_id TEXT NOT NULL,         -- References video_projects (project_uuid)
    trigger_keyword TEXT NOT NULL,    -- Trigger token to replace, e.g. "@Protagonist"
    visual_asset_id INTEGER NOT NULL, -- Foreign key referencing visual_library.id
    active INTEGER DEFAULT 1,         -- 0 = Inactive, 1 = Active
    created_at TIMESTAMP,
    updated_at TIMESTAMP
);
```

### Prompt Compilation Sequence

When a generation task starts (e.g. for `WordManagement`), the system executes this compilation cascade:

```typescript
export async function applyPromptHarnessRules(basePromptText: string, projectId: string): Promise<string> {
  const harnesses = await fetchPromptHarnessByProject(projectId);
  const activeHarnesses = harnesses.filter(h => h.active === 1);
  const visualAssets = await fetchVisualLibraryByProject(projectId);

  let compiledPrompt = basePromptText;

  for (const h of activeHarnesses) {
    const asset = visualAssets.find(v => v.id === h.visualAssetId);
    if (!asset) continue;

    const trigger = h.triggerKeyword;
    // Safely construct escape-sensitive RegExp matching the trigger token
    const escapedTrigger = trigger.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&');
    const regex = new RegExp(`(${escapedTrigger})`, 'gi');

    if (regex.test(compiledPrompt)) {
      // Append combined high-fidelity descriptors from visual library
      const styleChain = [asset.imagePrompt, asset.videoPrompt].filter(Boolean).join(", ");
      if (styleChain.trim()) {
        compiledPrompt = compiledPrompt.replace(regex, `$1 (${styleChain})`);
      }
    }
  }
  return compiledPrompt;
}
```

---

## 5. Ecosystem Diagnostics Checklist

Verify consistency setup across your project using this engineering check sequence:

- [x] **Database Verification**: The `visual_library` and `prompt_harness` tables exist in SQLite or local fallbacks.
- [x] **Trigger Isolation**: Key trigger words are prefixed (e.g., `@CharacterName`) to avoid accidental replacement of standard dictionary words.
- [x] **Cascade Validation**: Preview prompts inside the `WordManagement` editor reflect hot-swapped harness rules before submission.
- [x] **Execution Interceptor**: Workers in `queueWorker.ts` parse prompts using `applyPromptHarnessRules` prior to prompting external endpoints.
