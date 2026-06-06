use base64::{engine::general_purpose, Engine as _};
use log::{error, info};
use std::fs;
use std::path::Path;
use std::time::Duration;
use tauri_plugin_sql::{Migration, MigrationKind};

#[tauri::command]
fn greet(name: &str) -> String {
    info!("[tauri] Hello: {}", name);
    format!("Hello, {}! You've been greeted from Rust!", name)
}

#[tauri::command]
async fn generate_comfy_image_rust(
    workflow: serde_json::Value,
    server_address: String,
    local_path: String,
) -> Result<String, String> {
    println!("==== Rust ComfyUI Generation Started ====");
    println!("- Server: http://{}", server_address);
    println!("- Target Local Path: {}", local_path);

    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(30))
        .build()
        .map_err(|e| format!("Failed to build reqwest client: {}", e))?;

    // 1. Submit prompt to /prompt
    let submit_url = format!("http://{}/prompt", server_address);
    let payload = serde_json::json!({
        "prompt": workflow
    });

    let res = client
        .post(&submit_url)
        .json(&payload)
        .send()
        .await
        .map_err(|e| format!("Failed to connect to ComfyUI at {}: {}", submit_url, e))?;

    if !res.status().is_success() {
        let status = res.status();
        let err_text = res.text().await.unwrap_or_default();
        return Err(format!("ComfyUI returned error {}: {}", status, err_text));
    }

    let submit_res: serde_json::Value = res
        .json()
        .await
        .map_err(|e| format!("Failed to parse submit response: {}", e))?;

    let prompt_id = submit_res["prompt_id"]
        .as_str()
        .ok_or_else(|| "No prompt_id in ComfyUI submission response".to_string())?;

    println!("- Dispatched prompt_id: {}", prompt_id);

    // 2. Poll until comfy completes
    let history_url = format!("http://{}/history/{}", server_address, prompt_id);
    let mut poll_count = 0;
    let max_polls = 120; // 3 minutes with 1.5 sec delay
    let mut history_data: Option<serde_json::Value> = None;

    while poll_count < max_polls {
        tokio::time::sleep(Duration::from_millis(1500)).await;
        poll_count += 1;

        match client.get(&history_url).send().await {
            Ok(poll_res) => {
                if poll_res.status().is_success() {
                    if let Ok(json) = poll_res.json::<serde_json::Value>().await {
                        if let Some(prompt_hist) = json.get(prompt_id) {
                            if let Some(status) = prompt_hist.get("status") {
                                if status
                                    .get("completed")
                                    .and_then(|v| v.as_bool())
                                    .unwrap_or(false)
                                {
                                    history_data = Some(prompt_hist.clone());
                                    break;
                                }
                            }
                        }
                    }
                }
            }
            Err(e) => {
                println!("- Polling warning: {}", e);
            }
        }
    }

    let history = history_data
        .ok_or_else(|| format!("Generation timed out or failed for prompt {}", prompt_id))?;

    // 3. Find and extract output image target
    let mut image_url: Option<String> = None;
    if let Some(outputs) = history.get("outputs") {
        if let Some(outputs_obj) = outputs.as_object() {
            // First, prioritize target node "9" (used by z-image-turbo) or "60" (used by standard)
            for target_node in &["9", "60"] {
                if let Some(node_output) = outputs_obj.get(*target_node) {
                    if let Some(images) = node_output.get("images") {
                        if let Some(images_arr) = images.as_array() {
                            if !images_arr.is_empty() {
                                let img = &images_arr[0];
                                if let (Some(filename), Some(subfolder), Some(img_type)) = (
                                    img.get("filename").and_then(|v| v.as_str()),
                                    img.get("subfolder").and_then(|v| v.as_str()),
                                    img.get("type").and_then(|v| v.as_str()),
                                ) {
                                    image_url = Some(format!(
                                        "http://{}/view?filename={}&subfolder={}&type={}",
                                        server_address, filename, subfolder, img_type
                                    ));
                                    break;
                                }
                            }
                        }
                    }
                }
            }

            // Fallback loop: if not found, check any node output
            if image_url.is_none() {
                for (_node_id, node_output) in outputs_obj {
                    // Check images field
                    if let Some(images) = node_output.get("images") {
                        if let Some(images_arr) = images.as_array() {
                            if !images_arr.is_empty() {
                                let img = &images_arr[0];
                                if let (Some(filename), Some(subfolder), Some(img_type)) = (
                                    img.get("filename").and_then(|v| v.as_str()),
                                    img.get("subfolder").and_then(|v| v.as_str()),
                                    img.get("type").and_then(|v| v.as_str()),
                                ) {
                                    image_url = Some(format!(
                                        "http://{}/view?filename={}&subfolder={}&type={}",
                                        server_address, filename, subfolder, img_type
                                    ));
                                    break;
                                }
                            }
                        }
                    }
                    // Check gifs, videos, or alternative output keys
                    for key in &["gifs", "videos", "output", "images_output"] {
                        if let Some(arr) = node_output.get(*key) {
                            if let Some(arr) = arr.as_array() {
                                if !arr.is_empty() {
                                    let item = &arr[0];
                                    if let Some(filename) =
                                        item.get("filename").and_then(|v| v.as_str())
                                    {
                                        let subfolder = item
                                            .get("subfolder")
                                            .and_then(|v| v.as_str())
                                            .unwrap_or("");
                                        let img_type = item
                                            .get("type")
                                            .and_then(|v| v.as_str())
                                            .unwrap_or("output");
                                        image_url = Some(format!(
                                            "http://{}/view?filename={}&subfolder={}&type={}",
                                            server_address, filename, subfolder, img_type
                                        ));
                                        break;
                                    }
                                }
                            }
                        }
                    }
                    if image_url.is_some() {
                        break;
                    }
                }
            }
        }
    }

    let download_url = image_url.ok_or_else(|| {
        "No output images or visual media found in completion response".to_string()
    })?;
    println!("- Generated Visual Download Link: {}", download_url);

    // 4. Download and save to local path
    let download_res = client
        .get(&download_url)
        .send()
        .await
        .map_err(|e| format!("Failed to download image from ComfyUI output URL: {}", e))?;

    if !download_res.status().is_success() {
        return Err(format!(
            "Failed to retrieve image: HTTP {}",
            download_res.status()
        ));
    }

    let bytes = download_res
        .bytes()
        .await
        .map_err(|e| format!("Failed to read stream bytes: {}", e))?;

    // Create target directory if needed
    let output_path = Path::new(&local_path);
    if let Some(parent) = output_path.parent() {
        fs::create_dir_all(parent)
            .map_err(|e| format!("Failed to create destination directories: {}", e))?;
    }

    // Write file natively to disk
    fs::write(output_path, &bytes)
        .map_err(|e| format!("Failed to write file to disk ({:?}): {}", output_path, e))?;

    println!("- Successfully stored generated image at {:?}", output_path);
    Ok(local_path)
}

