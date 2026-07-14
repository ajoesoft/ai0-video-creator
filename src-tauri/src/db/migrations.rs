use tauri_plugin_sql::{Migration, MigrationKind};

pub fn get_migrations() -> Vec<Migration> {
    vec![
        Migration {
            version: 1,
            description: "initial_setup_unified",
            sql: "
                CREATE TABLE IF NOT EXISTS video_projects (
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
                    detected_language TEXT
                );

                CREATE TABLE IF NOT EXISTS scene_config (
                    config_id INTEGER PRIMARY KEY AUTOINCREMENT,
                    scene_type TEXT NOT NULL CHECK (scene_type IN ('short_video', 'story', 'dialogue', 'word')),
                    script_rules TEXT NOT NULL,
                    ai_params TEXT NOT NULL,
                    export_config TEXT NOT NULL,
                    create_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
                    update_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
                );

                CREATE TABLE IF NOT EXISTS scene_template (
                    template_id INTEGER PRIMARY KEY AUTOINCREMENT,
                    scene_type TEXT NOT NULL CHECK (scene_type IN ('short_video', 'story', 'dialogue', 'word')),
                    template_name TEXT NOT NULL,
                    template_path TEXT NOT NULL,
                    template_type TEXT NOT NULL CHECK (template_type IN ('script', 'image', 'timeline')),
                    is_default INTEGER NOT NULL DEFAULT 0 CHECK (is_default IN (0, 1)),
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
                );

                CREATE TABLE IF NOT EXISTS vocabulary (
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
                    text_to_image_prompt TEXT,
                    image_to_video_prompt TEXT,
                    ref_image_prompt TEXT,
                    ref_video_prompt TEXT,
                    translation TEXT,
                    voiceover TEXT,
                    translation_speech_file TEXT,
                    dialog TEXT,
                    FOREIGN KEY (project_uuid) REFERENCES video_projects(project_uuid) ON DELETE CASCADE
                );

                CREATE TABLE IF NOT EXISTS app_settings (
                    key TEXT PRIMARY KEY,
                    value TEXT NOT NULL,
                    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
                );

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

                CREATE TABLE IF NOT EXISTS system_prompts (
                    uuid TEXT PRIMARY KEY,
                    name TEXT,
                    classification TEXT,
                    prompt TEXT,
                    created_at INTEGER,
                    updated_at INTEGER
                );

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

                CREATE TABLE IF NOT EXISTS video_translation_logs (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    project_id TEXT,
                    log_type TEXT,
                    message TEXT,
                    timestamp INTEGER
                );
            ",
            kind: MigrationKind::Up,
        }
    ]
}

