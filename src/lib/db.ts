import Database from "@tauri-apps/plugin-sql";
import { remove, BaseDirectory } from "@tauri-apps/plugin-fs";
import { VideoProject, Vocabulary } from "../types";
import { invoke } from "@tauri-apps/api/core";

let db: Database | null = null;
let dbError: string | null = null;

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
        if (path) {
          dbPath = path;
        }
      } catch (err) {
        console.warn("Failed to retrieve dynamic database path via get_db_file_path:", err);
      }
      db = await Database.load("sqlite:" + dbPath);
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
          } catch (e) {}
          
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
            } catch (e) {}
            
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

function getLocalStorageProjects(): VideoProject[] {
  const data = localStorage.getItem(LOCAL_STORAGE_KEY);
  return data ? JSON.parse(data) : [];
}

function saveLocalStorageProjects(projects: VideoProject[]) {
  localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(projects));
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
      const result = await database.select<any[]>(
        "SELECT value FROM app_settings WHERE key = ? LIMIT 1",
        [key]
      );
      if (result.length > 0 && result[0].value) {
        return result[0].value;
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
      const result = await database.select<any[]>(
        "SELECT image_path FROM vocabulary WHERE project_uuid = ? AND image_path IS NOT NULL AND image_path != '' ORDER BY RANDOM() LIMIT 1",
        [projectUuid]
      );
      if (result.length > 0) {
        return result[0].image_path;
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
      await database.execute(
        "INSERT INTO app_settings (key, value, updated_at) VALUES (?, ?, CURRENT_TIMESTAMP) ON CONFLICT(key) DO UPDATE SET value = EXCLUDED.value, updated_at = CURRENT_TIMESTAMP",
        [key, value]
      );
      return true;
    }
  }
  return true;
}