#[tauri::command]
async fn submit_comfy_image_rust(
    workflow: serde_json::Value,
    server_address: String,
) -> Result<String, String> {
    println!("==== Rust Submit ComfyUI Prompt Started ====");
    println!("- Server: http://{}", server_address);

    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(30))
        .build()
        .map_err(|e| format!("Failed to build reqwest client: {}", e))?;

    let submit_url = format!("http://{}/prompt", server_address);
    let payload = serde_json::json!({
        "prompt": workflow
    });

    let res = client
        .post(&submit_url)
        .json(&payload)
        .send()
        .await
        .map_err(|e| format!("Failed to connect to ComfyUI at {}: {}", submit_url, e))?;

    if !res.status().is_success() {
        let status = res.status();
        let err_text = res.text().await.unwrap_or_default();
        return Err(format!("ComfyUI returned error {}: {}", status, err_text));
    }

    let submit_res: serde_json::Value = res
        .json()
        .await
        .map_err(|e| format!("Failed to parse submit response: {}", e))?;

    let prompt_id = submit_res["prompt_id"]
        .as_str()
        .ok_or_else(|| "No prompt_id in ComfyUI submission response".to_string())?;

    println!("- Dispatched prompt_id: {}", prompt_id);
    Ok(prompt_id.to_string())
}

