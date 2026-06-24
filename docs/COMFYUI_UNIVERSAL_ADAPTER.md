# ComfyUI 通用工作流适配器与编排协议 / ComfyUI Universal Workflow Adapter & Orchestration Protocol

本规范定义了在智能视频创作工作站中，如何通过 **Node Title (节点自定义名称/标题)** 配合统一的 **输入 (Inputs)**、**输出 (Outputs)** 与 **数据类型 (Types)** 映射，实现对任意第三方 ComfyUI 导出工作流 JSON 进行无缝对接与动态编排的通用技术标准。

This specification defines the universal protocol in the intelligent video creator workstation for dynamically orchestrating and adapting any third-party ComfyUI API JSON by mapping **Node Titles**, **Inputs**, **Outputs**, and **Data Types**.

---

## 一、 核心设计理念 / Core Concept

传统的 ComfyUI API 集成模式通常依赖于固定的数值型 Node ID（如 `"9"`, `"57:3"` 等）。这种强耦合方式存在严重的局限性：一旦创作者在 ComfyUI 画布中新增、删除或重构了任意节点，其 ID 将彻底发生改变，导致前端硬编码的逻辑全部失效崩溃。

To solve this, our **Universal Title-Matching Adapter (通用标题匹配适配器)** decouples node identification by using human-defined **Node Titles (`_meta.title`)** as programmatic anchors.

```
       +-----------------------------------------------------------+
       |                  COGNITIVE ORCHESTRATOR                   |
       |  (Translates dynamic project fields to targeted actions)  |
       +-----------------------------+-----------------------------+
                                     |
                                     v
       +-----------------------------------------------------------+
       |             COMFYUI UNIVERSAL ADAPTER (ADR)               |
       |  - Scans nodes. Matches exact title labels inside `_meta`. |
       |  - Dynamically updates `inputs` based on data category.   |
       +-----------------------------+-----------------------------+
                                     |
                  +------------------+------------------+
                  |                  |                  |
                  v                  v                  v
         [PROMPT TEXT NODE]     [INPUT IMAGE]     [OUTPUT VIDEO]
         "CLIP Text (Prompt)"    "Load Image"     "Video Combine"
```

---

## 二、 统一数据类型与节点约定 / Data Types & Node Standards

系统将通用的多模态输入/输出归纳为以下四种核心数据类型：

| 数据类型 / Data Type | 对应输入节点约定 (Target Input Title) | 对应输出节点约定 (Target Output Title) | 典型参数字段 / Params |
| :--- | :--- | :--- | :--- |
| **`PROMPT TEXT`** | 包含 `Prompt` / `Text` / `CLIP` 的文本编码器 | - | `inputs.text` / `inputs.string` |
| **`image`** | `Load Image` / `Input Image` | `Save Image` / `Output Image` / `PreviewImage` | `inputs.image` |
| **`video`** | `Load Video` / `Input Video` / `LoadVideo` | `Save Video` / `Video Combine` / `VHS_VideoCombine` | `inputs.video` / `inputs.images` |
| **`audio`** | `Load Audio` / `Input Audio` | `Save Audio` / `Output Audio` | `inputs.audio` |

---

## 三、 动态编排算法流程 / Dynamic Compile & Adapt Algorithm

在前端或 Tauri 核心后端中，通用适配器按如下流水线 (Pipeline) 处理任意导入的 ComfyUI 工作流 JSON：

### 1. 编译期：结构化检索 (Structural Search)
遍历 ComfyUI 工作流 JSON 全集中的每个 `node_id`，利用正则表达式或精确匹配提取 `_meta.title`。

```typescript
// 1. 定义适配规则定义
interface AdapterMapping {
  titlePattern: RegExp;      // 用于匹配 _meta.title 的规则
  classType?: string;        // (可选) 节点 class_type 辅助校验
  targetField: string;       // 需要重写或提取的 inputs 键名
}
```

