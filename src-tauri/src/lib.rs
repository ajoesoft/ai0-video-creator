use base64::{engine::general_purpose, Engine as _};
use log::{error, info};
use std::fs;
use std::path::Path;
use std::time::Duration;
use tauri_plugin_sql::{Migration, MigrationKind};

#[tauri::command]
fn greet(name: &str) -> String {
    info!("[AI0 Video Creator] Hello: {}", name);
    format!(
        "Hello, {}! You've been greeted from AI0 Video Creator!",
        name
    )
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
            status,
            err_text
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
#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let db_path = get_db_file_path().unwrap_or_else(|_| "main.db".to_string());
    let connection_string = format!("sqlite:{}", db_path);

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
        Migration {
            version: 8,
            description: "fix_video_projects_translation_table",
            sql: "CREATE TABLE IF NOT EXISTS video_projects_new (
                      project_uuid TEXT PRIMARY KEY,
                      project_name TEXT NOT NULL,
                      project_prompt TEXT,
                      cover_image_path TEXT,
                      create_time INTEGER NOT NULL,
                      update_time INTEGER NOT NULL,
                      project_status INTEGER NOT NULL DEFAULT 0,
                      scene_type TEXT DEFAULT 'short_video' CHECK (scene_type IN ('short_video', 'story', 'dialogue', 'word', 'video_translation')),
                      scene_config_id INTEGER,
                      template_id INTEGER,
                      project_path TEXT
                  );",
            kind: MigrationKind::Up,
        },
        Migration {
            version: 9,
            description: "fix_video_projects_translation_copy",
            sql: "INSERT OR REPLACE INTO video_projects_new (
                      project_uuid, project_name, project_prompt, cover_image_path, 
                      create_time, update_time, project_status, scene_type, 
                      scene_config_id, template_id, project_path
                  )
                  SELECT 
                      project_uuid, project_name, project_prompt, cover_image_path, 
                      create_time, update_time, project_status, 
                      CASE 
                          WHEN scene_type IN ('short_video', 'story', 'dialogue', 'word', 'video_translation') THEN scene_type 
                          ELSE 'short_video' 
                      END, 
                      scene_config_id, template_id, project_path 
                  FROM video_projects;",
            kind: MigrationKind::Up,
        },
        Migration {
            version: 10,
            description: "fix_video_projects_translation_drop",
            sql: "DROP TABLE IF EXISTS video_projects;",
            kind: MigrationKind::Up,
        },
        Migration {
            version: 11,
            description: "fix_video_projects_translation_rename",
            sql: "ALTER TABLE video_projects_new RENAME TO video_projects;",
            kind: MigrationKind::Up,
        }
    ];

    // ##############################
    // 修复：插件使用 **同一个数据库路径**
    // ##############################

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
                .add_migrations(&connection_string, migrations)
                .build(),
        )
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_http::init())
        .plugin(tauri_plugin_opener::init())
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
            get_ollama_version,
            get_comfyui_details
        ])
        .run(tauri::generate_context!())
        .expect("error while running  application");
}
