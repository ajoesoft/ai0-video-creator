我帮你**完整梳理、总结这套 SQLite 数据库结构**，按**表结构、字段含义、关联关系、版本迭代**清晰整理，方便你直接用于文档、开发理解或 Rust 代码维护。

# SQLite 数据库结构完整总结（基于 Rust 迁移脚本）
## 一、整体设计概述
这是一个**视频项目生成工具**的数据库，核心围绕 `video_projects`（视频项目）展开，配套场景配置、模板、角色、单词、词汇库、应用配置等业务表，使用**版本化迁移**（v1~v6）迭代升级。

**核心特性**
- 主表：`video_projects`（项目唯一标识：`project_uuid`）
- 外键关联：所有子表通过 `project_uuid` 关联主表，**级联删除**（项目删除，关联数据自动删除）
- 时间字段：统一使用 `DATETIME DEFAULT CURRENT_TIMESTAMP` / 时间戳
- 场景类型：固定枚举 `short_video/story/dialogue/word`

---

## 二、所有表结构 + 字段详解
### 1. video_projects（视频项目主表）
**版本：v1 创建，v2/v6 新增字段**
| 字段名 | 类型 | 约束 | 说明 |
|-------|------|------|------|
| project_uuid | TEXT | PRIMARY KEY | 项目唯一ID |
| project_name | TEXT | NOT NULL | 项目名称 |
| project_prompt | TEXT | NULL | 项目提示词/描述 |
| cover_image_path | TEXT | NULL | 封面图路径 |
| create_time | INTEGER | NOT NULL | 创建时间戳 |
| update_time | INTEGER | NOT NULL | 更新时间戳 |
| project_status | INTEGER | NOT NULL DEFAULT 0 | 项目状态 |
| scene_type | TEXT | DEFAULT 'short_video' | 场景类型（枚举） |
| scene_config_id | INTEGER | NULL | 场景配置ID |
| template_id | INTEGER | NULL | 模板ID |
| project_path | TEXT | NULL | 项目本地存储路径（v6新增） |

---

### 2. scene_config（场景配置表）
**版本：v3 创建**
| 字段名 | 类型 | 约束 | 说明 |
|-------|------|------|------|
| config_id | INTEGER | PK AUTOINCREMENT | 配置ID |
| scene_type | TEXT | NOT NULL 枚举 | 场景类型 |
| script_rules | TEXT | NOT NULL | 脚本规则（JSON/文本） |
| ai_params | TEXT | NOT NULL | AI调用参数 |
| export_config | TEXT | NOT NULL | 导出配置 |
| create_time | DATETIME | DEFAULT CURRENT_TIMESTAMP | 创建时间 |
| update_time | DATETIME | DEFAULT CURRENT_TIMESTAMP | 更新时间 |

---

### 3. scene_template（场景模板表）
**版本：v3 创建**
| 字段名 | 类型 | 约束 | 说明 |
|-------|------|------|------|
| template_id | INTEGER | PK AUTOINCREMENT | 模板ID |
| scene_type | TEXT | NOT NULL 枚举 | 场景类型 |
| template_name | TEXT | NOT NULL | 模板名称 |
| template_path | TEXT | NOT NULL | 模板文件路径 |
| template_type | TEXT | NOT NULL 枚举 | 模板类型：script/image/timeline |
| is_default | INTEGER | DEFAULT 0 | 是否默认模板（0否1是） |
| create_time | DATETIME | DEFAULT CURRENT_TIMESTAMP | 创建时间 |
| update_time | DATETIME | DEFAULT CURRENT_TIMESTAMP | 更新时间 |

---

### 4. dialogue_role（对话角色表）
**版本：v3 创建**
| 字段名 | 类型 | 约束 | 说明 |
|-------|------|------|------|
| role_id | INTEGER | PK AUTOINCREMENT | 角色ID |
| project_uuid | TEXT | NOT NULL FK | 关联项目ID（级联删除） |
| role_name | TEXT | NOT NULL | 角色名称 |
| role_voice | TEXT | NOT NULL | 角色音色/配音 |
| role_avatar | TEXT | NULL | 角色头像路径 |
| create_time | DATETIME | DEFAULT CURRENT_TIMESTAMP | 创建时间 |
| update_time | DATETIME | DEFAULT CURRENT_TIMESTAMP | 更新时间 |

---

### 5. word_detail（单词详情表）
**版本：v3 创建**
| 字段名 | 类型 | 约束 | 说明 |
|-------|------|------|------|
| word_id | INTEGER | PK AUTOINCREMENT | 单词ID |
| project_uuid | TEXT | NOT NULL FK | 关联项目ID |
| word | TEXT | NOT NULL | 单词原文 |
| phonetic | TEXT | NOT NULL | 音标 |
| paraphrase | TEXT | NOT NULL | 释义 |
| example | TEXT | NULL | 例句 |
| audio_path | TEXT | NULL | 发音音频路径 |
| image_path | TEXT | NULL | 配图路径 |
| create_time | DATETIME | DEFAULT CURRENT_TIMESTAMP | 创建时间 |
| update_time | DATETIME | DEFAULT CURRENT_TIMESTAMP | 更新时间 |

---