#[tauri::command]
async fn save_comfy_image_rust(
    prompt_id: String,
    server_address: String,
    local_path: String,
) -> Result<String, String> {
    println!("==== Rust Save ComfyUI Image Started ====");
    println!("- Server: http://{}", server_address);
    println!("- Prompt ID: {}", prompt_id);
    println!("- Target Local Path: {}", local_path);

    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(30))
        .build()
        .map_err(|e| format!("Failed to build reqwest client: {}", e))?;

    let history_url = format!("http://{}/history/{}", server_address, prompt_id);
    let res = client
        .get(&history_url)
        .send()
        .await
        .map_err(|e| format!("Failed to fetch history from {}: {}", history_url, e))?;

    if !res.status().is_success() {
        let status = res.status();
        let err_text = res.text().await.unwrap_or_default();
        return Err(format!(
            "Failed to retrieve history: HTTP {}: {}",
            status, err_text
        ));
    }

    let json: serde_json::Value = res
        .json()
        .await
        .map_err(|e| format!("Failed to parse history response: {}", e))?;

    let history = json
        .get(&prompt_id)
        .ok_or_else(|| format!("No history entry found for prompt_id: {}", prompt_id))?;

    // Find and extract output image target
    let mut image_url: Option<String> = None;
    if let Some(outputs) = history.get("outputs") {
        if let Some(outputs_obj) = outputs.as_object() {
            for target_node in &["9", "60"] {
                if let Some(node_output) = outputs_obj.get(*target_node) {
                    if let Some(images) = node_output.get("images") {
                        if let Some(images_arr) = images.as_array() {
                            if !images_arr.is_empty() {
                                let img = &images_arr[0];
                                if let (Some(filename), Some(subfolder), Some(img_type)) = (
                                    img.get("filename").and_then(|v| v.as_str()),
                                    img.get("subfolder").and_then(|v| v.as_str()),
                                    img.get("type").and_then(|v| v.as_str()),
                                ) {
                                    image_url = Some(format!(
                                        "http://{}/view?filename={}&subfolder={}&type={}",
                                        server_address, filename, subfolder, img_type
                                    ));
                                    break;
                                }
                            }
                        }
                    }
                }
            }

            // Fallback loop if not found (checking any node output)
            if image_url.is_none() {
                for (_node_id, node_output) in outputs_obj {
                    if let Some(images) = node_output.get("images") {
                        if let Some(images_arr) = images.as_array() {
                            if !images_arr.is_empty() {
                                let img = &images_arr[0];
                                if let (Some(filename), Some(subfolder), Some(img_type)) = (
                                    img.get("filename").and_then(|v| v.as_str()),
                                    img.get("subfolder").and_then(|v| v.as_str()),
                                    img.get("type").and_then(|v| v.as_str()),
                                ) {
                                    image_url = Some(format!(
                                        "http://{}/view?filename={}&subfolder={}&type={}",
                                        server_address, filename, subfolder, img_type
                                    ));
                                    break;
                                }
                            }
                        }
                    }
                    for key in &["gifs", "videos", "output", "images_output"] {
                        if let Some(arr) = node_output.get(*key) {
                            if let Some(arr) = arr.as_array() {
                                if !arr.is_empty() {
                                    let item = &arr[0];
                                    if let Some(filename) =
                                        item.get("filename").and_then(|v| v.as_str())
                                    {
                                        let subfolder = item
                                            .get("subfolder")
                                            .and_then(|v| v.as_str())
                                            .unwrap_or("");
                                        let img_type = item
                                            .get("type")
                                            .and_then(|v| v.as_str())
                                            .unwrap_or("output");
                                        image_url = Some(format!(
                                            "http://{}/view?filename={}&subfolder={}&type={}",
                                            server_address, filename, subfolder, img_type
                                        ));
                                        break;
                                    }
                                }
                            }
                        }
                    }
                    if image_url.is_some() {
                        break;
                    }
                }
            }
        }
    }

    let download_url = image_url.ok_or_else(|| {
        "No output images or visual media found in completion response".to_string()
    })?;
    println!("- Generated Visual Download Link: {}", download_url);

    // Download and save to local path
    let download_res = client
        .get(&download_url)
        .send()
        .await
        .map_err(|e| format!("Failed to download image from ComfyUI output URL: {}", e))?;

    if !download_res.status().is_success() {
        return Err(format!(
            "Failed to retrieve image: HTTP {}",
            download_res.status()
        ));
    }

    let bytes = download_res
        .bytes()
        .await
        .map_err(|e| format!("Failed to read stream bytes: {}", e))?;

    // Create target directory if needed
    let output_path = Path::new(&local_path);
    if let Some(parent) = output_path.parent() {
        fs::create_dir_all(parent)
            .map_err(|e| format!("Failed to create destination directories: {}", e))?;
    }

    // Write file natively to disk
    fs::write(output_path, &bytes)
        .map_err(|e| format!("Failed to write file to disk ({:?}): {}", output_path, e))?;

    println!("- Successfully stored generated image at {:?}", output_path);
    Ok(local_path)
}

