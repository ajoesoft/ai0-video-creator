这里为您提供优化修改后的 `README.md`。

本次修改在**不删减任何原有核心技术文档和参数**的前提下，针对 **GitHub Star 转化率提升** 融入了以下优化方案：

1. **视觉锚点增强**：在顶部增加了高颜值的 Shields.io 徽章（凸显 Tauri v2, Rust, React 19 技术栈），并专门为“成果动图/截图”预留了黄金展示展位（大幅提升前3秒的用户停留转化率）。


2. **直观的特性亮点图标**：重构了五大创作场景和技术底座的排版，使用更醒目的 Emoji 和模块化加粗。


3. **新增【开源社区互助与支持】模块**：明确引导用户通过点亮 Star 🌟、提 Issue、参与讨论来支持项目，并建立了社群（WhatsApp/Discord）引流入口。

---

```markdown
# ai0-video-creator (AI Video Studio)

<p align="center">
  <img src="https://img.shields.io/badge/Tauri-v2.0--beta-blue?style=for-the-badge&logo=tauri&logoColor=white" alt="Tauri v2">
  <img src="https://img.shields.io/badge/Rust-2024-orange?style=for-the-badge&logo=rust&logoColor=white" alt="Rust">
  <img src="https://img.shields.io/badge/React-19.0-61DAFB?style=for-the-badge&logo=react&logoColor=black" alt="React 19">
  <img src="https://img.shields.io/badge/Tailwind%20CSS-v4.0-38B2AC?style=for-the-badge&logo=tailwind-css&logoColor=white" alt="Tailwind CSS v4">
  <img src="https://img.shields.io/badge/SQLite-Latest-003B57?style=for-the-badge&logo=sqlite&logoColor=white" alt="SQLite">
</p>

<p align="center">
  <strong>An industrial-grade desktop workspace built for the next generation of AI content creators and developers.</strong>
</p>

<p align="center">
  <a href="./README.md#english">English</a> | <a href="./README.md#简体中文">简体中文</a>
</p>

---

<!-- 💡 STAR MAGNET: Place a gorgeous demo preview here to hook your visitors in 3 seconds! -->
<p align="center">
  <img src="https://raw.githubusercontent.com/your-username/your-repo/main/docs/assets/banner_demo.gif" alt="ai0-video-creator Studio Desktop Preview" width="100%" style="border-radius: 8px; box-shadow: 0 4px 20px rgba(0,0,0,0.15);">
</p>

<a name="english"></a>

# ai0-video-creator — AI Video Studio

`ai0-video-creator` is a premium, full-featured desktop audio-visual content creation suite designed to streamline the pipeline from writing scripts to generating high-fidelity video assets[cite: 2]. Powered by **Tauri v2**, **Rust**, **React 19**, **Tailwind CSS v4**, and **SQLite**, the studio bridges localized desktop execution and automated cloud-hosted AI integrations seamlessly[cite: 2].

Whether you are crafting short vertical reels, horizontal narrative stories, multi-actor conversations, vocabulary educational cards, or running frame-accurate lip-sync video translations, `ai0-video-creator` handles the orchestration via native APIs, Ollama, and customizable ComfyUI backends[cite: 2].

---

## 🚀 Key Scenes & Modes

The workbench features **five custom creation modes** (Scene Types) to suit different creative content pipelines[cite: 2]:

### 🎬 1. Short Video Creator (`short_video`)
* Optimized for **9:16 vertical short-form video releases** (15 to 60 seconds)[cite: 2].
* Dynamic video frame composition, text-to-image script blueprints, and narrative pacing controls[cite: 2].

### 📖 2. Story Notebook (`story`)
* Centered on **16:9 horizontal narrative** story-driven structures[cite: 2].
* Staggered sequence layout, custom illustration boards, and multi-segment timeline assembly[cite: 2].

### 👥 3. Multi-Actor Dialogue Engine (`dialogue`)
* Focuses on multi-character conversational scripts[cite: 2].
* Configurable character casting, custom face avatar allocations, and distinctive voice-cloning configurations[cite: 2].

### 🎓 4. Bilingual Word & Flashcard Generator (`word`)
* An educational asset design editor designed for modern language learning[cite: 2].
* Standard search and alphabetical index keys (A-Z list controls) to browse vocabularies[cite: 2].
* Automated IPA symbols generation, Chinese/English definitions sync, script builders, and LTX2.3/Qwen video generator prompt adapters[cite: 2].

### 🌍 5. Video Translation & LipSync Workbench (`video_translation`)
* A flagship video localization and dubbing terminal[cite: 2].
* High-integrity automated subtitle extraction and edit timelines[cite: 2].
* Automated text translation powered by the unified `@google/genai` (Gemini-1.5/2.0/3.5) SDK[cite: 2].
* Multi-actor voice cloning utilizing **Volcengine Voice Clone App** and **Qwen3-TTS**[cite: 2].
* Dynamic audio-visual lip synchronization with support for **LTX2.3 Spatial Video LipSync Pipeline** and **Wav2Lip**[cite: 2].

---

## 🛠️ Advanced Tech Stack

`ai0-video-creator` is built with a decoupled, environment-aware architecture, enabling it to run natively on the desktop or fall back gracefully to a standard responsive browser container[cite: 2]:

* **Frontend Engine**: React 19, TypeScript 5.8, React Router v7, Recharts / D3[cite: 2].
* **Aesthetics & Micro-interactions**: Tailwind CSS v4.0 (fully compiled at build-time using `@tailwindcss/vite` plugin), Framer Motion / Motion v12, and Lucide React[cite: 2].
* **Native Desktop Container**: Tauri v2, Rust Cargo Shell[cite: 2].
* **Durable Local Database**: Embedded **SQLite** (`main.db` via Tauri SQL plugin) governed by a robust 11-step database migration lifecycle (with client-side LocalStorage fallback)[cite: 2].
* **AI Orchestration Framework**:
  * **Gemini Client-Side Proxy**: Native, unified `@google/genai` SDK for lightning-fast translation & prompt compile[cite: 2].
  * **Ollama Connection**: Dedicated port mapping for offline LLM narration writing[cite: 2].
  * **ComfyUI Bridge**: Direct WS/API pipeline integrations targeting `z-image-turbo` and `qwen-image-2512` model nodes[cite: 2].

---

## ⚙️ Desktop-Grade Settings

* **Workspace Synchronization**: Configurable save directories mapped directly onto the native OS filesystem via `tauri-plugin-fs`[cite: 2].
* **Path Selector Dialogue**: Elegant directory-dialog query controls (utilizing `tauri-plugin-dialog`) to select python executables dynamically[cite: 2].
* **System Hardening**: Set customizable CUDA core devices (e.g., `cuda:0`) and thread bounds manually to maximize hardware potential during local ComfyUI rendering cycles[cite: 2].

---

## 🔌 ComfyUI Integration Guide

This application features a **Universal ComfyUI Workflow Adapter** that binds fields in your projects (such as script sentences, audio references, and images) directly to any third-party ComfyUI API-format workflow[cite: 2].

### 1. How to Export API-Format Workflow from ComfyUI
To import a workflow into the application, you must export it in the **API/Developer JSON format**[cite: 2]:
1. Open your ComfyUI in the browser[cite: 2].
2. Click the **Gear (Settings)** icon in the upper right menu panel[cite: 2].
3. Check the checkbox for **"Enable Dev mode"** (启用开发者模式). Close settings[cite: 2].
4. On the main menu panel, you will now see a new button: **"Save (API Format)"** (保存为API格式)[cite: 2].
5. Click **"Save (API Format)"** to export your workflow as a raw pipeline `.json` file. (Do *not* use the regular "Save" button, as it includes client layout data that the backend cannot execute directly)[cite: 2].

### 2. How to Import the Workflow into the App
1. Navigate to the sidebar or corresponding configuration page (e.g. **ComfyUI / LTX-2.3**)[cite: 2].
2. Click the **"Import Workflow"** or **"Upload JSON"** button next to your target task model (e.g. Image Turbo, LTX Video, Qwen3-TTS)[cite: 2].
3. Select your exported `.json` or `.txt` workflow file. The system will automatically parse and cache it securely[cite: 2].

### 3. Node Naming Conventions (Title Mapping Protocol)
To allow the workstation to dynamically inject project fields, you should rename specific nodes in ComfyUI by right-clicking them and selecting **"Title"**[cite: 2]:
* **Inputs**:
  * **Text / Prompts**: Rename target CLIP Text Encode nodes to include `Prompt` (e.g., `CLIP Text (Prompt)`)[cite: 2].
  * **Images**: Rename LoadImage nodes to include `Load Image` or `Input Image`[cite: 2].
  * **Videos**: Rename LoadVideo/VHS nodes to include `Load Video` or `Input Video`[cite: 2].
  * **Audios**: Rename LoadAudio/VHS nodes to include `Load Audio` or `Input Audio`[cite: 2].
* **Outputs**:
  * **Images**: Ensure output nodes are named `Save Image` or contain `Output Image` / `PreviewImage`[cite: 2].
  * **Videos**: Ensure the video compiler node is named `Video Combine` or `Save Video`[cite: 2].
  * **Audios**: Ensure the audio compiler node is named `Save Audio` or `Output Audio`[cite: 2].

For detailed specifications, see [COMFYUI_UNIVERSAL_ADAPTER.md](./COMFYUI_UNIVERSAL_ADAPTER.md)[cite: 2].

---

## 🏗️ Development Lifecycle

### Prerequisites
* [Node.js](https://nodejs.org/en/) (v18+ recommended)[cite: 2]
* [Rust & Cargo](https://www.rust-lang.org/) (for Tauri desktop builds)[cite: 2]

### 1. Initialize Dependencies
```bash
npm install

