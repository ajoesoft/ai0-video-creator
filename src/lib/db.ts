import Database from "@tauri-apps/plugin-sql";
import { remove, exists, BaseDirectory } from "@tauri-apps/plugin-fs";
import { VideoProject, Vocabulary, VisualLibraryItem, PromptHarness, BackgroundTask, TaskStatus, TaskType, SystemPrompt, DbVoicePreset } from "../types";
import { invoke } from "@tauri-apps/api/core";
import { PromptHarnessEngine } from "./harness/engine";

let db: Database | null = null;
let dbError: string | null = null;

const isTauri = typeof window !== 'undefined' && (!!(window as any).__TAURI_INTERNALS__ || !!(window as any).__TAURI__);

async function safeRemove(pathOrFilename: string, options?: { baseDir?: BaseDirectory }): Promise<void> {
  try {
    const fileExists = await exists(pathOrFilename, options);
    if (fileExists) {
      await remove(pathOrFilename, options);
      console.log(`Successfully removed file: ${pathOrFilename}`);
    } else {
      console.log(`File does not exist: ${pathOrFilename}, skipping removal.`);
    }
  } catch (err) {
    console.warn(`Pre-emptive exist-check or removal failed for ${pathOrFilename}:`, err);
  }
}

export function getDbError(): string | null {
  return dbError;
}

export async function getDbPath(): Promise<string> {
  if (isTauri) {
    try {
      const path = await invoke<string>("get_db_file_path");
      if (path) return path;
    } catch (e) {
      console.error("Failed to invoke get_db_file_path:", e);
    }
  }
  return "LocalBrowser Fallback (localStorage / IndexedDB)";
}