#[tauri::command]
async fn save_comfy_audio_rust(
    prompt_id: String,
    server_address: String,
    local_path: String,
) -> Result<String, String> {
    println!("==== Rust Save ComfyUI Audio Started ====");
    println!("- Server: http://{}", server_address);
    println!("- Prompt ID: {}", prompt_id);
    println!("- Target Local Path: {}", local_path);

    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(30))
        .build()
        .map_err(|e| format!("Failed to build reqwest client: {}", e))?;

    let history_url = format!("http://{}/history/{}", server_address, prompt_id);
    let res = client
        .get(&history_url)
        .send()
        .await
        .map_err(|e| format!("Failed to fetch history from {}: {}", history_url, e))?;

    if !res.status().is_success() {
        let status = res.status();
        let err_text = res.text().await.unwrap_or_default();
        return Err(format!(
            "Failed to retrieve history: HTTP {}: {}",
            status, err_text
        ));
    }

    let json: serde_json::Value = res
        .json()
        .await
        .map_err(|e| format!("Failed to parse history response: {}", e))?;

    let history = json
        .get(&prompt_id)
        .ok_or_else(|| format!("No history entry found for prompt_id: {}", prompt_id))?;

    let mut audio_url: Option<String> = None;
    if let Some(outputs) = history.get("outputs") {
        if let Some(outputs_obj) = outputs.as_object() {
            // Check node "6" first, which is the SaveAudioMP3 node
            if let Some(node_output) = outputs_obj.get("6") {
                if let Some(audio) = node_output
                    .get("audio")
                    .or_else(|| node_output.get("images"))
                    .or_else(|| node_output.get("output"))
                {
                    if let Some(audio_arr) = audio.as_array() {
                        if !audio_arr.is_empty() {
                            let aud = &audio_arr[0];
                            if let Some(filename) = aud.get("filename").and_then(|v| v.as_str()) {
                                let subfolder =
                                    aud.get("subfolder").and_then(|v| v.as_str()).unwrap_or("");
                                let aud_type =
                                    aud.get("type").and_then(|v| v.as_str()).unwrap_or("output");
                                audio_url = Some(format!(
                                    "http://{}/view?filename={}&subfolder={}&type={}",
                                    server_address, filename, subfolder, aud_type
                                ));
                            }
                        }
                    }
                }
            }

            // Fallback loop if not found (checking any node output for key "audio")
            if audio_url.is_none() {
                for (_node_id, node_output) in outputs_obj {
                    for key in &["audio", "images", "output"] {
                        if let Some(arr) = node_output.get(*key) {
                            if let Some(arr) = arr.as_array() {
                                if !arr.is_empty() {
                                    let item = &arr[0];
                                    if let Some(filename) =
                                        item.get("filename").and_then(|v| v.as_str())
                                    {
                                        let subfolder = item
                                            .get("subfolder")
                                            .and_then(|v| v.as_str())
                                            .unwrap_or("");
                                        let aud_type = item
                                            .get("type")
                                            .and_then(|v| v.as_str())
                                            .unwrap_or("output");
                                        audio_url = Some(format!(
                                            "http://{}/view?filename={}&subfolder={}&type={}",
                                            server_address, filename, subfolder, aud_type
                                        ));
                                        break;
                                    }
                                }
                            }
                        }
                    }
                    if audio_url.is_some() {
                        break;
                    }
                }
            }
        }
    }

    let download_url =
        audio_url.ok_or_else(|| "No output audio found in completion response".to_string())?;
    println!("- Generated Audio Download Link: {}", download_url);

    // Download and save to local path
    let download_res = client
        .get(&download_url)
        .send()
        .await
        .map_err(|e| format!("Failed to download audio from ComfyUI output URL: {}", e))?;

    if !download_res.status().is_success() {
        return Err(format!(
            "Failed to retrieve audio: HTTP {}",
            download_res.status()
        ));
    }

    let bytes = download_res
        .bytes()
        .await
        .map_err(|e| format!("Failed to read stream bytes: {}", e))?;

    // Create target directory if needed
    let output_path = Path::new(&local_path);
    if let Some(parent) = output_path.parent() {
        fs::create_dir_all(parent)
            .map_err(|e| format!("Failed to create destination directories: {}", e))?;
    }

    // Write file natively to disk
    fs::write(output_path, &bytes)
        .map_err(|e| format!("Failed to write file to disk ({:?}): {}", output_path, e))?;

    println!("- Successfully stored generated audio at {:?}", output_path);
    Ok(local_path)
}
#[tauri::command]
async fn load_local_image(path: String) -> Result<String, String> {
    info!("[tauri] 开始加载图片: {}", path);

    let bytes = match fs::read(&path) {
        Ok(data) => {
            // info!("[tauri] 图片加载成功 | 大小: {} bytes", data.len());
            data
        }
        Err(e) => {
            error!("[tauri] 图片加载失败: {}", e);
            return Err(e.to_string());
        }
    };

    let base64 = general_purpose::STANDARD.encode(bytes);

    Ok(base64)
}
// 修复：统一数据库路径（关键！）
fn get_app_db_path() -> Result<std::path::PathBuf, String> {
    let cwd = std::env::current_dir().map_err(|e| format!("获取当前目录失败: {}", e))?;
    let data_dir = cwd.join("../data"); // 去掉 ../，避免路径错乱

    if !data_dir.exists() {
        fs::create_dir_all(&data_dir).map_err(|e| format!("创建 data 目录失败: {}", e))?;
    }

    Ok(data_dir.join("main.db"))
}

