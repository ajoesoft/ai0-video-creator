import Database from "@tauri-apps/plugin-sql";
import { remove, exists, BaseDirectory } from "@tauri-apps/plugin-fs";
import { VideoProject, Vocabulary, VisualLibraryItem, PromptHarness, BackgroundTask, TaskStatus, TaskType } from "../types";
import { invoke } from "@tauri-apps/api/core";

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
        updated_at INTEGER
      );
    `);
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
    const transProjects = await database.select<any[]>("SELECT * FROM video_translation_projects");
    if (transProjects && transProjects.length > 0) {
      console.log(`[Migration] Found ${transProjects.length} candidate translation projects to migrate.`);
      for (const tp of transProjects) {
        const uuid = tp.project_id;
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

async function getLocalStorageProjects(): Promise<VideoProject[]> {
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
          return result.map(p => ({
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
          return JSON.parse(backupRaw[0].value);
        }
      } catch (err) {
        console.error("Failed to fetch projects from database in fallback getter:", err);
      }
    }
  }
  const data = localStorage.getItem(LOCAL_STORAGE_KEY);
  const standardProjects: VideoProject[] = data ? JSON.parse(data) : [];

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

  return standardProjects;
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
      // Map database fields to frontend types
      return result.map(p => ({
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
  visualStyle?: string
): Promise<any> {
  const id = explicitId || crypto.randomUUID();
  const now = Date.now();
  const actualProjectPath = projectPath || null;

  if (isTauri) {
    const database = await getDb();
    if (database) {
      await database.execute(
        "INSERT INTO video_projects (project_uuid, project_name, project_status, create_time, update_time, project_prompt, scene_type, project_path, width, height, aspect_ratio, visual_style) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
        [id, name, status, now, now, prompt || null, sceneType, actualProjectPath, width || 1920, height || 1080, aspectRatio || '16:9', visualStyle || 'Cinematic']
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
        visualStyle: visualStyle || 'Cinematic'
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
    visualStyle: visualStyle || 'Cinematic'
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
          detected_language = ?
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
        chinese: v.chinese
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
          created_at, updated_at, status, chinese
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          vocabulary.projectUuid, vocabulary.word || "", vocabulary.audioPath || null, vocabulary.indexChar || null, vocabulary.example || null, vocabulary.imagePath || null,
          vocabulary.phoneticSymbols || null, vocabulary.chineseDefinition || null, vocabulary.data || null, vocabulary.prompt || null, vocabulary.videoPath || null,
          vocabulary.ltx23Prompt || null, vocabulary.t2vPrompt || null, vocabulary.qwenImagePrompt || null, vocabulary.category || null, vocabulary.script || null,
          now, now, vocabulary.status || 1, vocabulary.chinese || null
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

export function getLocalStoragePromptHarnesses(): PromptHarness[] {
  const data = localStorage.getItem(PROMPT_HARNESS_LOCAL_STORAGE_KEY);
  return data ? JSON.parse(data) : [];
}

export function saveLocalStoragePromptHarnesses(items: PromptHarness[]) {
  localStorage.setItem(PROMPT_HARNESS_LOCAL_STORAGE_KEY, JSON.stringify(items));
}

export async function fetchPromptHarnessByProject(projectId: string): Promise<PromptHarness[]> {
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

  if (isTauri) {
    const database = await getDb();
    if (database) {
      try {
        await database.execute(
          `INSERT INTO prompt_harness (
            project_id, trigger_keyword, visual_asset_id, active, created_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?)`,
          [projectId, triggerKeyword, visualAssetId, active, now, now]
        );
        
        const idResult = await database.select<any[]>("SELECT last_insert_rowid() as id");
        const insertedId = idResult[0]?.id || now;
        
        return {
          id: insertedId,
          projectId,
          triggerKeyword,
          visualAssetId,
          active,
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
 */
export async function applyPromptHarnessRules(promptText: string, projectId: string): Promise<string> {
  if (!promptText || !promptText.trim()) return promptText;

  try {
    // 1. Fetch active harness rules
    const harnesses = await fetchPromptHarnessByProject(projectId);
    const activeHarnesses = harnesses.filter(h => h.active === 1);
    if (activeHarnesses.length === 0) return promptText;

    // 2. Fetch project visual library assets
    const visualAssets = await fetchVisualLibraryByProject(projectId);
    if (visualAssets.length === 0) return promptText;

    let modifiedPrompt = promptText;

    // Parse all @ tags in the prompt
    // This matches @ followed by any sequence of word-characters, non-spaces, and non-common-punctuation
    const tagRegex = /@([^\s,.:;!?"'()（）[\]{}<>；：，。！？"“‘]+)/g;
    const matches = Array.from(modifiedPrompt.matchAll(tagRegex));
    const processedTags = new Set<string>();

    for (const match of matches) {
      const fullMatch = match[0]; // e.g. "@Character1"
      const tagName = match[1];   // e.g. "Character1"
      
      if (processedTags.has(fullMatch)) continue;
      processedTags.add(fullMatch);

      // Find an active harness that matches this tag name case-insensitively
      const matchingRule = activeHarnesses.find(h => {
        const trigger = h.triggerKeyword || "";
        const cleanTrigger = trigger.startsWith('@') ? trigger.slice(1) : trigger;
        return cleanTrigger.toLowerCase() === tagName.toLowerCase();
      });

      if (!matchingRule) continue;

      const parentAsset = visualAssets.find(v => v.id === matchingRule.visualAssetId);
      if (!parentAsset) continue;

      const designDetails = [
        parentAsset.imagePrompt,
        parentAsset.videoPrompt
      ].filter(Boolean).join(", ");

      if (designDetails.trim()) {
        const replacement = `${tagName} (${designDetails})`;
        const escapedFullMatch = fullMatch.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&');
        const replaceRegex = new RegExp(escapedFullMatch, 'g');
        modifiedPrompt = modifiedPrompt.replace(replaceRegex, replacement);
      }
    }

    // Fallback for non-@ triggers (exact word matches) that aren't already part of a resolved parentheses block
    for (const rule of activeHarnesses) {
      const trigger = rule.triggerKeyword || "";
      if (!trigger) continue;
      const cleanTrigger = trigger.startsWith('@') ? trigger.slice(1) : trigger;
      const parentAsset = visualAssets.find(v => v.id === rule.visualAssetId);
      if (!parentAsset) continue;

      const designDetails = [
        parentAsset.imagePrompt,
        parentAsset.videoPrompt
      ].filter(Boolean).join(", ");

      if (designDetails.trim()) {
        // Look for the exact trigger name, ensuring it is not already followed by details in parentheses
        const escapedTrigger = cleanTrigger.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&');
        const checkRegex = new RegExp(`(?<!@)(${escapedTrigger})(?!\\s*\\()`, 'gi');
        modifiedPrompt = modifiedPrompt.replace(checkRegex, `$1 (${designDetails})`);
      }
    }

    return modifiedPrompt;
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

