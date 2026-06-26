import React, { useState, useEffect } from 'react';
import { 
  Play, 
  Clock, 
  Trash2, 
  ListOrdered, 
  Cpu, 
  Plus, 
  Loader2, 
  AlertCircle, 
  CheckCircle, 
  HelpCircle, 
  RefreshCw, 
  Sparkles, 
  ChevronRight, 
  X, 
  Calendar, 
  CornerDownRight, 
  Compass,
  FileText,
  Mic2,
  Video,
  Image as ImageIcon
} from 'lucide-react';
import { cn } from '@/src/lib/utils';
import { motion, AnimatePresence } from 'motion/react';
import { fetchBackgroundTasks, deleteBackgroundTask, clearCompletedTasks, updateBackgroundTask, fetchProjects } from '../lib/db';
import { queueWorker } from '../lib/queueWorker';
import { BackgroundTask, TaskStatus, TaskType, VideoProject } from '../types';

export function QueueManager() {
  const [tasks, setTasks] = useState<BackgroundTask[]>([]);
  const [projects, setProjects] = useState<VideoProject[]>([]);
  const [activeFormTab, setActiveFormTab] = useState<TaskType>(TaskType.T2I);
  
  // New Task Form states
  const [projectId, setProjectId] = useState<string>('');
  const [taskName, setTaskName] = useState<string>('');
  const [priority, setPriority] = useState<number>(0);
  
  // Timing / Schedule state
  const [isScheduled, setIsScheduled] = useState<boolean>(false);
  const [scheduleDelaySeconds, setScheduleDelaySeconds] = useState<number>(60);
  const [customDateTime, setCustomDateTime] = useState<string>('');

  // Form parameter states
  const [t2iPrompt, setT2iPrompt] = useState<string>('在赛博朋克废墟边缘，一个身穿 @盔甲_IP 的少女在雨中俯瞰城市。');
  const [t2iEngine, setT2iEngine] = useState<string>('z-image-turbo');
  const [t2vPrompt, setT2vPrompt] = useState<string>('A high-fidelity panoramic camera sweep, showing @主角 walking gracefully through the glowing forest.');
  const [t2vDuration, setT2vDuration] = useState<number>(4);
  const [i2vImage, setI2vImage] = useState<string>('');
  const [i2vPrompt, setI2vPrompt] = useState<string>('Make the background waterfall move dynamically, photorealistic LTX render');
  const [lipsyncAvatar, setLipsyncAvatar] = useState<string>('');
  const [lipsyncAudio, setLipsyncAudio] = useState<string>('');
  const [ttsText, setTtsText] = useState<string>('你好，欢迎使用 Tauri 智能后台队列任务管理器进行重配运算。');
  const [ttsVoice, setTtsVoice] = useState<string>('Lily (温润播音)');

  // Selected item payload inspection modal state
  const [selectedTask, setSelectedTask] = useState<BackgroundTask | null>(null);

  // Stats Counters
  const [stats, setStats] = useState({
    total: 0,
    pending: 0,
    running: 0,
    completed: 0,
    failed: 0,
    scheduled: 0,
  });

  // Subscribe to real-time events on mount
  useEffect(() => {
    const unsubscribe = queueWorker.subscribe((freshTasks) => {
      setTasks(freshTasks);
      
      // Calculate Stats
      const now = Date.now();
      const currentStats = {
        total: freshTasks.length,
        pending: freshTasks.filter(t => t.status === TaskStatus.PENDING && (!t.scheduledAt || t.scheduledAt <= now)).length,
        running: freshTasks.filter(t => t.status === TaskStatus.RUNNING).length,
        completed: freshTasks.filter(t => t.status === TaskStatus.COMPLETED).length,
        failed: freshTasks.filter(t => t.status === TaskStatus.FAILED).length,
        scheduled: freshTasks.filter(t => t.status === TaskStatus.PENDING && t.scheduledAt && t.scheduledAt > now).length,
      };
      setStats(currentStats);
    });

    // Load projects to select from
    fetchProjects().then(projs => {
      setProjects(projs);
      if (projs.length > 0) {
        setProjectId(projs[0].id);
      }
    });

    return () => unsubscribe();
  }, []);

  const handleCreateTaskSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    let finalParams: Record<string, any> = {};
    let finalType: TaskType = activeFormTab;
    let fallbackName = '';

    // Calculate Scheduled Time
    let finalScheduledAt: number | undefined;
    if (isScheduled) {
      if (customDateTime) {
        finalScheduledAt = new Date(customDateTime).getTime();
      } else {
        finalScheduledAt = Date.now() + (scheduleDelaySeconds * 1000);
      }
    }

    switch (activeFormTab) {
      case TaskType.T2I:
        finalParams = {
          prompt: t2iPrompt,
          isTurbo: t2iEngine.includes('turbo'),
          localPath: `renders/t2i_task_${Date.now()}.png`
        };
        fallbackName = `文生图: ${t2iPrompt.substring(0, 20)}...`;
        break;

      case TaskType.T2V:
        finalParams = {
          prompt: t2vPrompt,
          duration: t2vDuration,
          fps: 24,
          width: 768,
          height: 432
        };
        fallbackName = `文生视频: ${t2vPrompt.substring(0, 20)}...`;
        break;

      case TaskType.I2V:
        finalParams = {
          image1: i2vImage || 'mock_face_base.png',
          prompt: i2vPrompt,
          duration: 4
        };
        fallbackName = `图生视频: ${i2vPrompt.substring(0, 20)}...`;
        break;

      case TaskType.LIPSYNC:
        finalParams = {
          image1: lipsyncAvatar || 'mock_character_head.png',
          audio: lipsyncAudio || 'mock_voice_lines.mp3',
          prompt: 'highly accurate face lip alignment'
        };
        fallbackName = `高精口型同步 (LipSync)`;
        break;

      case TaskType.TTS:
        finalParams = {
          text: ttsText,
          voicePrompt: ttsVoice,
          language: '中文'
        };
        fallbackName = `Qwen语音克隆: ${ttsText.substring(0, 20)}...`;
        break;
    }

    try {
      await queueWorker.enqueue({
        projectId: projectId || 'global',
        name: taskName.trim() || fallbackName,
        type: finalType,
        params: finalParams,
        scheduledAt: finalScheduledAt,
        priority: Number(priority),
      });

      // Show temporary HUD toast or feedback
      setTaskName('');
      setIsScheduled(false);
    } catch (err) {
      console.error("Queue Form Dispatch Failure:", err);
    }
  };

  const handleCancelTask = async (id: string) => {
    await queueWorker.cancelTask(id);
  };

  const handleDeleteTask = async (id: string) => {
    await deleteBackgroundTask(id);
    const updated = await fetchBackgroundTasks();
    // Simulate direct dispatch to sync
    queueWorker.start();
  };

  const handleClearHistory = async () => {
    if (confirm("Are you sure you want to purge finished/cancelled tasks? (确定要清除所有已完成、已失败或已撤销的任务历史吗？)")) {
      await clearCompletedTasks();
      queueWorker.start();
    }
  };

  const handleRequeueTask = async (task: BackgroundTask) => {
    let oldParams = {};
    try {
      oldParams = JSON.parse(task.params);
    } catch(e){}

    await queueWorker.enqueue({
      projectId: task.projectId,
      name: `${task.name} (Re-queued)`,
      type: task.type,
      params: oldParams,
      priority: task.priority
    });
  };

  return (
    <div className="p-8 space-y-8 animate-fadeIn max-w-[1700px] mx-auto pb-24">
      
      {/* Header Banner */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-white/5 pb-6">
        <div className="space-y-1">
          <div className="flex items-center gap-2.5">
            <Cpu className="w-5 h-5 text-brand-primary animate-pulse" />
            <span className="mono-text text-[10px] uppercase font-bold tracking-widest text-[#9f9fb2]">Computing Core Cluster</span>
          </div>
          <h2 className="text-2xl font-bold text-white tracking-tight flex items-center gap-2">
            分布式异步任务队列管理器 <span className="font-mono text-xs text-brand-primary bg-brand-primary/10 px-2 py-0.5 rounded border border-brand-primary/20">Unified Task Control Center</span>
          </h2>
          <p className="text-xs text-white/40 leading-relaxed max-w-[850px]">
            统一调度 AI Studio 体系内所有的重型多模态运算进程（包括TTS克隆、Qwen-ASR、SDXL/Flux图文绘制、LTX-Video大模型渲染以及高精准 LipSync 角色对齐等）。
            通过多优先级队列和定时启动机制，在后台平滑排队执行，确保单卡/多卡高功率硬件计算资源利用率拉满，绝不起始卡死或产生超 VRAM 崩溃。
          </p>
        </div>

        <div className="flex items-center gap-3">
          <button 
            onClick={handleClearHistory}
            className="px-4 py-2.5 bg-white/5 hover:bg-red-500/10 text-white/50 border border-white/5 hover:border-red-500/20 hover:text-red-400 font-mono text-xs font-bold uppercase tracking-wider rounded transition-all flex items-center gap-1.5"
          >
            <Trash2 className="w-3.5 h-3.5" />
            <span>清除计算历史 (Purge Records)</span>
          </button>
        </div>
      </div>

      {/* Numerical Metrics Dashboard widget */}
      <div className="grid grid-cols-2 lg:grid-cols-6 gap-4">
        
        <div className="bg-[#0b0b0d] border border-white/5 p-4 rounded-md space-y-1 relative overflow-hidden group">
          <div className="absolute top-0 right-0 p-3 opacity-5 pointer-events-none group-hover:scale-110 transition-transform">
            <ListOrdered className="w-12 h-12 text-white" />
          </div>
          <p className="text-[10px] font-mono text-white/40 uppercase tracking-wider">总登记任务 / Total</p>
          <p className="text-2xl font-bold font-mono tracking-tight text-white">{stats.total}</p>
          <span className="text-[9px] text-white/30 block">排队生命期内总量统计</span>
        </div>

        <div className="bg-[#0b0b0d] border border-white/5 p-4 rounded-md space-y-1 relative overflow-hidden group">
          <div className="absolute top-0 right-0 p-3 opacity-5 pointer-events-none bg-blue-400/20 rounded-bl-full" />
          <p className="text-[10px] font-mono text-blue-400 uppercase tracking-wider">进行中 / Running</p>
          <div className="flex items-center gap-2">
            <p className="text-2xl font-bold font-mono tracking-tight text-blue-400">{stats.running}</p>
            {stats.running > 0 && <Loader2 className="w-5 h-5 animate-spin text-blue-400" />}
          </div>
          <span className="text-[9px] text-blue-400/50 block">正在计算管线中运转</span>
        </div>

        <div className="bg-[#0b0b0d] border border-white/5 p-4 rounded-md space-y-1 relative overflow-hidden group">
          <div className="absolute top-0 right-0 p-3 opacity-5 pointer-events-none bg-yellow-400/25 rounded-bl-full" />
          <p className="text-[10px] font-mono text-yellow-300 uppercase tracking-wider">就绪等待 / Pending</p>
          <p className="text-2xl font-bold font-mono tracking-tight text-yellow-300">{stats.pending}</p>
          <span className="text-[9px] text-yellow-300/50 block">队列待决，按优先级触发</span>
        </div>

        <div className="bg-[#0b0b0d] border border-white/5 p-4 rounded-md space-y-1 relative overflow-hidden group">
          <div className="absolute top-0 right-0 p-3 opacity-5 pointer-events-none bg-orange-400/25 rounded-bl-full" />
          <p className="text-[10px] font-mono text-orange-400 uppercase tracking-wider">定时规划 / Scheduled</p>
          <div className="flex items-center gap-1.5">
            <p className="text-2xl font-bold font-mono tracking-tight text-orange-400">{stats.scheduled}</p>
            <Clock className="w-4 h-4 text-orange-400 animate-pulse" />
          </div>
          <span className="text-[9px] text-orange-400/50 block">时钟未达延迟或克隆定时</span>
        </div>

        <div className="bg-[#0b0b0d] border border-white/5 p-4 rounded-md space-y-1 relative overflow-hidden group">
          <div className="absolute top-0 right-0 p-3 opacity-5 pointer-events-none bg-green-400/25 rounded-bl-full" />
          <p className="text-[10px] font-mono text-green-400 uppercase tracking-wider">计算成功 / Completed</p>
          <p className="text-2xl font-bold font-mono tracking-tight text-green-400">{stats.completed}</p>
          <span className="text-[9px] text-green-400/50 block">完美渲染并存储至本地</span>
        </div>

        <div className="bg-[#0b0b0d] border border-white/5 p-4 rounded-md space-y-1 relative overflow-hidden group">
          <div className="absolute top-0 right-0 p-3 opacity-5 pointer-events-none bg-red-400/25 rounded-bl-full" />
          <p className="text-[10px] font-mono text-red-400 uppercase tracking-wider">意外错误 / Failed</p>
          <p className="text-2xl font-bold font-mono tracking-tight text-red-400">{stats.failed}</p>
          <span className="text-[9px] text-red-400/50 block">发生故障中止排队</span>
        </div>

      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
        
        {/* Left Column: Formulate Task Creation Panel (5 cols) */}
        <div className="lg:col-span-5 space-y-6">
          
          <form onSubmit={handleCreateTaskSubmit} className="bg-white/[0.02] border border-white/5 rounded-md p-6 space-y-6 relative">
            <div className="absolute -top-3.5 left-4 px-2.5 py-1 bg-brand-primary text-black font-mono text-[9px] font-bold uppercase tracking-widest rounded-sm shadow-md">
              Formulate Task Playbook
            </div>

            <div className="space-y-4 pt-2">
              {/* Target Project Selection */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="text-[9px] font-mono text-white/50 uppercase block tracking-wider font-semibold">
                    1. 关联剧本项目 (Target Project)
                  </label>
                  <select
                    value={projectId}
                    onChange={(e) => setProjectId(e.target.value)}
                    className="w-full bg-black border border-white/10 text-xs text-white rounded px-3 py-2.5 focus:outline-none focus:border-brand-primary font-mono"
                  >
                    <option value="global" className="text-black bg-white">-- 全局通用 (Global Space) --</option>
                    {projects.map(p => (
                      <option key={p.id} value={p.id} className="text-black bg-white">{p.name} ({p.sceneType})</option>
                    ))}
                  </select>
                </div>

                <div className="space-y-1">
                  <label className="text-[9px] font-mono text-white/50 uppercase block tracking-wider font-semibold">
                    2. 分级优先级 (Priority Queue Weight)
                  </label>
                  <input
                    type="number"
                    min="0"
                    max="100"
                    value={priority}
                    onChange={(e) => setPriority(Number(e.target.value))}
                    className="w-full bg-black border border-white/10 text-xs text-white rounded px-3 py-2 focus:outline-none focus:border-brand-primary font-mono"
                    placeholder="0 = Default Low"
                  />
                </div>
              </div>

              {/* Task Custom Name Input */}
              <div className="space-y-1">
                <label className="text-[9px] font-mono text-white/50 uppercase block tracking-wider font-semibold">
                  3. 任务自定义标识名 (Identify Name)
                </label>
                <input
                  type="text"
                  value={taskName}
                  onChange={(e) => setTaskName(e.target.value)}
                  placeholder="e.g. 故事第一幕 Flux 主角高姿态渲染 (可选)"
                  className="w-full bg-black border border-white/10 text-xs text-white rounded px-3 py-2 focus:outline-none focus:border-brand-primary font-mono placeholder-white/20"
                />
              </div>

              {/* Timing triggers scheduler (Delayed / instant toggle) */}
              <div className="p-4 bg-black/40 border border-white/5 rounded-md space-y-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Clock className="w-4 h-4 text-brand-primary" />
                    <span className="text-xs font-bold text-white font-mono">定时规划排队 (Schedule Trigger Configuration)</span>
                  </div>
                  <input 
                    type="checkbox"
                    checked={isScheduled} 
                    onChange={(e) => setIsScheduled(e.target.checked)}
                    className="w-4 h-4 text-brand-primary bg-black border-white/10 rounded focus:ring-brand-primary"
                  />
                </div>

                {isScheduled && (
                  <motion.div 
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: 'auto' }}
                    className="space-y-3 font-mono text-[10px] text-white/60 border-t border-white/5 pt-3"
                  >
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      <div className="space-y-1">
                        <label className="text-[8px] text-white/40 block">秒级延迟排队 (Delay Trigger In Seconds)</label>
                        <input
                          type="number"
                          value={scheduleDelaySeconds}
                          onChange={(e) => setScheduleDelaySeconds(Number(e.target.value))}
                          className="w-full bg-black border border-white/10 font-mono text-xs text-white p-2"
                        />
                      </div>
                      <div className="space-y-1">
                        <label className="text-[8px] text-white/40 block">或指定具体运行时刻 (Specific Time)</label>
                        <input
                          type="datetime-local"
                          value={customDateTime}
                          onChange={(e) => setCustomDateTime(e.target.value)}
                          className="w-full bg-black border border-white/10 font-mono text-[9px] text-white p-1.5 focus:outline-none"
                        />
                      </div>
                    </div>
                    <span className="text-[8px] text-[#f43f5e] block uppercase font-bold leading-tight">! 注意: 当启动后，该任务只有在本地到达指定时间戳后才会被提取进 GPU 计算管道。</span>
                  </motion.div>
                )}
              </div>

              {/* Task category selector & Sub form Tabs */}
              <div className="space-y-2 pt-2">
                <label className="text-[10px] font-mono text-white/40 uppercase block tracking-wider font-semibold">
                  Select Task Sub-pipeline Architecture:
                </label>
                <div className="grid grid-cols-3 md:grid-cols-5 gap-1 bg-black/40 p-1 border border-white/5 rounded">
                  {[
                    { type: TaskType.T2I, label: 'T2I 图', icon: ImageIcon },
                    { type: TaskType.T2V, label: 'T2V 影', icon: Video },
                    { type: TaskType.I2V, label: 'I2V 画', icon: Compass },
                    { type: TaskType.LIPSYNC, label: 'LipSync 对', icon: FileText },
                    { type: TaskType.TTS, label: 'TTS 语', icon: Mic2 },
                  ].map((tab) => {
                    const Icon = tab.icon;
                    return (
                      <button
                        key={tab.type}
                        type="button"
                        onClick={() => setActiveFormTab(tab.type)}
                        className={cn(
                          "py-1.5 rounded text-[10px] font-mono font-bold uppercase transition-all flex flex-col items-center gap-1.5 justify-center",
                          activeFormTab === tab.type 
                            ? "bg-brand-primary text-black font-extrabold" 
                            : "text-white/45 hover:text-white"
                        )}
                      >
                        <Icon className="w-3.5 h-3.5" />
                        <span>{tab.label}</span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Active Sub-parameter inputs mapping */}
              <div className="p-4 bg-black/20 border border-white/5 rounded-md">
                {activeFormTab === TaskType.T2I && (
                  <div className="space-y-3">
                    <div className="space-y-1">
                      <label className="text-[9px] font-mono text-white/40 block">T2I 扩散大模型提示词 (Image Generation Prompt)</label>
                      <textarea
                        value={t2iPrompt}
                        onChange={(e) => setT2iPrompt(e.target.value)}
                        rows={3}
                        className="w-full bg-black border border-white/10 rounded font-mono text-xs text-white p-2 focus:outline-none resize-none"
                      />
                      <span className="text-[8px] text-brand-primary block leading-tight font-mono">
                        💡 引擎将在计算开始时全自动匹配并应用 IP 一致性 Prompt Harness 对其展开！
                      </span>
                    </div>
                    <div className="space-y-1">
                      <label className="text-[8px] font-mono text-white/40 block">基础推理模型引擎选择</label>
                      <select 
                        value={t2iEngine} 
                        onChange={(e) => setT2iEngine(e.target.value)}
                        className="w-full bg-black border border-white/10 font-mono text-xs text-white p-2"
                      >
                        <option value="z-image-turbo" className="text-black bg-white">Z-Image-Turbo (极致超快 Turbo, 8步渲染)</option>
                        <option value="qwen-image-2512" className="text-black bg-white">Qwen-Image-2512 (高清闪电 Lightning, 4步渲染)</option>
                      </select>
                    </div>
                  </div>
                )}

                {activeFormTab === TaskType.T2V && (
                  <div className="space-y-3">
                    <div className="space-y-1">
                      <label className="text-[9px] font-mono text-white/40 block">T2V 生成分镜指令 (Text-to-Video LTX-2.3 Engine Prompt)</label>
                      <textarea
                        value={t2vPrompt}
                        onChange={(e) => setT2vPrompt(e.target.value)}
                        rows={3}
                        className="w-full bg-black border border-white/10 rounded font-mono text-xs text-white p-2 focus:outline-none resize-none"
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="text-[8px] font-mono text-white/40 block">生成视频持续时长 (Scene Duration In Secs)</label>
                      <input
                        type="number"
                        value={t2vDuration}
                        onChange={(e) => setT2vDuration(Number(e.target.value))}
                        className="w-full bg-black border border-white/10 font-mono text-xs text-white p-2"
                      />
                    </div>
                  </div>
                )}

                {activeFormTab === TaskType.I2V && (
                  <div className="space-y-3">
                    <div className="space-y-1">
                      <label className="text-[9px] font-mono text-white/40 block">基底图像路径/URL (Base Image Address)</label>
                      <input
                        type="text"
                        value={i2vImage}
                        onChange={(e) => setI2vImage(e.target.value)}
                        placeholder="e.g. workspace_root/t2i_gen_output_1.png"
                        className="w-full bg-black border border-white/10 font-mono text-xs text-white p-2"
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="text-[9px] font-mono text-white/40 block">分镜演变动态指令 (Evolution Dynamics Prompt)</label>
                      <textarea
                        value={i2vPrompt}
                        onChange={(e) => setI2vPrompt(e.target.value)}
                        rows={2}
                        className="w-full bg-black border border-white/10 rounded font-mono text-xs text-white p-2 focus:outline-none resize-none"
                      />
                    </div>
                  </div>
                )}

                {activeFormTab === TaskType.LIPSYNC && (
                  <div className="space-y-3">
                    <div className="space-y-1">
                      <label className="text-[9px] font-mono text-white/40 block">人脸头像图片源 (Avatar Face Image path)</label>
                      <input
                        type="text"
                        value={lipsyncAvatar}
                        onChange={(e) => setLipsyncAvatar(e.target.value)}
                        placeholder="e.g. C:\comfyui_project\character_avatar.jpg"
                        className="w-full bg-black border border-white/10 font-mono text-xs text-white p-2"
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="text-[9px] font-mono text-white/40 block">配音音频源文件 (Speech Audio path)</label>
                      <input
                        type="text"
                        value={lipsyncAudio}
                        onChange={(e) => setLipsyncAudio(e.target.value)}
                        placeholder="e.g. C:\comfyui_project\output_tts.mp3"
                        className="w-full bg-black border border-white/10 font-mono text-xs text-white p-2"
                      />
                    </div>
                  </div>
                )}

                {activeFormTab === TaskType.TTS && (
                  <div className="space-y-3">
                    <div className="space-y-1">
                      <label className="text-[9px] font-mono text-white/40 block">TTS 文本转配音正文 (Synthesis Context Text)</label>
                      <textarea
                        value={ttsText}
                        onChange={(e) => setTtsText(e.target.value)}
                        rows={3}
                        className="w-full bg-black border border-white/10 rounded font-mono text-xs text-white p-2 focus:outline-none resize-none"
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="text-[8px] font-mono text-white/40 block">克隆角色或配音模板 (Reference Cloner Design)</label>
                      <input
                        type="text"
                        value={ttsVoice}
                        onChange={(e) => setTtsVoice(e.target.value)}
                        placeholder="e.g. Lily or Max or reference_audio.wav"
                        className="w-full bg-black border border-white/10 font-mono text-xs text-white p-2"
                      />
                    </div>
                  </div>
                )}

              </div>

            </div>

            {/* Submitting button */}
            <button
              type="submit"
              className="w-full py-3 bg-brand-primary hover:bg-white text-black font-mono text-xs font-bold uppercase tracking-wider rounded transition-all active:scale-95 duration-150 flex items-center justify-center gap-2 cursor-pointer"
            >
              <Plus className="w-4 h-4 stroke-[3px]" />
              <span>推入后台算力队列 (Enqueue Task)</span>
            </button>
          </form>

          {/* Quick Informative guidelines */}
          <div className="bg-black/40 border border-white/5 p-5 rounded-md space-y-3 font-mono text-[11px] text-white/50 leading-relaxed">
            <h4 className="text-xs font-bold text-white uppercase tracking-wider flex items-center gap-1.5 pb-2 border-b border-white/5">
              <HelpCircle className="w-4 h-4 text-brand-primary" />
              <span>排队与算力说明 (Queue Policy Docs)</span>
            </h4>
            <p>
              1. <strong>单队列排队 (Single-queue Serialism)</strong>: 为最大程度降低大模型瞬间耗尽显卡 VRAM 的风险，所有任务序列都将按照优先级排序，逐一在后台串行提交。
            </p>
            <p>
              2. <strong>智能 Harness 一致性注入</strong>: 系统集成 IP 触发技术。对于文生图与图生视频任务，若剧本文本包含已定义的 Trigger "@角色"，我们将在调用 Comfy 扩散模块的瞬间自动将关联高保真特征提示词贴合进去。
            </p>
            <p>
              3. <strong>定时任务与时钟轮</strong>: 设定为定时的任务将持状态 <code>pending</code> 挂起。只有当时钟检测到本地时间达到计划阈值，才会将其放入就绪队列激活执行。
            </p>
          </div>

        </div>

        {/* Right Column: Reactive real-time queue listings (7 cols) */}
        <div className="lg:col-span-7 space-y-4">
          
          <div className="bg-[#0b0b0d] border border-white/5 rounded-md p-6 space-y-4">
            
            <div className="flex items-center justify-between border-b border-white/5 pb-4">
              <div className="space-y-0.5">
                <h3 className="text-sm font-bold text-white uppercase tracking-wider font-mono">
                  活跃任务调配池 (Real-time Compute Queue Pool)
                </h3>
                <p className="text-[10px] text-white/40">列举所有生命期内的 pending, running, completed, cancelled, failed 状态实体</p>
              </div>
              <div className="flex items-center gap-2">
                <span className="px-2 py-0.5 bg-brand-primary/10 text-brand-primary border border-brand-primary/20 rounded font-mono text-[9px] font-bold">
                  SEQUENCE MODE
                </span>
              </div>
            </div>

            {tasks.length === 0 ? (
              <div className="py-24 border border-dashed border-white/5 rounded text-center space-y-3 text-white/30">
                <Cpu className="w-10 h-10 mx-auto animate-pulse text-zinc-600" />
                <div className="space-y-1">
                  <p className="text-xs font-mono">调配池暂无正在计算的项目记录。</p>
                  <p className="text-[10px] text-white/20">您可以使用左侧的模板配置测试快速派发任务排队运行。</p>
                </div>
              </div>
            ) : (
              <div className="space-y-3 max-h-[750px] overflow-y-auto custom-scrollbar pr-1">
                <AnimatePresence initial={false}>
                  {tasks.map((task, index) => {
                    const isScheduledTimeInFuture = task.scheduledAt && task.scheduledAt > Date.now();
                    return (
                      <motion.div
                        key={task.id}
                        layoutId={`task-${task.id}`}
                        initial={{ opacity: 0, y: 15 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, scale: 0.95 }}
                        className={cn(
                          "p-4 border rounded relative overflow-hidden transition-all duration-200",
                          task.status === TaskStatus.RUNNING
                            ? "bg-brand-primary/5 border-brand-primary/40 shadow-lg shadow-brand-primary/5"
                            : task.status === TaskStatus.COMPLETED
                            ? "bg-green-500/[0.01] border-green-500/20"
                            : task.status === TaskStatus.FAILED
                            ? "bg-red-500/[0.01] border-red-500/20"
                            : isScheduledTimeInFuture
                            ? "bg-orange-500/[0.01] border-orange-500/25"
                            : "bg-white/[0.01] border-white/5 hover:border-white/10"
                        )}
                      >
                        {/* Priority ribbon badge */}
                        {task.priority > 0 && (
                          <div className="absolute top-0 right-0 bg-yellow-400 font-mono text-[7px] text-black px-1.5 py-0.5 uppercase font-extrabold rounded-bl">
                            PRIORITY {task.priority}
                          </div>
                        )}

                        <div className="flex items-start justify-between gap-4">
                          
                          {/* Left Column: Icons & basic labels */}
                          <div className="space-y-2 flex-grow">
                            <div className="flex flex-wrap items-center gap-2">
                              {/* Task Type badge label */}
                              <span className={cn(
                                "text-[9px] font-mono font-bold uppercase tracking-widest px-2 py-0.5 rounded",
                                task.type === TaskType.T2I ? "bg-cyan-500/10 text-cyan-400 border border-cyan-500/20" :
                                task.type === TaskType.T2V ? "bg-indigo-500/10 text-indigo-400 border border-indigo-500/20" :
                                task.type === TaskType.I2V ? "bg-purple-500/10 text-purple-400 border border-purple-500/20" :
                                task.type === TaskType.LIPSYNC ? "bg-amber-500/10 text-amber-400 border border-amber-500/20" :
                                "bg-teal-500/10 text-teal-400 border border-teal-500/20"
                              )}>
                                {task.type}
                              </span>

                              {/* Task Name */}
                              <h4 className="text-xs font-bold text-white truncate max-w-[280px]" title={task.name}>
                                {task.name}
                              </h4>

                              {/* Project ID */}
                              <span className="text-[9px] font-mono text-white/35 bg-white/5 px-1.5 py-0.5 rounded">
                                proj: {task.projectId === 'global' ? 'Global' : task.projectId.substring(0, 8)}
                              </span>
                            </div>

                            {/* Dynamic Param text teaser preview */}
                            <p className="text-[10px] font-mono text-white/40 leading-relaxed truncate max-w-[480px]">
                              {task.params}
                            </p>

                            {/* Dates triggers logs */}
                            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[9px] text-[#71717a] font-mono">
                              <span>Created: {new Date(task.createdAt).toLocaleTimeString()}</span>
                              {task.startedAt && <span>Started: {new Date(task.startedAt).toLocaleTimeString()}</span>}
                              {task.completedAt && <span>Finished: {new Date(task.completedAt).toLocaleTimeString()}</span>}
                              
                              {/* Scheduled delay date indication info */}
                              {task.scheduledAt && (
                                <span className="text-orange-400 flex items-center gap-1">
                                  <Calendar className="w-3 h-3" />
                                  Sched: {new Date(task.scheduledAt).toLocaleString()}
                                </span>
                              )}
                            </div>
                          </div>

                          {/* Right Column: Status & controls */}
                          <div className="flex flex-col items-end justify-between self-stretch flex-shrink-0 min-h-[70px]">
                            {/* Status Pill Badge */}
                            <div className="flex items-center gap-1.5">
                              {task.status === TaskStatus.PENDING && (
                                <span className={cn(
                                  "inline-flex items-center gap-1 px-2 py-0.5 rounded text-[8px] font-mono font-bold leading-none uppercase",
                                  isScheduledTimeInFuture 
                                    ? "bg-orange-500/10 text-orange-400 border border-orange-500/20 animate-pulse" 
                                    : "bg-yellow-500/10 text-yellow-500 border border-yellow-500/20"
                                )}>
                                  {isScheduledTimeInFuture ? '🕒 SCHEDULED' : 'WAITING'}
                                </span>
                              )}
                              {task.status === TaskStatus.RUNNING && (
                                <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-blue-500/10 text-blue-400 border border-blue-500/20 rounded text-[8px] font-mono font-bold leading-none uppercase animate-pulse">
                                  <Loader2 className="w-2.5 h-2.5 animate-spin" />
                                  RUNNING
                                </span>
                              )}
                              {task.status === TaskStatus.COMPLETED && (
                                <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-green-500/10 text-green-400 border border-green-500/20 rounded text-[8px] font-mono font-bold leading-none uppercase">
                                  <CheckCircle className="w-2.5 h-2.5" />
                                  SUCCESS
                                </span>
                              )}
                              {task.status === TaskStatus.FAILED && (
                                <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-red-500/10 text-red-500 border border-red-500/20 rounded text-[8px] font-mono font-bold leading-none uppercase">
                                  <AlertCircle className="w-2.5 h-2.5" />
                                  FAULT
                                </span>
                              )}
                              {task.status === TaskStatus.CANCELLED && (
                                <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-white/5 text-white/40 border border-white/5 rounded text-[8px] font-mono font-bold leading-none uppercase">
                                  CANCELLED
                                </span>
                              )}
                            </div>

                            {/* Action Options Buttons */}
                            <div className="flex items-center gap-1">
                              {/* Inspect Payload */}
                              <button
                                onClick={() => setSelectedTask(task)}
                                className="px-2 py-1 bg-white/5 hover:bg-white/10 text-[9px] text-white/50 hover:text-white rounded font-mono font-bold uppercase transition"
                                title="Inspect Params and Results"
                              >
                                View Log
                              </button>

                              {/* Requeue if failed/completed */}
                              {(task.status === TaskStatus.COMPLETED || task.status === TaskStatus.FAILED || task.status === TaskStatus.CANCELLED) && (
                                <button
                                  onClick={() => handleRequeueTask(task)}
                                  className="p-1 px-2 bg-brand-primary/10 hover:bg-brand-primary/20 text-brand-primary hover:text-white rounded font-mono text-[9px] font-bold uppercase transition flex items-center gap-1"
                                  title="Clone and Re-queue calculations"
                                >
                                  <RefreshCw className="w-2.5 h-2.5" />
                                  Re-run
                                </button>
                              )}

                              {/* Force Abort/Cancel */}
                              {(task.status === TaskStatus.PENDING || task.status === TaskStatus.RUNNING) && (
                                <button
                                  onClick={() => handleCancelTask(task.id)}
                                  className="px-2 py-1 bg-[#1a1012] hover:bg-red-500/15 text-red-400/75 hover:text-red-300 border border-red-500/10 rounded font-mono text-[9px] font-bold uppercase transition"
                                >
                                  Abort
                                </button>
                              )}

                              {/* Delete Completely from queue history */}
                              <button
                                onClick={() => handleDeleteTask(task.id)}
                                className="p-1 bg-white/5 hover:bg-red-500/15 text-[#71717a] hover:text-red-400 rounded transition border border-transparent hover:border-red-500/10"
                                title="Remove task from history"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          </div>

                        </div>

                        {/* Progress Bar (Visualizer tracker) */}
                        {(task.status === TaskStatus.RUNNING || (task.status === TaskStatus.PENDING && task.progress > 0)) && (
                          <div className="mt-3.5 space-y-1 animate-fadeIn">
                            <div className="flex justify-between items-center text-[9px] font-mono">
                              <span className="text-brand-primary/80 italic font-semibold">{task.error || 'Initializing compute cluster nodes...'}</span>
                              <span className="text-brand-primary font-bold">{task.progress}%</span>
                            </div>
                            <div className="w-full h-1 bg-[#1c1c24] rounded-full overflow-hidden">
                              <motion.div 
                                className="h-full bg-brand-primary" 
                                initial={{ width: '0%' }}
                                animate={{ width: `${task.progress}%` }}
                                transition={{ ease: 'easeOut' }}
                              />
                            </div>
                          </div>
                        )}

                        {/* Live failure inline error notification */}
                        {task.status === TaskStatus.FAILED && task.error && (
                          <div className="mt-2.5 p-2 bg-red-500/5 border border-red-500/10 rounded font-mono text-[9px] text-red-400">
                            <strong>Abort Log</strong>: {task.error}
                          </div>
                        )}
                      </motion.div>
                    );
                  })}
                </AnimatePresence>
              </div>
            )}

          </div>

        </div>

      </div>

      {/* SELECTED TASK DETAILED PAYLOAD INSPECTION PANEL (ANIMATED PORTAL MODAL) */}
      <AnimatePresence>
        {selectedTask && (
          <div className="fixed inset-0 bg-black/60 backdrop-blur-md flex items-center justify-center z-50 p-4">
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-[#09090b] border border-white/10 p-6 rounded-md shadow-2xl max-w-2xl w-full space-y-5"
            >
              {/* Modal header */}
              <div className="flex items-center justify-between border-b border-white/10 pb-3">
                <div className="space-y-0.5">
                  <span className="mono-text text-[9px] text-brand-primary tracking-widest font-bold uppercase">Task Payload Metadata</span>
                  <h3 className="text-sm font-mono font-bold text-white uppercase tracking-wider">
                    Task ID: #{selectedTask.id}
                  </h3>
                </div>
                <button
                  onClick={() => setSelectedTask(null)}
                  className="p-1.5 bg-white/5 hover:bg-white/10 text-white/50 hover:text-white rounded transition"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {/* Param Grid data */}
              <div className="space-y-4 font-mono text-[11px] leading-relaxed">
                
                <div className="grid grid-cols-2 gap-4 border-b border-white/5 pb-4">
                  <div className="space-y-1">
                    <span className="text-white/40 block">Task Name</span>
                    <span className="text-white font-bold">{selectedTask.name}</span>
                  </div>
                  <div className="space-y-1">
                    <span className="text-white/40 block">Assigned Priority weight</span>
                    <span className="text-yellow-400 font-bold">{selectedTask.priority} / 100</span>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4 border-b border-white/5 pb-4">
                  <div className="space-y-1">
                    <span className="text-white/40 block">Active Status</span>
                    <span className={cn(
                      "font-bold uppercase",
                      selectedTask.status === TaskStatus.RUNNING ? "text-blue-400" :
                      selectedTask.status === TaskStatus.COMPLETED ? "text-green-400" :
                      selectedTask.status === TaskStatus.FAILED ? "text-red-400" :
                      "text-white/50"
                    )}>{selectedTask.status}</span>
                  </div>
                  <div className="space-y-1">
                    <span className="text-white/40 block">Timing (Timestamps)</span>
                    <span className="text-white/70 block">Created: {new Date(selectedTask.createdAt).toLocaleString()}</span>
                    {selectedTask.scheduledAt && <span className="text-orange-400 block">Sched: {new Date(selectedTask.scheduledAt).toLocaleString()}</span>}
                  </div>
                </div>

                {/* String Parameter Payload input JSON */}
                <div className="space-y-1">
                  <span className="text-white/40 block">Input Arguments Map (Params)</span>
                  <pre className="bg-black border border-white/5 p-3 rounded font-mono text-[10px] text-brand-primary leading-tight overflow-x-auto custom-scrollbar">
                    {JSON.stringify(JSON.parse(selectedTask.params), null, 2)}
                  </pre>
                </div>

                {/* Finalized Result JSON */}
                <div className="space-y-1 pt-1">
                  <span className="text-white/40 block">Computation Result Registry</span>
                  <pre className="bg-[#040405] border border-white/5 p-3 rounded font-mono text-[10px] text-green-400 leading-tight overflow-x-auto custom-scrollbar">
                    {selectedTask.result 
                      ? JSON.stringify(JSON.parse(selectedTask.result), null, 2)
                      : selectedTask.status === TaskStatus.RUNNING 
                      ? '"Calculation is active. Processing frame buffers..."' 
                      : '"Waiting in serial queue for execution resources..."'
                    }
                  </pre>
                </div>

                {selectedTask.error && (
                  <div className="p-3 bg-red-500/5 border border-red-500/10 rounded text-red-400 text-[10px]">
                    <strong>Abort Message details</strong>: {selectedTask.error}
                  </div>
                )}

              </div>

              {/* Close Button footer bar */}
              <div className="pt-3 border-t border-white/5 flex justify-end">
                <button
                  type="button"
                  onClick={() => setSelectedTask(null)}
                  className="px-4 py-2 bg-brand-primary text-black font-mono text-[10px] uppercase font-bold tracking-wider rounded"
                >
                  Close Drawer
                </button>
              </div>

            </motion.div>
          </div>
        )}
      </AnimatePresence>

    </div>
  );
}