#[tauri::command]
fn get_db_file_path() -> Result<String, String> {
    let path = get_app_db_path()?;
    path.to_str()
        .map(|s| s.to_string())
        .ok_or_else(|| "数据库路径转字符串失败".to_string())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    // ##############################
    // 修复：正确、安全、一次性完成的迁移
    // ##############################
    let migrations = vec![
        // v1: 基础表
        Migration {
            version: 1,
            description: "initial_setup",
            sql: "CREATE TABLE IF NOT EXISTS video_projects (
                project_uuid TEXT PRIMARY KEY, 
                project_name TEXT NOT NULL, 
                project_prompt TEXT, 
                cover_image_path TEXT, 
                create_time INTEGER NOT NULL, 
                update_time INTEGER NOT NULL, 
                project_status INTEGER NOT NULL DEFAULT 0
            );",
            kind: MigrationKind::Up,
        },
        // v2: 新增列（SQLite 不支持 ADD COLUMN + CHECK，所以只加列）
        Migration {
            version: 2,
            description: "add_scene_columns",
            sql: "ALTER TABLE video_projects ADD COLUMN scene_type TEXT DEFAULT 'short_video';
                  ALTER TABLE video_projects ADD COLUMN scene_config_id INTEGER;
                  ALTER TABLE video_projects ADD COLUMN template_id INTEGER;",
            kind: MigrationKind::Up,
        },
        // v3: 场景相关表
        Migration {
            version: 3,
            description: "create_scene_tables",
            sql: "CREATE TABLE IF NOT EXISTS scene_config (
                    config_id INTEGER PRIMARY KEY AUTOINCREMENT,
                    scene_type TEXT NOT NULL,
                    script_rules TEXT NOT NULL,
                    ai_params TEXT NOT NULL,
                    export_config TEXT NOT NULL,
                    create_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
                    update_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
                );
                CREATE TABLE IF NOT EXISTS scene_template (
                    template_id INTEGER PRIMARY KEY AUTOINCREMENT,
                    scene_type TEXT NOT NULL,
                    template_name TEXT NOT NULL,
                    template_path TEXT NOT NULL,
                    template_type TEXT NOT NULL,
                    is_default INTEGER NOT NULL DEFAULT 0,
                    create_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
                    update_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
                );
                CREATE TABLE IF NOT EXISTS dialogue_role (
                    role_id INTEGER PRIMARY KEY AUTOINCREMENT,
                    project_uuid TEXT NOT NULL,
                    role_name TEXT NOT NULL,
                    role_voice TEXT NOT NULL,
                    role_avatar TEXT,
                    create_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
                    update_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
                    FOREIGN KEY (project_uuid) REFERENCES video_projects(project_uuid) ON DELETE CASCADE
                );
                CREATE TABLE IF NOT EXISTS word_detail (
                    word_id INTEGER PRIMARY KEY AUTOINCREMENT,
                    project_uuid TEXT NOT NULL,
                    word TEXT NOT NULL,
                    phonetic TEXT NOT NULL,
                    paraphrase TEXT NOT NULL,
                    example TEXT,
                    audio_path TEXT,
                    image_path TEXT,
                    create_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
                    update_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
                    FOREIGN KEY (project_uuid) REFERENCES video_projects(project_uuid) ON DELETE CASCADE
                );",
            kind: MigrationKind::Up,
        },
        // v4: 词汇表
        Migration {
            version: 4,
            description: "add_vocabulary_table",
            sql: "CREATE TABLE IF NOT EXISTS vocabulary (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    project_uuid TEXT NOT NULL,
                    word TEXT NOT NULL,
                    audio_path TEXT,
                    index_char TEXT,
                    example TEXT,
                    image_path TEXT,
                    phonetic_symbols TEXT,
                    chinese_definition TEXT,
                    data TEXT,
                    prompt TEXT,
                    video_path TEXT,
                    ltx23_prompt TEXT,
                    t2v_prompt TEXT,
                    qwen_image_prompt TEXT,
                    category TEXT,
                    script TEXT,
                    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                    status INTEGER DEFAULT 1,
                    chinese TEXT,
                    FOREIGN KEY (project_uuid) REFERENCES video_projects(project_uuid) ON DELETE CASCADE
                );",
            kind: MigrationKind::Up,
        },
        // v5: 设置表
        Migration {
            version: 5,
            description: "add_settings_table",
            sql: "CREATE TABLE IF NOT EXISTS app_settings (
                    key TEXT PRIMARY KEY,
                    value TEXT NOT NULL,
                    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
                );",
            kind: MigrationKind::Up,
        },
        // v6: 项目路径
        Migration {
            version: 6,
            description: "add_project_path_column",
            sql: "ALTER TABLE video_projects ADD COLUMN project_path TEXT;",
            kind: MigrationKind::Up,
        },
        // v7: 安全重建表（一次性完成！支持 video_translation）
        Migration {
            version: 7,
            description: "recreate_video_projects_with_translation_support",
            sql: "
                PRAGMA foreign_keys = OFF;

                -- 新建正确结构的表
                CREATE TABLE IF NOT EXISTS video_projects_new (
                    project_uuid TEXT PRIMARY KEY,
                    project_name TEXT NOT NULL,
                    project_prompt TEXT,
                    cover_image_path TEXT,
                    create_time INTEGER NOT NULL,
                    update_time INTEGER NOT NULL,
                    project_status INTEGER NOT NULL DEFAULT 0,
                    scene_type TEXT DEFAULT 'short_video',
                    scene_config_id INTEGER,
                    template_id INTEGER,
                    project_path TEXT
                );

                -- 迁移数据
                INSERT INTO video_projects_new
                SELECT * FROM video_projects;

                -- 替换旧表
                DROP TABLE IF EXISTS video_projects;
                ALTER TABLE video_projects_new RENAME TO video_projects;

                PRAGMA foreign_keys = ON;
            ",
            kind: MigrationKind::Up,
        },
    ];

    // ##############################
    // 修复：插件使用 **同一个数据库路径**
    // ##############################
    let db_path = get_app_db_path().unwrap();
    let db_url = format!("sqlite:{}", db_path.to_string_lossy());

    tauri::Builder::default()
        .plugin(
            tauri_plugin_log::Builder::new()
                .target(tauri_plugin_log::Target::new(
                    tauri_plugin_log::TargetKind::Folder {
                        path: std::path::PathBuf::from("./logs"),
                        file_name: None,
                    },
                ))
                .level(log::LevelFilter::Info)
                .build(),
        )
        // 关键修复：数据库路径统一
        .plugin(
            tauri_plugin_sql::Builder::new()
                .add_migrations(&db_url, migrations)
                .build(),
        )
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_http::init())
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![
            greet,
            load_local_image,
            generate_comfy_image_rust,
            submit_comfy_image_rust,
            save_comfy_image_rust,
            get_db_file_path,
            save_comfy_audio_rust
        ])
        .run(tauri::generate_context!())
        .expect("应用启动失败");
}