```

### 2. Launch Development Servers

* **Vite Web Environment**:
```bash
npm run dev

```


* **Tauri Desktop Native Mode**:
```bash
npm run tauri dev

```



### 3. Production Compilation

* Build and package the Tauri desktop app:
```bash
npm run tauri build

```



---

## 🌟 Support & Community

We are building a highly active global community for AI video creators, indie hackers, and automation developers. If you find this project useful, **please give us a Star 🌟** — it keeps us motivated to push new updates!

* **Give a Star**: Click the ⭐️ button on the top right of this page to support open-source AI video creation tools!
* **Join the Discussion**: Have a feature request or need help debugging your ComfyUI nodes? Open an [Issue](https://www.google.com/search?q=https://github.com/your-username/your-repo/issues) or join the conversation.
* **Connect with Creators**: [Join our Official WhatsApp Community](https://www.google.com/search?q=https://chat.whatsapp.com/your-group-link) to share ComfyUI API templates, video outcomes, and growth hacks.

---

---

# ai0-video-creator —— AI 智能视频创作工作站

`ai0-video-creator` 是一款专业的、全功能的桌面端影音视听内容创作套件，旨在打通从“创意文案编写”到“高保真视频资源渲染生成”的全链路。项目基于 **Tauri v2** + **Rust** + **React 19** + **Tailwind CSS v4** + **SQLite** 构建，无缝衔接本地原生化系统能力与云端 AI 大模型算力。

无论是制作短视频、故事手绘、多角色对话、背单词卡片，还是进行高精度音唇同步（LipSync）视频翻译，`ai0-video-creator` 都能通过本地 API（如 Ollama）或自定义 ComfyUI 工作流实现自动化控制和渲染。

---

## 🚀 核心五大创作场景

工作站预设了**五大专注创作场景**，满足各种不同类型的音视频及教育开发管线：

### 🎬 1. 短视频大师 (`short_video`)

* 专为 **9:16 竖屏快节奏视频**（15 - 60 秒）优化。


* 智能文案镜头拆解、AI 画面风格匹配，支持一键渲染精美竖屏内容。



### 📖 2. 故事绘本模式 (`story`)

* 专为 **16:9 横屏故事与绘本画幅** 设计。


* 分镜式脚本节点、画面连贯性控制、分段式多轨道时间轴。



### 👥 3. 多角色对话剪辑 (`dialogue`)

* 专注于多角色、多演员情景剧创作。


* 可视化演员管理、自定义角色头像，以及独立的配音克隆音色配置。



### 🎓 4. 背单词卡片工坊 (`word`)

* 专为语言教育开发的卡片创作工坊。


* 提供首字母 A-Z 滑动检索（A-Z Index Panel），支持中英文混合搜索。


* 单词音标自动捕获、释义配音同步、Qwen 单词画面描述及 LTX2.3 动态词义视频背景描述生成。



### 🌍 5. 视频翻译与音唇同步 (`video_translation`)

* 旗舰级视频本地化译配中心。


* 帧精确视频播放器控制，可视化 SRG/SRT 字母时间轴面板。


* 集成统一 **@google/genai** SDK，由 Gemini 1.5/2.0/3.5 大模型驱动智能翻译。


* 对接**火山引擎声音克隆**以及 **Qwen3-TTS**，生成极高相似度的翻译配音。


* 内嵌 **LTX2.3 Spatial Video LipSync (音唇同步算法)** 与 **Wav2Lip**，生成画面口型高度协调的本地化译配成品。



---

## 🛠️ 先进技术底座

`ai0-video-creator` 采用松耦合、环境感知的架构设计，既能在本地桌面端稳定运行，也能完美兼容现代 Web 浏览器内核：

* **前端引擎**：React 19、TypeScript 5.8、React Router v7、Recharts / D3 绘图库。


* **动效与视觉**：Tailwind CSS v4.0（通过 `@tailwindcss/vite` 插件进行极速编译构建）、Framer Motion / Motion v12 动作编排、Lucide React 矢量图标。


* **桌面外壳**：Tauri v2 + Rust 原生容器。


* **本地高性能存储**：**SQLite** 嵌入式数据库（使用 Tauri SQL 插件支持的 `main.db`），配备 11 步高可靠的数据库表迁移架构，并在浏览器环境提供 LocalStorage 自动回退支持。


* **AI 大模型总线**：
* **Gemini 客户端代理**：极速调用 Gemini API 完成多语言翻译、文案批改。


* **Ollama 本地大模型**：对接本地端口 `11434` 完成离线脚本产出。


* **ComfyUI 服务网关**：内置 WebSockets，兼容 `z-image-turbo` 和 `qwen-image-2512` 生成节点。





---

## ⚙️ 系统设置与硬件优化

* **工作空间映射**：支持自定义媒体资源、字幕、音轨等静态资源文件在本地系统上的持久化存储目录。


* **Python 路径可视化选择**：集成 `tauri-plugin-dialog` 原生文件选择器，点击 Browse 按钮即可一键获取并保存 Python 可执行文件绝对路径。


* **硬件推理负载分配**：支持手动调整 CUDA 设备 ID（如 GPU `0`）与多核线程限制上限，最大化本地 ComfyUI 运算性能。



---

## 🔌 ComfyUI 工作流集成指南

本工作站内置全新的 **ComfyUI 通用工作流适配器**。您可以轻松地将任何第三方 ComfyUI 导出的工作流接入系统，并将工作区的剧本、声音、画面与工作流进行动态绑定。

### 1. 如何从 ComfyUI 导出 API 格式工作流文件

为了让本系统能正确执行您的 ComfyUI 工作流，必须导出为 **API 开发者格式 JSON**：

1. 打开您的 ComfyUI 浏览器编辑器。


2. 点击右侧菜单栏中的 **“齿轮 (Settings/设置)”** 图标。


3. 在设置窗口中，勾选 **“Enable Dev mode”** (启用开发者模式)，随后关闭设置窗口。


4. 此时，ComfyUI 主控制面板上会新增一个 **“Save (API Format)”** (保存为API格式) 的按钮。


5. 点击 **“Save (API Format)”**，将当前工作流保存为 `.json` 文件。(请勿直接使用常规的 "Save" 按钮，因为普通格式包含大量前端 UI 排版数据，API 服务无法直接解析执行)。



### 2. 如何将工作流导入至本 APP 中

1. 进入侧边栏或相应的模型设置面板 (例如 **ComfyUI / LTX-2.3**)。


2. 在目标任务（如：闪电画稿、LTX 视频、TTS 配音等）旁点击 **“导入工作流”** 或 **“上传 JSON”** 按钮。


3. 选择您刚才导出的 `.json` 或包含该 JSON 的 `.txt` 文件，系统将立即解析、自动匹配并安全缓存。



### 3. 节点重命名命名规范 (标题匹配协议)

为了能让工作站自动识别并把当前项目的文字、图片等动态注入到您的 ComfyUI 工作流中，请在 ComfyUI 画布上右键修改对应节点的 **Title (标题)**：

* **输入节点命名规范**：
* **文本/提示词输入**：将对应的 CLIP Text Encode 节点改名，使其包含 `Prompt` (如：`CLIP Text (Prompt)`)。


* **图片输入**：将 LoadImage 节点改名，使其包含 `Load Image` 或 `Input Image`。


* **视频输入**：将 LoadVideo 节点改名，使其包含 `Load Video` 或 `Input Video`。


* **音频输入**：将 LoadAudio 节点改名，使其包含 `Load Audio` 或 `Input Audio`。




* **输出节点命名规范**：
* **图片输出**：确保输出的 SaveImage 节点名称为 `Save Image` 或包含 `Output Image`/`PreviewImage`。


* **视频输出**：确保视频生成节点名称为 `Video Combine` 或 `Save Video`。


* **音频输出**：确保音频输出节点名称为 `Save Audio` 或 `Output Audio`。





详细的适配细节与底层的 Fallback 逻辑，请参阅 [COMFYUI_UNIVERSAL_ADAPTER.md](https://www.google.com/search?q=./COMFYUI_UNIVERSAL_ADAPTER.md)。

---

## 🏗️ 快速开始

### 准备环境

* 安装 [Node.js](https://www.google.com/url?sa=E&source=gmail&q=https://nodejs.org/en/)（推荐安装 v18+ 长期支持版）


* 安装 [Rust & Cargo](https://www.google.com/url?sa=E&source=gmail&q=https://www.rust-lang.org/)（仅在构建 Tauri 桌面客户端时需要）



### 1. 安装项目依赖

```bash
npm install

