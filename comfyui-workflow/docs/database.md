# SQLite 数据库结构完整总结
这是一套**视频/内容创作项目**的数据库迁移脚本，共6个版本迭代，最终形成**6张核心表**，用于管理视频项目、场景配置、角色、单词/词汇、应用配置等数据，整体为**项目制关联结构**。

---

## 一、总表清单（最终6张表）
1. `video_projects` - 视频项目主表
2. `scene_config` - 场景配置表
3. `scene_template` - 场景模板表
4. `dialogue_role` - 对话角色表
5. `word_detail` - 单词详情表
6. `vocabulary` - 词汇表（扩展单词功能）
7. `app_settings` - 应用全局配置表

---

## 二、逐表详细定义（精简清晰版）
### 1. `video_projects` 视频项目主表（核心主表）
**主键**：`project_uuid`（唯一标识）
| 字段 | 类型 | 说明 |
|------|------|------|
| project_uuid | TEXT | 项目唯一ID，主键 |
| project_name | TEXT | 项目名称（必填） |
| project_prompt | TEXT | 项目提示词/描述 |
| cover_image_path | TEXT | 封面图路径 |
| create_time | INTEGER | 创建时间戳 |
| update_time | INTEGER | 更新时间戳 |
| project_status | INTEGER | 项目状态，默认0 |
| scene_type | TEXT | 场景类型，限定4种：短视频/故事/对话/单词 |
| scene_config_id | INTEGER | 关联场景配置ID |
| template_id | INTEGER | 关联模板ID |
| project_path | TEXT | 项目本地存储路径 |

---

### 2. `scene_config` 场景配置表
存储不同场景的AI参数、脚本规则、导出配置
| 字段 | 类型 | 说明 |
|------|------|------|
| config_id | INTEGER | 自增主键 |
| scene_type | TEXT | 场景类型（限定4种） |
| script_rules | TEXT | 脚本规则（JSON/文本） |
| ai_params | TEXT | AI生成参数 |
| export_config | TEXT | 导出配置 |
| create_time / update_time | DATETIME | 创建/更新时间 |

---

### 3. `scene_template` 场景模板表
管理脚本、图片、时间线三类模板
| 字段 | 类型 | 说明 |
|------|------|------|
| template_id | INTEGER | 自增主键 |
| scene_type | TEXT | 适用场景类型 |
| template_name | TEXT | 模板名称 |
| template_path | TEXT | 模板文件路径 |
| template_type | TEXT | 模板类型：脚本/图片/时间线 |
| is_default | INTEGER | 是否默认模板（0否1是） |
| time | DATETIME | 创建/更新时间 |

---

### 4. `dialogue_role` 对话角色表
**关联项目**，项目删除时角色自动删除
| 字段 | 类型 | 说明 |
|------|------|------|
| role_id | INTEGER | 自增主键 |
| project_uuid | TEXT | 关联项目ID |
| role_name | TEXT | 角色名称 |
| role_voice | TEXT | 角色配音/音色 |
| role_avatar | TEXT | 角色头像 |
| time | DATETIME | 创建/更新时间 |

---

### 5. `word_detail` 单词详情表
基础单词数据，绑定项目
| 字段 | 类型 | 说明 |
|------|------|------|
| word_id | INTEGER | 自增主键 |
| project_uuid | TEXT | 关联项目ID |
| word | TEXT | 单词原文 |
| phonetic | TEXT | 音标 |
| paraphrase | TEXT | 释义 |
| example / audio_path / image_path | TEXT | 例句、音频、图片 |

---

### 6. `vocabulary` 词汇表（功能增强版单词表）
扩展了视频、多类提示词、分类、脚本等字段，**项目制单词库**
| 关键字段 | 说明 |
|---------|------|
| 基础 | 单词、音标、释义、例句、音频/图片路径 |
| 生成 | 视频路径、多类AI提示词（ltx23/t2v/通义万相） |
| 管理 | 分类、脚本、状态、创建/更新时间 |
| 关联 | project_uuid，绑定项目 |

---

### 7. `app_settings` 应用配置表
全局键值对配置，存储软件设置
| 字段 | 类型 | 说明 |
|------|------|------|
| key | TEXT | 配置项键名，主键 |
| value | TEXT | 配置值 |
| updated_at | DATETIME | 更新时间 |

---

## 三、核心设计规则总结
1. **主从结构**
   所有子表（角色、单词、词汇）都通过 `project_uuid` 关联 `video_projects`，**项目删除，关联数据自动删除**。
2. **强约束**
   场景类型、模板类型都用 `CHECK` 限定可选值，保证数据规范。
3. **时间管理**
   全表统一使用 `create_time/update_time` 记录操作时间。
4. **业务定位**
   面向**AI视频创作 + 单词/词汇学习类工具**，支持短视频、故事、对话、单词四种场景。

---