### 6. vocabulary（词汇库表）
**版本：v4 创建**
> 扩展版单词表，包含视频生成、AI 提示词等全字段
| 字段名 | 类型 | 约束 | 说明 |
|-------|------|------|------|
| id | INTEGER | PK AUTOINCREMENT | 主键 |
| project_uuid | TEXT | NOT NULL FK | 关联项目 |
| word | TEXT | NOT NULL | 单词 |
| audio_path | TEXT | NULL | 音频 |
| index_char | TEXT | NULL | 索引字符 |
| example | TEXT | NULL | 例句 |
| image_path | TEXT | NULL | 图片 |
| phonetic_symbols | TEXT | NULL | 音标 |
| chinese_definition | TEXT | NULL | 中文释义 |
| data | TEXT | NULL | 扩展JSON数据 |
| prompt | TEXT | NULL | 通用提示词 |
| video_path | TEXT | NULL | 生成视频路径 |
| ltx23_prompt | TEXT | NULL | 模型专用提示词 |
| t2v_prompt | TEXT | NULL | 文生视频提示词 |
| qwen_image_prompt | TEXT | NULL | 通义千问图像提示词 |
| category | TEXT | NULL | 分类 |
| script | TEXT | NULL | 脚本 |
| created_at | DATETIME | DEFAULT CURRENT_TIMESTAMP | 创建时间 |
| updated_at | DATETIME | DEFAULT CURRENT_TIMESTAMP | 更新时间 |
| status | INTEGER | DEFAULT 1 | 状态 |
| chinese | TEXT | NULL | 中文 |

---

### 7. app_settings（应用配置表）
**版本：v5 创建**
| 字段名 | 类型 | 约束 | 说明 |
|-------|------|------|------|
| key | TEXT | PRIMARY KEY | 配置键（唯一） |
| value | TEXT | NOT NULL | 配置值 |
| updated_at | DATETIME | DEFAULT CURRENT_TIMESTAMP | 更新时间 |

---

## 三、迁移版本迭代说明（v1 → v6）
| 版本 | 功能 | 操作 |
|-----|------|------|
| v1 | 初始化 | 创建主表 video_projects |
| v2 | 场景扩展 | 给项目表添加场景类型、配置ID、模板ID |
| v3 | 业务表 | 创建场景配置/模板/对话角色/单词详情 |
| v4 | 词汇库 | 创建扩展词汇表 vocabulary |
| v5 | 应用配置 | 创建全局配置表 app_settings |
| v6 | 路径存储 | 给项目表添加本地路径 project_path |

---

## 四、表关系图（简洁版）
```
video_projects (主表)
├── dialogue_role  (项目角色：多对一)
├── word_detail    (项目单词：多对一)
├── vocabulary     (项目词汇库：多对一)
├── scene_config   (场景配置：一对一)
└── scene_template (场景模板：多对一)
```

---

## 五、Rust 迁移代码优化建议（可选）
你当前的代码可以**更规范、更易维护**，我给你一个优化版（保留逻辑不变）：
```rust
use std::fmt;

#[derive(Debug, Clone)]
pub enum MigrationKind {
    Up,
    Down,
}

impl fmt::Display for MigrationKind {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            MigrationKind::Up => write!(f, "UP"),
            MigrationKind::Down => write!(f, "DOWN"),
        }
    }
}

#[derive(Debug, Clone)]
pub struct Migration {
    pub version: u32,
    pub description: &'static str,
    pub sql: &'static str,
    pub kind: MigrationKind,
}

/// 数据库迁移脚本：视频项目生成工具
pub fn get_database_migrations() -> Vec<Migration> {
    vec![
        // V1: 初始化项目表
        Migration {
            version: 1,
            description: "initial_setup: create video_projects",
            sql: "CREATE TABLE IF NOT EXISTS video_projects (
                project_uuid TEXT PRIMARY KEY, 
                project_name TEXT NOT NULL, 
                project_prompt TEXT, 
                cover_image_path TEXT, 
                create_time INTEGER NOT NULL, 
                update_time INTEGER NOT NULL, 
                project_status INTEGER NOT NULL DEFAULT 0);",
            kind: MigrationKind::Up,
        },
        // V2: 添加场景相关字段
        Migration {
            version: 2,
            description: "add_scene_columns to video_projects",
            sql: "ALTER TABLE video_projects ADD COLUMN scene_type TEXT DEFAULT 'short_video' CHECK (scene_type IN ('short_video', 'story', 'dialogue', 'word'));
                  ALTER TABLE video_projects ADD COLUMN scene_config_id INTEGER;
                  ALTER TABLE video_projects ADD COLUMN template_id INTEGER;",
            kind: MigrationKind::Up,
        },
        // V3: 创建场景配置、模板、角色、单词表
        Migration {
            version: 3,
            description: "create_scene_tables",
            sql: "CREATE TABLE IF NOT EXISTS scene_config (
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
                );",
            kind: MigrationKind::Up,
        },
        // V4: 词汇库表
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
        // V5: 应用全局配置
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
        // V6: 项目本地存储路径
        Migration {
            version: 6,
            description: "add_project_path_column",
            sql: "ALTER TABLE video_projects ADD COLUMN project_path TEXT;",
            kind: MigrationKind::Up,
        },
    ]
}
```

---

### 总结
1. 数据库共 **7张表**，以 `video_projects` 为核心，所有业务表通过 `project_uuid` 关联并支持**级联删除**
2. 迭代从 v1~v6，逐步扩展**项目、场景、角色、单词、词汇库、配置、本地路径**功能
3. 字段规范：时间统一、枚举约束、外键安全、NULL/NOT NULL 明确
4. 适合**视频生成、单词学习、AI 脚本制作**类桌面/客户端应用