### 2. 运行时：输入热注入 (Runtime Input Injection)
当触发 AI 任务时，适配器接收输入矩阵（如配音文本、剧本、封面参考图），遍历工作流，对满足 Title 匹配的节点字段进行瞬时改写：

```typescript
export function adaptComfyUIWorkflow(
  rawWorkflow: Record<string, any>,
  inputs: {
    prompt?: string;
    imagePath?: string;
    videoPath?: string;
    audioPath?: string;
  }
): Record<string, any> {
  const workflow = JSON.parse(JSON.stringify(rawWorkflow)); // 深拷贝 Deep Copy
  
  for (const nodeId in workflow) {
    const node = workflow[nodeId];
    const title = node._meta?.title || "";
    
    // 注入 PROMPT TEXT
    if (inputs.prompt && /Prompt|CLIP|Positive|Text/i.test(title)) {
      if ('text' in node.inputs) {
        node.inputs.text = inputs.prompt;
      } else if ('string' in node.inputs) {
        node.inputs.string = inputs.prompt;
      }
    }
    
    // 注入 输入图片 (Input Image)
    if (inputs.imagePath && /Load\s*Image|Input\s*Image/i.test(title)) {
      node.inputs.image = inputs.imagePath;
    }
    
    // 注入 输入视频 (Input Video)
    if (inputs.videoPath && /Load\s*Video|Input\s*Video/i.test(title)) {
      node.inputs.video = inputs.videoPath;
    }

    // 注入 输入音频 (Input Audio)
    if (inputs.audioPath && /Load\s*Audio|Input\s*Audio/i.test(title)) {
      node.inputs.audio = inputs.audioPath;
    }
  }
  
  return workflow;
}
```

### 3. 后期：输出路由与资产提取 (Output Routing & Asset Retrieval)
ComfyUI 生成完毕后，适配器根据**输出节点 Title** 轮询指定的物理磁盘目录或 API 结果：

```typescript
export function findOutputNodeId(workflow: Record<string, any>, type: 'image' | 'video' | 'audio'): string | null {
  for (const nodeId in workflow) {
    const node = workflow[nodeId];
    const title = node._meta?.title || "";
    const classType = node.class_type || "";
    
    if (type === 'image' && (classType === 'SaveImage' || /Save\s*Image|Output\s*Image/i.test(title))) {
      return nodeId;
    }
    if (type === 'video' && (classType === 'VHS_VideoCombine' || /Save\s*Video|Video\s*Combine/i.test(title))) {
      return nodeId;
    }
    if (type === 'audio' && (classType === 'SaveAudio' || /Save\s*Audio|Output\s*Audio/i.test(title))) {
      return nodeId;
    }
  }
  return null;
}
```

---

## 四、 最佳实践规范 / Best Practices

为了保证您的 ComfyUI 接口与本创作工作站实现 100% 自动兼容，请在 ComfyUI Editor 中遵循以下简单规范：

1. **重命名关键输入节点 (Rename Crucial Nodes)**：
   * 将承载主提示词的 CLIPTextEncode 节点重命名为：`CLIP Text Encode (Prompt)`
   * 将承载输入控制图的 LoadImage 节点重命名为：`Load Image (Reference)`
   * 将承载口型对齐或视频输入的 LoadVideo / VHS_LoadVideo 节点重命名为：`Load Video`
2. **重命名关键输出节点 (Rename Crucial Output Nodes)**：
   * 将负责画面输出的 SaveImage 节点重命名为：`Save Image`
   * 将负责合流输出的 VHS_VideoCombine 节点重命名为：`Video Combine`
3. **保持 ClassType 原生性**：
   * 尽量使用主流成熟社区扩展节点（如 `ComfyUI-Video-Helper-Suites`、`ComfyUI-Audio-Nodes`），适配器会自动匹配其底层的 `class_type`，即使未手动重命名 Title 依然能通过 Fallback 逻辑正确挂载！

通过这一设计，本系统成功将复杂的深度学习图像工作流降维成高度模块化、通过 Title 即挂即用的“微服务”，为多模态短视频创作带来了终极的灵活性与可扩展性！
