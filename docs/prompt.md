


增加视频翻译功能，导入视频，使用ffmpeg extract第一帧作为cover,然后使用ffmpeg extract mp3,使用qwen3-asr-api从mp3中提取srt字幕，然后转换成ass格式，将翻译成英文保存成新的字幕文件，使用qwen3-tts生成新的音频，使用ltx2.3 lipsync功能将mp3合成新的翻译视频。