export async function runDatabaseMigrations(database: Database): Promise<void> {
  // Migrate the check constraint on video_projects if present
  try {
    const result = await database.select<any[]>(
      "SELECT sql FROM sqlite_master WHERE type='table' AND name='video_projects'"
    );
    if (result.length > 0) {
      const createSql = result[0].sql || "";
      if (createSql.includes("CHECK") && createSql.includes("scene_type") && !createSql.includes("digital_human")) {
        console.log("[Migration] Rebuilding video_projects table to remove/loosen scene_type CHECK constraint...");
        
        // 1. Get existing columns dynamically so we don't drop anything custom or throw mismatch errors
        const colsResult = await database.select<any[]>("PRAGMA table_info(video_projects)");
        const existingCols = colsResult.map(c => c.name);
        
        // 2. Turn off foreign keys temporarily
        await database.execute("PRAGMA foreign_keys = OFF;");
        
        // 3. Create the new table with identical columns but NO constraint, or an updated CHECK constraint
        // Note: Removing the CHECK constraint entirely on scene_type is the safest and most robust path.
        await database.execute(`
          CREATE TABLE IF NOT EXISTS video_projects_new (
            project_uuid TEXT PRIMARY KEY NOT NULL,
            project_name TEXT NOT NULL,
            project_status INTEGER NOT NULL DEFAULT 0,
            create_time INTEGER NOT NULL,
            update_time INTEGER NOT NULL,
            project_prompt TEXT,
            cover_image_path TEXT,
            scene_type TEXT DEFAULT 'short_video',
            scene_config_id INTEGER,
            template_id INTEGER,
            project_path TEXT,
            width INTEGER DEFAULT 1920,
            height INTEGER DEFAULT 1080,
            aspect_ratio TEXT DEFAULT '16:9',
            visual_style TEXT DEFAULT 'Cinematic',
            video_url TEXT,
            audio_url TEXT,
            audio_duration REAL DEFAULT 0.0,
            srt_original TEXT,
            text_original TEXT,
            detected_language TEXT,
            source_language TEXT DEFAULT 'zh',
            target_languages TEXT DEFAULT 'en'
          );
        `);
        
        // 4. Copy existing data for whatever columns actually exist
        const targetCols = [
          'project_uuid', 'project_name', 'project_status', 'create_time', 'update_time', 
          'project_prompt', 'cover_image_path', 'scene_type', 'scene_config_id', 'template_id', 
          'project_path', 'width', 'height', 'aspect_ratio', 'visual_style', 
          'video_url', 'audio_url', 'audio_duration', 'srt_original', 'text_original', 
          'detected_language', 'source_language', 'target_languages'
        ];
        
        const colsToSelect = targetCols.filter(col => existingCols.includes(col));
        const selectStr = colsToSelect.join(', ');
        const insertStr = colsToSelect.join(', ');
        
        await database.execute(`
          INSERT INTO video_projects_new (${insertStr})
          SELECT ${selectStr} FROM video_projects;
        `);
        
        // 5. Drop old table
        await database.execute("DROP TABLE video_projects;");
        
        // 6. Rename new table to original
        await database.execute("ALTER TABLE video_projects_new RENAME TO video_projects;");
        
        // 7. Turn foreign keys back on
        await database.execute("PRAGMA foreign_keys = ON;");
        
        console.log("[Migration] Rebuilt video_projects table successfully!");
      }
    }
  } catch (err) {
    console.error("[Migration] Failed to migrate video_projects CHECK constraint:", err);
  }

  // Database migrations have been successfully migrated to the Rust backend and run automatically on startup.
  return;
  // Auto-alter video_projects to support width, height, aspect_ratio, visual_style
  try {
    await database.execute("ALTER TABLE video_projects ADD COLUMN width INTEGER DEFAULT 1920");
  } catch (_) {}
  try {
    await database.execute("ALTER TABLE video_projects ADD COLUMN height INTEGER DEFAULT 1080");
  } catch (_) {}
  try {
    await database.execute("ALTER TABLE video_projects ADD COLUMN aspect_ratio TEXT DEFAULT '16:9'");
  } catch (_) {}
  try {
    await database.execute("ALTER TABLE video_projects ADD COLUMN visual_style TEXT DEFAULT 'Cinematic'");
  } catch (_) {}
  try {
    await database.execute("ALTER TABLE video_projects ADD COLUMN video_url TEXT");
  } catch (_) {}
  try {
    await database.execute("ALTER TABLE video_projects ADD COLUMN audio_url TEXT");
  } catch (_) {}
  try {
    await database.execute("ALTER TABLE video_projects ADD COLUMN audio_duration REAL DEFAULT 0.0");
  } catch (_) {}
  try {
    await database.execute("ALTER TABLE video_projects ADD COLUMN srt_original TEXT");
  } catch (_) {}
  try {
    await database.execute("ALTER TABLE video_projects ADD COLUMN text_original TEXT");
  } catch (_) {}
  try {
    await database.execute("ALTER TABLE video_projects ADD COLUMN detected_language TEXT");
  } catch (_) {}

  // Auto-alter video_translation_timeline to support segment video and audio url storage
  try {
    await database.execute("ALTER TABLE video_translation_timeline ADD COLUMN video_url TEXT");
  } catch (_) {}
  try {
    await database.execute("ALTER TABLE video_translation_timeline ADD COLUMN audio_url TEXT");
  } catch (_) {}

  // Auto-create visual_library table if missing
  try {
    await database.execute(`
      CREATE TABLE IF NOT EXISTS visual_library (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        project_id TEXT,
        scene_id TEXT,
        title TEXT,
        type TEXT,
        uuid TEXT,
        short_name TEXT,
        image_prompt TEXT,
        video_prompt TEXT,
        audio_prompt TEXT,
        image_path TEXT,
        video_path TEXT,
        audio_path TEXT,
        created_at INTEGER,
        updated_at INTEGER
      );
    `);
  } catch (errTable) {
    console.error("Failed to create visual_library table:", errTable);
  }

  // Auto-create prompt_harness table if missing
  try {
    await database.execute(`
      CREATE TABLE IF NOT EXISTS prompt_harness (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        project_id TEXT,
        trigger_keyword TEXT,
        visual_asset_id INTEGER,
        active INTEGER DEFAULT 1,
        created_at INTEGER,
        updated_at INTEGER,
        type TEXT,
        template TEXT,
        parameters TEXT,
        target_model TEXT
      );
    `);
    
    // Add columns dynamically for existing databases
    try { await database.execute("ALTER TABLE prompt_harness ADD COLUMN type TEXT;"); } catch (_) {}
    try { await database.execute("ALTER TABLE prompt_harness ADD COLUMN template TEXT;"); } catch (_) {}
    try { await database.execute("ALTER TABLE prompt_harness ADD COLUMN parameters TEXT;"); } catch (_) {}
    try { await database.execute("ALTER TABLE prompt_harness ADD COLUMN target_model TEXT;"); } catch (_) {}
  } catch (errHarnessTable) {
    console.error("Failed to create prompt_harness table:", errHarnessTable);
  }

  // Auto-create background_tasks table if missing
  try {
    await database.execute(`
      CREATE TABLE IF NOT EXISTS background_tasks (
        id TEXT PRIMARY KEY,
        project_id TEXT,
        name TEXT,
        type TEXT,
        status TEXT,
        params TEXT,
        result TEXT,
        error TEXT,
        progress INTEGER DEFAULT 0,
        scheduled_at INTEGER,
        created_at INTEGER,
        started_at INTEGER,
        completed_at INTEGER,
        priority INTEGER DEFAULT 0
      );
    `);
  } catch (errTasksTable) {
    console.error("Failed to create background_tasks table:", errTasksTable);
  }

  // Auto-create system_prompts table if missing
  try {
    await database.execute(`
      CREATE TABLE IF NOT EXISTS system_prompts (
        uuid TEXT PRIMARY KEY,
        name TEXT,
        classification TEXT,
        prompt TEXT,
        created_at INTEGER,
        updated_at INTEGER
      );
    `);

    // Seed default/standard prompts using INSERT OR IGNORE
    console.log("[Migration] Checking and seeding default system prompts & standard presets into database...");
    const defaults = [
      {
        uuid: "prompt-uuid-details-default",
        name: "Cover & Style Director (封面及风格导演)",
        classification: "details",
        prompt: "You are an expert design director and style consultant. Focus on analyzing the project's creative direction, visual theme, and storytelling tone. Guide the user in drafting consistent style guidelines, select fitting color schemes, and brainstorm evocative ideas for the project's cover image."
      },
      {
        uuid: "prompt-uuid-script-default",
        name: "Screenplay & Dialogue Maestro (编剧与对白大师)",
        classification: "script",
        prompt: "You are an elite screenwriter and script supervisor. Assist the user in drafting precise dialogues, voiceover lines, director's cues (camera angles, movements), and visual prompt descriptions for scene synthesis. Ensure the speech rhythm, dialogue style, and stage directions form a cohesive dramatic narrative."
      },
      {
        uuid: "prompt-uuid-visuals-default",
        name: "IP Character & Environment Sculptor (IP角色与环境塑造师)",
        classification: "visuals",
        prompt: "You are a lead character designer and worldbuilding artist. Help the user define consistent characters (IPs), props, and environmental parameters. Maintain detailed physical descriptions, clothing, mood settings, and lighting prompts to keep visual likeness intact across generations."
      },
      {
        uuid: "prompt-uuid-audio-default",
        name: "Voice Casting & Sound Designer (声色与声效设计师)",
        classification: "audio",
        prompt: "You are a professional audio designer and voice casting director. Assist the user in configuring distinct voiceover timbres, speech rates, emotional intonations, and character-specific acoustic profiles. Focus on optimizing vocal performance and matching roles to their ideal vocal qualities."
      },
      // Composition Type (构图类型)
      {
        uuid: "std-prompt-comp-wide",
        name: "Cinematic Wide Shot (电影级宽画幅构图)",
        classification: "composition",
        prompt: "Cinematic wide shot, stunning landscape framing, deep depth of field, clear horizontal line, panoramic scale, epic sense of scale, balanced rule of thirds"
      },
      {
        uuid: "std-prompt-comp-symmetric",
        name: "Symmetric Cinematic (对称式电影构图)",
        classification: "composition",
        prompt: "Symmetric cinematic composition, perfect balance, center-focused framing, dramatic alignment, clean architectural guidelines, formal artistic structure"
      },
      {
        uuid: "std-prompt-comp-thirds",
        name: "Rule of Thirds Portrait (三分法黄金人物构图)",
        classification: "composition",
        prompt: "Rule of thirds portrait framing, subject aligned on vertical grid line, dynamic negative space, cinematic balance, comfortable visual negative space"
      },
      {
        uuid: "std-prompt-comp-closeup",
        name: "Extreme Close-Up Detail (局部极度特写)",
        classification: "composition",
        prompt: "Extreme close-up shot, macro detail focus, shallow depth of field, high-fidelity texture, intense emotional expression, dramatic focal point"
      },
      // Lighting Type (光影类型)
      {
        uuid: "std-prompt-light-volumetric",
        name: "Volumetric God Rays (体积光/丁达尔圣光)",
        classification: "lighting",
        prompt: "Volumetric lighting, dramatic god rays, Tyndall effect, visible light beams cutting through atmosphere, smoky dust particles, high contrast shadows"
      },
      {
        uuid: "std-prompt-light-rembrandt",
        name: "Rembrandt Classic (古典伦勃朗肖像光)",
        classification: "lighting",
        prompt: "Rembrandt lighting style, classic 45-degree key light, dramatic triangle shadow on cheek, soft ambient fill, painterly contrast, moody chiaroscuro"
      },
      {
        uuid: "std-prompt-light-backlight",
        name: "Cinematic Backlight (电影感轮廓逆光)",
        classification: "lighting",
        prompt: "Cinematic backlighting, golden rim light, glowing hair strands, beautiful halo effect, rich background separation, high contrast silhouette, lens flare"
      },
      {
        uuid: "std-prompt-light-neon",
        name: "Cyberpunk Neon Glow (赛博朋克霓虹夜光)",
        classification: "lighting",
        prompt: "Cyberpunk neon glow, vivid pink and cyan dual lighting, wet pavement reflections, high contrast nocturnal shadows, futuristic moody illumination"
      },
      // Color Type (色彩类型)
      {
        uuid: "std-prompt-color-tealorange",
        name: "Teal and Orange Blockbuster (好莱坞经典青橙色调)",
        classification: "color",
        prompt: "Hollywood Teal and Orange color grading, high contrast cinematic film palette, warm skin tones, cool shadows, atmospheric depth, blockbuster aesthetic"
      },
      {
        uuid: "std-prompt-color-vintage",
        name: "Vintage Kodachrome (复古柯达彩色胶片)",
        classification: "color",
        prompt: "Vintage Kodachrome color profile, warm nostalgic tones, subtle chromatic aberration, classic 35mm film grain, analog color saturation, retro aesthetic"
      },
      {
        uuid: "std-prompt-color-moodydark",
        name: "Moody Low Saturation (低饱和度冷郁氛围)",
        classification: "color",
        prompt: "Moody low saturation color grading, desaturated cool tones, deep dark shadows, gloomy atmospheric mist, muted colors, somber cinematic style"
      },
      {
        uuid: "std-prompt-color-pastel",
        name: "Vibrant Pastel Fantasy (高饱和幻想马卡龙色)",
        classification: "color",
        prompt: "Vibrant pastel colors, high saturation fantasy palette, soft whimsical tones, dreamy watercolor shades, bright and cheerful atmospheric grading"
      },
      // Quality (画质)
      {
        uuid: "std-prompt-qual-8k",
        name: "8K UHD Masterpiece (8K超清杰作)",
        classification: "quality",
        prompt: "8k resolution, UHD masterpiece, razor-sharp details, high-fidelity textures, micro-detail rendering, photorealistic skin pores and surface fabrics, award-winning cinematic fidelity"
      },
      {
        uuid: "std-prompt-qual-ue5",
        name: "Unreal Engine 5 Render (虚幻5实时渲染级)",
        classification: "quality",
        prompt: "Unreal Engine 5 render style, hyperrealistic 3D graphics, ray-traced global illumination, Nanite micro-polygon details, sub-surface scattering, ultra high-end digital art"
      },
      // Style (画风)
      {
        uuid: "std-prompt-style-realism",
        name: "Cinematic Realism (写实院线电影风)",
        classification: "style",
        prompt: "Cinematic photorealism, shot on 35mm Panavision camera, anamorphic lens, real-life lighting, raw documentary texture, high visual credibility"
      },
      {
        uuid: "std-prompt-style-anime",
        name: "Makoto Shinkai Anime (新海诚动漫插画风)",
        classification: "style",
        prompt: "Makoto Shinkai anime style, beautiful hand-drawn illustration, vibrant blue skies, fluffy clouds, highly detailed background, romantic anime lighting, soft dream-like colors"
      },
      {
        uuid: "std-prompt-style-pixar",
        name: "3D Disney Pixar (迪士尼皮克斯3D动画风)",
        classification: "style",
        prompt: "3D stylized character design, Disney Pixar animation style, adorable features, rich clay-like smooth textures, vibrant expressive lighting, cheerful color palette"
      },
      {
        uuid: "std-prompt-style-watercolor",
        name: "Traditional Ink Watercolor (国风水墨写意风)",
        classification: "style",
        prompt: "Traditional Chinese ink wash and watercolor painting, soft sweeping brushstrokes, minimalist composition, dynamic splash ink effect, elegant negative space, ethereal aesthetic"
      },
      // Atmosphere (氛围)
      {
        uuid: "std-prompt-atmos-eerie",
        name: "Eerie Suspense Horror (惊悚诡异悬疑)",
        classification: "atmosphere",
        prompt: "Eerie suspenseful atmosphere, mysterious creeping fog, dim flickering light source, cold unsettling air, tense thriller mood, lingering shadows"
      },
      {
        uuid: "std-prompt-atmos-epic",
        name: "Epic Grand Scale (史诗宏大震撼)",
        classification: "atmosphere",
        prompt: "Epic grand atmosphere, awe-inspiring scale, majestic sweeping view, cinematic orchestration, heroic storytelling perspective, breath-taking dramatic depth"
      },
      {
        uuid: "std-prompt-atmos-cozy",
        name: "Cozy Warm Healing (治愈温馨安详)",
        classification: "atmosphere",
        prompt: "Cozy warm healing atmosphere, soft gentle sunlight, tranquil peaceful environment, comforting glowing ambiance, slow-living relaxation, serene emotional tone"
      }
    ];

    for (const p of defaults) {
      await database.execute(
        "INSERT OR IGNORE INTO system_prompts (uuid, name, classification, prompt, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)",
        [p.uuid, p.name, p.classification, p.prompt, Date.now(), Date.now()]
      );
    }
  } catch (errPromptsTable) {
    console.error("Failed to create/seed system_prompts table:", errPromptsTable);
  }

  // Safe check and auto-creation / migration for video_translation_projects with v2 schema check to clear foreign key constraints
  try {
    let isMigrated = false;
    try {
      const res = await database.select<any[]>("SELECT value FROM app_settings WHERE key = 'video_translation_schema_v2' LIMIT 1");
      if (res && res.length > 0 && res[0].value === "true") {
        isMigrated = true;
      }
    } catch (_) {}

    if (!isMigrated) {
      console.warn("video_translation_schema_v2 not yet active. Purging old video_translation_ tables to resolve any legacy foreign key mismatches...");
      await database.execute("PRAGMA foreign_keys = OFF;");
      await database.execute("DROP TABLE IF EXISTS video_translation_timeline;");
      await database.execute("DROP TABLE IF EXISTS video_translation_logs;");
      await database.execute("DROP TABLE IF EXISTS video_translation_projects;");
      await database.execute("PRAGMA foreign_keys = ON;");
      
      try {
        await database.execute("CREATE TABLE IF NOT EXISTS app_settings (key TEXT PRIMARY KEY, value TEXT NOT NULL, updated_at DATETIME DEFAULT CURRENT_TIMESTAMP);");
        await database.execute("INSERT OR REPLACE INTO app_settings (key, value, updated_at) VALUES ('video_translation_schema_v2', 'true', CURRENT_TIMESTAMP);");
      } catch (settErr) {
        console.error("Failed to mark video_translation_schema_v2 in app_settings:", settErr);
      }
    }
  } catch (errMigrate) {
    console.error("Failed to execute video_translation schema check/migration:", errMigrate);
  }

  // Recreate video_translation_projects table
  try {
    await database.execute(`
      CREATE TABLE IF NOT EXISTS video_translation_projects (
        project_id TEXT PRIMARY KEY,
        name TEXT,
        video_url TEXT,
        cover_url TEXT,
        audio_url TEXT,
        audio_duration REAL,
        srt_original TEXT,
        text_original TEXT,
        detected_language TEXT,
        status TEXT,
        created_at INTEGER,
        updated_at INTEGER
      );
    `);
  } catch (err) {
    console.error("Failed to create video_translation_projects table:", err);
  }

  // Recreate video_translation_timeline table
  try {
    await database.execute(`
      CREATE TABLE IF NOT EXISTS video_translation_timeline (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        project_id TEXT,
        segment_index INTEGER,
        start_sec REAL,
        end_sec REAL,
        text TEXT,
        translated_text TEXT,
        video_url TEXT,
        audio_url TEXT,
        created_at INTEGER,
        updated_at INTEGER
      );
    `);
  } catch (err) {
    console.error("Failed to create video_translation_timeline table:", err);
  }

  // Recreate video_translation_logs table
  try {
    await database.execute(`
      CREATE TABLE IF NOT EXISTS video_translation_logs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        project_id TEXT,
        log_type TEXT,
        message TEXT,
        timestamp INTEGER
      );
    `);
  } catch (err) {
    console.error("Failed to create video_translation_logs table:", err);
  }

  // Self-migration: Merge all unique translation projects inside video_translation_projects table into unified video_projects table
  try {
    console.log("[Migration] Merging video_translation_projects rows into video_projects...");
    
    // Find all sub-project IDs to avoid migrating them as top-level projects
    const subProjectIds = new Set<string>();
    try {
      const settings = await database.select<any[]>(
        "SELECT key, value FROM app_settings WHERE key LIKE 'video_translation_data_%'"
      );
      for (const s of settings) {
        try {
          const val = JSON.parse(s.value);
          if (val && Array.isArray(val.queue)) {
            const parentId = s.key.substring('video_translation_data_'.length);
            for (const sub of val.queue) {
              if (sub && sub.id && sub.id !== parentId) {
                subProjectIds.add(sub.id);
              }
            }
          }
        } catch (e) {}
      }
    } catch (e) {
      console.warn("Failed to gather subProjectIds during migration:", e);
    }

    const transProjects = await database.select<any[]>("SELECT * FROM video_translation_projects");
    if (transProjects && transProjects.length > 0) {
      console.log(`[Migration] Found ${transProjects.length} candidate translation projects to migrate.`);
      for (const tp of transProjects) {
        const uuid = tp.project_id;
        if (subProjectIds.has(uuid)) {
          console.log(`[Migration] Skipping sub-project translation migration for queue item: [${tp.name}] (UUID: ${uuid})`);
          continue;
        }
        const existing = await database.select<any[]>("SELECT project_uuid FROM video_projects WHERE project_uuid = ? LIMIT 1", [uuid]);
        if (!existing || existing.length === 0) {
          console.log(`[Migration] Migrating Translation Project: [${tp.name}] (UUID: ${uuid}) into video_projects.`);
          const statusVal = tp.status === 'completed' ? 4 : 2; // ProjectStatus.COMPLETED = 4, EDITING = 2
          const now = Date.now();
          await database.execute(
            `INSERT INTO video_projects (
              project_uuid, project_name, project_status, create_time, update_time, 
              project_prompt, scene_type, cover_image_path, project_path, 
              width, height, aspect_ratio, visual_style,
              video_url, audio_url, audio_duration, srt_original, text_original, detected_language
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
              uuid,
              tp.name || "Untitled Translation",
              statusVal,
              tp.created_at || now,
              tp.updated_at || now,
              tp.srt_original ? (tp.srt_original.substring(0, 150) + "...") : "Video Translation Project configured.",
              "video_translation",
              tp.cover_url || null,
              null,
              1920,
              1080,
              "16:9",
              "Cinematic",
              tp.video_url || null,
              tp.audio_url || null,
              tp.audio_duration || 0.0,
              tp.srt_original || null,
              tp.text_original || null,
              tp.detected_language || null
            ]
          );
        } else {
          // Row already exists in video_projects. Cleanly merge missing translation-specific schema properties.
          await database.execute(
            `UPDATE video_projects SET
              video_url = COALESCE(video_url, ?),
              audio_url = COALESCE(audio_url, ?),
              audio_duration = COALESCE(audio_duration, ?),
              srt_original = COALESCE(srt_original, ?),
              text_original = COALESCE(text_original, ?),
              detected_language = COALESCE(detected_language, ?)
            WHERE project_uuid = ?`,
            [
              tp.video_url || null,
              tp.audio_url || null,
              tp.audio_duration || 0.0,
              tp.srt_original || null,
              tp.text_original || null,
              tp.detected_language || null,
              uuid
            ]
          );
        }

        // Construct state setting video_translation_data_${uuid} inside app_settings if not present
        const settingKey = `video_translation_data_${uuid}`;
        const existingSetting = await database.select<any[]>("SELECT value FROM app_settings WHERE key = ? LIMIT 1", [settingKey]);
        if (!existingSetting || existingSetting.length === 0) {
          console.log(`[Migration] Constructing translation state setting data for project ${uuid}...`);
          // Fetch timeline segment rows
          const segments = await database.select<any[]>(
            "SELECT * FROM video_translation_timeline WHERE project_id = ? ORDER BY segment_index ASC",
            [uuid]
          );
          const mappedDialogues = segments.map(s => ({
            index: s.segment_index,
            startSec: s.start_sec,
            endSec: s.end_sec,
            text: s.text,
            videoUrl: s.video_url || null,
            audioUrl: s.audio_url || null
          }));
          const mappedTranslatedDialogues = segments.map(s => ({
            index: s.segment_index,
            startSec: s.start_sec,
            endSec: s.end_sec,
            text: s.translated_text || "",
            videoUrl: s.video_url || null,
            audioUrl: s.audio_url || null
          })).filter(s => s.text !== "");

          const logsRows = await database.select<any[]>(
            "SELECT message FROM video_translation_logs WHERE project_id = ? ORDER BY timestamp ASC",
            [uuid]
          );
          const mappedLogs = logsRows.length > 0 ? logsRows.map(l => l.message) : [`[LOG] Loaded project from storage: ${tp.name}`];

          const translationState = {
            videoName: tp.name,
            videoSize: "Unknown Size",
            videoUrl: tp.video_url || "",
            coverUrl: tp.cover_url || null,
            audioUrl: tp.audio_url || null,
            audioDuration: tp.audio_duration || 0,
            srtOriginal: tp.srt_original || "",
            srtTranslated: "",
            textOriginal: tp.text_original || "",
            textTranslated: "",
            dialogues: mappedDialogues,
            translatedDialogues: mappedTranslatedDialogues,
            synthesizedAudioUrl: null,
            outputVideoUrl: null,
            status: tp.status || 'idle',
            logs: mappedLogs,
            selectedVoice: 'Kore',
            sourceLang: 'Chinese',
            targetLang: 'English',
            ttsSpeed: 1.0,
            lipsyncModel: 'LTX2.3 + LipSync-1.0'
          };

          await database.execute(
            "INSERT INTO app_settings (key, value, updated_at) VALUES (?, ?, CURRENT_TIMESTAMP) ON CONFLICT(key) DO UPDATE SET value = EXCLUDED.value, updated_at = CURRENT_TIMESTAMP",
            [settingKey, JSON.stringify(translationState)]
          );
          console.log(`[Migration] Successfully constructed translation State inside app_settings for ${uuid}.`);
        }
      }
    }
  } catch (migrateErr) {
    console.error("Failed to run video_translation merge self-migration:", migrateErr);
  }

  // Create visual_library_template table
  try {
    await database.execute(`
      CREATE TABLE IF NOT EXISTS visual_library_template (
          template_id INTEGER PRIMARY KEY AUTOINCREMENT,
          scene_type TEXT NOT NULL CHECK (scene_type IN ('short_video', 'story', 'dialogue', 'word','translation')),
          template_name TEXT NOT NULL,
          template_name_chinese TEXT NOT NULL,
          prompt TEXT NOT NULL,
          prompt_chinese TEXT NOT NULL,
          template_type TEXT NOT NULL CHECK (template_type IN ('camera', 'enviroment', 'ip', 'tts','llm')),
          is_default INTEGER NOT NULL DEFAULT 0 CHECK (is_default IN (0, 1)),
          create_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
          update_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // Seed visual_library_template if empty
    const existingTemplates = await database.select<any[]>(
      "SELECT template_id FROM visual_library_template LIMIT 1"
    );
    if (!existingTemplates || existingTemplates.length === 0) {
      console.log("[Migration] Seeding initial camera templates into visual_library_template...");
      const insertSql = `
        INSERT INTO visual_library_template
        (scene_type, template_name, template_name_chinese, prompt, prompt_chinese, template_type, is_default)
        VALUES
        ('short_video', 'Pan Left', '左摇镜', 'Pan Left shot, stationary camera, slow horizontal pan to left, smooth motion, stable frame, cinematic composition, no camera position shift', '摄像机机位固定，镜头水平缓慢向左转动，画面同步右滑，带出画面右侧环境', 'camera', 0),
        ('short_video', 'Pan Right', '右摇镜', 'Pan Right shot, fixed camera position, gentle horizontal pan right, silky smooth movement, natural perspective transition', '机位不动，镜头水平向右旋转，画面向左滑动，逐步展现左侧场景', 'camera', 0),
        ('short_video', 'Pan Up', '上摇镜', 'Pan Up shot, static camera, vertical slow tilt upward, gradual reveal upper scenery, smooth motion blur', '机身固定，镜头垂直向上扬起，从低处景物缓缓抬至高空远景/人物面部上方', 'camera', 0),
        ('short_video', 'Pan Down', '下摇镜', 'Pan Down shot, locked camera, vertical pan down, slow descending view, soft motion transition', '机位不变，镜头垂直向下转动，从高处缓缓落向地面、人物脚部或低处细节', 'camera', 0),
        ('short_video', 'Dolly In', '物理前推镜', 'Dolly In shot, camera physically moving forward, natural depth of field, smooth linear movement, cinematic depth', '摄像机整体向前直线移动，空间纵深真实拉近主体，无数码放大畸变', 'camera', 0),
        ('short_video', 'Dolly Out', '物理后拉镜', 'Dolly Out shot, camera slow backward movement, widening field of view, stable sliding motion, rich background context', '整机向后匀速后退，画面不断收纳更多周边环境，氛围感开阔', 'camera', 0),
        ('short_video', 'Dolly Left', '轨道左移', 'Dolly Left sliding shot, parallel horizontal camera movement, subject centered in frame, ultra smooth track motion', '摄像机沿水平滑轨整体向左平行滑行，主体保持画面中心，横向空间流动', 'camera', 0),
        ('short_video', 'Dolly Right', '轨道右移', 'Dolly Right track shot, horizontal slide to right, steady movement, clear spatial layering', '整机沿滑轨向右平稳滑行，横向平移运镜，适合双人平行行走跟拍', 'camera', 0),
        ('short_video', 'Pedestal Up', '整机升镜', 'Pedestal Up shot, whole camera vertical lift upward, gradual elevation, wide landscape reveal, vibration-free', '摄像机整体垂直向上抬升，机位抬高，视野逐层拓宽，区别单纯向上摇镜', 'camera', 0),
        ('short_video', 'Pedestal Down', '整机降镜', 'Pedestal Down shot, camera vertical descending movement, low angle gradual transition, smooth lifting gear motion', '摄像机垂直向下缓慢降低机位，视角下沉，聚焦地面低角度细节', 'camera', 0),
        ('short_video', 'Zoom In', '数码/光学拉近', 'Slow Zoom In shot, fixed camera position, gradual focal length increase, soft background blur, subtle motion blur', '机位静止，镜头焦距拉长，画面放大主体，压缩空间感，轻微背景虚化增强', 'camera', 0),
        ('short_video', 'Zoom Out', '数码/光学拉远', 'Slow Zoom Out shot, static camera, steadily widening focal view, full scene exposure, smooth zoom transition', '机位不动，焦距缩短，画面持续缩小，不断露出周边完整环境', 'camera', 0),
        ('short_video', 'Dolly Zoom', '希区柯克眩晕变焦', 'Dolly Vertigo shot, camera dolly backward while zooming in, subject size unchanged, distorted background perspective, tense cinematic atmosphere', '摄像机匀速后移，同时镜头同步拉近，主体大小不变，背景拉伸扭曲，惊悚悬疑专用', 'camera', 0),
        ('short_video', 'Orbit Left', '左环绕运镜', 'Slow Left Orbit shot, camera circling counterclockwise around central subject, consistent distance from target, smooth circular motion', '摄像机以主体为圆心，逆时针弧形环绕移动，360°环绕局部，全方位展示主体', 'camera', 0),
        ('short_video', 'Orbit Right', '右环绕运镜', 'Right Orbit shot, clockwise circular camera movement around main subject, steady orbit radius, cinematic 360 partial view', '摄像机顺时针绕主体环形移动，多角度循环展示人物/物体轮廓', 'camera', 0),
        ('short_video', 'Full Circular Orbit', '360°完整环绕', 'Full 360 Circular Orbit shot, complete circular camera loop around subject, uniform moving speed, balanced framing', '摄像机完整绕主体一周，全景无死角环绕拍摄，产品、人物展示专用', 'camera', 0),
        ('short_video', 'Arc Shot', '半弧形运镜', 'Arc Shot, half-circle curved camera movement, gentle arc trajectory, moderate view transition, natural pacing', '仅做120°~180°弧形滑行，不完整绕圈，柔和过渡视角，自然不夸张', 'camera', 0),
        ('short_video', 'Crane Up', '摇臂升镜', 'Crane Up shot, professional film camera crane lifting camera high, dramatic wide landscape reveal, fluid large range motion', '大型摄影摇臂携带摄像机快速抬升至高空，瞬间打开宏大全景视野', 'camera', 0),
        ('short_video', 'Crane Down', '摇臂降镜', 'Crane Down shot, crane arm lowering camera from high altitude, slow descent from wide shot to close-up, epic cinematic feel', '摇臂从高空缓慢下放摄像机，从宏大远景缓缓落至近距离主体特写', 'camera', 0),
        ('short_video', 'Drone Fly Forward', '无人机低空前飞', 'Drone forward fly shot, low altitude aerial camera, steady forward flight, sweeping landscape, smooth aerial stabilization', '无人机低空平稳向前直线飞行，贴地掠过道路、海面、山谷', 'camera', 0),
        ('short_video', 'Drone Fly Backward', '无人机向后飞掠', 'Drone backward reveal shot, drone flying backward and slightly ascending, widening aerial view, grand scenery unfolding', '无人机匀速向后拉升后退，画面持续拓宽，宏大全景逐渐展开', 'camera', 0),
        ('short_video', 'Drone Ascend', '无人机上升', 'Drone Ascend shot, stationary drone vertical climb upward, gradual high-angle aerial view, layered terrain display', '原地悬停垂直向上爬升，视野从近景逐步拔高至上帝视角', 'camera', 0),
        ('short_video', 'Drone Descend', '无人机俯冲下降', 'Drone Descend shot, slow vertical aerial dive from high altitude, descending focus on ground subject, soft aerial motion', '无人机高空垂直向下缓慢俯冲，视角下沉，聚焦地面核心景物', 'camera', 0),
        ('short_video', 'Drone Fly Past', '无人机擦身飞掠', 'Drone Fly Past shot, drone horizontally glide past central subject, dynamic fast aerial movement, slight motion blur for speed', '无人机横向从主体侧面快速划过，一掠而过，强烈速度感', 'camera', 0),
        ('short_video', 'Top-Down Drone', '上帝垂直俯拍', 'Bird’s Eye Top-Down drone shot, perfectly vertical overhead aerial view, symmetrical composition, flat top perspective', '无人机90度垂直于地面纯俯视，无倾斜角度，规整对称构图', 'camera', 0),
        ('short_video', 'Forward Tracking', '向前跟拍', 'Forward Tracking shot, camera moving synchronously with walking subject, subject stays centered, flowing foreground blur', '摄像机与人物同步向前移动，始终锁定主体，前景持续流动', 'camera', 0),
        ('short_video', 'Backward Tracking', '倒退跟拍', 'Backward Tracking shot, camera moving backward facing subject, continuous front tracking, stable gimbal movement', '摄像机面向主体，匀速向后倒退移动，正面全程跟随人物前进', 'camera', 0),
        ('short_video', 'Side Tracking', '侧面平行跟拍', 'Side Parallel Tracking shot, camera moving side-by-side with character, horizontal synchronized motion, clear side profile view', '摄像机与人物横向平行同步移动，侧面全程记录人物行动', 'camera', 0),
        ('short_video', 'Low Angle Shot', '低角度仰拍', 'Low Angle shot, camera below subject eye level, upward looking perspective, powerful imposing atmosphere, slight wide distortion', '机位低于主体地平线，镜头向上仰视，突出人物高大强势气场', 'camera', 0),
        ('short_video', 'High Angle Shot', '高角度俯拍', 'High Angle shot, elevated camera looking down at subject, restrained weak atmosphere, clear surrounding environment layout', '机位高于主体，向下倾斜俯视，弱化人物力量，营造压抑渺小感', 'camera', 0),
        ('short_video', 'Dutch Tilt', '斜角歪镜', 'Dutch Tilt shot, canted tilted camera frame, slanted horizontal line, tense unstable psychological atmosphere, cinematic thriller style', '摄像机机身整体倾斜，画面水平线歪斜，紧张、癫狂、悬疑情绪专用', 'camera', 0),
        ('short_video', 'Stabilized Hand Follow', '稳定器顺滑手持跟拍', 'Stabilized handheld follow shot, gimbal balanced camera, soft natural micro motion, documentary texture, no harsh shake', '云台稳定器手持跟随人物，轻微自然流动，无明显抖动，生活化质感', 'camera', 0),
        ('short_video', 'Shoulder Cam', '肩扛手持镜头', 'Shoulder mount handheld shot, subtle natural camera shake, realistic documentary aesthetic, slight motion jitter', '摄像机肩扛拍摄，轻微自然低频抖动，纪实纪录片、街头vlog风格', 'camera', 0),
        ('short_video', 'Running Hand Shot', '奔跑手持镜头', 'Running handheld shot, obvious dynamic camera shake, fast chase atmosphere, heavy motion blur for rapid movement', '手持设备跟随奔跑主体，明显动态抖动，强烈速度、紧张追逐氛围', 'camera', 0),
        ('short_video', 'Whip Pan', '极速甩镜/闪摇转场', 'Whip Pan transition shot, ultra fast horizontal camera whip, heavy motion blur streak, quick scene cut transition effect', '镜头极快左右/上下甩动，画面模糊拖影，用于镜头快速切换转场', 'camera', 0),
        ('short_video', 'POV Shot', '第一人称主观镜头', 'Human POV shot, first-person subjective perspective, camera movement simulate human eye vision, immersive viewing experience', '镜头模拟人眼视角，所有移动等同于人物自身视线移动，沉浸式视角', 'camera', 0),
        ('short_video', 'Spin Rotate', '机身自旋镜头', 'Camera Spin Rotate shot, 360 axial self rotation of camera, swirling spinning frame, dreamy dizzy visual effect', '摄像机自身360°轴向自转，画面持续旋转，眩晕、梦幻、迷幻特效', 'camera', 0),
        ('short_video', 'Creep Slow Push', '潜行慢推镜', 'Creep slow Dolly In shot, ultra slow forward camera creep, barely perceptible movement, eerie suspense horror atmosphere', '极低速度物理向前Dolly，近乎无声缓慢逼近主体，悬疑恐怖氛围感', 'camera', 0),
        ('short_video', 'Rack Focus', '焦点切换运镜', 'Tracking shot with Rack Focus, camera slow movement, fast shift focal point between foreground and background, clear focus jump transition', '机位缓慢移动过程中，快速切换对焦前后景，引导观众视线跳转', 'camera', 0);
      `;
      await database.execute(insertSql);
      console.log("[Migration] Successfully seeded initial camera templates into visual_library_template!");
    }
  } catch (errTemplatesTable) {
    console.error("Failed to create/seed visual_library_template table:", errTemplatesTable);
  }
}

export async function getDb() {
  if (!isTauri) return null;
  if (!db) {
    try {
      const dbPath = await getDbPath();
      db = await Database.load("sqlite:" + dbPath);
      
      // Execute all centralized database schema migrations
      await runDatabaseMigrations(db);
      
    } catch (err: any) {
      console.error("Failed to load SQLite via Tauri plugin-sql:", err);
      const errMsg = err?.toString() || "";
      
      // Auto-heal on migration conflicts or missing schema/columns
      const isSchemaMismatch = errMsg.includes("migration") || 
                              errMsg.includes("no such column") || 
                              errMsg.includes("has no column") ||
                              errMsg.includes("column") ||
                              errMsg.includes("modified") || 
                              errMsg.includes("previously applied");
      if (isSchemaMismatch) {
        console.warn("Detected SQLite schema or migration discrepancy. Attempting automatic self-healing by removing main.db...");
        try {
          const dbPath = await getDbPath();
          await safeRemove(dbPath);
          console.log(`Executed safe self-healing for path: ${dbPath}, reloading...`);
          
          db = await Database.load("sqlite:" + dbPath);
          await runDatabaseMigrations(db);
          dbError = null;
          return db;
        } catch (fsErr: any) {
          console.error("Failed to safely delete database file using getDbPath():", fsErr);
          
          // Try standard AppLocalData location as fallback
          try {
            await safeRemove("main.db", { baseDir: BaseDirectory.AppLocalData });
            console.log("Executed safe self-healing for main.db in AppLocalData, reloading...");
            
            const dbPathFallback = await getDbPath();
            db = await Database.load("sqlite:" + dbPathFallback);
            await runDatabaseMigrations(db);
            dbError = null;
            return db;
          } catch (fsErr2: any) {
            console.error("Failed to safely delete main.db from AppLocalData:", fsErr2);
            
            // Try standard AppData location as second fallback just in case
            try {
              await safeRemove("main.db", { baseDir: BaseDirectory.AppData });
              console.log("Executed safe self-healing for main.db in AppData, reloading...");
              
              const dbPathFallback2 = await getDbPath();
              db = await Database.load("sqlite:" + dbPathFallback2);
              await runDatabaseMigrations(db);
              dbError = null;
              return db;
            } catch (fsErr3: any) {
              console.error("Failed to safely delete main.db from AppData:", fsErr3);
            }
          }
        }
      }
      
      dbError = errMsg || "Unknown SQLite connection load error";
      return null;
    }
  }
  return db;
}

// Browser fallback storage
const LOCAL_STORAGE_KEY = 'ai_video_projects_fallback';

// Gather all sub-project IDs in Tauri or Browser environment to filter them out of top-level lists
export async function getSubProjectIds(): Promise<Set<string>> {
  const subProjectIds = new Set<string>();
  if (isTauri) {
    try {
      const database = await getDb();
      if (database) {
        const settings = await database.select<any[]>(
          "SELECT key, value FROM app_settings WHERE key LIKE 'video_translation_data_%'"
        );
        for (const s of settings) {
          try {
            const val = JSON.parse(s.value);
            if (val && Array.isArray(val.queue)) {
              const parentId = s.key.substring('video_translation_data_'.length);
              for (const sub of val.queue) {
                if (sub && sub.id && sub.id !== parentId) {
                  subProjectIds.add(sub.id);
                }
              }
            }
          } catch (e) {}
        }
      }
    } catch (err) {
      console.warn("Failed to query sub-projects from app_settings:", err);
    }
  } else {
    try {
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key && key.startsWith('video_translation_data_')) {
          try {
            const val = JSON.parse(localStorage.getItem(key) || '{}');
            if (val && Array.isArray(val.queue)) {
              const parentId = key.substring('video_translation_data_'.length);
              for (const sub of val.queue) {
                if (sub && sub.id && sub.id !== parentId) {
                  subProjectIds.add(sub.id);
                }
              }
            }
          } catch (e) {}
        }
      }
    } catch (e) {}
  }
  return subProjectIds;
}

async function getLocalStorageProjects(): Promise<VideoProject[]> {
  const subProjectIds = await getSubProjectIds();
  if (isTauri) {
    const database = await getDb();
    if (database) {
      try {
        const result = await database.select<any[]>(
          `SELECT p.*, 
          (SELECT image_path FROM vocabulary v 
           WHERE v.project_uuid = p.project_uuid 
           AND v.image_path IS NOT NULL 
           AND v.image_path != '' 
           ORDER BY RANDOM() LIMIT 1) as random_cover
          FROM video_projects p 
          ORDER BY p.update_time DESC`
        );
        if (result.length > 0) {
          return result
            .filter(p => !subProjectIds.has(p.project_uuid))
            .map(p => ({
              id: p.project_uuid,
              name: p.project_name,
              prompt: p.project_prompt,
              coverImagePath: p.random_cover || p.cover_image_path,
              projectPath: p.project_path,
              status: p.project_status,
              sceneType: p.scene_type || 'short_video',
              createdAt: p.create_time,
              updatedAt: p.update_time,
              width: p.width || 1920,
              height: p.height || 1080,
              aspectRatio: p.aspect_ratio || '16:9',
              visualStyle: p.visual_style || 'Cinematic',
              videoUrl: p.video_url || null,
              audioUrl: p.audio_url || null,
              audioDuration: p.audio_duration || 0,
              srtOriginal: p.srt_original || null,
              textOriginal: p.text_original || null,
              detectedLanguage: p.detected_language || null,
            }));
        }

        // Try reading backup from app_settings
        const backupRaw = await database.select<any[]>(
          "SELECT value FROM app_settings WHERE key = ? LIMIT 1",
          [LOCAL_STORAGE_KEY]
        );
        if (backupRaw.length > 0 && backupRaw[0].value) {
          const parsedBackup: VideoProject[] = JSON.parse(backupRaw[0].value);
          return parsedBackup.filter(p => !subProjectIds.has(p.id));
        }
      } catch (err) {
        console.error("Failed to fetch projects from database in fallback getter:", err);
      }
    }
  }
  const data = localStorage.getItem(LOCAL_STORAGE_KEY);
  const standardProjects: VideoProject[] = data ? JSON.parse(data) : [];

  // Filter local storage projects
  const filteredProjects = standardProjects.filter(p => !subProjectIds.has(p.id));

  // Browser local storage self-migration check
  try {
    const transKey = "fallback_video_translation_projects";
    const transProjectsStr = localStorage.getItem(transKey);
    if (transProjectsStr) {
      const transProjects: any[] = JSON.parse(transProjectsStr);
      if (transProjects.length > 0) {
        let modified = false;
        for (const tp of transProjects) {
          const uuid = tp.project_id;
          if (subProjectIds.has(uuid)) {
            continue; // Skip migrating sub-projects
          }
          const exist = standardProjects.find(sp => sp.id === uuid);
          if (!exist) {
            console.log(`[Migration] Migrating local storage translation project: ${tp.name} (${uuid})`);
            const statusVal = tp.status === 'completed' ? 4 : 2; // ProjectStatus.COMPLETED = 4, EDITING = 2
            const now = Date.now();
            standardProjects.push({
              id: uuid,
              name: tp.name || "Untitled Translation",
              prompt: tp.srt_original ? (tp.srt_original.substring(0, 150) + "...") : "Video Translation Project configured.",
              coverImagePath: tp.cover_url || null,
              createdAt: tp.created_at || now,
              updatedAt: tp.updated_at || now,
              status: statusVal,
              sceneType: "video_translation" as any,
              width: 1920,
              height: 1080,
              aspectRatio: "16:9",
              visualStyle: "Cinematic"
            });
            modified = true;
          }

          // Generate detailed translation state JSON setting for this fallback project if missing
          const settingKey = `video_translation_data_${uuid}`;
          if (!localStorage.getItem(settingKey)) {
            const timelineKey = "fallback_video_translation_timeline";
            const timelineStr = localStorage.getItem(timelineKey);
            const allSegments: any[] = timelineStr ? JSON.parse(timelineStr) : [];
            const segments = allSegments.filter(s => s.project_id === uuid);

            const logsKey = "fallback_video_translation_logs";
            const logsStr = localStorage.getItem(logsKey);
            const allLogs: any[] = logsStr ? JSON.parse(logsStr) : [];
            const logsRows = allLogs.filter(l => l.project_id === uuid);

            const mappedDialogues = segments.map(s => ({
              index: s.segment_index,
              startSec: s.start_sec,
              endSec: s.end_sec,
              text: s.text || "",
            }));
            const mappedTranslatedDialogues = segments.map(s => ({
              index: s.segment_index,
              startSec: s.start_sec,
              endSec: s.end_sec,
              text: s.translated_text || "",
            })).filter(s => s.text !== "");

            const mappedLogs = logsRows.length > 0 ? logsRows.map(l => l.message) : [`[LOG] Loaded project from storage: ${tp.name}`];

            const translationState = {
              videoName: tp.name,
              videoSize: "Unknown Size",
              videoUrl: tp.video_url || "",
              coverUrl: tp.cover_url || null,
              audioUrl: tp.audio_url || null,
              audioDuration: tp.audio_duration || 0,
              srtOriginal: tp.srt_original || "",
              srtTranslated: "",
              textOriginal: tp.text_original || "",
              textTranslated: "",
              dialogues: mappedDialogues,
              translatedDialogues: mappedTranslatedDialogues,
              synthesizedAudioUrl: null,
              outputVideoUrl: null,
              status: tp.status || 'idle',
              logs: mappedLogs,
              selectedVoice: 'Kore',
              sourceLang: 'Chinese',
              targetLang: 'English',
              ttsSpeed: 1.0,
              lipsyncModel: 'LTX2.3 + LipSync-1.0'
            };
            localStorage.setItem(settingKey, JSON.stringify(translationState));
          }
        }
        if (modified) {
          localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(standardProjects));
        }
      }
    }
  } catch (err) {
    console.error("Local Web fallback self-migration error:", err);
  }

  return standardProjects.filter(p => !subProjectIds.has(p.id));
}

async function saveLocalStorageProjects(projects: VideoProject[]): Promise<void> {
  const data = JSON.stringify(projects);
  localStorage.setItem(LOCAL_STORAGE_KEY, data);

  if (isTauri) {
    const database = await getDb();
    if (database) {
      try {
        // Also save to app_settings table
        await database.execute(
          "INSERT INTO app_settings (key, value, updated_at) VALUES (?, ?, CURRENT_TIMESTAMP) ON CONFLICT(key) DO UPDATE SET value = EXCLUDED.value, updated_at = CURRENT_TIMESTAMP",
          [LOCAL_STORAGE_KEY, data]
        );
      } catch (err) {
        console.error("Failed to sync projects backup to database:", err);
      }
    }
  }
}

export async function fetchProjects(): Promise<VideoProject[]> {
  const subProjectIds = await getSubProjectIds();
  if (isTauri) {
    const database = await getDb();
    if (database) {
      const result = await database.select<any[]>(
        `SELECT p.*, 
        (SELECT image_path FROM vocabulary v 
         WHERE v.project_uuid = p.project_uuid 
         AND v.image_path IS NOT NULL 
         AND v.image_path != '' 
         ORDER BY RANDOM() LIMIT 1) as random_cover
        FROM video_projects p 
        ORDER BY p.update_time DESC`
      );
      // Map database fields to frontend types, filtering out sub-projects
      return result
        .filter(p => !subProjectIds.has(p.project_uuid))
        .map(p => ({
          id: p.project_uuid,
          name: p.project_name,
          prompt: p.project_prompt,
          coverImagePath: p.random_cover || p.cover_image_path,
          projectPath: p.project_path,
          status: p.project_status,
          sceneType: p.scene_type || 'short_video',
          createdAt: p.create_time,
          updatedAt: p.update_time,
          width: p.width || 1920,
          height: p.height || 1080,
          aspectRatio: p.aspect_ratio || '16:9',
          visualStyle: p.visual_style || 'Cinematic',
          videoUrl: p.video_url || null,
          audioUrl: p.audio_url || null,
          audioDuration: p.audio_duration || 0,
          srtOriginal: p.srt_original || null,
          textOriginal: p.text_original || null,
          detectedLanguage: p.detected_language || null,
        }));
    }
  }

  // Fallback to LocalStorage for Web Preview
  const localProjects = await getLocalStorageProjects();
  return localProjects.sort((a, b) => b.updatedAt - a.updatedAt);
}

export async function seedSystemHarnessesForProject(projectId: string, visualStyle: string): Promise<void> {
  const now = Date.now();
  console.log(`Seeding system harnesses for project ${projectId} with style ${visualStyle}`);

  // Seed standard visual styles in the prompt_harness table
  await ensureVisualStylesSeeded(projectId);

  // Base items: System Camera Motion Harnesses (can be shared and used in visual library)
  const itemsToCreate = [
    {
      title: "向左横移 (Pan Left)",
      sceneId: "camera_pan_left",
      shortName: "@PanLeft",
      imagePrompt: "classic smooth pan left",
      videoPrompt: "slow panning camera to the left, capturing wide scenic landscape view",
      type: "运镜"
    },
    {
      title: "向右横移 (Pan Right)",
      sceneId: "camera_pan_right",
      shortName: "@PanRight",
      imagePrompt: "classic smooth pan right",
      videoPrompt: "slow panning camera to the right, sweeping cinematic motion",
      type: "运镜"
    },
    {
      title: "拉近镜头 (Zoom In)",
      sceneId: "camera_zoom_in",
      shortName: "@ZoomIn",
      imagePrompt: "smooth zoom in",
      videoPrompt: "smooth cinematic camera zoom in, tracking the main focus in detail",
      type: "运镜"
    },
    {
      title: "拉远镜头 (Zoom Out)",
      sceneId: "camera_zoom_out",
      shortName: "@ZoomOut",
      imagePrompt: "smooth zoom out",
      videoPrompt: "subtle scenic camera zoom out, revealing detailed epic environmental background",
      type: "运镜"
    },
    {
      title: "环绕运镜 (Orbit)",
      sceneId: "camera_orbit",
      shortName: "@Orbit",
      imagePrompt: "slow orbital tracking camera",
      videoPrompt: "slow orbital tracking camera movement rotating 360 degrees around the subject",
      type: "运镜"
    },
    {
      title: "俯拍飞掠 (Drone)",
      sceneId: "camera_drone",
      shortName: "@Drone",
      imagePrompt: "epic drone shot",
      videoPrompt: "epic high-altitude drone shot, gliding forward, seamless aerial view",
      type: "运镜"
    }
  ];

  // Visual style pre-made system prompt harnesses
  if (visualStyle === 'Cinematic' || visualStyle === '电影') {
    itemsToCreate.push(
      {
        title: "电影质感风格",
        sceneId: "style_cinematic",
        shortName: "@Style",
        imagePrompt: "classic 35mm photograph, shallow depth of field, warm cinematic lighting, ultra-detailed photorealistic, shot on ARRI Alexa",
        videoPrompt: "35mm cinema camera film grain, dramatic high contrast, photorealistic cinematic movement",
        type: "Style"
      },
      {
        title: "电影氛围光影",
        sceneId: "style_cinematic_lighting",
        shortName: "@Lighting",
        imagePrompt: "dramatic cinematic side lighting, volumetric sunset rays filtration, golden hour ambient",
        videoPrompt: "golden hour side light ambiance, ray tracing sunset reflections",
        type: "Style"
      }
    );
  } else if (visualStyle === 'Animation' || visualStyle === '动画') {
    itemsToCreate.push(
      {
        title: "3D动画风格",
        sceneId: "style_animation",
        shortName: "@Style",
        imagePrompt: "Pixar style 3D animation, soft clay render, stylized big expressive eyes, bright colorful lighting, sub-surface scattering skin",
        videoPrompt: "3D stylized animation keyframes, soft render movement, vibrant colors",
        type: "Style"
      },
      {
        title: "动画明快光影",
        sceneId: "style_animation_lighting",
        shortName: "@Lighting",
        imagePrompt: "soft overhead dome light, colorful highlights, high-end CGI shader, ambient occlusion",
        videoPrompt: "soft ambient CGI animation lighting, cheerful warm illumination",
        type: "Style"
      }
    );
  } else if (visualStyle === 'Comic' || visualStyle === '漫画') {
    itemsToCreate.push(
      {
        title: "漫画手绘风格",
        sceneId: "style_comic",
        shortName: "@Style",
        imagePrompt: "vibrant anime manga comic illustration, ink lineart, halftone dots, bold line weight, screentone shading overlay",
        videoPrompt: "dynamic visual novel anime style cells, bold outline transition",
        type: "Style"
      },
      {
        title: "极高对比漫画光影",
        sceneId: "style_comic_lighting",
        shortName: "@Lighting",
        imagePrompt: "bold cel-shaded high contrast lighting, black comic shadows, dramatic action panel reflection",
        videoPrompt: "cell shaded high-contrast graphics, manga page lighting accents",
        type: "Style"
      }
    );
  } else if (visualStyle === 'Ghibli' || visualStyle === '吉卜力') {
    itemsToCreate.push(
      {
        title: "吉卜力复古水彩",
        sceneId: "style_ghibli",
        shortName: "@Style",
        imagePrompt: "Studio Ghibli aesthetic watercolor handpainted anime wallpaper, nostalgic rich color scheme, gorgeous scenery master keyframe",
        videoPrompt: "nostalgic hand-painted watercolor anime scene landscape panning, retro aesthetic",
        type: "Style"
      },
      {
        title: "午后温润光影",
        sceneId: "style_ghibli_lighting",
        shortName: "@Lighting",
        imagePrompt: "gentle warm watercolor summer breeze sunlight, glowing white fluffy summer clouds, nostalgic atmospheric haze",
        videoPrompt: "serene bright afternoon radiance, soft sun rays through summer clouds",
        type: "Style"
      }
    );
  } else if (visualStyle === 'Pixar' || visualStyle === '皮克斯动画') {
    itemsToCreate.push(
      {
        title: "皮克斯3D动画",
        sceneId: "style_pixar",
        shortName: "@Style",
        imagePrompt: "high-end 3D Disney Pixar animation render, cute stylized character, extremely expressive eyes, realistic hair groom, sub-surface scattering skin, cinematic colorful keyframe, smooth 3D render",
        videoPrompt: "smooth cinematic 3D character animation, playful expressions, classic Pixar storytelling camera pan",
        type: "Style"
      },
      {
        title: "高光灵动光影",
        sceneId: "style_pixar_lighting",
        shortName: "@Lighting",
        imagePrompt: "dynamic stylized keyframe key light, beautiful rim light highlights, volumetric warm lighting, colorful accents",
        videoPrompt: "vibrant dynamic keyframe studio illumination, colorful bouncing ambient light",
        type: "Style"
      }
    );
  } else if (visualStyle === 'PixarClay' || visualStyle === '皮克斯粘土') {
    itemsToCreate.push(
      {
        title: "皮克斯粘土动画",
        sceneId: "style_clay",
        shortName: "@Style",
        imagePrompt: "claymation cute animation style, handcrafted cozy clay texture, soft matte finish, cute round proportions, miniature diorama set, stop-motion aesthetic",
        videoPrompt: "stop-motion claymation character movement, subtle playful clay deformation, tactile cozy animations",
        type: "Style"
      },
      {
        title: "温润柔和粘土光影",
        sceneId: "style_clay_lighting",
        shortName: "@Lighting",
        imagePrompt: "ultra-soft warm studio dome light, soft diffused ambient occlusion, pastel color mood, gentle shadows",
        videoPrompt: "diffused soft warm lighting, calm and inviting stop-motion studio atmosphere",
        type: "Style"
      }
    );
  } else if (visualStyle === 'Cyberpunk' || visualStyle === '赛博朋克') {
    itemsToCreate.push(
      {
        title: "赛博朋克霓虹",
        sceneId: "style_cyberpunk",
        shortName: "@Style",
        imagePrompt: "futuristic cyberpunk cityscape portrait, glowing neon signs, vibrant pink and cyan highlights, wet rainy pavement reflections, detailed cybernetic enhancements, high-tech dark atmosphere",
        videoPrompt: "cinematic neon lighting reflection, rain trickling down, high-speed camera sweep with lens flares",
        type: "Style"
      },
      {
        title: "冷暖高对比光影",
        sceneId: "style_cyberpunk_lighting",
        shortName: "@Lighting",
        imagePrompt: "dramatic futuristic pink and cyan fluorescent backlighting, high contrast neon glow, sharp volumetric dark shadows",
        videoPrompt: "pulsing neon light flares, alternating blue and magenta rim highlights",
        type: "Style"
      }
    );
  } else if (visualStyle === 'OilPainting' || visualStyle === '写实油画') {
    itemsToCreate.push(
      {
        title: "经典写实油画",
        sceneId: "style_oil",
        shortName: "@Style",
        imagePrompt: "classical oil painting aesthetic, textured brush strokes, impasto technique, rich deep color palette, masterwork gallery level detail, fine canvas texture",
        videoPrompt: "slow moving camera panning across a fine-art oil canvas, artistic organic motion",
        type: "Style"
      },
      {
        title: "古典戏曲光影",
        sceneId: "style_oil_lighting",
        shortName: "@Lighting",
        imagePrompt: "Rembrandt dramatic chiaroscuro lighting, deep golden side illumination, moody soft background shadows, warm amber highlights",
        videoPrompt: "dramatic warm candlelit ambiance, slow fading shadows on classic canvas paint",
        type: "Style"
      }
    );
  } else if (visualStyle === 'UkiyoE' || visualStyle === '传统浮世绘') {
    itemsToCreate.push(
      {
        title: "传统写意浮世绘",
        sceneId: "style_ukiyoe",
        shortName: "@Style",
        imagePrompt: "classic Japanese Ukiyo-e woodblock print style, handpainted mineral pigments, elegant dark ink outlines, flat solid color planes, vintage mulberry paper texture, flowing woodblock artwork",
        videoPrompt: "stylized woodblock flat illustration camera panning, gentle organic paper ripples, retro hand-drawn frames",
        type: "Style"
      },
      {
        title: "古雅温润和风光影",
        sceneId: "style_ukiyoe_lighting",
        shortName: "@Lighting",
        imagePrompt: "soft ambient antique warm paper illumination, muted vintage color wash, nostalgic flat shading highlights",
        videoPrompt: "flickering soft warm parchment glow, vintage animated inkwash shadow layers",
        type: "Style"
      }
    );
  } else if (visualStyle === 'UnrealEngine' || visualStyle === '虚幻写实') {
    itemsToCreate.push(
      {
        title: "虚幻引擎超写实",
        sceneId: "style_unreal",
        shortName: "@Style",
        imagePrompt: "photorealistic ultra-detailed render, Unreal Engine 5 aesthetic, global illumination, hyper-detailed skin pores and fabric weave, ray-traced shadows, gorgeous cinematography",
        videoPrompt: "epic cinematic tracking shot, hyper-realistic physics engine movement, crisp focus pulling, atmospheric details",
        type: "Style"
      },
      {
        title: "实时追踪全局光影",
        sceneId: "style_unreal_lighting",
        shortName: "@Lighting",
        imagePrompt: "next-gen raytraced soft direct lighting, volumetric fog atmosphere, real-time dynamic shadows, high-end CGI look",
        videoPrompt: "ray-traced dynamic sunset rays, atmospheric smoke particles moving slowly",
        type: "Style"
      }
    );
  } else {
    itemsToCreate.push(
      {
        title: "通用艺术质感",
        sceneId: "style_general",
        shortName: "@Style",
        imagePrompt: "detailed artistic masterpiece style, elegant clean aesthetic, balanced visual tones",
        videoPrompt: "cinematic motion artistic digital masterpiece render",
        type: "Style"
      },
      {
        title: "通用环境光影",
        sceneId: "style_general_lighting",
        shortName: "@Lighting",
        imagePrompt: "balanced atmospheric studio lighting, premium clean environment details",
        videoPrompt: "ambient photorealistic studio quality raytraced illumination",
        type: "Style"
      }
    );
  }

  if (isTauri) {
    const database = await getDb();
    if (database) {
      try {
        for (const item of itemsToCreate) {
          // A. Insert visual_library
          await database.execute(
            `INSERT INTO visual_library (
              project_id, scene_id, title, type, uuid, short_name, image_prompt, video_prompt, audio_prompt, 
              image_path, video_path, audio_path, created_at, updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
              projectId,
              item.sceneId,
              item.title,
              item.type,
              "", // uuid
              item.shortName,
              item.imagePrompt,
              item.videoPrompt,
              "", // audio_prompt
              "", // image_path
              "", // video_path
              "", // audio_path
              now,
              now
            ]
          );

          // B. Retrieve inserted ID
          const idResult = await database.select<any[]>("SELECT last_insert_rowid() as id");
          const insertedId = idResult[0]?.id;

          if (insertedId) {
            // C. Insert prompt_harness
            await database.execute(
              `INSERT INTO prompt_harness (project_id, trigger_keyword, visual_asset_id, active, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)`,
              [projectId, item.shortName, insertedId, 1, now, now]
            );
          }
        }
      } catch (err) {
        console.error("Failed to seed database harnesses:", err);
      }
      return;
    }
  }

  // LocalStorage Fallback Seeding
  try {
    const allItemsRaw = localStorage.getItem(VISUAL_LIBRARY_LOCAL_STORAGE_KEY);
    const allItems: any[] = allItemsRaw ? JSON.parse(allItemsRaw) : [];
    
    const allHarnessesRaw = localStorage.getItem(PROMPT_HARNESS_LOCAL_STORAGE_KEY);
    const allHarnesses: any[] = allHarnessesRaw ? JSON.parse(allHarnessesRaw) : [];

    let virtualIdCounter = Date.now();

    for (const item of itemsToCreate) {
      const assetId = ++virtualIdCounter;
      const newAsset = {
        id: assetId,
        projectId,
        sceneId: item.sceneId,
        title: item.title,
        type: item.type,
        uuid: "",
        shortName: item.shortName,
        imagePrompt: item.imagePrompt,
        videoPrompt: item.videoPrompt,
        audioPrompt: "",
        imagePath: "",
        videoPath: "",
        audioPath: "",
        createdAt: now,
        updatedAt: now
      };
      allItems.push(newAsset);

      const harnessId = ++virtualIdCounter;
      const newHarness = {
        id: harnessId,
        projectId,
        triggerKeyword: item.shortName,
        visualAssetId: assetId,
        active: 1,
        createdAt: now,
        updatedAt: now
      };
      allHarnesses.push(newHarness);
    }

    localStorage.setItem(VISUAL_LIBRARY_LOCAL_STORAGE_KEY, JSON.stringify(allItems));
    localStorage.setItem(PROMPT_HARNESS_LOCAL_STORAGE_KEY, JSON.stringify(allHarnesses));
  } catch (err) {
    console.error("Failed to seed LocalStorage pre-mades:", err);
  }
}

export async function createProject(
  name: string, 
  status: number, 
  prompt?: string, 
  sceneType: string = 'short_video', 
  projectPath?: string, 
  explicitId?: string,
  width?: number,
  height?: number,
  aspectRatio?: string,
  visualStyle?: string,
  sourceLanguage: string = 'zh',
  targetLanguages: string = 'en'
): Promise<any> {
  const id = explicitId || crypto.randomUUID();
  const now = Date.now();
  const actualProjectPath = projectPath || null;

  if (isTauri) {
    const database = await getDb();
    if (database) {
      await database.execute(
        "INSERT INTO video_projects (project_uuid, project_name, project_status, create_time, update_time, project_prompt, scene_type, project_path, width, height, aspect_ratio, visual_style, source_language, target_languages) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
        [id, name, status, now, now, prompt || null, sceneType, actualProjectPath, width || 1920, height || 1080, aspectRatio || '16:9', visualStyle || 'Cinematic', sourceLanguage, targetLanguages]
      );
      await seedSystemHarnessesForProject(id, visualStyle || 'Cinematic');
      return { 
        id, 
        name, 
        status, 
        createdAt: now, 
        updatedAt: now, 
        prompt, 
        sceneType, 
        projectPath: actualProjectPath,
        width: width || 1920,
        height: height || 1080,
        aspectRatio: aspectRatio || '16:9',
        visualStyle: visualStyle || 'Cinematic',
        sourceLanguage,
        targetLanguages
      };
    }
  }

  // Fallback to LocalStorage
  const newProject: VideoProject = {
    id,
    name,
    prompt: prompt || '',
    status,
    sceneType: sceneType as any,
    createdAt: now,
    updatedAt: now,
    projectPath: actualProjectPath || '',
    width: width || 1920,
    height: height || 1080,
    aspectRatio: aspectRatio || '16:9',
    visualStyle: visualStyle || 'Cinematic',
    sourceLanguage,
    targetLanguages
  };
  const projects = await getLocalStorageProjects();
  projects.push(newProject);
  await saveLocalStorageProjects(projects);
  await seedSystemHarnessesForProject(id, visualStyle || 'Cinematic');
  return newProject;
}

export async function fetchProjectById(id: string): Promise<VideoProject | null> {
  if (isTauri) {
    const database = await getDb();
    if (database) {
      const result = await database.select<any[]>(
        "SELECT * FROM video_projects WHERE project_uuid = ? LIMIT 1",
        [id]
      );
      if (result.length > 0) {
        const p = result[0];
        return {
          id: p.project_uuid,
          name: p.project_name,
          prompt: p.project_prompt,
          coverImagePath: p.cover_image_path,
          projectPath: p.project_path,
          status: p.project_status,
          sceneType: p.scene_type || 'short_video',
          createdAt: p.create_time,
          updatedAt: p.update_time,
          width: p.width || 1920,
          height: p.height || 1080,
          aspectRatio: p.aspect_ratio || '16:9',
          visualStyle: p.visual_style || 'Cinematic',
          videoUrl: p.video_url || null,
          audioUrl: p.audio_url || null,
          audioDuration: p.audio_duration || 0,
          srtOriginal: p.srt_original || null,
          textOriginal: p.text_original || null,
          detectedLanguage: p.detected_language || null,
          sourceLanguage: p.source_language || 'zh',
          targetLanguages: p.target_languages || 'en',
        };
      }
      return null;
    }
  }

  // Fallback to LocalStorage
  const projects = await getLocalStorageProjects();
  return projects.find(p => p.id === id) || null;
}

export async function updateProject(id: string, updates: Partial<VideoProject>): Promise<VideoProject | null> {
  const now = Date.now();
  const current = await fetchProjectById(id);
  if (!current) return null;

  const updated = { ...current, ...updates, updatedAt: now };

  if (isTauri) {
    const database = await getDb();
    if (database) {
      // Map back to DB fields
      await database.execute(
        `UPDATE video_projects SET 
          project_name = ?, 
          project_prompt = ?, 
          project_status = ?, 
          cover_image_path = ?, 
          scene_type = ?, 
          project_path = ?, 
          update_time = ?, 
          width = ?, 
          height = ?, 
          aspect_ratio = ?, 
          visual_style = ?,
          video_url = ?,
          audio_url = ?,
          audio_duration = ?,
          srt_original = ?,
          text_original = ?,
          detected_language = ?,
          source_language = ?,
          target_languages = ?
         WHERE project_uuid = ?`,
        [
          updated.name,
          updated.prompt,
          updated.status,
          updated.coverImagePath || null,
          updated.sceneType,
          updated.projectPath || null,
          now,
          updated.width || 1920,
          updated.height || 1080,
          updated.aspectRatio || '16:9',
          updated.visualStyle || 'Cinematic',
          updated.videoUrl || null,
          updated.audioUrl || null,
          updated.audioDuration || 0,
          updated.srtOriginal || null,
          updated.textOriginal || null,
          updated.detectedLanguage || null,
          updated.sourceLanguage || 'zh',
          updated.targetLanguages || 'en',
          id
        ]
      );
      return updated;
    }
  }

  // Fallback
  const projects = await getLocalStorageProjects();
  const index = projects.findIndex(p => p.id === id);
  if (index !== -1) {
    projects[index] = updated;
    await saveLocalStorageProjects(projects);
  }
  return updated;
}

// Vocabulary operations
const VOCABULARY_LOCAL_STORAGE_KEY = 'ai_video_vocabulary_fallback';

function getLocalStorageVocabulary(): Vocabulary[] {
  const data = localStorage.getItem(VOCABULARY_LOCAL_STORAGE_KEY);
  return data ? JSON.parse(data) : [];
}

function saveLocalStorageVocabulary(vocabularies: Vocabulary[]) {
  localStorage.setItem(VOCABULARY_LOCAL_STORAGE_KEY, JSON.stringify(vocabularies));
}

export async function fetchVocabularyByProject(projectUuid: string): Promise<Vocabulary[]> {
  if (isTauri) {
    const database = await getDb();
    if (database) {
      const result = await database.select<any[]>(
        "SELECT * FROM vocabulary WHERE project_uuid = ? ORDER BY created_at DESC",
        [projectUuid]
      );
      return result.map(v => ({
        id: v.id,
        projectUuid: v.project_uuid,
        word: v.word,
        audioPath: v.audio_path,
        indexChar: v.index_char,
        example: v.example,
        imagePath: v.image_path,
        phoneticSymbols: v.phonetic_symbols,
        chineseDefinition: v.chinese_definition,
        data: v.data,
        prompt: v.prompt,
        videoPath: v.video_path,
        ltx23Prompt: v.ltx23_prompt,
        t2vPrompt: v.t2v_prompt,
        qwenImagePrompt: v.qwen_image_prompt,
        category: v.category,
        script: v.script,
        createdAt: typeof v.created_at === 'string' ? new Date(v.created_at).getTime() : v.created_at,
        updatedAt: typeof v.updated_at === 'string' ? new Date(v.updated_at).getTime() : v.updated_at,
        status: v.status,
        chinese: v.chinese,
        textToImagePrompt: v.text_to_image_prompt,
        imageToVideoPrompt: v.image_to_video_prompt,
        refImagePrompt: v.ref_image_prompt,
        refVideoPrompt: v.ref_video_prompt,
        translation: v.translation,
        voiceover: v.voiceover,
        translationSpeechFile: v.translation_speech_file,
        dialog: v.dialog,
        translations: v.translations
      }));
    }
  }

  // Fallback to LocalStorage for Web Preview
  const allVocab = getLocalStorageVocabulary();
  return allVocab.filter(v => v.projectUuid === projectUuid).sort((a, b) => a.id - b.id);
}

export async function createVocabulary(vocabulary: Partial<Vocabulary>): Promise<any> {
  const now = new Date().toISOString();
  if (isTauri) {
    const database = await getDb();
    if (database) {
      await database.execute(
        `INSERT INTO vocabulary (
          project_uuid, word, audio_path, index_char, example, image_path, 
          phonetic_symbols, chinese_definition, data, prompt, video_path, 
          ltx23_prompt, t2v_prompt, qwen_image_prompt, category, script, 
          created_at, updated_at, status, chinese,
          text_to_image_prompt, image_to_video_prompt, ref_image_prompt, ref_video_prompt,
          translation, voiceover, translation_speech_file, dialog, translations
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          vocabulary.projectUuid, vocabulary.word || "", vocabulary.audioPath || null, vocabulary.indexChar || null, vocabulary.example || null, vocabulary.imagePath || null,
          vocabulary.phoneticSymbols || null, vocabulary.chineseDefinition || null, vocabulary.data || null, vocabulary.prompt || null, vocabulary.videoPath || null,
          vocabulary.ltx23Prompt || null, vocabulary.t2vPrompt || null, vocabulary.qwenImagePrompt || null, vocabulary.category || null, vocabulary.script || null,
          now, now, vocabulary.status || 1, vocabulary.chinese || null,
          vocabulary.textToImagePrompt || null, vocabulary.imageToVideoPrompt || null, vocabulary.refImagePrompt || null, vocabulary.refVideoPrompt || null,
          vocabulary.translation || null, vocabulary.voiceover || null, vocabulary.translationSpeechFile || null, vocabulary.dialog || null, vocabulary.translations || null
        ]
      );
      return true;
    }
  }

  // Fallback to LocalStorage
  const allVocab = getLocalStorageVocabulary();
  const nextId = allVocab.length > 0 ? Math.max(...allVocab.map(v => v.id)) + 1 : 1;
  const newVocab: Vocabulary = {
    id: nextId,
    projectUuid: vocabulary.projectUuid || '',
    word: vocabulary.word || '',
    audioPath: vocabulary.audioPath || '',
    indexChar: vocabulary.indexChar || '',
    example: vocabulary.example || '',
    imagePath: vocabulary.imagePath || '',
    phoneticSymbols: vocabulary.phoneticSymbols || '',
    chineseDefinition: vocabulary.chineseDefinition || '',
    data: vocabulary.data || '',
    prompt: vocabulary.prompt || '',
    videoPath: vocabulary.videoPath || '',
    ltx23Prompt: vocabulary.ltx23Prompt || '',
    t2vPrompt: vocabulary.t2vPrompt || '',
    qwenImagePrompt: vocabulary.qwenImagePrompt || '',
    category: vocabulary.category || 'prose',
    script: vocabulary.script || '',
    createdAt: Date.now(),
    updatedAt: Date.now(),
    status: vocabulary.status || 1,
    chinese: vocabulary.chinese || '',
    textToImagePrompt: vocabulary.textToImagePrompt || '',
    imageToVideoPrompt: vocabulary.imageToVideoPrompt || '',
    refImagePrompt: vocabulary.refImagePrompt || '',
    refVideoPrompt: vocabulary.refVideoPrompt || '',
    translation: vocabulary.translation || '',
    voiceover: vocabulary.voiceover || '',
    translationSpeechFile: vocabulary.translationSpeechFile || '',
    dialog: vocabulary.dialog || '',
    translations: vocabulary.translations || '',
  };
  allVocab.push(newVocab);
  saveLocalStorageVocabulary(allVocab);
  return true;
}

export async function updateVocabulary(id: number, updates: Partial<Vocabulary>): Promise<any> {
  const now = new Date().toISOString();
  if (isTauri) {
    const database = await getDb();
    if (database) {
      // Exclude id and projectUuid from potentially being updated
      const { id: _, projectUuid: __, ...rest } = updates;
      const entries = Object.entries(rest);
      
      if (entries.length === 0) return true;

      const setClause = entries.map(([key]) => {
        // Map camelCase keys to snake_case db columns
        const dbKey = key.replace(/[A-Z]/g, letter => `_${letter.toLowerCase()}`);
        return `${dbKey} = ?`;
      }).concat(["updated_at = ?"]).join(", ");

      const values = entries.map(([_, value]) => value ?? null).concat([now, id]);

      await database.execute(
        `UPDATE vocabulary SET ${setClause} WHERE id = ?`,
        values
      );
      return true;
    }
  }

  // Fallback to LocalStorage
  const allVocab = getLocalStorageVocabulary();
  const index = allVocab.findIndex(v => v.id === id);
  if (index !== -1) {
    allVocab[index] = { ...allVocab[index], ...updates, updatedAt: Date.now() };
    saveLocalStorageVocabulary(allVocab);
    return true;
  }
  return false;
}

export async function deleteVocabulary(id: number): Promise<any> {
  if (isTauri) {
    const database = await getDb();
    if (database) {
      await database.execute("DELETE FROM vocabulary WHERE id = ?", [id]);
      return true;
    }
  }

  // Fallback to LocalStorage
  const allVocab = getLocalStorageVocabulary();
  const filtered = allVocab.filter(v => v.id !== id);
  saveLocalStorageVocabulary(filtered);
  return true;
}

export async function deleteProject(id: string): Promise<boolean> {
  if (isTauri) {
    const database = await getDb();
    if (database) {
      // First delete all vocabulary associated with the project
      await database.execute("DELETE FROM vocabulary WHERE project_uuid = ?", [id]);
      // Then delete the project itself
      await database.execute("DELETE FROM video_projects WHERE project_uuid = ?", [id]);
      return true;
    }
  }

  // Fallback
  const projects = await getLocalStorageProjects();
  const filtered = projects.filter(p => p.id !== id);
  await saveLocalStorageProjects(filtered);
  return true;
}

// App Settings operations
export async function getSetting(key: string): Promise<string | null> {
  if (isTauri) {
    const database = await getDb();
    if (database) {
      try {
        const result = await database.select<any[]>(
          "SELECT value FROM app_settings WHERE key = ? LIMIT 1",
          [key]
        );
        if (result.length > 0 && result[0].value) {
          return result[0].value;
        }
      } catch (err: any) {
        const errMsg = err?.toString() || "";
        if (errMsg.includes("no such table: app_settings")) {
          console.warn("Table app_settings does not exist, creating it...");
          try {
            await database.execute(
              "CREATE TABLE IF NOT EXISTS app_settings (key TEXT PRIMARY KEY, value TEXT NOT NULL, updated_at DATETIME DEFAULT CURRENT_TIMESTAMP);"
            );
            const result = await database.select<any[]>(
              "SELECT value FROM app_settings WHERE key = ? LIMIT 1",
              [key]
            );
            if (result.length > 0 && result[0].value) {
              return result[0].value;
            }
          } catch (createErr) {
            console.error("Failed to self-heal app_settings table in getSetting:", createErr);
          }
        } else {
          console.error("Error reading setting:", err);
        }
      }
    }
  }
  const localVal = localStorage.getItem(key);
  if (localVal) return localVal;

  if (key === 'workspace_path') {
    return 'workspace';
  }
  return null;
}

export async function fetchRandomProjectImage(projectUuid: string): Promise<string | null> {
  if (isTauri) {
    const database = await getDb();
    if (database) {
      try {
        const result = await database.select<any[]>(
          "SELECT image_path FROM vocabulary WHERE project_uuid = ? AND image_path IS NOT NULL AND image_path != '' ORDER BY RANDOM() LIMIT 1",
          [projectUuid]
        );
        if (result.length > 0) {
          return result[0].image_path;
        }
      } catch (err) {
        console.error("Error fetching random project image:", err);
      }
    }
  }
  return null;
}

export async function setSetting(key: string, value: string): Promise<boolean> {
  localStorage.setItem(key, value);
  if (isTauri) {
    const database = await getDb();
    if (database) {
      try {
        await database.execute(
          "INSERT INTO app_settings (key, value, updated_at) VALUES (?, ?, CURRENT_TIMESTAMP) ON CONFLICT(key) DO UPDATE SET value = EXCLUDED.value, updated_at = CURRENT_TIMESTAMP",
          [key, value]
        );
        return true;
      } catch (err: any) {
        const errMsg = err?.toString() || "";
        if (errMsg.includes("no such table: app_settings")) {
          console.warn("Table app_settings does not exist in setSetting, creating it...");
          try {
            await database.execute(
              "CREATE TABLE IF NOT EXISTS app_settings (key TEXT PRIMARY KEY, value TEXT NOT NULL, updated_at DATETIME DEFAULT CURRENT_TIMESTAMP);"
            );
            await database.execute(
              "INSERT INTO app_settings (key, value, updated_at) VALUES (?, ?, CURRENT_TIMESTAMP) ON CONFLICT(key) DO UPDATE SET value = EXCLUDED.value, updated_at = CURRENT_TIMESTAMP",
              [key, value]
            );
            return true;
          } catch (createErr) {
            console.error("Failed to self-heal app_settings table in setSetting:", createErr);
          }
        } else {
          console.error("Error writing setting:", err);
        }
      }
    }
  }
  return true;
}

// Visual Library operations
const VISUAL_LIBRARY_LOCAL_STORAGE_KEY = 'ai_visual_library_fallback';

export function getLocalStorageVisualLibrary(): VisualLibraryItem[] {
  const data = localStorage.getItem(VISUAL_LIBRARY_LOCAL_STORAGE_KEY);
  return data ? JSON.parse(data) : [];
}

export function saveLocalStorageVisualLibrary(items: VisualLibraryItem[]) {
  localStorage.setItem(VISUAL_LIBRARY_LOCAL_STORAGE_KEY, JSON.stringify(items));
}

export async function fetchVisualLibraryByProject(projectId: string): Promise<VisualLibraryItem[]> {
  await ensureCameraMotionsSeeded(projectId);
  if (isTauri) {
    const database = await getDb();
    if (database) {
      try {
        const result = await database.select<any[]>(
          "SELECT * FROM visual_library WHERE project_id = ? ORDER BY created_at DESC",
          [projectId]
        );
        return result.map(v => ({
          id: v.id,
          projectId: v.project_id,
          sceneId: v.scene_id || '',
          title: v.title || '',
          type: v.type || '',
          uuid: v.uuid || '',
          shortName: v.short_name || '',
          imagePrompt: v.image_prompt || '',
          videoPrompt: v.video_prompt || '',
          audioPrompt: v.audio_prompt || '',
          imagePath: v.image_path || '',
          videoPath: v.video_path || '',
          audioPath: v.audio_path || '',
          createdAt: typeof v.created_at === 'string' ? new Date(v.created_at).getTime() : (v.created_at || Date.now()),
          updatedAt: typeof v.updated_at === 'string' ? new Date(v.updated_at).getTime() : (v.updated_at || Date.now()),
        }));
      } catch (err) {
        console.error("Error fetching visual library from DB:", err);
      }
    }
  }

  // Fallback to LocalStorage for Web Preview / fallback
  const allItems = getLocalStorageVisualLibrary();
  return allItems.filter(item => item.projectId === projectId).sort((a, b) => b.createdAt - a.createdAt);
}

export async function createVisualLibraryItem(item: Partial<VisualLibraryItem>): Promise<VisualLibraryItem> {
  const now = Date.now();
  
  if (isTauri) {
    const database = await getDb();
    if (database) {
      try {
        await database.execute(
          `INSERT INTO visual_library (
            project_id, scene_id, title, type, uuid, short_name, image_prompt, video_prompt, audio_prompt, 
            image_path, video_path, audio_path, created_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            item.projectId || "",
            item.sceneId || "",
            item.title || "",
            item.type || "",
            item.uuid || "",
            item.shortName || "",
            item.imagePrompt || "",
            item.videoPrompt || "",
            item.audioPrompt || "",
            item.imagePath || "",
            item.videoPath || "",
            item.audioPath || "",
            now,
            now
          ]
        );
        
        // Retrive last inserted id in SQLite
        const idResult = await database.select<any[]>("SELECT last_insert_rowid() as id");
        const insertedId = idResult[0]?.id || now;
        
        return {
          id: insertedId,
          projectId: item.projectId || "",
          sceneId: item.sceneId || "",
          title: item.title || "",
          type: item.type || "",
          uuid: item.uuid || "",
          shortName: item.shortName || "",
          imagePrompt: item.imagePrompt || "",
          videoPrompt: item.videoPrompt || "",
          audioPrompt: item.audioPrompt || "",
          imagePath: item.imagePath || "",
          videoPath: item.videoPath || "",
          audioPath: item.audioPath || "",
          createdAt: now,
          updatedAt: now,
        } as VisualLibraryItem;
      } catch (err) {
        console.error("Error inserting visual library item:", err);
      }
    }
  }

  // Fallback to LocalStorage
  const allItems = getLocalStorageVisualLibrary();
  const nextId = allItems.length > 0 ? Math.max(...allItems.map(v => v.id)) + 1 : 1;
  const newItem: VisualLibraryItem = {
    id: nextId,
    projectId: item.projectId || '',
    sceneId: item.sceneId || '',
    title: item.title || '',
    type: item.type || '',
    uuid: item.uuid || '',
    shortName: item.shortName || '',
    imagePrompt: item.imagePrompt || '',
    videoPrompt: item.videoPrompt || '',
    audioPrompt: item.audioPrompt || '',
    imagePath: item.imagePath || '',
    videoPath: item.videoPath || '',
    audioPath: item.audioPath || '',
    createdAt: now,
    updatedAt: now,
  };
  allItems.push(newItem);
  saveLocalStorageVisualLibrary(allItems);
  return newItem;
}

export async function updateVisualLibraryItem(id: number, updates: Partial<VisualLibraryItem>): Promise<boolean> {
  const now = Date.now();
  if (isTauri) {
    const database = await getDb();
    if (database) {
      try {
        const { id: _, projectId: __, ...rest } = updates;
        const entries = Object.entries(rest);
        
        if (entries.length === 0) return true;

        const setClause = entries.map(([key]) => {
          // Map camelCase keys to snake_case db columns
          const dbKey = key.replace(/[A-Z]/g, letter => `_${letter.toLowerCase()}`);
          return `${dbKey} = ?`;
        }).concat(["updated_at = ?"]).join(", ");

        const values = entries.map(([_, value]) => value ?? null).concat([now, id]);

        await database.execute(
          `UPDATE visual_library SET ${setClause} WHERE id = ?`,
          values
        );
        return true;
      } catch (err) {
        console.error("Error updating visual library item in DB:", err);
        return false;
      }
    }
  }

  // Fallback to LocalStorage
  const allItems = getLocalStorageVisualLibrary();
  const index = allItems.findIndex(v => v.id === id);
  if (index !== -1) {
    allItems[index] = { ...allItems[index], ...updates, updatedAt: now };
    saveLocalStorageVisualLibrary(allItems);
    return true;
  }
  return false;
}

export async function deleteVisualLibraryItem(id: number): Promise<boolean> {
  if (isTauri) {
    const database = await getDb();
    if (database) {
      try {
        await database.execute("DELETE FROM visual_library WHERE id = ?", [id]);
        return true;
      } catch (err) {
        console.error("Error deleting visual library item:", err);
        return false;
      }
    }
  }

  // Fallback to LocalStorage
  const allItems = getLocalStorageVisualLibrary();
  const filtered = allItems.filter(v => v.id !== id);
  saveLocalStorageVisualLibrary(filtered);
  return true;
}

// ========================================================
// Prompt Harness operations (IP Consistency Harness System)
// ========================================================
const PROMPT_HARNESS_LOCAL_STORAGE_KEY = 'ai_prompt_harnesses_fallback';

export const STYLE_TEMPLATES = [
  {
    name_en: 'Cinematic',
    name_zh: '电影',
    image: "classic 35mm photograph, shallow depth of field, warm cinematic lighting, ultra-detailed photorealistic, shot on ARRI Alexa",
    video: "35mm cinema camera film grain, dramatic high contrast, photorealistic cinematic movement"
  },
  {
    name_en: 'Animation',
    name_zh: '动画',
    image: "Pixar style 3D animation, soft clay render, stylized big expressive eyes, bright colorful lighting, sub-surface scattering skin",
    video: "3D stylized animation keyframes, soft render movement, vibrant colors"
  },
  {
    name_en: 'Comic',
    name_zh: '漫画',
    image: "vibrant anime manga comic illustration, ink lineart, halftone dots, bold line weight, screentone shading overlay",
    video: "dynamic visual novel anime style cells, bold outline transition"
  },
  {
    name_en: 'Ghibli',
    name_zh: '吉卜力',
    image: "Studio Ghibli aesthetic watercolor handpainted anime wallpaper, nostalgic rich color scheme, gorgeous scenery master keyframe",
    video: "nostalgic hand-painted watercolor anime scene landscape panning, retro aesthetic"
  },
  {
    name_en: 'Pixar',
    name_zh: '皮克斯动画',
    image: "high-end 3D Disney Pixar animation render, cute stylized character, extremely expressive eyes, realistic hair groom, sub-surface scattering skin, cinematic colorful keyframe, smooth 3D render",
    video: "smooth cinematic 3D character animation, playful expressions, classic Pixar storytelling camera pan"
  },
  {
    name_en: 'PixarClay',
    name_zh: '皮克斯粘土',
    image: "claymation cute animation style, handcrafted cozy clay texture, soft matte finish, cute round proportions, miniature diorama set, stop-motion aesthetic",
    video: "stop-motion claymation character movement, subtle playful clay deformation, tactile cozy animations"
  },
  {
    name_en: 'Cyberpunk',
    name_zh: '赛博朋克',
    image: "futuristic cyberpunk cityscape portrait, glowing neon signs, vibrant pink and cyan highlights, wet rainy pavement reflections, detailed cybernetic enhancements, high-tech dark atmosphere",
    video: "cinematic neon lighting reflection, rain trickling down, high-speed camera sweep with lens flares"
  },
  {
    name_en: 'OilPainting',
    name_zh: '写实油画',
    image: "classical oil painting aesthetic, textured brush strokes, impasto technique, rich deep color palette, masterwork gallery level detail, fine canvas texture",
    video: "slow moving camera panning across a fine-art oil canvas, artistic organic motion"
  },
  {
    name_en: 'UkiyoE',
    name_zh: '传统浮世绘',
    image: "classic Japanese Ukiyo-e woodblock print style, handpainted mineral pigments, elegant dark ink outlines, flat solid color planes, vintage mulberry paper texture, flowing woodblock artwork",
    video: "stylized woodblock flat illustration camera panning, gentle organic paper ripples, retro hand-drawn frames"
  },
  {
    name_en: 'UnrealEngine',
    name_zh: '虚幻写实',
    image: "photorealistic ultra-detailed render, Unreal Engine 5 aesthetic, global illumination, hyper-detailed skin pores and fabric weave, ray-traced shadows, gorgeous cinematography",
    video: "epic cinematic tracking shot, hyper-realistic physics engine movement, crisp focus pulling, atmospheric details"
  }
];

export async function ensureVisualStylesSeeded(projectId: string): Promise<void> {
  const now = Date.now();
  if (isTauri) {
    const database = await getDb();
    if (database) {
      try {
        const countResult = await database.select<any[]>(
          "SELECT COUNT(*) as cnt FROM prompt_harness WHERE project_id = ? AND type = 'visual_style'",
          [projectId]
        );
        const count = countResult[0]?.cnt || 0;
        if (count === 0) {
          console.log(`Dynamic seeding visual styles in DB for project ${projectId}`);
          for (const style of STYLE_TEMPLATES) {
            await database.execute(
              `INSERT INTO prompt_harness (project_id, trigger_keyword, visual_asset_id, active, type, template, parameters, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
              [projectId, style.name_en, 0, 1, 'visual_style', style.image, style.video, now, now]
            );
            await database.execute(
              `INSERT INTO prompt_harness (project_id, trigger_keyword, visual_asset_id, active, type, template, parameters, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
              [projectId, style.name_zh, 0, 1, 'visual_style', style.image, style.video, now, now]
            );
          }
        }
      } catch (err) {
        console.error("Failed to dynamically seed visual styles in DB:", err);
      }
    }
    return;
  }

  // Fallback to LocalStorage
  try {
    const allHarnessesRaw = localStorage.getItem(PROMPT_HARNESS_LOCAL_STORAGE_KEY);
    const allHarnesses: any[] = allHarnessesRaw ? JSON.parse(allHarnessesRaw) : [];
    const count = allHarnesses.filter(h => h.projectId === projectId && h.type === 'visual_style').length;
    if (count === 0) {
      console.log(`Dynamic seeding visual styles in LocalStorage for project ${projectId}`);
      let virtualIdCounter = Date.now();
      for (const style of STYLE_TEMPLATES) {
        allHarnesses.push({
          id: ++virtualIdCounter,
          projectId,
          triggerKeyword: style.name_en,
          visualAssetId: 0,
          active: 1,
          type: 'visual_style',
          template: style.image,
          parameters: style.video,
          createdAt: now,
          updatedAt: now
        });
        allHarnesses.push({
          id: ++virtualIdCounter,
          projectId,
          triggerKeyword: style.name_zh,
          visualAssetId: 0,
          active: 1,
          type: 'visual_style',
          template: style.image,
          parameters: style.video,
          createdAt: now,
          updatedAt: now
        });
      }
      localStorage.setItem(PROMPT_HARNESS_LOCAL_STORAGE_KEY, JSON.stringify(allHarnesses));
    }
  } catch (err) {
    console.error("Failed to dynamically seed visual styles in LocalStorage:", err);
  }
}

export const CAMERA_MOTIONS = [
  {
    title: "Pan Left 左摇镜",
    shortName: "@PanLeft",
    english: "Pan Left",
    prompt: "Pan Left shot, stationary camera, slow horizontal pan to left, smooth motion, stable frame, cinematic composition, no camera position shift"
  },
  {
    title: "Pan Right 右摇镜",
    shortName: "@PanRight",
    english: "Pan Right",
    prompt: "Pan Right shot, fixed camera position, gentle horizontal pan right, silky smooth movement, natural perspective transition"
  },
  {
    title: "Pan Up 上摇镜",
    shortName: "@PanUp",
    english: "Pan Up",
    prompt: "Pan Up shot, static camera, vertical slow tilt upward, gradual reveal upper scenery, smooth motion blur"
  },
  {
    title: "Pan Down 下摇镜",
    shortName: "@PanDown",
    english: "Pan Down",
    prompt: "Pan Down shot, locked camera, vertical pan down, slow descending view, soft motion transition"
  },
  {
    title: "Dolly In 物理前推镜",
    shortName: "@DollyIn",
    english: "Dolly In",
    prompt: "Dolly In shot, camera physically moving forward, natural depth of field, smooth linear movement, cinematic depth"
  },
  {
    title: "Dolly Out 物理后拉镜",
    shortName: "@DollyOut",
    english: "Dolly Out",
    prompt: "Dolly Out shot, camera slow backward movement, widening field of view, stable sliding motion, rich background context"
  },
  {
    title: "Dolly Left 轨道左移",
    shortName: "@DollyLeft",
    english: "Dolly Left",
    prompt: "Dolly Left sliding shot, parallel horizontal camera movement, subject centered in frame, ultra smooth track motion"
  },
  {
    title: "Dolly Right 轨道右移",
    shortName: "@DollyRight",
    english: "Dolly Right",
    prompt: "Dolly Right track shot, horizontal slide to right, steady movement, clear spatial layering"
  },
  {
    title: "Pedestal Up 整机升镜",
    shortName: "@PedestalUp",
    english: "Pedestal Up",
    prompt: "Pedestal Up shot, whole camera vertical lift upward, gradual elevation, wide landscape reveal, vibration-free"
  },
  {
    title: "Pedestal Down 整机降镜",
    shortName: "@PedestalDown",
    english: "Pedestal Down",
    prompt: "Pedestal Down shot, camera vertical descending movement, low angle gradual transition, smooth lifting gear motion"
  },
  {
    title: "Zoom In 数码/光学拉近",
    shortName: "@ZoomIn",
    english: "Zoom In",
    prompt: "Slow Zoom In shot, fixed camera position, gradual focal length increase, soft background blur, subtle motion blur"
  },
  {
    title: "Zoom Out 数码/光学拉远",
    shortName: "@ZoomOut",
    english: "Zoom Out",
    prompt: "Slow Zoom Out shot, static camera, steadily widening focal view, full scene exposure, smooth zoom transition"
  },
  {
    title: "Dolly Zoom 希区柯克眩晕变焦",
    shortName: "@DollyZoom",
    english: "Dolly Zoom",
    prompt: "Dolly Vertigo shot, camera dolly backward while zooming in, subject size unchanged, distorted background perspective, tense cinematic atmosphere"
  },
  {
    title: "Orbit Left 左环绕运镜",
    shortName: "@OrbitLeft",
    english: "Orbit Left",
    prompt: "Slow Left Orbit shot, camera circling counterclockwise around central subject, consistent distance from target, smooth circular motion"
  },
  {
    title: "Orbit Right 右环绕运镜",
    shortName: "@OrbitRight",
    english: "Orbit Right",
    prompt: "Right Orbit shot, clockwise circular camera movement around main subject, steady orbit radius, cinematic 360 partial view"
  },
  {
    title: "Full Circular Orbit 360°完整环绕",
    shortName: "@FullCircularOrbit",
    english: "Full Circular Orbit",
    prompt: "Full 360 Circular Orbit shot, complete circular camera loop around subject, uniform moving speed, balanced framing"
  },
  {
    title: "Arc Shot 半弧形运镜",
    shortName: "@ArcShot",
    english: "Arc Shot",
    prompt: "Arc Shot, half-circle curved camera movement, gentle arc trajectory, moderate view transition, natural pacing"
  },
  {
    title: "Crane Up 摇臂升镜",
    shortName: "@CraneUp",
    english: "Crane Up",
    prompt: "Crane Up shot, professional film crane lifting camera high, dramatic wide landscape reveal, fluid large range motion"
  },
  {
    title: "Crane Down 摇臂降镜",
    shortName: "@CraneDown",
    english: "Crane Down",
    prompt: "Crane Down shot, crane arm lowering camera from high altitude, slow descent from wide shot to close-up, epic cinematic feel"
  },
  {
    title: "Drone Fly Forward 无人机低空前飞",
    shortName: "@DroneFlyForward",
    english: "Drone Fly Forward",
    prompt: "Drone forward fly shot, low altitude aerial camera, steady forward flight, sweeping landscape, smooth aerial stabilization"
  },
  {
    title: "Drone Fly Backward 无人机向后飞掠",
    shortName: "@DroneFlyBackward",
    english: "Drone Fly Backward",
    prompt: "Drone backward reveal shot, drone flying backward and slightly ascending, widening aerial view, grand scenery unfolding"
  },
  {
    title: "Drone Ascend 无人机上升",
    shortName: "@DroneAscend",
    english: "Drone Ascend",
    prompt: "Drone Ascend shot, stationary drone vertical climb upward, gradual high-angle aerial view, layered terrain display"
  },
  {
    title: "Drone Descend 无人机俯冲下降",
    shortName: "@DroneDescend",
    english: "Drone Descend",
    prompt: "Drone Descend shot, slow vertical aerial dive from high altitude, descending focus on ground subject, soft aerial motion"
  },
  {
    title: "Drone Fly Past 无人机擦身飞掠",
    shortName: "@DroneFlyPast",
    english: "Drone Fly Past",
    prompt: "Drone Fly Past shot, drone horizontally glide past central subject, dynamic fast aerial movement, slight motion blur for speed"
  },
  {
    title: "Top-Down Drone 上帝垂直俯拍",
    shortName: "@TopDownDrone",
    english: "Top-Down Drone",
    prompt: "Bird’s Eye Top-Down drone shot, perfectly vertical overhead aerial view, symmetrical composition, flat top perspective"
  },
  {
    title: "Forward Tracking 向前跟拍",
    shortName: "@ForwardTracking",
    english: "Forward Tracking",
    prompt: "Forward Tracking shot, camera moving synchronously with walking subject, subject stays centered, flowing foreground blur"
  },
  {
    title: "Backward Tracking 倒退跟拍",
    shortName: "@BackwardTracking",
    english: "Backward Tracking",
    prompt: "Backward Tracking shot, camera moving backward facing subject, continuous front tracking, stable gimbal movement"
  },
  {
    title: "Side Tracking 侧面平行跟拍",
    shortName: "@SideTracking",
    english: "Side Tracking",
    prompt: "Side Parallel Tracking shot, camera moving side-by-side with character, horizontal synchronized motion, clear side profile view"
  },
  {
    title: "Low Angle Shot 低角度仰拍",
    shortName: "@LowAngleShot",
    english: "Low Angle Shot",
    prompt: "Low Angle shot, camera below subject eye level, upward looking perspective, powerful imposing atmosphere, slight wide distortion"
  },
  {
    title: "High Angle Shot 高角度俯拍",
    shortName: "@HighAngleShot",
    english: "High Angle Shot",
    prompt: "High Angle shot, elevated camera looking down at subject, restrained weak atmosphere, clear surrounding environment layout"
  },
  {
    title: "Dutch Tilt 斜角歪镜",
    shortName: "@DutchTilt",
    english: "Dutch Tilt",
    prompt: "Dutch Tilt shot, canted tilted camera frame, slanted horizontal line, tense unstable psychological atmosphere, cinematic thriller style"
  },
  {
    title: "Stabilized Hand Follow 稳定器顺滑手持跟拍",
    shortName: "@StabilizedHandFollow",
    english: "Stabilized Hand Follow",
    prompt: "Stabilized handheld follow shot, gimbal balanced camera, soft natural micro motion, documentary texture, no harsh shake"
  },
  {
    title: "Shoulder Cam 肩扛手持镜头",
    shortName: "@ShoulderCam",
    english: "Shoulder Cam",
    prompt: "Shoulder mount handheld shot, subtle natural camera shake, realistic documentary aesthetic, slight motion jitter"
  },
  {
    title: "Running Hand Shot 奔跑手持镜头",
    shortName: "@RunningHandShot",
    english: "Running Hand Shot",
    prompt: "Running handheld shot, obvious dynamic camera shake, fast chase atmosphere, heavy motion blur for rapid movement"
  },
  {
    title: "Whip Pan 极速甩镜/闪摇转场",
    shortName: "@WhipPan",
    english: "Whip Pan",
    prompt: "Whip Pan transition shot, ultra fast horizontal camera whip, heavy motion blur streak, quick scene cut transition effect"
  },
  {
    title: "POV Shot 第一人称主观镜头",
    shortName: "@POVShot",
    english: "POV Shot",
    prompt: "Human POV shot, first-person subjective perspective, camera movement simulate human eye vision, immersive immersive viewing experience"
  },
  {
    title: "Spin Rotate 机身自旋镜头",
    shortName: "@SpinRotate",
    english: "Spin Rotate",
    prompt: "Camera Spin Rotate shot, 360 axial self rotation of camera, swirling spinning frame, dreamy dizzy visual effect"
  },
  {
    title: "Creep Slow Push 潜行慢推镜",
    shortName: "@CreepSlowPush",
    english: "Creep Slow Push",
    prompt: "Creep slow Dolly In shot, ultra slow forward camera creep, barely perceptible movement, eerie suspense horror atmosphere"
  },
  {
    title: "Rack Focus 焦点切换运镜",
    shortName: "@RackFocus",
    english: "Rack Focus",
    prompt: "Tracking shot with Rack Focus, camera slow movement, fast shift focal point between foreground and background, clear focus jump transition"
  }
];

export async function ensureCameraMotionsSeeded(projectId: string): Promise<void> {
  const now = Date.now();
  if (isTauri) {
    const database = await getDb();
    if (database) {
      try {
        const countResult = await database.select<any[]>(
          "SELECT COUNT(*) as cnt FROM visual_library WHERE project_id = ? AND type = '运镜'",
          [projectId]
        );
        const count = countResult[0]?.cnt || 0;
        if (count === 0) {
          console.log(`Dynamic seeding camera motions in DB for project ${projectId}`);
          
          // Fetch from visual_library_template where template_type is camera
          const templates = await database.select<any[]>(
            "SELECT * FROM visual_library_template WHERE template_type = 'camera'"
          );
          
          if (templates && templates.length > 0) {
            console.log(`Retrieved ${templates.length} camera templates from database to seed project ${projectId}`);
            for (const t of templates) {
              const title = `${t.template_name} ${t.template_name_chinese}`;
              const shortName = `@${t.template_name.replace(/\s+/g, '')}`;
              const sceneId = shortName.toLowerCase().replace('@', '');
              
              await database.execute(
                `INSERT INTO visual_library (project_id, scene_id, title, type, uuid, short_name, image_prompt, video_prompt, audio_prompt, image_path, video_path, audio_path, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                [projectId, sceneId, title, '运镜', '', shortName, t.prompt, t.prompt, '', '', '', '', now, now]
              );
            }
          } else {
            console.warn("No camera templates found in visual_library_template, falling back to static CAMERA_MOTIONS");
            for (const motion of CAMERA_MOTIONS) {
              await database.execute(
                `INSERT INTO visual_library (project_id, scene_id, title, type, uuid, short_name, image_prompt, video_prompt, audio_prompt, image_path, video_path, audio_path, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                [projectId, motion.shortName.toLowerCase().replace('@', ''), motion.title, '运镜', '', motion.shortName, motion.prompt, motion.prompt, '', '', '', '', now, now]
              );
            }
          }
        }
      } catch (err) {
        console.error("Failed to dynamically seed camera motions in DB:", err);
      }
    }
    return;
  }

  // Fallback to LocalStorage
  try {
    const allItemsRaw = localStorage.getItem(VISUAL_LIBRARY_LOCAL_STORAGE_KEY);
    const allItems: any[] = allItemsRaw ? JSON.parse(allItemsRaw) : [];
    const count = allItems.filter(item => item.projectId === projectId && item.type === '运镜').length;
    if (count === 0) {
      console.log(`Dynamic seeding camera motions in LocalStorage for project ${projectId}`);
      let virtualIdCounter = Date.now();
      for (const motion of CAMERA_MOTIONS) {
        allItems.push({
          id: ++virtualIdCounter,
          projectId,
          sceneId: motion.shortName.toLowerCase().replace('@', ''),
          title: motion.title,
          type: '运镜',
          uuid: '',
          shortName: motion.shortName,
          imagePrompt: motion.prompt,
          videoPrompt: motion.prompt,
          audioPrompt: '',
          imagePath: '',
          videoPath: '',
          audioPath: '',
          createdAt: now,
          updatedAt: now
        });
      }
      localStorage.setItem(VISUAL_LIBRARY_LOCAL_STORAGE_KEY, JSON.stringify(allItems));
    }
  } catch (err) {
    console.error("Failed to dynamically seed camera motions in LocalStorage:", err);
  }
}

export function getLocalStoragePromptHarnesses(): PromptHarness[] {
  const data = localStorage.getItem(PROMPT_HARNESS_LOCAL_STORAGE_KEY);
  return data ? JSON.parse(data) : [];
}

export function saveLocalStoragePromptHarnesses(items: PromptHarness[]) {
  localStorage.setItem(PROMPT_HARNESS_LOCAL_STORAGE_KEY, JSON.stringify(items));
}

export async function fetchPromptHarnessByProject(projectId: string): Promise<PromptHarness[]> {
  await ensureVisualStylesSeeded(projectId);
  if (isTauri) {
    const database = await getDb();
    if (database) {
      try {
        const result = await database.select<any[]>(
          "SELECT * FROM prompt_harness WHERE project_id = ? ORDER BY created_at DESC",
          [projectId]
        );
        return result.map(h => ({
          id: h.id,
          projectId: h.project_id,
          triggerKeyword: h.trigger_keyword || '',
          visualAssetId: h.visual_asset_id || 0,
          active: h.active === undefined ? 1 : h.active,
          createdAt: typeof h.created_at === 'string' ? new Date(h.created_at).getTime() : (h.created_at || Date.now()),
          updatedAt: typeof h.updated_at === 'string' ? new Date(h.updated_at).getTime() : (h.updated_at || Date.now()),
          type: h.type || 'static',
          template: h.template || '',
          parameters: h.parameters || '',
          targetModel: h.target_model || '',
        }));
      } catch (err) {
        console.error("Error fetching prompt harnesses from DB:", err);
      }
    }
  }

  // Fallback to LocalStorage
  const allItems = getLocalStoragePromptHarnesses();
  return allItems.filter(item => item.projectId === projectId).sort((a, b) => b.createdAt - a.createdAt);
}

export async function createPromptHarness(harness: Partial<PromptHarness>): Promise<PromptHarness> {
  const now = Date.now();
  const triggerKeyword = harness.triggerKeyword || "";
  const visualAssetId = harness.visualAssetId || 0;
  const active = harness.active !== undefined ? harness.active : 1;
  const projectId = harness.projectId || "";
  const type = harness.type || "static";
  const template = harness.template || "";
  const parameters = harness.parameters || "";
  const targetModel = harness.targetModel || "";

  if (isTauri) {
    const database = await getDb();
    if (database) {
      try {
        await database.execute(
          `INSERT INTO prompt_harness (
            project_id, trigger_keyword, visual_asset_id, active, type, template, parameters, target_model, created_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [projectId, triggerKeyword, visualAssetId, active, type, template, parameters, targetModel, now, now]
        );
        
        const idResult = await database.select<any[]>("SELECT last_insert_rowid() as id");
        const insertedId = idResult[0]?.id || now;
        
        return {
          id: insertedId,
          projectId,
          triggerKeyword,
          visualAssetId,
          active,
          type,
          template,
          parameters,
          targetModel,
          createdAt: now,
          updatedAt: now
        };
      } catch (err) {
        console.error("Error inserting prompt harness:", err);
      }
    }
  }

  // Client fallback
  const allItems = getLocalStoragePromptHarnesses();
  const nextId = allItems.length > 0 ? Math.max(...allItems.map(h => h.id)) + 1 : 1;
  const newItem: PromptHarness = {
    id: nextId,
    projectId,
    triggerKeyword,
    visualAssetId,
    active,
    type,
    template,
    parameters,
    targetModel,
    createdAt: now,
    updatedAt: now
  };
  allItems.push(newItem);
  saveLocalStoragePromptHarnesses(allItems);
  return newItem;
}

export async function updatePromptHarness(id: number, updates: Partial<PromptHarness>): Promise<boolean> {
  const now = Date.now();
  if (isTauri) {
    const database = await getDb();
    if (database) {
      try {
        const { id: _, projectId: __, ...rest } = updates;
        const entries = Object.entries(rest);
        
        if (entries.length === 0) return true;

        const setClause = entries.map(([key]) => {
          const dbKey = key.replace(/[A-Z]/g, letter => `_${letter.toLowerCase()}`);
          return `${dbKey} = ?`;
        }).concat(["updated_at = ?"]).join(", ");

        const values = entries.map(([_, value]) => value ?? null).concat([now, id]);

        await database.execute(
          `UPDATE prompt_harness SET ${setClause} WHERE id = ?`,
          values
        );
        return true;
      } catch (err) {
        console.error("Error updating prompt harness in DB:", err);
        return false;
      }
    }
  }

  // Local storage fallback
  const allItems = getLocalStoragePromptHarnesses();
  const index = allItems.findIndex(h => h.id === id);
  if (index !== -1) {
    allItems[index] = { ...allItems[index], ...updates, updatedAt: now };
    saveLocalStoragePromptHarnesses(allItems);
    return true;
  }
  return false;
}

export async function deletePromptHarness(id: number): Promise<boolean> {
  if (isTauri) {
    const database = await getDb();
    if (database) {
      try {
        await database.execute("DELETE FROM prompt_harness WHERE id = ?", [id]);
        return true;
      } catch (err) {
        console.error("Error deleting prompt harness:", err);
        return false;
      }
    }
  }

  // Local storage fallback
  const allItems = getLocalStoragePromptHarnesses();
  const filtered = allItems.filter(h => h.id !== id);
  saveLocalStoragePromptHarnesses(filtered);
  return true;
}

/**
 * Harness Engine - Core Prompt expander
 * Finds Trigger Keywords matched in the original raw draft prompt,
 * and appends/replaces them with the detailed visual prompts of synced library assets.
 * Now optimized using a design-pattern based Strategy & Registry Engine.
 */
export async function applyPromptHarnessRules(promptText: string, projectId: string, targetModel?: string): Promise<string> {
  if (!promptText || !promptText.trim()) return promptText;

  try {
    const harnesses = await fetchPromptHarnessByProject(projectId);
    const activeHarnesses = harnesses.filter(h => h.active === 1);

    // Dynamically retrieve character definitions from WordManagement (Vocabulary database)
    const virtualHarnesses: any[] = [];
    try {
      const vocabularies = await fetchVocabularyByProject(projectId);
      for (const vocab of vocabularies) {
        if (vocab.data && vocab.word) {
          try {
            const parsed = JSON.parse(vocab.data);
            const charactorConstraint = parsed.charactor || '';
            if (charactorConstraint && charactorConstraint.trim()) {
              // Create a virtual persona speech harness rule for this character
              const trigger = vocab.word.startsWith('@') ? vocab.word : `@${vocab.word}`;
              virtualHarnesses.push({
                id: -vocab.id, // negative number to avoid id clashes
                projectId: projectId,
                triggerKeyword: trigger,
                type: 'persona',
                template: charactorConstraint,
                active: 1,
                visualAssetId: 0
              });
            }
          } catch (e) {}
        }
      }
    } catch (e) {
      console.warn("Failed to dynamically fetch vocabulary characters for speech constraints:", e);
    }

    const mergedHarnesses = [...activeHarnesses, ...virtualHarnesses];
    if (mergedHarnesses.length === 0) return promptText;

    const engine = PromptHarnessEngine.getInstance();
    return await engine.process(promptText, mergedHarnesses, { projectId, targetModel });
  } catch (err) {
    console.warn("Harness engine substitution warning:", err);
    return promptText;
  }
}

// ========================================================
// BACKGROUND QUEUE & TASK MANAGER DB OPERATIONS
// ========================================================
const TASKS_LOCAL_STORAGE_KEY = 'background_tasks_fallback';

function getLocalStorageTasks(): BackgroundTask[] {
  const data = localStorage.getItem(TASKS_LOCAL_STORAGE_KEY);
  return data ? JSON.parse(data) : [];
}

function saveLocalStorageTasks(items: BackgroundTask[]) {
  localStorage.setItem(TASKS_LOCAL_STORAGE_KEY, JSON.stringify(items));
}

export async function fetchBackgroundTasks(projectId?: string): Promise<BackgroundTask[]> {
  if (isTauri) {
    const database = await getDb();
    if (database) {
      try {
        let query = "SELECT * FROM background_tasks";
        let params: any[] = [];
        if (projectId) {
          query += " WHERE project_id = ?";
          params.push(projectId);
        }
        query += " ORDER BY priority DESC, created_at DESC";
        const result = await database.select<any[]>(query, params);
        return result.map(t => ({
          id: t.id,
          projectId: t.project_id || '',
          name: t.name || '',
          type: t.type as TaskType,
          status: t.status as TaskStatus,
          params: t.params || '{}',
          result: t.result || undefined,
          error: t.error || undefined,
          progress: t.progress || 0,
          scheduledAt: t.scheduled_at || undefined,
          createdAt: t.created_at || Date.now(),
          startedAt: t.started_at || undefined,
          completedAt: t.completed_at || undefined,
          priority: t.priority || 0,
        }));
      } catch (err) {
        console.error("Error fetching background tasks from DB:", err);
      }
    }
  }

  // Local storage fallback
  const allTasks = getLocalStorageTasks();
  let filtered = allTasks;
  if (projectId) {
    filtered = allTasks.filter(t => t.projectId === projectId);
  }
  return filtered.sort((a, b) => b.priority - a.priority || b.createdAt - a.createdAt);
}

export async function createBackgroundTask(task: any): Promise<BackgroundTask> {
  const now = Date.now();
  const id = task.id || Math.random().toString(36).substr(2, 9);
  const projectId = task.projectId || '';
  const name = task.name || 'Unnamed Task';
  const type = task.type || TaskType.T2I;
  const status = task.status || TaskStatus.PENDING;
  const params = task.params || '{}';
  const result = task.result || undefined;
  const error = task.error || undefined;
  const progress = task.progress || 0;
  const scheduledAt = task.scheduledAt || undefined;
  const priority = task.priority || 0;

  const newTask: BackgroundTask = {
    id,
    projectId,
    name,
    type,
    status,
    params,
    result,
    error,
    progress,
    scheduledAt,
    createdAt: now,
    priority,
  };

  if (isTauri) {
    const database = await getDb();
    if (database) {
      try {
        await database.execute(
          `INSERT INTO background_tasks (
            id, project_id, name, type, status, params, result, error, progress, scheduled_at, created_at, priority
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [id, projectId, name, type, status, params, result || null, error || null, progress, scheduledAt || null, now, priority]
        );
        return newTask;
      } catch (err) {
        console.error("Error inserting background task:", err);
      }
    }
  }

  // LocalStorage fallback
  const allTasks = getLocalStorageTasks();
  allTasks.push(newTask);
  saveLocalStorageTasks(allTasks);
  return newTask;
}

export async function updateBackgroundTask(id: string, updates: Partial<BackgroundTask>): Promise<boolean> {
  if (isTauri) {
    const database = await getDb();
    if (database) {
      try {
        const entries = Object.entries(updates);
        if (entries.length === 0) return true;

        const setClause = entries.map(([key]) => {
          const dbKey = key.replace(/[A-Z]/g, letter => `_${letter.toLowerCase()}`);
          return `${dbKey} = ?`;
        }).join(", ");

        const values = entries.map(([_, value]) => value ?? null).concat([id]);

        await database.execute(
          `UPDATE background_tasks SET ${setClause} WHERE id = ?`,
          values
        );
        return true;
      } catch (err) {
        console.error("Error updating background task in DB:", err);
        return false;
      }
    }
  }

  // LocalStorage fallback
  const allTasks = getLocalStorageTasks();
  const index = allTasks.findIndex(t => t.id === id);
  if (index !== -1) {
    allTasks[index] = { ...allTasks[index], ...updates };
    saveLocalStorageTasks(allTasks);
    return true;
  }
  return false;
}

export async function deleteBackgroundTask(id: string): Promise<boolean> {
  if (isTauri) {
    const database = await getDb();
    if (database) {
      try {
        await database.execute("DELETE FROM background_tasks WHERE id = ?", [id]);
        return true;
      } catch (err) {
        console.error("Error deleting background task:", err);
        return false;
      }
    }
  }

  // LocalStorage fallback
  const allTasks = getLocalStorageTasks();
  const filtered = allTasks.filter(t => t.id !== id);
  saveLocalStorageTasks(filtered);
  return true;
}

export async function clearCompletedTasks(): Promise<boolean> {
  if (isTauri) {
    const database = await getDb();
    if (database) {
      try {
        await database.execute("DELETE FROM background_tasks WHERE status = ? OR status = ? OR status = ?", [TaskStatus.COMPLETED, TaskStatus.FAILED, TaskStatus.CANCELLED]);
        return true;
      } catch (err) {
        console.error("Error clearing completed tasks:", err);
        return false;
      }
    }
  }

  // LocalStorage fallback
  const allTasks = getLocalStorageTasks();
  const filtered = allTasks.filter(t => t.status !== TaskStatus.COMPLETED && t.status !== TaskStatus.FAILED && t.status !== TaskStatus.CANCELLED);
  saveLocalStorageTasks(filtered);
  return true;
}

export async function saveVideoTranslationProjectRecord(
  projectId: string,
  name: string,
  videoUrl: string,
  coverUrl: string | null = null,
  status: string = 'idle',
  audioUrl: string | null = null,
  audioDuration: number = 0,
  srtOriginal: string = "",
  textOriginal: string = "",
  detectedLanguage: string = ""
): Promise<boolean> {
  const now = Date.now();
  if (isTauri) {
    const database = await getDb();
    if (database) {
      try {
        await database.execute(
          `INSERT INTO video_translation_projects (
            project_id, name, video_url, cover_url, audio_url, audio_duration,
            srt_original, text_original, detected_language, status, created_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          ON CONFLICT(project_id) DO UPDATE SET
            name = EXCLUDED.name,
            video_url = EXCLUDED.video_url,
            cover_url = EXCLUDED.cover_url,
            audio_url = EXCLUDED.audio_url,
            audio_duration = EXCLUDED.audio_duration,
            srt_original = EXCLUDED.srt_original,
            text_original = EXCLUDED.text_original,
            detected_language = EXCLUDED.detected_language,
            status = EXCLUDED.status,
            updated_at = EXCLUDED.updated_at`,
          [
            projectId,
            name,
            videoUrl || null,
            coverUrl || null,
            audioUrl || null,
            audioDuration || 0.0,
            srtOriginal || null,
            textOriginal || null,
            detectedLanguage || null,
            status,
            now,
            now
          ]
        );
        return true;
      } catch (err) {
        console.error("Failed to insert/update video_translation_projects record:", err);
        return false;
      }
    }
  }

  // Fallback
  try {
    const projectsKey = "fallback_video_translation_projects";
    const existingProjStr = localStorage.getItem(projectsKey);
    const existingList: any[] = existingProjStr ? JSON.parse(existingProjStr) : [];
    const updatedProj = {
      project_id: projectId,
      name,
      video_url: videoUrl,
      cover_url: coverUrl,
      audio_url: audioUrl,
      audio_duration: audioDuration,
      srt_original: srtOriginal,
      text_original: textOriginal,
      detected_language: detectedLanguage,
      status,
      created_at: now,
      updated_at: now
    };
    const projIdx = existingList.findIndex(p => p.project_id === projectId);
    if (projIdx !== -1) {
      existingList[projIdx] = { ...existingList[projIdx], ...updatedProj, updated_at: now };
    } else {
      existingList.push(updatedProj);
    }
    localStorage.setItem(projectsKey, JSON.stringify(existingList));
    return true;
  } catch (err) {
    console.error("Failed in fallback saveVideoTranslationProjectRecord:", err);
    return false;
  }
}

export async function saveVideoTranslationData(
  projectId: string,
  name: string,
  videoUrl: string,
  coverUrl: string | null,
  audioUrl: string | null,
  audioDuration: number,
  srtOriginal: string,
  textOriginal: string,
  detectedLanguage: string,
  status: string,
  segments: { index: number; startSec: number; endSec: number; text: string; translatedText?: string; videoUrl?: string; audioUrl?: string }[],
  logs: string[]
): Promise<void> {
  const now = Date.now();
  if (isTauri) {
    const database = await getDb();
    if (database) {
      try {
        // Also save to video_translation_projects
        await database.execute(
          `INSERT INTO video_translation_projects (
            project_id, name, video_url, cover_url, audio_url, audio_duration,
            srt_original, text_original, detected_language, status, created_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          ON CONFLICT(project_id) DO UPDATE SET
            name = EXCLUDED.name,
            video_url = EXCLUDED.video_url,
            cover_url = EXCLUDED.cover_url,
            audio_url = EXCLUDED.audio_url,
            audio_duration = EXCLUDED.audio_duration,
            srt_original = EXCLUDED.srt_original,
            text_original = EXCLUDED.text_original,
            detected_language = EXCLUDED.detected_language,
            status = EXCLUDED.status,
            updated_at = EXCLUDED.updated_at`,
          [
            projectId,
            name,
            videoUrl || null,
            coverUrl || null,
            audioUrl || null,
            audioDuration || 0.0,
            srtOriginal || null,
            textOriginal || null,
            detectedLanguage || null,
            status,
            now,
            now
          ]
        );

        // 1. Save or update video_projects directly with all translation properties using native SQLite UPSERT
        await database.execute(
          `INSERT INTO video_projects (
            project_uuid, project_name, project_status, create_time, update_time, 
            project_prompt, scene_type, cover_image_path, project_path, 
            width, height, aspect_ratio, visual_style,
            video_url, audio_url, audio_duration, srt_original, text_original, detected_language
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          ON CONFLICT(project_uuid) DO UPDATE SET
            project_name = EXCLUDED.project_name,
            project_status = EXCLUDED.project_status,
            update_time = EXCLUDED.update_time,
            cover_image_path = EXCLUDED.cover_image_path,
            video_url = EXCLUDED.video_url,
            audio_url = EXCLUDED.audio_url,
            audio_duration = EXCLUDED.audio_duration,
            srt_original = EXCLUDED.srt_original,
            text_original = EXCLUDED.text_original,
            detected_language = EXCLUDED.detected_language,
            project_prompt = EXCLUDED.project_prompt`,
          [
            projectId,
            name,
            status === 'completed' ? 4 : 2, // ProjectStatus.COMPLETED = 4, EDITING = 2
            now,
            now,
            srtOriginal ? (srtOriginal.substring(0, 150) + "...") : "Video Translation Project configured.",
            "video_translation",
            coverUrl || null,
            null,
            1920,
            1080,
            "16:9",
            "Cinematic",
            videoUrl || null,
            audioUrl || null,
            audioDuration || 0.0,
            srtOriginal || null,
            textOriginal || null,
            detectedLanguage || null
          ]
        );

        // 2. Refresh video_translation_timeline segments
        await database.execute(
          "DELETE FROM video_translation_timeline WHERE project_id = ?",
          [projectId]
        );

        for (const segment of segments) {
          await database.execute(
            `INSERT INTO video_translation_timeline (
              project_id, segment_index, start_sec, end_sec, text, translated_text, video_url, audio_url, created_at, updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
              projectId,
              segment.index,
              segment.startSec,
              segment.endSec,
              segment.text,
              segment.translatedText || "",
              segment.videoUrl || null,
              segment.audioUrl || null,
              now,
              now
            ]
          );
        }

        // 3. Clear and insert logs
        await database.execute(
          "DELETE FROM video_translation_logs WHERE project_id = ?",
          [projectId]
        );

        for (const logLine of logs) {
          await database.execute(
            `INSERT INTO video_translation_logs (project_id, log_type, message, timestamp)
             VALUES (?, ?, ?, ?)`,
            [
              projectId,
              "ASR_LOG",
              logLine,
              now
            ]
          );
        }
      } catch (err) {
        console.error("Failed to write to video_projects/video_translation_* SQLite tables:", err);
      }
      return;
    }
  }

  // LocalStorage Fallback
  try {
    // 1. Projects
    const projectsKey = "fallback_video_translation_projects";
    const existingProjStr = localStorage.getItem(projectsKey);
    const existingList: any[] = existingProjStr ? JSON.parse(existingProjStr) : [];
    const updatedProj = {
      project_id: projectId,
      name,
      video_url: videoUrl,
      cover_url: coverUrl,
      audio_url: audioUrl,
      audio_duration: audioDuration,
      srt_original: srtOriginal,
      text_original: textOriginal,
      detected_language: detectedLanguage,
      status,
      created_at: now,
      updated_at: now
    };
    const projIdx = existingList.findIndex(p => p.project_id === projectId);
    if (projIdx !== -1) {
      existingList[projIdx] = { ...existingList[projIdx], ...updatedProj, updated_at: now };
    } else {
      existingList.push(updatedProj);
    }
    localStorage.setItem(projectsKey, JSON.stringify(existingList));

    // 1b. Sync standard LocalStorage fallback list to keep name, cover, status, and time aligned
    const standardData = localStorage.getItem(LOCAL_STORAGE_KEY);
    if (standardData) {
      const standardProjects: VideoProject[] = JSON.parse(standardData);
      const sIdx = standardProjects.findIndex(sp => sp.id === projectId);
      if (sIdx !== -1) {
        standardProjects[sIdx] = {
          ...standardProjects[sIdx],
          name,
          coverImagePath: coverUrl || undefined,
          updatedAt: now,
          status: status === 'completed' ? 4 : 2,
          videoUrl,
          audioUrl,
          audioDuration,
          srtOriginal,
          textOriginal,
          detectedLanguage
        };
        localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(standardProjects));
      }
    }

    // 2. Timeline
    const timelineKey = "fallback_video_translation_timeline";
    const existingTimelineStr = localStorage.getItem(timelineKey);
    let allSegments: any[] = existingTimelineStr ? JSON.parse(existingTimelineStr) : [];
    
    allSegments = allSegments.filter(s => s.project_id !== projectId);
    for (const segment of segments) {
      allSegments.push({
        project_id: projectId,
        segment_index: segment.index,
        start_sec: segment.startSec,
        end_sec: segment.endSec,
        text: segment.text,
        translated_text: segment.translatedText || "",
        created_at: now,
        updated_at: now
      });
    }
    localStorage.setItem(timelineKey, JSON.stringify(allSegments));

    // 3. Logs
    const logsKey = "fallback_video_translation_logs";
    const existingLogsStr = localStorage.getItem(logsKey);
    let allLogs: any[] = existingLogsStr ? JSON.parse(existingLogsStr) : [];
    
    allLogs = allLogs.filter(l => l.project_id !== projectId);
    for (const logLine of logs) {
      allLogs.push({
        project_id: projectId,
        log_type: "ASR_LOG",
        message: logLine,
        timestamp: now
      });
    }
    localStorage.setItem(logsKey, JSON.stringify(allLogs));
  } catch (err) {
    console.error("Failed to write to fallback video_translation_* Web LocalStorage:", err);
  }
}

export async function saveVideoTranslationTimeline(
  projectId: string, 
  dialogues: { index: number; startSec: number; endSec: number; text: string; videoUrl?: string; audioUrl?: string }[], 
  translatedDialogues: { index: number; startSec: number; endSec: number; text: string; videoUrl?: string; audioUrl?: string }[]
): Promise<void> {
  const now = Date.now();
  if (isTauri) {
    const database = await getDb();
    if (database) {
      await database.execute("DELETE FROM video_translation_timeline WHERE project_id = ?", [projectId]);
      for (const dlg of dialogues) {
        const matchedTrans = translatedDialogues.find(t => t.index === dlg.index);
        await database.execute(
          `INSERT INTO video_translation_timeline (
            project_id, segment_index, start_sec, end_sec, text, translated_text, video_url, audio_url, created_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            projectId,
            dlg.index,
            dlg.startSec,
            dlg.endSec,
            dlg.text,
            matchedTrans ? matchedTrans.text : "",
            dlg.videoUrl || null,
            dlg.audioUrl || matchedTrans?.audioUrl || null,
            now,
            now
          ]
        );
      }
    }
  } else {
    // LocalStorage Fallback
    try {
      const timelineKey = "fallback_video_translation_timeline";
      const existingTimelineStr = localStorage.getItem(timelineKey);
      let allSegments: any[] = existingTimelineStr ? JSON.parse(existingTimelineStr) : [];
      
      allSegments = allSegments.filter(s => s.project_id !== projectId);
      for (const dlg of dialogues) {
        const matchedTrans = translatedDialogues.find(t => t.index === dlg.index);
        allSegments.push({
          project_id: projectId,
          segment_index: dlg.index,
          start_sec: dlg.startSec,
          end_sec: dlg.endSec,
          text: dlg.text,
          translated_text: matchedTrans ? matchedTrans.text : "",
          created_at: now,
          updated_at: now
        });
      }
      localStorage.setItem(timelineKey, JSON.stringify(allSegments));
    } catch (err) {
      console.error("Failed to write to fallback video_translation_timeline Web LocalStorage:", err);
    }
  }
}

// System Prompts DB Operations
export async function fetchSystemPrompts(): Promise<SystemPrompt[]> {
  if (isTauri) {
    const database = await getDb();
    if (database) {
      try {
        const rows = await database.select<any[]>("SELECT * FROM system_prompts ORDER BY created_at ASC");
        if (rows && rows.length > 0) {
          return rows.map(r => ({
            uuid: r.uuid,
            name: r.name,
            classification: r.classification as any,
            prompt: r.prompt
          }));
        }
      } catch (err) {
        console.error("Failed to fetch system prompts from SQLite system_prompts table:", err);
      }
    }
  }

  // Fallback to localStorage setting if SQLite is not available
  const stored = localStorage.getItem('system_prompts');
  if (stored) {
    try {
      return JSON.parse(stored);
    } catch (e) {
      console.error("Failed to parse fallback system prompts:", e);
    }
  }

  return [];
}

export async function saveSystemPrompt(prompt: SystemPrompt): Promise<void> {
  const now = Date.now();
  if (isTauri) {
    const database = await getDb();
    if (database) {
      try {
        await database.execute(
          `INSERT INTO system_prompts (uuid, name, classification, prompt, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?)
           ON CONFLICT(uuid) DO UPDATE SET
             name = EXCLUDED.name,
             classification = EXCLUDED.classification,
             prompt = EXCLUDED.prompt,
             updated_at = EXCLUDED.updated_at`,
          [prompt.uuid, prompt.name, prompt.classification, prompt.prompt, now, now]
        );
        // Sync with app_settings key for double redundancy / layout reading
        const all = await fetchSystemPrompts();
        await setSetting('system_prompts', JSON.stringify(all));
        return;
      } catch (err) {
        console.error("Failed to save system prompt in SQLite:", err);
      }
    }
  }

  // Fallback
  const stored = localStorage.getItem('system_prompts');
  let prompts: SystemPrompt[] = stored ? JSON.parse(stored) : [];
  const idx = prompts.findIndex(p => p.uuid === prompt.uuid);
  if (idx > -1) {
    prompts[idx] = prompt;
  } else {
    prompts.push(prompt);
  }
  localStorage.setItem('system_prompts', JSON.stringify(prompts));
  await setSetting('system_prompts', JSON.stringify(prompts));
}

export async function saveAllSystemPrompts(prompts: SystemPrompt[]): Promise<void> {
  const now = Date.now();
  if (isTauri) {
    const database = await getDb();
    if (database) {
      try {
        await database.execute("DELETE FROM system_prompts");
        for (const prompt of prompts) {
          await database.execute(
            `INSERT INTO system_prompts (uuid, name, classification, prompt, created_at, updated_at)
             VALUES (?, ?, ?, ?, ?, ?)`,
            [prompt.uuid, prompt.name, prompt.classification, prompt.prompt, now, now]
          );
        }
        // Redundant app_settings sync
        await setSetting('system_prompts', JSON.stringify(prompts));
        return;
      } catch (err) {
        console.error("Failed to batch save system prompts in SQLite:", err);
      }
    }
  }

  // Fallback
  localStorage.setItem('system_prompts', JSON.stringify(prompts));
  await setSetting('system_prompts', JSON.stringify(prompts));
}

export async function deleteSystemPrompt(uuid: string): Promise<void> {
  if (isTauri) {
    const database = await getDb();
    if (database) {
      try {
        await database.execute("DELETE FROM system_prompts WHERE uuid = ?", [uuid]);
        // Redundant app_settings sync
        const all = await fetchSystemPrompts();
        await setSetting('system_prompts', JSON.stringify(all));
        return;
      } catch (err) {
        console.error("Failed to delete system prompt from SQLite:", err);
      }
    }
  }

  // Fallback
  const stored = localStorage.getItem('system_prompts');
  if (stored) {
    let prompts: SystemPrompt[] = JSON.parse(stored);
    prompts = prompts.filter(p => p.uuid !== uuid);
    localStorage.setItem('system_prompts', JSON.stringify(prompts));
    await setSetting('system_prompts', JSON.stringify(prompts));
  }
}

// Default Seed Voice Presets divided into English & Chinese definitions
export const SEED_VOICE_PRESETS: DbVoicePreset[] = [
  {
    id: 'vox_female_news',
    name_zh: '新闻女主播 (28–32 岁，时政 / 资讯播报专用)',
    name_en: 'News Female Anchor (28-32 Years Old)',
    desc_zh: '年龄声线：28 至 32 岁成熟女性，标准播音腔，声线沉稳厚实，共鸣饱满，中频突出，无轻浮尖细感\n发音韵律：普通话字正腔圆，吐字规整有力，断句专业规范，重音逻辑清晰；语速标准偏稳，快慢控制克制，无大幅度起伏\n情绪气质：端庄冷静、客观中立，语调克制克制，轻微庄重感，无夸张情绪，轻重层次分明，具备权威可信的听觉质感\n声学细节：气声极少，嗓音干净无杂音，音调均衡稳定，尾音收束利落，无拖音、夹子音、软糯少女音，长时间收听不刺耳\n适用场景：电视新闻、时事快讯、财经播报、官方资讯配音',
    desc_en: 'News anchor female, 28-32 years old, standard broadcasting voice, steady thick timbre, full mid-frequency resonance, precise articulation, neutral calm tone, moderate steady speed, solemn and credible, minimal breath sound, clean voice without shrill high pitch, for news broadcast and official report.',
    gender: 'female',
    pitch: 0,
    speed: 1.0,
    emotion: 'articulate'
  },
  {
    id: 'vox_male_tech',
    name_zh: '科技男解说 (25–30 岁，数码 / AI / 硬件测评解说)',
    name_en: 'Tech Male Commentator (25-30 Years Old)',
    desc_zh: '年龄声线：25–30 岁青年男性，清爽低中音，声线干净通透，轻微少年感但不失专业，无厚重烟嗓、低沉大叔嗓\n发音韵律：吐字清晰利落，专业术语咬字清晰，停顿自然；语速中等偏轻快，节奏流畅不拖沓，讲解时轻重音区分明显\n情绪气质：理性冷静、条理清晰，语调平和客观，带轻微求知分享感，不亢奋嘶吼，逻辑感强，通俗易懂\n声学细节：轻微自然气声，音色通透清亮，音调平稳，无沙哑杂音，语速弹性适中，适配长时间产品讲解、技术科普\n适用场景：数码测评、AI 技术讲解、软件教程、科技资讯解说',
    desc_en: 'Tech commentator male, 25-30 years old, clean young baritone, clear pronunciation for technical terms, moderate slightly brisk speed, rational calm tone, transparent timbre, natural soft breath sound, suitable for digital product review and tech popular science.',
    gender: 'male',
    pitch: -1,
    speed: 1.05,
    emotion: 'deep'
  },
  {
    id: 'vox_healing_girl',
    name_zh: '治愈系少女 (18–22 岁，睡前电台、英语伴读、治愈旁白)',
    name_en: 'Healing Girl (18-22 Years Old)',
    desc_zh: '年龄声线：18–22 岁少女声线，轻柔薄嗓，高频柔和不尖锐，自带温润软糯质感，无刻意夹子音，原生柔和少女感\n发音韵律：语速缓慢舒缓，断句松弛，尾音轻柔弱化，连读顺滑，咬字轻柔不费力\n情绪气质：温柔安静、松弛治愈，语调平缓起伏微小，自带安抚感，情绪柔软温和，无冷淡、亢奋音色\n声学细节：均匀微弱气声，嗓音通透温润，音量柔和，音调偏低柔，无刺耳高频，长时间收听舒缓放松\n适用场景：睡前电台、美文旁白、语言伴读、治愈短视频配音',
    desc_en: 'Healing teenage girl voice, 18-22 years old, soft thin gentle timbre, slow relaxed speaking speed, mild soothing intonation, natural soft breath sound, no shrill pitch, warm comforting texture, for bedtime radio and reading narration.',
    gender: 'female',
    pitch: 2,
    speed: 0.9,
    emotion: 'soft'
  },
  {
    id: 'vox_cyber_agent',
    name_zh: '赛博女特工 (24–29 岁，科幻游戏、短片、悬疑旁白)',
    name_en: 'Cyberpunk Female Agent (24-29 Years Old)',
    desc_zh: '年龄声线：24–29 岁冷感御姐声线，偏低冷中音，声线紧致克制，自带疏离机械质感，无软糯甜嗓\n发音韵律：语速偏平稳偏快，吐字干脆利落，尾音短促收束，停顿克制克制，无多余拖腔，咬字锋利清晰\n情绪气质：冷静疏离、果决冷峻，语调起伏极小，中性冷感，暗藏沉稳压迫感，无温柔、活泼情绪\n声学细节：轻微低哑颗粒感，气声克制，音调偏冷沉，自带轻微电子疏离质感，无高亢刺耳频段\n适用场景：赛博朋克短片、游戏特工台词、悬疑科幻旁白、谍战剧情配音',
    desc_en: 'Cyberpunk female agent, 24-29 years old, cold low mezzo timbre, compact restrained voice texture, crisp short ending sound, calm aloof tone, slightly grainy low voice, little pitch fluctuation, for sci-fi game lines and cyberpunk film narration.',
    gender: 'cyber',
    pitch: 1,
    speed: 1.05,
    emotion: 'cyber'
  }
];

export async function fetchVoicePresets(): Promise<DbVoicePreset[]> {
  if (isTauri) {
    const database = await getDb();
    if (database) {
      try {
        await database.execute(`
          CREATE TABLE IF NOT EXISTS voice_presets (
            id TEXT PRIMARY KEY,
            name_zh TEXT NOT NULL,
            name_en TEXT NOT NULL,
            desc_zh TEXT,
            desc_en TEXT,
            gender TEXT,
            pitch REAL DEFAULT 0.0,
            speed REAL DEFAULT 1.0,
            emotion TEXT,
            ref_audio_name TEXT,
            uploaded_audio_base64 TEXT
          );
        `);

        const rows = await database.select<any[]>("SELECT * FROM voice_presets");
        if (rows.length === 0) {
          console.log("[Migration] Seeding database default voice presets...");
          for (const preset of SEED_VOICE_PRESETS) {
            await database.execute(`
              INSERT INTO voice_presets (id, name_zh, name_en, desc_zh, desc_en, gender, pitch, speed, emotion)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            `, [
              preset.id, 
              preset.name_zh, 
              preset.name_en, 
              preset.desc_zh, 
              preset.desc_en, 
              preset.gender, 
              preset.pitch, 
              preset.speed, 
              preset.emotion
            ]);
          }
          return SEED_VOICE_PRESETS;
        }

        return rows.map(r => ({
          id: r.id,
          name_zh: r.name_zh,
          name_en: r.name_en,
          desc_zh: r.desc_zh,
          desc_en: r.desc_en,
          gender: r.gender as any,
          pitch: r.pitch,
          speed: r.speed,
          emotion: r.emotion,
          refAudioName: r.ref_audio_name || undefined,
          uploadedAudioBase64: r.uploaded_audio_base64 || undefined
        }));
      } catch (err) {
        console.error("Failed to fetch voice presets from SQLite:", err);
      }
    }
  }

  // Fallback to localStorage
  const stored = localStorage.getItem('digital_human_voice_presets');
  if (stored) {
    try {
      return JSON.parse(stored);
    } catch (e) {
      // JSON syntax error fallback
    }
  }

  // Save seed data to localStorage for future use
  localStorage.setItem('digital_human_voice_presets', JSON.stringify(SEED_VOICE_PRESETS));
  return SEED_VOICE_PRESETS;
}

export async function saveVoicePreset(preset: DbVoicePreset): Promise<void> {
  if (isTauri) {
    const database = await getDb();
    if (database) {
      try {
        await database.execute(`
          INSERT INTO voice_presets (id, name_zh, name_en, desc_zh, desc_en, gender, pitch, speed, emotion, ref_audio_name, uploaded_audio_base64)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          ON CONFLICT(id) DO UPDATE SET
            name_zh = EXCLUDED.name_zh,
            name_en = EXCLUDED.name_en,
            desc_zh = EXCLUDED.desc_zh,
            desc_en = EXCLUDED.desc_en,
            gender = EXCLUDED.gender,
            pitch = EXCLUDED.pitch,
            speed = EXCLUDED.speed,
            emotion = EXCLUDED.emotion,
            ref_audio_name = EXCLUDED.ref_audio_name,
            uploaded_audio_base64 = EXCLUDED.uploaded_audio_base64
        `, [
          preset.id,
          preset.name_zh,
          preset.name_en,
          preset.desc_zh || '',
          preset.desc_en || '',
          preset.gender,
          preset.pitch,
          preset.speed,
          preset.emotion,
          preset.refAudioName || null,
          preset.uploadedAudioBase64 || null
        ]);
        return;
      } catch (err) {
        console.error("Failed to save voice preset in SQLite:", err);
      }
    }
  }

  // LocalStorage sync fallback
  const all = await fetchVoicePresets();
  const idx = all.findIndex(v => v.id === preset.id);
  if (idx > -1) {
    all[idx] = preset;
  } else {
    all.push(preset);
  }
  localStorage.setItem('digital_human_voice_presets', JSON.stringify(all));
}

export async function deleteVoicePreset(id: string): Promise<void> {
  if (isTauri) {
    const database = await getDb();
    if (database) {
      try {
        await database.execute("DELETE FROM voice_presets WHERE id = ?", [id]);
        return;
      } catch (err) {
        console.error("Failed to delete voice preset from SQLite:", err);
      }
    }
  }

  // LocalStorage fallback
  const all = await fetchVoicePresets();
  const filtered = all.filter(v => v.id !== id);
  localStorage.setItem('digital_human_voice_presets', JSON.stringify(filtered));
}



