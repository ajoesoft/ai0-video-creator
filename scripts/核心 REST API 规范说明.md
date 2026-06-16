
1. 图像生成推理接口（POST /api/generate）
输入 JSON 荷载格式：

```json
{
  "prompt": "highly detailed watercolor illustration, a futuristic neon workshop, 8k resolution, cinematic lighting",
  "negative_prompt": "blurry, low quality, distorted anatomy, text signatures",
  "width": 512,
  "height": 512,
  "steps": 4,
  "cfg_scale": 1.0,
  "seed": -1,
  "output_dir": "./output"
}
```


接口输出 JSON 格式：
```json
{
  "status": "success",
  "output_path": "/workspace/output/image_1718361254_1067201.png",
  "filename": "image_1718361254_1067201.png",
  "seed": 1067201,
  "elapsed_seconds": 3.42,
  "message": "Image rendered successfully"
}
```


自编模型直接下载接口（POST /api/download）
输入 JSON 荷载格式：


```json
{
  "repo_id": "zimageturbo/z-image-turbo",
  "filename": "z-image-turbo-Q5_K_S.gguf",
  "source": "huggingface",
  "local_dir": "./models"
}
```

极速部署运行步骤
当确认本地环境已准备完毕，请在项目主控制后台执行以下简单命令（已为您在后台赋予完备权限）：
启动环境初始化与服务拉起：

```bash
chmod +x ./scripts/setup_gguf_service.sh
./scripts/setup_gguf_service.sh
```


运行机制解析：此程序会自动通过 GitHub 下载 python-build-standalone、自动构建隔离 venv、利用 pip 部署全部高阶依赖包、从 HF 镜像拉取 z-image-turbo-Q5_K_S.gguf 数据库模型，最后开机自检并在 http://0.0.0.0:3001 正式拉起 REST API 推理服务器。

