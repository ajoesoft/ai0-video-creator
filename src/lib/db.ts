import Database from "@tauri-apps/plugin-sql";
import { remove, BaseDirectory } from "@tauri-apps/plugin-fs";
import { VideoProject, Vocabulary, VisualLibraryItem, PromptHarness, BackgroundTask, TaskStatus, TaskType } from "../types";

import { invoke } from "@tauri-apps/api/core";

let db: Database | null = null;
let dbError: string | null = null;
const PROMPT_HARNESS_LOCAL_STORAGE_KEY = 'ai_prompt_harnesses_fallback';

const isTauri = typeof window !== 'undefined' && (!!(window as any).__TAURI_INTERNALS__ || !!(window as any).__TAURI__);

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

export async function getDb() {
  if (!isTauri) return null;
  if (!db) {
    try {
      let dbPath = "main.db";
      try {
        const path = await invoke<string>("get_db_file_path");
        console.log("Invoked get_db_file_path, got:", path);
        if (path) {
          dbPath = path;
        }
      } catch (err) {
        console.warn("Failed to retrieve dynamic database path via get_db_file_path:", err);
      }
      db = await Database.load("sqlite:" + dbPath);
      // Auto-create visual_library table if missing
      try {
        await db.execute(`
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
        await db.execute(`
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
        await db.execute(`
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
    } catch (err: any) {
      console.error("Failed to load SQLite via Tauri plugin-sql:", err);
      const errMsg = err?.toString() || "";

      // Auto-heal on migration conflicts
      if (errMsg.includes("migration") && (errMsg.includes("modified") || errMsg.includes("previously applied"))) {
        console.warn("Detected SQLite migration discrepancy. Attempting automatic self-healing by removing main.db...");
        try {
          await remove("main.db", { baseDir: BaseDirectory.AppLocalData });
          console.log("Deleted corrupt/outdated main.db from AppLocalData, reloading...");

          let dbPath = "main.db";
          try {
            const path = await invoke<string>("get_db_file_path");
            if (path) dbPath = path;
          } catch (e) { }

          db = await Database.load("sqlite:" + dbPath);
          dbError = null;
          return db;
        } catch (fsErr: any) {
          console.error("Failed to delete main.db from AppLocalData:", fsErr);

          // Try standard AppData location just in case
          try {
            await remove("main.db", { baseDir: BaseDirectory.AppData });
            console.log("Deleted corrupt/outdated main.db from AppData, reloading...");

            let dbPath = "main.db";
            try {
              const path = await invoke<string>("get_db_file_path");
              if (path) dbPath = path;
            } catch (e) { }

            db = await Database.load("sqlite:" + dbPath);
            dbError = null;
            return db;
          } catch (fsErr2: any) {
            console.error("Failed to delete main.db from AppData:", fsErr2);
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
  return data ? JSON.parse(data) : [];
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
      }));
    }
  }

  // Fallback to LocalStorage for Web Preview
  return getLocalStorageProjects().sort((a, b) => b.updatedAt - a.updatedAt);
}

export async function createProject(name: string, status: number, prompt?: string, sceneType: string = 'short_video', projectPath?: string, explicitId?: string): Promise<any> {
  const id = explicitId || crypto.randomUUID();
  const now = Date.now();
  const actualProjectPath = projectPath || null;

  if (isTauri) {
    const database = await getDb();
    if (database) {
      await database.execute(
        "INSERT INTO video_projects (project_uuid, project_name, project_status, create_time, update_time, project_prompt, scene_type, project_path) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
        [id, name, status, now, now, prompt || null, sceneType, actualProjectPath]
      );
      return { id, name, status, createdAt: now, updatedAt: now, prompt, sceneType, projectPath: actualProjectPath };
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
  };
  const projects = getLocalStorageProjects();
  projects.push(newProject);
  saveLocalStorageProjects(projects);
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
        };
      }
      return null;
    }
  }

  // Fallback to LocalStorage
  const projects = getLocalStorageProjects();
  return projects.find(p => p.id === id) || null;
}

export async function updateProject(id: string, updates: Partial<VideoProject>): Promise<VideoProject | null> {
  const now = Date.now();
  const current = await fetchProjectById(id);
  if (!current) return null;
  console.log(`## current:` + JSON.stringify(current));
  const updated = { ...current, ...updates, updatedAt: now };

  if (isTauri) {
    const database = await getDb();
    if (database) {
      // Map back to DB fields
      await database.execute(
        "UPDATE video_projects SET project_name = ?, project_prompt = ?, project_status = ?, cover_image_path = ?, scene_type = ?, project_path = ?, update_time = ? WHERE project_uuid = ?",
        [
          updated.name,
          updated.prompt,
          updated.status,
          updated.coverImagePath || null,
          updated.sceneType,
          updated.projectPath || null,
          now,
          id
        ]
      );
      console.log(`## updated: `+JSON.stringify(updated));

      return updated;
    }
  }

  // Fallback
  const projects = getLocalStorageProjects();
  const index = projects.findIndex(p => p.id === id);
  if (index !== -1) {
    projects[index] = updated;
    saveLocalStorageProjects(projects);
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
  const projects = getLocalStorageProjects();
  const filtered = projects.filter(p => p.id !== id);
  saveLocalStorageProjects(filtered);
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

    // 3. For each active harness rule, check presence of trigger keyword
    for (const rule of activeHarnesses) {
      const parentAsset = visualAssets.find(v => v.id === rule.visualAssetId);
      if (!parentAsset) continue;

      const trigger = rule.triggerKeyword;
      // Use escape helper to support special characters of keyword e.g. "@主角"
      const escapedTrigger = trigger.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&');

      // Match with word bounds or direct boundaries
      const regex = new RegExp(`(${escapedTrigger})`, 'gi');

      if (regex.test(modifiedPrompt)) {
        // Construct the detailed consistency inject token
        const designDetails = [
          parentAsset.imagePrompt,
          parentAsset.videoPrompt
        ].filter(Boolean).join(", ");

        if (designDetails.trim()) {
          // Replace matching keywords with their descriptive high fidelity context
          modifiedPrompt = modifiedPrompt.replace(regex, `$1 (${designDetails})`);
        }
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