### 极简一句话总结
这是一个**AI视频创作+单词学习工具**的SQLite数据库，以项目为核心，管理项目信息、场景配置、模板、对话角色、单词/词汇库和全局配置。




我给你生成**清晰、直观、可直接用于文档/设计的数据库结构关系图（文字版 ER 图）**，严格对应你给的 SQLite 迁移脚本。

# 📊 数据库结构关系（ER 关系图）

## 主表（核心）
### **video_projects** 视频项目表
- **主键**：project_uuid
- 所有其他业务表都**外键关联**到此表
- 项目删除 → 关联数据**自动级联删除**

---

## 从表（关联子表）
所有子表通过 **project_uuid → video_projects.project_uuid** 关联

### 1. dialogue_role（对话角色表）
- 关联：project_uuid → video_projects.project_uuid
- 关系：**1 个项目 → N 个角色**（一对多）

### 2. word_detail（基础单词详情表）
- 关联：project_uuid → video_projects.project_uuid
- 关系：**1 个项目 → N 个单词**（一对多）

### 3. vocabulary（增强词汇表）
- 关联：project_uuid → video_projects.project_uuid
- 关系：**1 个项目 → N 个词汇**（一对多）

---

## 独立配置表（不直接绑定项目）
### 4. scene_config（场景配置表）
- 主键：config_id
- 被 video_projects 引用：**video_projects.scene_config_id**
- 关系：**1 个配置 → N 个项目**（一对多）

### 5. scene_template（场景模板表）
- 主键：template_id
- 被 video_projects 引用：**video_projects.template_id**
- 关系：**1 个模板 → N 个项目**（一对多）

### 6. app_settings（全局配置表）
- 全局键值对
- **不与任何表关联**

---

# 🧱 完整结构关系总览（最清晰版）
```
[video_projects]  (项目主表)
   ↑       ↑       ↑
   │       │       │
   ▼       ▼       ▼
dialogue_role  word_detail  vocabulary
(角色)        (单词)       (词汇)


[scene_config] → 引用 → video_projects.scene_config_id
[scene_template] → 引用 → video_projects.template_id

[app_settings] (独立全局配置)
```

---

# 📈 关系类型总结
| 关系 | 表 | 说明 |
|------|----|------|
| **一对多** | 项目 → 角色 | 1个项目可以有多个角色 |
| **一对多** | 项目 → 单词 | 1个项目可以有多个单词 |
| **一对多** | 项目 → 词汇 | 1个项目可以有多个词汇 |
| **一对多** | 场景配置 → 项目 | 1套配置可用于多个项目 |
| **一对多** | 场景模板 → 项目 | 1个模板可用于多个项目 |
| **无关联** | app_settings | 全局配置 |

---

# 🎯 一句话概括结构
这是一个**以视频项目为中心**的数据库结构：
**项目表是核心父表，角色/单词/词汇是子表；场景配置与模板为公共配置，被项目引用；全局配置独立存在。**

需要我给你生成 **UML 图文本、Markdown 表格版、或可直接导入数据库工具的结构** 也可以告诉我！



erDiagram
    VIDEO_PROJECTS ||--o{ DIALOGUE_ROLE : "包含"
    VIDEO_PROJECTS ||--o{ WORD_DETAIL : "包含"
    VIDEO_PROJECTS ||--o{ VOCABULARY : "包含"
    SCENE_CONFIG ||--o{ VIDEO_PROJECTS : "被引用"
    SCENE_TEMPLATE ||--o{ VIDEO_PROJECTS : "被引用"

    VIDEO_PROJECTS {
        string project_uuid PK
        string project_name
        string project_prompt
        string cover_image_path
        int create_time
        int update_time
        int project_status
        string scene_type
        int scene_config_id FK
        int template_id FK
        string project_path
    }

    SCENE_CONFIG {
        int config_id PK
        string scene_type
        string script_rules
        string ai_params
        string export_config
        datetime create_time
        datetime update_time
    }

    SCENE_TEMPLATE {
        int template_id PK
        string scene_type
        string template_name
        string template_path
        string template_type
        int is_default
        datetime create_time
        datetime update_time
    }

    DIALOGUE_ROLE {
        int role_id PK
        string project_uuid FK
        string role_name
        string role_voice
        string role_avatar
        datetime create_time
        datetime update_time
    }

    WORD_DETAIL {
        int word_id PK
        string project_uuid FK
        string word
        string phonetic
        string paraphrase
        string example
        string audio_path
        string image_path
        datetime create_time
        datetime update_time
    }

    VOCABULARY {
        int id PK
        string project_uuid FK
        string word
        string phonetic_symbols
        string chinese_definition
        string audio_path
        string image_path
        string video_path
        string category
        string status
        datetime created_at
        datetime updated_at
    }

    APP_SETTINGS {
        string key PK
        string value
        datetime updated_at
    }

    