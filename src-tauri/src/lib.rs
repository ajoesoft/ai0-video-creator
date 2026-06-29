// Learn more about Tauri commands at https://tauri.app/develop/calling-rust/
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]
pub mod db;
use base64::{engine::general_purpose, Engine as _};
use log::{error, info};
use std::path::Path;
use std::fs;
use http_range::HttpRange;
use log::{debug, warn};
use std::io::{Read, Seek,Write, SeekFrom};
use std::time::Duration;
use http::{header::*, response::Builder as ResponseBuilder, status::StatusCode};


fn random_boundary() -> String {
    let mut x = [0_u8; 30];
    getrandom::getrandom(&mut x).expect("failed to get random bytes");
    (x[..])
        .iter()
        .map(|&x| format!("{x:x}"))
        .fold(String::new(), |mut a, x| {
            a.push_str(x.as_str());
            a
        })
}
fn read_setting_from_db(db_path: &str, key_name: &str) -> Result<Option<String>, rusqlite::Error> {
    let conn = rusqlite::Connection::open(db_path)?;

    let table_exists: bool = conn
        .query_row(
            "SELECT EXISTS(SELECT 1 FROM sqlite_master WHERE type='table' AND name='app_settings')",
            [],
            |row| row.get(0),
        )
        .unwrap_or(false);

    if !table_exists {
        return Ok(None);
    }

    let mut stmt = conn.prepare("SELECT value FROM app_settings WHERE key = ?1")?;
    let mut rows = stmt.query([key_name])?;
    if let Some(row) = rows.next()? {
        let val: String = row.get(0)?;
        Ok(Some(val))
    } else {
        Ok(None)
    }
}

fn write_setting_to_db(
    db_path: &str,
    key_name: &str,
    value_str: &str,
) -> Result<(), rusqlite::Error> {
    let conn = rusqlite::Connection::open(db_path)?;

    conn.execute(
        "CREATE TABLE IF NOT EXISTS app_settings (
            key TEXT PRIMARY KEY,
            value TEXT NOT NULL,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )",
        [],
    )?;

    conn.execute(
        "INSERT OR REPLACE INTO app_settings (key, value, updated_at) VALUES (?1, ?2, CURRENT_TIMESTAMP)",
        [key_name, value_str],
    )?;
    Ok(())
}

#[tauri::command]
fn greet(name: &str) -> String {
    format!(
        "Hello, {}! You've been greeted from AI0 Video Creator!",
        name
    )
}

#[tauri::command]
fn get_fallback_cover_svg_base64() -> String {
    let svg_raw = r#"<svg xmlns='http://www.w3.org/2000/svg' width='300' height='170' viewBox='0 0 300 170'>
    <rect width='100%' height='100%' fill='#15151a'/>
    <text x='50%' y='50%' dominant-baseline='middle' text-anchor='middle' font-family='Space Grotesk, system-ui, sans-serif' font-size='12' fill='#FF5D22'>
    LATENT SPACE</text></svg>"#;
    let svg_base64 = general_purpose::STANDARD.encode(svg_raw.as_bytes());
    format!("data:image/svg+xml;base64,{}", svg_base64)
}

