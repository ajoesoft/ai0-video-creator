

解决不能播放视频问题，不能播放以assets://localhost/开头资源问题，
错误如下：
[Error] Failed to load resource: The URL can’t be shown (/data/workflow/workspace/word/6ebafe61-d8a9-44dc-a578-48194265f635/video/scene_4.mp4, line 0)

将workspacePrefix设置成当前目录下workspace，可以从参数配置进行工作空间配置。更改mp3等audio播放,处理assets://localhost/的资源播放问题。



增加ComfyUI的ai0-LTX-2.3-All-In-One-api.txt调用，通过参数设置Select Your option，1.实现文生视频、2.音频到视频、3.图片到视频(+音频)、4.口型同步(图片+音频到视频+音频)
5. 始末帧到视频(+音频)、6.Style transfer(视频移动控制)，生成6个适应功能有需要的不同参数函数提供给前端调用。


完善script synthesis 的build all speech,asr transcription,translate,synthesize speech,使用ai0-video-creator-Qwen3 ASR 3.0-api完成asr语音转义，使用ai0-HY-MT20-translation-api.txt进行翻译，使用ai0-qwen-tts-voice-allinone-api.txt进行语音生成，生成的相关信息插入数据库，包括:脚本,audio-file,asr的文本,翻译的文本，生成后，写入数据库。
ai0-qwen-tts-voice-allinone-api.txt
ai0-HY-MT20-translation-api.txt
ai0-LTX-2.3-All-In-One-api.txt
ai0-video-subtitle-api.txt




增加视频翻译功能，导入视频，使用ffmpeg extract第一帧作为cover,然后使用ffmpeg extract mp3,使用qwen3-asr-api从mp3中提取srt字幕，然后转换成ass格式，将翻译成英文保存成新的字幕文件，使用qwen3-tts生成新的音频，使用ltx2.3 lipsync功能将mp3合成新的翻译视频。