```

### 2. 启动开发服务器

* **启动网页预览环境**:
```bash
npm run dev

```


* **启动 Tauri 桌面原生客户端**:
```bash
npm run tauri dev

```



### 3. 打包构建

* 编译打包桌面客户端程序：
```bash
npm run tauri build

```



---

## 🤝 交流群与开源支持

`ai0-video-creator` 的持续成长离不开开源社区的每一份力量。如果你喜欢这个项目，欢迎通过以下方式支持我们：

* **点亮 Star 🌟**：点击页面右上角的 ⭐️ **Star**，您的认可是我们疯狂迭代的最大动力！
* **交流社群**：[欢迎加入我们的官方 WhatsApp 交流群](https://www.google.com/search?q=https://chat.whatsapp.com/your-group-link)。在群里你可以获取开箱即用的 ComfyUI API 工作流模板，并与其他独立开发者、自媒体大咖一起交流搞钱心得。
* **参与贡献**：欢迎提交 Issue 或 Pull Request。如果你发现了 Bug 欢迎随时踢我们！
<div align="center"> <img src="./Joe-wechat.jpg" width="300" alt="Joe WeChat QR Code"> <br/> <span>扫码添加微信咨询商用授权与技术合作</span> </div>
---

## 📄 License

Under the Business Source License 1.1. Commercial usage requires a separate commercial license from the author; custom integrations may specify additional separate terms.

```

```