pub fn run_database_migrations_backend(db_path: &str) -> Result<(), Box<dyn std::error::Error>> {
    println!("[Rust Migrations] Connecting to database at file: {}", db_path);
    let conn = rusqlite::Connection::open(db_path)?;

    // Core self-healing step: Ensure EVERY table exists by running table creation directly from Rust
    println!("[Rust Migrations] Creating/verifying all core tables...");

    conn.execute(
        "CREATE TABLE IF NOT EXISTS video_projects (
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
        );",
        [],
    )?;

    conn.execute(
        "CREATE TABLE IF NOT EXISTS scene_config (
            config_id INTEGER PRIMARY KEY AUTOINCREMENT,
            scene_type TEXT NOT NULL CHECK (scene_type IN ('short_video', 'story', 'dialogue', 'word')),
            script_rules TEXT NOT NULL,
            ai_params TEXT NOT NULL,
            export_config TEXT NOT NULL,
            create_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
            update_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
        );",
        [],
    )?;

    conn.execute(
        "CREATE TABLE IF NOT EXISTS scene_template (
            template_id INTEGER PRIMARY KEY AUTOINCREMENT,
            scene_type TEXT NOT NULL CHECK (scene_type IN ('short_video', 'story', 'dialogue', 'word')),
            template_name TEXT NOT NULL,
            template_path TEXT NOT NULL,
            template_type TEXT NOT NULL CHECK (template_type IN ('script', 'image', 'timeline')),
            is_default INTEGER NOT NULL DEFAULT 0 CHECK (is_default IN (0, 1)),
            create_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
            update_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
        );",
        [],
    )?;

    conn.execute(
        "CREATE TABLE IF NOT EXISTS dialogue_role (
            role_id INTEGER PRIMARY KEY AUTOINCREMENT,
            project_uuid TEXT NOT NULL,
            role_name TEXT NOT NULL,
            role_voice TEXT NOT NULL,
            role_avatar TEXT,
            create_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
            update_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (project_uuid) REFERENCES video_projects(project_uuid) ON DELETE CASCADE
        );",
        [],
    )?;

    conn.execute(
        "CREATE TABLE IF NOT EXISTS word_detail (
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
        [],
    )?;

    conn.execute(
        "CREATE TABLE IF NOT EXISTS vocabulary (
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
            translations TEXT
        );",
        [],
    )?;

    conn.execute(
        "CREATE TABLE IF NOT EXISTS app_settings (
            key TEXT PRIMARY KEY,
            value TEXT NOT NULL,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );",
        [],
    )?;

    conn.execute(
        "CREATE TABLE IF NOT EXISTS visual_library (
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
        );",
        [],
    )?;

    conn.execute(
        "CREATE TABLE IF NOT EXISTS prompt_harness (
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
        );",
        [],
    )?;

    conn.execute(
        "CREATE TABLE IF NOT EXISTS background_tasks (
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
        );",
        [],
    )?;

    conn.execute(
        "CREATE TABLE IF NOT EXISTS system_prompts (
            uuid TEXT PRIMARY KEY,
            name TEXT,
            classification TEXT,
            prompt TEXT,
            created_at INTEGER,
            updated_at INTEGER
        );",
        [],
    )?;

    // Check and seed default/standard system prompts using INSERT OR IGNORE
    println!("[Rust Migrations] Checking and seeding default system prompts & standard presets in Rust...");
    let now = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_millis() as i64)
        .unwrap_or(0);

    let defaults = vec![
        (
            "prompt-uuid-details-default",
            "Cover & Style Director (封面及风格导演)",
            "details",
            "You are an expert design director and style consultant. Focus on analyzing the project's creative direction, visual theme, and storytelling tone. Guide the user in drafting consistent style guidelines, select fitting color schemes, and brainstorm evocative ideas for the project's cover image."
        ),
        (
            "prompt-uuid-script-default",
            "Screenplay & Dialogue Maestro (编剧与对白大师)",
            "script",
            "You are an elite screenwriter and script supervisor. Assist the user in drafting precise dialogues, voiceover lines, director's cues (camera angles, movements), and visual prompt descriptions for scene synthesis. Ensure the speech rhythm, dialogue style, and stage directions form a cohesive dramatic narrative."
        ),
        (
            "prompt-uuid-visuals-default",
            "IP Character & Environment Sculptor (IP角色与环境塑造师)",
            "visuals",
            "You are a lead character designer and worldbuilding artist. Help the user define consistent characters (IPs), props, and environmental parameters. Maintain detailed physical descriptions, clothing, mood settings, and lighting prompts to keep visual likeness intact across generations."
        ),
        (
            "prompt-uuid-audio-default",
            "Voice Casting & Sound Designer (声色与声效设计师)",
            "audio",
            "You are a professional audio designer and voice casting director. Assist the user in configuring distinct voiceover timbres, speech rates, emotional intonations, and character-specific acoustic profiles. Focus on optimizing vocal performance and matching roles to their ideal vocal qualities."
        ),
        // Composition Type (构图类型)
        (
            "std-prompt-comp-wide",
            "Cinematic Wide Shot (电影级宽画幅构图)",
            "composition",
            "Cinematic wide shot, stunning landscape framing, deep depth of field, clear horizontal line, panoramic scale, epic sense of scale, balanced rule of thirds"
        ),
        (
            "std-prompt-comp-symmetric",
            "Symmetric Cinematic (对称式电影构图)",
            "composition",
            "Symmetric cinematic composition, perfect balance, center-focused framing, dramatic alignment, clean architectural guidelines, formal artistic structure"
        ),
        (
            "std-prompt-comp-thirds",
            "Rule of Thirds Portrait (三分法黄金人物构图)",
            "composition",
            "Rule of thirds portrait framing, subject aligned on vertical grid line, dynamic negative space, cinematic balance, comfortable visual negative space"
        ),
        (
            "std-prompt-comp-closeup",
            "Extreme Close-Up Detail (局部极度特写)",
            "composition",
            "Extreme close-up shot, macro detail focus, shallow depth of field, high-fidelity texture, intense emotional expression, dramatic focal point"
        ),
        // Lighting Type (光影类型)
        (
            "std-prompt-light-volumetric",
            "Volumetric God Rays (体积光/丁达尔圣光)",
            "lighting",
            "Volumetric lighting, dramatic god rays, Tyndall effect, visible light beams cutting through atmosphere, smoky dust particles, high contrast shadows"
        ),
        (
            "std-prompt-light-rembrandt",
            "Rembrandt Classic (古典伦勃朗肖像光)",
            "lighting",
            "Rembrandt lighting style, classic 45-degree key light, dramatic triangle shadow on cheek, soft ambient fill, painterly contrast, moody chiaroscuro"
        ),
        (
            "std-prompt-light-backlight",
            "Cinematic Backlight (电影感轮廓逆光)",
            "lighting",
            "Cinematic backlighting, golden rim light, glowing hair strands, beautiful halo effect, rich background separation, high contrast silhouette, lens flare"
        ),
        (
            "std-prompt-light-neon",
            "Cyberpunk Neon Glow (赛博朋克霓虹夜光)",
            "lighting",
            "Cyberpunk neon glow, vivid pink and cyan dual lighting, wet pavement reflections, high contrast nocturnal shadows, futuristic moody illumination"
        ),
        // Color Type (色彩类型)
        (
            "std-prompt-color-tealorange",
            "Teal and Orange Blockbuster (好莱坞经典青橙色调)",
            "color",
            "Hollywood Teal and Orange color grading, high contrast cinematic film palette, warm skin tones, cool shadows, atmospheric depth, blockbuster aesthetic"
        ),
        (
            "std-prompt-color-vintage",
            "Vintage Kodachrome (复古柯达彩色胶片)",
            "color",
            "Vintage Kodachrome color profile, warm nostalgic tones, subtle chromatic aberration, classic 35mm film grain, analog color saturation, retro aesthetic"
        ),
        (
            "std-prompt-color-moodydark",
            "Moody Low Saturation (低饱和度冷郁氛围)",
            "color",
            "Moody low saturation color grading, desaturated cool tones, deep dark shadows, gloomy atmospheric mist, muted colors, somber cinematic style"
        ),
        (
            "std-prompt-color-pastel",
            "Vibrant Pastel Fantasy (高饱和幻想马卡龙色)",
            "color",
            "Vibrant pastel colors, high saturation fantasy palette, soft whimsical tones, dreamy watercolor shades, bright and cheerful atmospheric grading"
        ),
        // Quality (画质)
        (
            "std-prompt-qual-8k",
            "8K UHD Masterpiece (8K超清杰作)",
            "quality",
            "8k resolution, UHD masterpiece, razor-sharp details, high-fidelity textures, micro-detail rendering, photorealistic skin pores and surface fabrics, award-winning cinematic fidelity"
        ),
        (
            "std-prompt-qual-ue5",
            "Unreal Engine 5 Render (虚幻5实时渲染级)",
            "quality",
            "Unreal Engine 5 render style, hyperrealistic 3D graphics, ray-traced global illumination, Nanite micro-polygon details, sub-surface scattering, ultra high-end digital art"
        ),
        // Style (画风)
        (
            "std-prompt-style-realism",
            "Cinematic Realism (写实院线电影风)",
            "style",
            "Cinematic photorealism, shot on 35mm Panavision camera, anamorphic lens, real-life lighting, raw documentary texture, high visual credibility"
        ),
        (
            "std-prompt-style-anime",
            "Makoto Shinkai Anime (新海诚动漫插画风)",
            "style",
            "Makoto Shinkai anime style, beautiful hand-drawn illustration, vibrant blue skies, fluffy clouds, highly detailed background, romantic anime lighting, soft dream-like colors"
        ),
        (
            "std-prompt-style-pixar",
            "3D Disney Pixar (迪士尼皮克斯3D动画风)",
            "style",
            "3D stylized character design, Disney Pixar animation style, adorable features, rich clay-like smooth textures, vibrant expressive lighting, cheerful color palette"
        ),
        (
            "std-prompt-style-watercolor",
            "Traditional Ink Watercolor (国风水墨写意风)",
            "style",
            "Traditional Chinese ink wash and watercolor painting, soft sweeping brushstrokes, minimalist composition, dynamic splash ink effect, elegant negative space, ethereal aesthetic"
        ),
        // Atmosphere (氛围)
        (
            "std-prompt-atmos-eerie",
            "Eerie Suspense Horror (惊悚诡异悬疑)",
            "atmosphere",
            "Eerie suspenseful atmosphere, mysterious creeping fog, dim flickering light source, cold unsettling air, tense thriller mood, lingering shadows"
        ),
        (
            "std-prompt-atmos-epic",
            "Epic Grand Scale (史诗宏大震撼)",
            "atmosphere",
            "Epic grand atmosphere, awe-inspiring scale, majestic sweeping view, cinematic orchestration, heroic storytelling perspective, breath-taking dramatic depth"
        ),
        (
            "std-prompt-atmos-cozy",
            "Cozy Warm Healing (治愈温馨安详)",
            "atmosphere",
            "Cozy warm healing atmosphere, soft gentle sunlight, tranquil peaceful environment, comforting glowing ambiance, slow-living relaxation, serene emotional tone"
        )
    ];

    for p in defaults {
        let _ = conn.execute(
            "INSERT OR IGNORE INTO system_prompts (uuid, name, classification, prompt, created_at, updated_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
            rusqlite::params![p.0, p.1, p.2, p.3, now, now],
        );
    }
    println!("[Rust Migrations] Done checking and seeding system prompts and standard presets!");

    // Robust column alter safety checks
    let alter_queries = vec![
        "ALTER TABLE video_projects ADD COLUMN scene_type TEXT DEFAULT 'short_video' CHECK (scene_type IN ('short_video', 'story', 'dialogue', 'word', 'video_translation'))",
        "ALTER TABLE video_projects ADD COLUMN scene_config_id INTEGER",
        "ALTER TABLE video_projects ADD COLUMN template_id INTEGER",
        "ALTER TABLE video_projects ADD COLUMN project_path TEXT",
        "ALTER TABLE video_projects ADD COLUMN width INTEGER DEFAULT 1920",
        "ALTER TABLE video_projects ADD COLUMN height INTEGER DEFAULT 1080",
        "ALTER TABLE video_projects ADD COLUMN aspect_ratio TEXT DEFAULT '16:9'",
        "ALTER TABLE video_projects ADD COLUMN visual_style TEXT DEFAULT 'Cinematic'",
        "ALTER TABLE video_projects ADD COLUMN video_url TEXT",
        "ALTER TABLE video_projects ADD COLUMN audio_url TEXT",
        "ALTER TABLE video_projects ADD COLUMN audio_duration REAL DEFAULT 0.0",
        "ALTER TABLE video_projects ADD COLUMN srt_original TEXT",
        "ALTER TABLE video_projects ADD COLUMN text_original TEXT",
        "ALTER TABLE video_projects ADD COLUMN detected_language TEXT",
        "ALTER TABLE video_projects ADD COLUMN source_language TEXT DEFAULT 'zh'",
        "ALTER TABLE video_projects ADD COLUMN target_languages TEXT DEFAULT 'en'",
    ];
    for q in alter_queries {
        let _ = conn.execute(q, []);
    }

    let alter_vocabulary = vec![
        "ALTER TABLE vocabulary ADD COLUMN text_to_image_prompt TEXT",
        "ALTER TABLE vocabulary ADD COLUMN image_to_video_prompt TEXT",
        "ALTER TABLE vocabulary ADD COLUMN ref_image_prompt TEXT",
        "ALTER TABLE vocabulary ADD COLUMN ref_video_prompt TEXT",
        "ALTER TABLE vocabulary ADD COLUMN translation TEXT",
        "ALTER TABLE vocabulary ADD COLUMN voiceover TEXT",
        "ALTER TABLE vocabulary ADD COLUMN translation_speech_file TEXT",
        "ALTER TABLE vocabulary ADD COLUMN dialog TEXT",
        "ALTER TABLE vocabulary ADD COLUMN translations TEXT",
    ];
    for q in alter_vocabulary {
        let _ = conn.execute(q, []);
    }

    let alter_timeline = vec![
        "ALTER TABLE video_translation_timeline ADD COLUMN video_url TEXT",
        "ALTER TABLE video_translation_timeline ADD COLUMN audio_url TEXT",
    ];
    for q in alter_timeline {
        let _ = conn.execute(q, []);
    }

    let alter_harness = vec![
        "ALTER TABLE prompt_harness ADD COLUMN type TEXT",
        "ALTER TABLE prompt_harness ADD COLUMN template TEXT",
        "ALTER TABLE prompt_harness ADD COLUMN parameters TEXT",
        "ALTER TABLE prompt_harness ADD COLUMN target_model TEXT",
    ];
    for q in alter_harness {
        let _ = conn.execute(q, []);
    }

    // Safe check and auto-creation / migration for video_translation_projects with v2 schema check
    let mut is_migrated = false;
    if let Ok(val) = conn.query_row::<String, _, _>(
        "SELECT value FROM app_settings WHERE key = 'video_translation_schema_v2' LIMIT 1",
        [],
        |row| row.get(0)
    ) {
        if val == "true" {
            is_migrated = true;
        }
    }

    if !is_migrated {
        println!("[Rust Migrations] video_translation_schema_v2 not active. Purging old translation tables...");
        let _ = conn.execute("PRAGMA foreign_keys = OFF;", []);
        let _ = conn.execute("DROP TABLE IF EXISTS video_translation_timeline;", []);
        let _ = conn.execute("DROP TABLE IF EXISTS video_translation_logs;", []);
        let _ = conn.execute("DROP TABLE IF EXISTS video_translation_projects;", []);
        let _ = conn.execute("PRAGMA foreign_keys = ON;", []);

        let _ = conn.execute(
            "INSERT OR REPLACE INTO app_settings (key, value, updated_at) VALUES ('video_translation_schema_v2', 'true', CURRENT_TIMESTAMP);",
            [],
        );
    }

    // Recreate video_translation_projects table
    conn.execute(
        "CREATE TABLE IF NOT EXISTS video_translation_projects (
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
        );",
        [],
    )?;

    // Recreate video_translation_timeline table
    conn.execute(
        "CREATE TABLE IF NOT EXISTS video_translation_timeline (
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
        );",
        [],
    )?;

    // Recreate video_translation_logs table
    conn.execute(
        "CREATE TABLE IF NOT EXISTS video_translation_logs (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            project_id TEXT,
            log_type TEXT,
            message TEXT,
            timestamp INTEGER
        );",
        [],
    )?;

    // Self-migration: Merge all unique translation projects inside video_translation_projects table into unified video_projects table
    println!("[Rust Migrations] Merging video_translation_projects rows into video_projects...");
    
    struct TransProject {
        project_id: String,
        name: Option<String>,
        video_url: Option<String>,
        cover_url: Option<String>,
        audio_url: Option<String>,
        audio_duration: Option<f64>,
        srt_original: Option<String>,
        text_original: Option<String>,
        detected_language: Option<String>,
        status: Option<String>,
        created_at: Option<i64>,
        updated_at: Option<i64>,
    }

    let mut stmt = conn.prepare("SELECT project_id, name, video_url, cover_url, audio_url, audio_duration, srt_original, text_original, detected_language, status, created_at, updated_at FROM video_translation_projects")?;
    let trans_rows = stmt.query_map([], |row| {
        Ok(TransProject {
            project_id: row.get(0)?,
            name: row.get(1)?,
            video_url: row.get(2)?,
            cover_url: row.get(3)?,
            audio_url: row.get(4)?,
            audio_duration: row.get(5)?,
            srt_original: row.get(6)?,
            text_original: row.get(7)?,
            detected_language: row.get(8)?,
            status: row.get(9)?,
            created_at: row.get(10)?,
            updated_at: row.get(11)?,
        })
    })?;

    let mut candidate_projects = Vec::new();
    for tp_res in trans_rows {
        if let Ok(tp) = tp_res {
            candidate_projects.push(tp);
        }
    }

    if !candidate_projects.is_empty() {
        println!("[Rust Migrations] Found {} candidate translation projects to migrate.", candidate_projects.len());
        for tp in candidate_projects {
            let uuid = tp.project_id.clone();
            let exists: bool = conn.query_row(
                "SELECT EXISTS(SELECT 1 FROM video_projects WHERE project_uuid = ?1)",
                [&uuid],
                |row| row.get(0)
            ).unwrap_or(false);

            if !exists {
                println!("[Rust Migrations] Migrating Translation Project: [{}] (UUID: {}) into video_projects.", tp.name.as_deref().unwrap_or(""), uuid);
                let status_val = if tp.status.as_deref() == Some("completed") { 4 } else { 2 };
                let now = std::time::SystemTime::now()
                    .duration_since(std::time::UNIX_EPOCH)
                    .map(|d| d.as_millis() as i64)
                    .unwrap_or(0);

                let create_time = tp.created_at.unwrap_or(now);
                let update_time = tp.updated_at.unwrap_or(now);
                let srt_desc = tp.srt_original.as_ref().map(|s| {
                    if s.len() > 150 {
                        format!("{}...", &s[..150])
                    } else {
                        s.clone()
                    }
                }).unwrap_or_else(|| "Video Translation Project configured.".to_string());

                let _ = conn.execute(
                    "INSERT INTO video_projects (
                        project_uuid, project_name, project_prompt, cover_image_path, create_time, update_time, 
                        project_status, scene_type, project_path, 
                        width, height, aspect_ratio, visual_style,
                        video_url, audio_url, audio_duration, srt_original, text_original, detected_language
                    ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15, ?16, ?17, ?18, ?19)",
                    rusqlite::params![
                        uuid,
                        tp.name.as_deref().unwrap_or("Untitled Translation"),
                        srt_desc,
                        tp.cover_url.as_deref(),
                        create_time,
                        update_time,
                        status_val,
                        "video_translation",
                        None::<String>, // project_path
                        1920,
                        1080,
                        "16:9",
                        "Cinematic",
                        tp.video_url.as_deref(),
                        tp.audio_url.as_deref(),
                        tp.audio_duration.unwrap_or(0.0),
                        tp.srt_original.as_deref(),
                        tp.text_original.as_deref(),
                        tp.detected_language.as_deref(),
                    ]
                );
            } else {
                let _ = conn.execute(
                    "UPDATE video_projects SET
                        video_url = COALESCE(video_url, ?1),
                        audio_url = COALESCE(audio_url, ?2),
                        audio_duration = COALESCE(audio_duration, ?3),
                        srt_original = COALESCE(srt_original, ?4),
                        text_original = COALESCE(text_original, ?5),
                        detected_language = COALESCE(detected_language, ?6)
                    WHERE project_uuid = ?7",
                    rusqlite::params![
                        tp.video_url.as_deref(),
                        tp.audio_url.as_deref(),
                        tp.audio_duration.unwrap_or(0.0),
                        tp.srt_original.as_deref(),
                        tp.text_original.as_deref(),
                        tp.detected_language.as_deref(),
                        uuid,
                    ]
                );
            }

            // Construct state setting video_translation_data_${uuid} inside app_settings if not present
            let setting_key = format!("video_translation_data_{}", uuid);
            let setting_exists: bool = conn.query_row(
                "SELECT EXISTS(SELECT 1 FROM app_settings WHERE key = ?1)",
                [&setting_key],
                |row| row.get(0)
            ).unwrap_or(false);

            if !setting_exists {
                println!("[Rust Migrations] Constructing translation state setting data for project {}...", uuid);
                
                struct Segment {
                    segment_index: i64,
                    start_sec: f64,
                    end_sec: f64,
                    text: String,
                    translated_text: Option<String>,
                    video_url: Option<String>,
                    audio_url: Option<String>,
                }

                let mut tim_stmt = conn.prepare("SELECT segment_index, start_sec, end_sec, text, translated_text, video_url, audio_url FROM video_translation_timeline WHERE project_id = ?1 ORDER BY segment_index ASC")?;
                let seg_rows = tim_stmt.query_map([&uuid], |row| {
                    Ok(Segment {
                        segment_index: row.get(0)?,
                        start_sec: row.get(1)?,
                        end_sec: row.get(2)?,
                        text: row.get(3)?,
                        translated_text: row.get(4)?,
                        video_url: row.get(5)?,
                        audio_url: row.get(6)?,
                    })
                })?;

                let mut dialogues = Vec::new();
                let mut translated_dialogues = Vec::new();

                for s_res in seg_rows {
                    if let Ok(s) = s_res {
                        dialogues.push(serde_json::json!({
                            "index": s.segment_index,
                            "startSec": s.start_sec,
                            "endSec": s.end_sec,
                            "text": s.text,
                            "videoUrl": s.video_url,
                            "audioUrl": s.audio_url
                        }));

                        let t_text = s.translated_text.unwrap_or_default();
                        if !t_text.is_empty() {
                            translated_dialogues.push(serde_json::json!({
                                "index": s.segment_index,
                                "startSec": s.start_sec,
                                "endSec": s.end_sec,
                                "text": t_text,
                                "videoUrl": s.video_url,
                                "audioUrl": s.audio_url
                            }));
                        }
                    }
                }

                // Logs
                let mut log_stmt = conn.prepare("SELECT message FROM video_translation_logs WHERE project_id = ?1 ORDER BY timestamp ASC")?;
                let log_rows = log_stmt.query_map([&uuid], |row| row.get::<_, String>(0))?;
                let mut logs = Vec::new();
                for lr in log_rows {
                    if let Ok(msg) = lr {
                        logs.push(msg);
                    }
                }
                if logs.is_empty() {
                    logs.push(format!("[LOG] Loaded project from storage: {}", tp.name.as_deref().unwrap_or("Untitled")));
                }

                let translation_state = serde_json::json!({
                    "videoName": tp.name.as_deref().unwrap_or("Untitled"),
                    "videoSize": "Unknown Size",
                    "videoUrl": tp.video_url.as_deref().unwrap_or(""),
                    "coverUrl": tp.cover_url,
                    "audioUrl": tp.audio_url,
                    "audioDuration": tp.audio_duration.unwrap_or(0.0),
                    "srtOriginal": tp.srt_original.as_deref().unwrap_or(""),
                    "srtTranslated": "",
                    "textOriginal": tp.text_original.as_deref().unwrap_or(""),
                    "textTranslated": "",
                    "dialogues": dialogues,
                    "translatedDialogues": translated_dialogues,
                    "synthesizedAudioUrl": null,
                    "outputVideoUrl": null,
                    "status": tp.status.as_deref().unwrap_or("idle"),
                    "logs": logs,
                    "selectedVoice": "Kore",
                    "sourceLang": "Chinese",
                    "targetLang": "English",
                    "ttsSpeed": 1.0,
                    "lipsyncModel": "LTX2.3 + LipSync-1.0"
                });

                let translation_state_str = serde_json::to_string(&translation_state).unwrap_or_default();

                let _ = conn.execute(
                    "INSERT INTO app_settings (key, value, updated_at) VALUES (?1, ?2, CURRENT_TIMESTAMP)
                     ON CONFLICT(key) DO UPDATE SET value = EXCLUDED.value, updated_at = CURRENT_TIMESTAMP",
                    rusqlite::params![setting_key, translation_state_str]
                );

                println!("[Rust Migrations] Successfully constructed translation State inside app_settings for {}.", uuid);
            }
        }
    }

    println!("[Rust Migrations] All backend migrations completed successfully!");
    Ok(())
}