#[tauri::command]
fn extract_video_cover(
    ffmpeg_path: String,
    video_path: String,
    output_dir: String,
) -> Result<String, String> {
    let path_to_use = if ffmpeg_path.is_empty() {
        "ffmpeg".to_string()
    } else {
        ffmpeg_path
    };

    let out_path = std::path::Path::new(&output_dir);
    if let Some(parent) = out_path.parent() {
        if !parent.exists() {
            if let Err(e) = std::fs::create_dir_all(parent) {
                return Err(format!(
                    "Failed to create parent directory for cover: {}",
                    e
                ));
            }
        }
    }

    let mut command = std::process::Command::new(&path_to_use);
    command
        .arg("-y")
        .arg("-i")
        .arg(&video_path)
        .arg("-ss")
        .arg("00:00:00.500")
        .arg("-vframes")
        .arg("1")
        .arg(&output_dir);

    let output = command.output();
    match output {
        Ok(out) => {
            let stdout = String::from_utf8_lossy(&out.stdout).trim().to_string();
            let stderr = String::from_utf8_lossy(&out.stderr).trim().to_string();
            if out.status.success() {
                Ok(output_dir)
            } else {
                Err(format!(
                    "FFmpeg cover extraction failed: {}\nStderr: {}",
                    stdout, stderr
                ))
            }
        }
        Err(e) => Err(format!("FFmpeg process failed to start: {}", e)),
    }
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
fn get_ffmpeg_version(ffmpeg_path: String) -> Result<String, String> {
    let path_to_use = if ffmpeg_path.is_empty() {
        "ffmpeg".to_string()
    } else {
        ffmpeg_path
    };

    let output = std::process::Command::new(&path_to_use)
        .arg("-version")
        .output();

    match output {
        Ok(out) => {
            let stdout = String::from_utf8_lossy(&out.stdout).trim().to_string();
            let stderr = String::from_utf8_lossy(&out.stderr).trim().to_string();
            if out.status.success() {
                let first_line = stdout
                    .lines()
                    .next()
                    .unwrap_or("FFmpeg Connected")
                    .to_string();
                Ok(first_line)
            } else {
                let err_msg = if !stdout.is_empty() { stdout } else { stderr };
                let first_line = err_msg
                    .lines()
                    .next()
                    .unwrap_or("Error querying ffmpeg")
                    .to_string();
                Ok(first_line)
            }
        }
        Err(e) => Err(format!("FFmpeg not accessible: {}", e)),
    }
}

#[tauri::command]
fn run_ffmpeg_cmd(ffmpeg_path: String, args: Vec<String>) -> Result<String, String> {
    let path_to_use = if ffmpeg_path.is_empty() {
        "ffmpeg".to_string()
    } else {
        ffmpeg_path
    };

    let mut command = std::process::Command::new(&path_to_use);
    for arg in args {
        command.arg(arg);
    }

    let output = command.output();
    match output {
        Ok(out) => {
            let stdout = String::from_utf8_lossy(&out.stdout).trim().to_string();
            let stderr = String::from_utf8_lossy(&out.stderr).trim().to_string();
            if out.status.success() {
                Ok(stdout)
            } else {
                Err(format!("FFmpeg failed: {}\nStderr: {}", stdout, stderr))
            }
        }
        Err(e) => Err(format!("FFmpeg process failed to start: {}", e)),
    }
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
async fn load_local_image(path: String) -> Result<String, String> {
    let bytes = match fs::read(&path) {
        Ok(data) => data,
        Err(e) => {
            error!("[tauri] 图片加载失败: {}", e);
            return Err(e.to_string());
        }
    };

    let base64 = general_purpose::STANDARD.encode(bytes);

    Ok(base64)
}

#[tauri::command]
fn get_db_file_path() -> Result<String, String> {
    let app_dir = if cfg!(target_os = "windows") {
        let appdata = std::env::var("APPDATA")
            .map_err(|_| "Failed to get APPDATA environment variable".to_string())?;
        std::path::PathBuf::from(appdata).join("site.ai0.videoCreator")
    } else if cfg!(target_os = "macos") {
        let home = std::env::var("HOME")
            .map_err(|_| "Failed to get HOME environment variable".to_string())?;
        std::path::PathBuf::from(home)
            .join("Library")
            .join("Application Support")
            .join("site.ai0.videoCreator")
    } else {
        let home = std::env::var("HOME")
            .map_err(|_| "Failed to get HOME environment variable".to_string())?;
        std::path::PathBuf::from(home)
            .join(".local")
            .join("share")
            .join("site.ai0.videoCreator")
    };

    if !app_dir.exists() {
        fs::create_dir_all(&app_dir)
            .map_err(|e| format!("Failed to create app data directory: {}", e))?;
    }
    let db_path = app_dir.join("main.db");
    // info!("## db_path:  {}", db_path.to_str().unwrap());
    db_path
        .to_str()
        .map(|s| s.to_string())
        .ok_or_else(|| "Failed to convert database path to string".to_string())
}

#[tauri::command]
fn get_python_version(python_path: String) -> Result<String, String> {
    let path_to_use = if python_path.is_empty() {
        "python".to_string()
    } else {
        python_path
    };

    let output = std::process::Command::new(&path_to_use)
        .arg("--version")
        .output();

    match output {
        Ok(out) => {
            let stdout = String::from_utf8_lossy(&out.stdout).trim().to_string();
            let stderr = String::from_utf8_lossy(&out.stderr).trim().to_string();
            if out.status.success() {
                if !stdout.is_empty() {
                    Ok(stdout)
                } else if !stderr.is_empty() {
                    Ok(stderr)
                } else {
                    Ok("Python Connection Success".to_string())
                }
            } else {
                let err_msg = if !stdout.is_empty() { stdout } else { stderr };
                Err(format!("Python returned error: {}", err_msg))
            }
        }
        Err(e) => Err(format!("Python not accessible: {}", e)),
    }
}

#[tauri::command]
fn get_cuda_version(python_path: String) -> Result<String, String> {
    let path_to_use = if python_path.is_empty() {
        "python".to_string()
    } else {
        python_path
    };

    // 1. Try PyTorch CUDA inquiry via process
    let output = std::process::Command::new(&path_to_use)
        .args(&["-c", "import torch; print(torch.version.cuda) if torch.cuda.is_available() else print('PyTorch CUDA unsupported')"])
        .output();

    if let Ok(out) = output {
        if out.status.success() {
            let stdout = String::from_utf8_lossy(&out.stdout).trim().to_string();
            if !stdout.is_empty() && !stdout.contains("unsupported") {
                return Ok(format!("CUDA {} (via PyTorch)", stdout));
            }
        }
    }

    // 2. Try nvidia-smi
    let output_smi = std::process::Command::new("nvidia-smi").output();
    if let Ok(out) = output_smi {
        if out.status.success() {
            let stdout = String::from_utf8_lossy(&out.stdout);
            for line in stdout.lines() {
                if line.contains("CUDA Version:") {
                    if let Some(pos) = line.find("CUDA Version:") {
                        let sub = &line[pos..];
                        let parts: Vec<&str> = sub.split_whitespace().collect();
                        if parts.len() >= 3 {
                            return Ok(format!(
                                "CUDA {} (via System)",
                                parts[2].trim_end_matches('|').trim()
                            ));
                        }
                    }
                }
            }
        }
    }

    // 3. Try nvcc
    let output_nvcc = std::process::Command::new("nvcc").arg("--version").output();
    if let Ok(out) = output_nvcc {
        if out.status.success() {
            let stdout = String::from_utf8_lossy(&out.stdout);
            for line in stdout.lines() {
                if line.contains("release") {
                    let parts: Vec<&str> = line.split("release").collect();
                    if parts.len() >= 2 {
                        let ver_parts: Vec<&str> = parts[1].trim().split(',').collect();
                        if !ver_parts.is_empty() {
                            return Ok(format!("CUDA {} (via nvcc)", ver_parts[0].trim()));
                        }
                    }
                }
            }
        }
    }

    Ok("CUDA Not Detected / Undefined".to_string())
}

#[tauri::command]
fn get_ollama_version() -> Result<String, String> {
    let output = std::process::Command::new("ollama")
        .arg("--version")
        .output();
    match output {
        Ok(out) => {
            if out.status.success() {
                let stdout = String::from_utf8_lossy(&out.stdout).trim().to_string();
                if !stdout.is_empty() {
                    return Ok(stdout);
                }
                let stderr = String::from_utf8_lossy(&out.stderr).trim().to_string();
                if !stderr.is_empty() {
                    return Ok(stderr);
                }
                Ok("Ollama active".to_string())
            } else {
                Err("Ollama query command returned error".to_string())
            }
        }
        Err(_) => Err("Ollama executable not found in system PATH".to_string()),
    }
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
fn extract_video_audio(
    ffmpeg_path: String,
    video_path: String,
    output_path: String,
) -> Result<String, String> {
    let path_to_use = if ffmpeg_path.is_empty() {
        "ffmpeg".to_string()
    } else {
        ffmpeg_path
    };

    let out_path = std::path::Path::new(&output_path);
    if let Some(parent) = out_path.parent() {
        if !parent.exists() {
            if let Err(e) = std::fs::create_dir_all(parent) {
                return Err(format!(
                    "Failed to create parent directory for audio: {}",
                    e
                ));
            }
        }
    }

    let mut command = std::process::Command::new(&path_to_use);
    command
        .arg("-y")
        .arg("-i")
        .arg(&video_path)
        .arg("-q:a")
        .arg("0")
        .arg("-map")
        .arg("a")
        .arg(&output_path);

    let output = command.output();
    match output {
        Ok(out) => {
            let stdout = String::from_utf8_lossy(&out.stdout).trim().to_string();
            let stderr = String::from_utf8_lossy(&out.stderr).trim().to_string();
            if out.status.success() {
                Ok(output_path)
            } else {
                Err(format!(
                    "FFmpeg audio extraction failed: {}\nStderr: {}",
                    stdout, stderr
                ))
            }
        }
        Err(e) => Err(format!("FFmpeg process failed to start: {}", e)),
    }
}

#[tauri::command]
fn get_comfyui_details(comfyui_root: String) -> Result<serde_json::Value, String> {
    use std::collections::HashMap;
    use std::fs;
    use std::path::Path;

    if comfyui_root.is_empty() {
        return Err("ComfyUI Root Path is empty".to_string());
    }

    let root_path = Path::new(&comfyui_root);
    if !root_path.exists() {
        return Err(format!(
            "ComfyUI root path does not exist: {}",
            comfyui_root
        ));
    }

    // 1. Gather custom_nodes
    let mut custom_nodes = Vec::new();
    let custom_nodes_dir = root_path.join("custom_nodes");
    if custom_nodes_dir.exists() && custom_nodes_dir.is_dir() {
        if let Ok(entries) = fs::read_dir(custom_nodes_dir) {
            for entry in entries {
                if let Ok(e) = entry {
                    let path = e.path();
                    if path.is_dir() {
                        if let Some(name) = path.file_name() {
                            let name_str = name.to_string_lossy().to_string();
                            if name_str != "__pycache__" && !name_str.starts_with('.') {
                                custom_nodes.push(name_str);
                            }
                        }
                    }
                }
            }
        }
    }
    custom_nodes.sort_by_key(|name| name.to_lowercase());

    // 2. Gather models
    let mut models = HashMap::new();
    let models_dir = root_path.join("models");
    if models_dir.exists() && models_dir.is_dir() {
        if let Ok(entries) = fs::read_dir(&models_dir) {
            for entry in entries {
                if let Ok(e) = entry {
                    let path = e.path();
                    if path.is_dir() {
                        if let Some(folder_name) = path.file_name() {
                            let folder_name_str = folder_name.to_string_lossy().to_string();
                            if !folder_name_str.starts_with('.') && folder_name_str != "__pycache__"
                            {
                                let mut files_list = Vec::new();
                                traverse_model_files(&path, &mut files_list, &path);
                                files_list.sort_by_key(|f| f.to_lowercase());
                                models.insert(folder_name_str, files_list);
                            }
                        }
                    }
                }
            }
        }
    }

    Ok(serde_json::json!({
        "custom_nodes": custom_nodes,
        "models": models,
    }))
}

fn traverse_model_files(dir: &std::path::Path, list: &mut Vec<String>, base_dir: &std::path::Path) {
    if let Ok(entries) = std::fs::read_dir(dir) {
        for entry in entries {
            if let Ok(e) = entry {
                let path = e.path();
                if path.is_dir() {
                    traverse_model_files(&path, list, base_dir);
                } else if path.is_file() {
                    let file_name = path
                        .file_name()
                        .unwrap_or_default()
                        .to_string_lossy()
                        .to_string();
                    if !file_name.starts_with('.') {
                        if let Ok(rel_path) = path.strip_prefix(base_dir) {
                            list.push(rel_path.to_string_lossy().to_string());
                        } else {
                            list.push(file_name);
                        }
                    }
                }
            }
        }
    }
}


async fn serve_workspace_file(req: axum::http::Request<axum::body::Body>) -> impl axum::response::IntoResponse {
    use axum::body::Body;
    use axum::http::{StatusCode, Request};
    use axum::response::{IntoResponse, Response};
    use tower::ServiceExt;
    use tower_http::services::ServeDir;

    let db_path = match get_db_file_path() {
        Ok(path) => path,
        Err(e) => {
            return Response::builder()
                .status(StatusCode::INTERNAL_SERVER_ERROR)
                .body(Body::from(format!("Failed to determine DB path: {}", e)))
                .unwrap();
        }
    };

    let workspace_path = match read_setting_from_db(&db_path, "workspace_path") {
        Ok(Some(path)) => path,
        Ok(None) => {
            return Response::builder()
                .status(StatusCode::NOT_FOUND)
                .body(Body::from("workspace_path setting not configured in database yet. Please configure it in settings page first."))
                .unwrap();
        }
        Err(e) => {
            return Response::builder()
                .status(StatusCode::INTERNAL_SERVER_ERROR)
                .body(Body::from(format!("Failed to read setting from database: {}", e)))
                .unwrap();
        }
    };

    if workspace_path.trim().is_empty() {
        return Response::builder()
            .status(StatusCode::NOT_FOUND)
            .body(Body::from("workspace_path setting is defined but currently empty. Please configure a valid path."))
            .unwrap();
    }

    let uri = req.uri().clone();
    let subpath = uri.path().trim_start_matches('/');
    if subpath.contains("..") {
        return Response::builder()
            .status(StatusCode::FORBIDDEN)
            .body(Body::from("Directory traversal forbidden"))
            .unwrap();
    }

    let full_path = std::path::PathBuf::from(&workspace_path).join(subpath);
    if !full_path.exists() {
        return Response::builder()
            .status(StatusCode::NOT_FOUND)
            .body(Body::from(format!("File not found in workspace: {} (Workspace: {})", subpath, workspace_path)))
            .unwrap();
    }

    let headers = req.headers().clone();
    let mut req_builder = Request::builder().uri(uri);
    if let Some(headers_mut) = req_builder.headers_mut() {
        *headers_mut = headers;
    }

    let serve_req = match req_builder.body(Body::empty()) {
        Ok(r) => r,
        Err(e) => {
            return Response::builder()
                .status(StatusCode::INTERNAL_SERVER_ERROR)
                .body(Body::from(format!("Failed to build ServeDir request: {}", e)))
                .unwrap();
        }
    };

    let route_service = ServeDir::new(workspace_path);
    match route_service.oneshot(serve_req).await {
        Ok(res) => res.into_response(),
        Err(e) => Response::builder()
            .status(StatusCode::INTERNAL_SERVER_ERROR)
            .body(Body::from(format!("Error running ServeDir oneshot: {}", e)))
            .unwrap(),
    }
}
async fn start_video_server() {
    use std::net::SocketAddr;
    use tower_http::cors::{Any, CorsLayer};

    let db_path = match get_db_file_path() {
        Ok(p) => p,
        Err(e) => {
            log::error!("[Axum Server] Failed to determine DB file path: {}", e);
            "main.db".to_string()
        }
    };

    let app = axum::Router::new()
        .fallback(serve_workspace_file)
        .layer(
            CorsLayer::new()
                .allow_origin(Any)
                .allow_methods(Any)
                .allow_headers(Any),
        );

    let mut port = 4000;
    if let Ok(Some(saved_port_str)) = read_setting_from_db(&db_path, "video_server_port") {
        if let Ok(p) = saved_port_str.trim().parse::<u16>() {
            port = p;
        }
    }

    let mut host_addr_str = "127.0.0.1".to_string();
    if let Ok(Some(saved_host)) = read_setting_from_db(&db_path, "video_server_address") {
        let trimmed = saved_host.trim();
        if !trimmed.is_empty() {
            host_addr_str = trimmed.to_string();
        }
    }

    let ip_addr: std::net::IpAddr = host_addr_str.parse().unwrap_or_else(|_| {
        std::net::IpAddr::V4(std::net::Ipv4Addr::new(127, 0, 0, 1))
    });

    let mut listener = None;
    let mut bound_port = port;

    for p in port..(port + 100) {
        let addr = SocketAddr::from((ip_addr, p));
        match tokio::net::TcpListener::bind(&addr).await {
            Ok(l) => {
                listener = Some(l);
                bound_port = p;
                break;
            }
            Err(e) => {
                log::warn!("[Axum Server] Port {} occupied: {}, trying next...", p, e);
            }
        }
    }

    let listener = match listener {
        Some(l) => l,
        None => {
            let addr = SocketAddr::from((ip_addr, 0));
            match tokio::net::TcpListener::bind(&addr).await {
                Ok(l) => {
                    let local_addr = l.local_addr().unwrap();
                    bound_port = local_addr.port();
                    l
                }
                Err(e) => {
                    log::error!("[Axum Server] All port binding attempts failed: {}", e);
                    return;
                }
            }
        }
    };

    let actual_host = listener.local_addr().unwrap().ip().to_string();
    log::info!("[Axum Server] 视频服务器流通道正在监听: http://{}:{}", actual_host, bound_port);

    if let Err(e) = write_setting_to_db(&db_path, "video_server_port", &bound_port.to_string()) {
        log::error!("[Axum Server] Failed to save video_server_port to DB: {}", e);
    }
    if let Err(e) = write_setting_to_db(&db_path, "video_server_address", &actual_host) {
        log::error!("[Axum Server] Failed to save video_server_address to DB: {}", e);
    }

    if let Err(e) = axum::serve(listener, app.into_make_service()).await {
        log::error!("[Axum Server] Video server crashed: {}", e);
    }
}
fn get_stream_response(
    request: http::Request<Vec<u8>>,
) -> Result<http::Response<Vec<u8>>, Box<dyn std::error::Error>> {
    info!("[Stream Protocol] 收到请求 URI: {}", request.uri());

    // 1. 获取请求的原始 Path 并进行 URL 解码
    let mut path = percent_encoding::percent_decode(request.uri().path().as_bytes())
        .decode_utf8_lossy()
        .to_string();

    debug!("[Stream Protocol] 原始解码 Path: {}", path);

    // 2. 移除可能因为格式产生的残留多余斜杠
    if path.starts_with("//") {
        path = path.replacen("//", "/", 1);
    }

    // 3. 针对 Windows 系统的特殊处理
    #[cfg(windows)]
    if path.starts_with('/') && path.chars().nth(2) == Some(':') {
        path = path.replacen('/', "", 1);
    }

    info!("[Stream Protocol] 最终试图读取的物理路径: {}", path);

    // 4. 安全检查：确保文件在本地真的存在
    if !std::path::Path::new(&path).exists() {
        error!(
            "[Stream Protocol] 错误：本地找不到该媒体文件！路径：{}",
            path
        );
        return Ok(ResponseBuilder::new()
            .status(StatusCode::NOT_FOUND)
            .header(CONTENT_TYPE, "text/plain")
            .body("Video file not found".as_bytes().to_vec())?);
    }

    // 5. 打开文件
    let mut file = std::fs::File::open(&path)?;
    // get file length
    let len = {
        let old_pos = file.stream_position()?;
        let len = file.seek(SeekFrom::End(0))?;
        file.seek(SeekFrom::Start(old_pos))?;
        len
    };

    debug!("[Stream Protocol] 视频文件总长度 (Size): {} bytes", len);

    let mut resp = ResponseBuilder::new()
        .header(CONTENT_TYPE, "video/mp4")
        .header(ACCEPT_RANGES, "bytes") // 关键：告诉浏览器我支持持续分片下载！
        .header("Access-Control-Allow-Origin", "*")
        .header("Access-Control-Allow-Headers", "*")
        .header("Access-Control-Allow-Methods", "GET, OPTIONS");

    // if the webview sent a range header, we need to send a 206 in return
    let http_response = if let Some(range_header) = request.headers().get("range") {
        let range_str = range_header.to_str().unwrap_or("");
        info!(
            "[Stream Protocol] 触发分片请求 -> Range 头数据: {}",
            range_str
        );

        let not_satisfiable = || {
            warn!(
                "[Stream Protocol] 警告：Range 范围不合法或越界 -> {}",
                range_str
            );
            ResponseBuilder::new()
                .status(StatusCode::RANGE_NOT_SATISFIABLE)
                .header(CONTENT_RANGE, format!("bytes */{len}"))
                .body(vec![])
        };

        // parse range header
        let ranges = if let Ok(ranges) = HttpRange::parse(range_str, len) {
            ranges
                .iter()
                .map(|r| (r.start, r.start + r.length - 1))
                .collect::<Vec<_>>()
        } else {
            return Ok(not_satisfiable()?);
        };

        /// The Maximum bytes we send in one range
        const MAX_LEN: u64 = 4000 * 1024;

        if ranges.len() == 1 {
            let &(start, mut end) = ranges.first().unwrap();

            if start >= len || end >= len || end < start {
                return Ok(not_satisfiable()?);
            }

            // ================== 【核心修正：滑动窗口智能修正】 ==================
            // 如果浏览器请求的区间太小（比如 0-1445），会导致通道过早关闭引发内核 Trap。
            // 我们强制将结束位置扩展到 start + MAX_LEN - 1，或者文件的末尾。
            if (end - start) < MAX_LEN {
                end = (start + MAX_LEN - 1).min(len - 1);
            }
            // ===================================================================

            // 计算实际需要读取和返回的字节数
            let bytes_to_read = end + 1 - start;
            
            debug!(
                "[Stream Protocol] 智能滑动窗口修正 -> 实际读取区间: {}-{} (共 {} 字节)", 
                start, end, bytes_to_read
            );

            let mut buf = Vec::with_capacity(bytes_to_read as usize);
            file.seek(SeekFrom::Start(start))?;
            file.take(bytes_to_read).read_to_end(&mut buf)?;

            resp = resp.header(CONTENT_RANGE, format!("bytes {start}-{end}/{len}"));
            resp = resp.header(CONTENT_LENGTH, bytes_to_read);
            resp = resp.status(StatusCode::PARTIAL_CONTENT);
            resp.body(buf)
        } else {
            debug!(
                "[Stream Protocol] 多区间分片响应 -> 区间总数: {}",
                ranges.len()
            );
            let mut buf = Vec::new();
            let ranges = ranges
                .iter()
                .filter_map(|&(start, mut end)| {
                    if start >= len || end >= len || end < start {
                        None
                    } else {
                        end = start + (end - start).min(len - start).min(MAX_LEN - 1);
                        Some((start, end))
                    }
                })
                .collect::<Vec<_>>();

            let boundary = random_boundary();
            let boundary_sep = format!("\r\n--{boundary}\r\n");
            let boundary_closer = format!("\r\n--{boundary}\r\n");

            resp = resp.header(
                CONTENT_TYPE,
                format!("multipart/byteranges; boundary={boundary}"),
            );

            for (start, end) in ranges {
                buf.write_all(boundary_sep.as_bytes())?;
                buf.write_all(format!("{CONTENT_TYPE}: video/mp4\r\n").as_bytes())?;
                buf.write_all(
                    format!("{CONTENT_RANGE}: bytes {start}-{end}/{len}\r\n").as_bytes(),
                )?;
                buf.write_all("\r\n".as_bytes())?;

                let bytes_to_read = end + 1 - start;
                let mut local_buf = vec![0_u8; bytes_to_read as usize];
                file.seek(SeekFrom::Start(start))?;
                file.read_exact(&mut local_buf)?;
                buf.extend_from_slice(&local_buf);
            }
            buf.write_all(boundary_closer.as_bytes())?;

            resp.body(buf)
        }
    } else {
        // 前端没有传 Range 头，一次性读取整个视频文件（不推荐大视频走这里）
        warn!("[Stream Protocol] 注意：前端请求未携带 Range 头，正在一次性加载完整视频！");
        resp = resp.header(CONTENT_LENGTH, len);
        let mut buf = Vec::with_capacity(len as usize);
        file.read_to_end(&mut buf)?;
        resp.body(buf)
    };

    http_response.map_err(Into::into)
}

#[tauri::command]
async fn comfy_api_request_rust(
    server_address: String,
    method: String,
    endpoint: String,
    body: Option<serde_json::Value>,
) -> Result<serde_json::Value, String> {
    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(30))
        .build()
        .map_err(|e| format!("Failed to build reqwest client: {}", e))?;

    let url = format!("http://{}{}", server_address, endpoint);

    let req_builder = match method.to_uppercase().as_str() {
        "POST" => {
            let mut req = client.post(&url);
            if let Some(b) = body {
                req = req.json(&b);
            }
            req
        }
        _ => client.get(&url),
    };

    let res = req_builder.send()
        .await
        .map_err(|e| format!("Failed to send request to ComfyUI at {}: {}", url, e))?;

    let status = res.status();
    let text = res.text()
        .await
        .map_err(|e| format!("Failed to read response body: {}", e))?;

    if !status.is_success() {
        return Err(format!("ComfyUI returned error HTTP {}: {}", status, text));
    }

    if text.trim().is_empty() {
        return Ok(serde_json::json!({ "status": "ok" }));
    }

    // Try parsing as JSON, fallback to returning string in a JSON wrapper
    match serde_json::from_str::<serde_json::Value>(&text) {
        Ok(json) => Ok(json),
        Err(_) => Ok(serde_json::json!({ "text": text })),
    }
}

#[tauri::command]
async fn upload_file_to_comfy_rust(
    server_address: String,
    local_path: String,
    filename: String,
) -> Result<String, String> {
    println!("==== Rust Upload File to ComfyUI Started ====");
    println!("- Server: http://{}", server_address);
    println!("- Local Path: {}", local_path);
    println!("- Destination Filename: {}", filename);

    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(60))
        .build()
        .map_err(|e| format!("Failed to build reqwest client: {}", e))?;

    let bytes = if local_path.starts_with("data:") {
        // Parse base64
        let comma_idx = local_path.find(',').ok_or_else(|| "Invalid data URI".to_string())?;
        let b64_str = &local_path[comma_idx + 1..];
        use base64::{prelude::BASE64_STANDARD, Engine};
        BASE64_STANDARD.decode(b64_str)
            .map_err(|e| format!("Failed to decode base64: {}", e))?
    } else {
        // Read file from disk
        let path = Path::new(&local_path);
        if !path.exists() {
            return Err(format!("File does not exist: {}", local_path));
        }
        std::fs::read(path)
            .map_err(|e| format!("Failed to read file from disk: {}", e))?
    };

    let upload_url = format!("http://{}/upload/image", server_address);
    
    // Create multipart form
    let part = reqwest::multipart::Part::bytes(bytes)
        .file_name(filename.clone())
        .mime_str("application/octet-stream")
        .map_err(|e| format!("Failed to set part details: {}", e))?;

    let form = reqwest::multipart::Form::new()
        .part("image", part)
        .text("overwrite", "true");

    let res = client.post(&upload_url)
        .multipart(form)
        .send()
        .await
        .map_err(|e| format!("Failed to send multipart request to ComfyUI at {}: {}", upload_url, e))?;
    let status = res.status();
    if !status.is_success() {
        let err_text = res.text().await.unwrap_or_default();
        return Err(format!("ComfyUI upload returned HTTP {}: {}",status, err_text));
    }

    let json: serde_json::Value = res.json()
        .await
        .map_err(|e| format!("Failed to parse upload response: {}", e))?;

    let uploaded_name = json["name"]
        .as_str()
        .ok_or_else(|| "No file name in upload response".to_string())?;

    println!("- Successfully uploaded as: {}", uploaded_name);
    Ok(uploaded_name.to_string())
}


#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let db_path = get_db_file_path().unwrap_or_else(|_| "main.db".to_string());
    let connection_string = format!("sqlite:{}", db_path);
    info!("Using unified database URL for all plugins: {}", connection_string);

    let migrations = db::migrations::get_migrations();
    let db_path_clone = db_path.clone();

    tauri::Builder::default()  
        .plugin(tauri_plugin_log::Builder::default().build())        
        .plugin(tauri_plugin_opener::init())
        .setup(move |_app| {
            if let Err(e) = db::migrations::run_database_migrations_backend(&db_path_clone) {
                log::error!("[Rust Setup] Failed to execute database migrations: {}", e);
                eprintln!("Failed to execute database migrations: {}", e);
            }      
            tauri::async_runtime::spawn(async move {
                start_video_server().await;
            });
            Ok(())
        })
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
        .register_asynchronous_uri_scheme_protocol("stream", move |_ctx, request, responder| {
            match get_stream_response(request) {
                Ok(http_response) => responder.respond(http_response),
                Err(e) => {
                    error!("[Stream Protocol] 致命错误：流处理器崩溃 -> {}", e);
                    responder.respond(
                        ResponseBuilder::new()
                            .status(StatusCode::INTERNAL_SERVER_ERROR)
                            .header(CONTENT_TYPE, "text/plain")
                            .body(e.to_string().as_bytes().to_vec())
                            .unwrap(),
                    )
                }
            }
        })
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_http::init())       
        .plugin(
            tauri_plugin_sql::Builder::new()
                .add_migrations(&connection_string, migrations)
                .build(),
        )      
        .invoke_handler(tauri::generate_handler![
            greet,
            generate_comfy_image_rust,
            load_local_image,
            submit_comfy_image_rust,
            save_comfy_image_rust,
            save_comfy_audio_rust,
            get_db_file_path,
            get_python_version,
            get_cuda_version,
            get_ffmpeg_version,
            extract_video_cover,
            extract_video_audio,
            run_ffmpeg_cmd,
            get_ollama_version,
            get_fallback_cover_svg_base64,
            get_comfyui_details,
            upload_file_to_comfy_rust,
            comfy_api_request_rust
        ])
        .run(tauri::generate_context!())
        .expect("error while running  application");
}
