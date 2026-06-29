import { comfy } from './comfy';
import { 
  fetchBackgroundTasks, 
  createBackgroundTask, 
  updateBackgroundTask, 
  applyPromptHarnessRules 
} from './db';
import { BackgroundTask, TaskStatus, TaskType } from '../types';

type WorkerSubscriber = (tasks: BackgroundTask[]) => void;

class QueueWorkerManager {
  private isRunning: boolean = false;
  private currentTask: BackgroundTask | null = null;
  private subscribers: Set<WorkerSubscriber> = new Set();
  private intervalId: any = null;

  constructor() {
    // Start automated task check loop on client load
    if (typeof window !== 'undefined') {
      this.start();
    }
  }

  /**
   * Register a reactive UI subscriber to receive live queue listings
   */
  public subscribe(callback: WorkerSubscriber): () => void {
    this.subscribers.add(callback);
    // Trigger initial load
    this.refreshAndNotify();
    return () => {
      this.subscribers.delete(callback);
    };
  }

  /**
   * Notify all listeners with the freshest list of tasks
   */
  private async refreshAndNotify() {
    try {
      const tasks = await fetchBackgroundTasks();
      this.subscribers.forEach(cb => cb(tasks));
    } catch (err) {
      console.warn("Queue Worker notify error:", err);
    }
  }

  /**
   * Start the background polling loop (every 3 seconds)
   */
  public start() {
    if (this.intervalId) return;
    
    // Poll loop checks database for pending/scheduled items
    this.intervalId = setInterval(() => {
      this.tick();
    }, 3000);
    
    this.tick(); // Run immediate check
  }

  /**
   * Stop/terminate the active worker interval
   */
  public stop() {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
  }

  /**
   * Enqueue a new generation task into the manager
   */
  public async enqueue(payload: {
    projectId: string;
    name: string;
    type: TaskType;
    params: Record<string, any>;
    scheduledAt?: number; // Epoch timestamp (delayed if > Date.now())
    priority?: number; // Higher number means processed sooner
  }): Promise<BackgroundTask> {
    const taskData = {
      projectId: payload.projectId,
      name: payload.name,
      type: payload.type,
      status: TaskStatus.PENDING,
      params: JSON.stringify(payload.params),
      progress: 0,
      scheduledAt: payload.scheduledAt || null,
      priority: payload.priority || 0,
    };

    const created = await createBackgroundTask(taskData);
    this.refreshAndNotify();
    
    // Trigger asynchronous queue tick immediately
    setTimeout(() => this.tick(), 100);
    
    return created;
  }

  /**
   * Centralized single-step polling event
   */
  private async tick() {
    // If a task is already processing sequentially, do not spawn another
    if (this.isRunning) return;

    try {
      const allTasks = await fetchBackgroundTasks();
      const now = Date.now();

      // Find candidates: State is pending, and if scheduled, its trigger time has reached
      const candidates = allTasks.filter(t => {
        if (t.status !== TaskStatus.PENDING) return false;
        if (t.scheduledAt && t.scheduledAt > now) return false; // post-poned/scheduled
        return true;
      });

      if (candidates.length === 0) return;

      // Select top candidate based on priority first, then insertion time
      const nextTask = candidates[0]; // SQLite query automatically sorts by priority desc, created_at desc
      
      await this.runTask(nextTask);
    } catch (err) {
      console.error("Queue Worker tick execution error:", err);
      this.isRunning = false;
    }
  }

  /**
   * Core task runner
   */
  private async runTask(task: BackgroundTask) {
    this.isRunning = true;
    this.currentTask = task;

    console.log(`[QueueWorker] Executing Background Task: #${task.id} [${task.type}] - "${task.name}"`);

    try {
      // 1. Set status to RUNNING
      await updateBackgroundTask(task.id, {
        status: TaskStatus.RUNNING,
        startedAt: Date.now(),
        progress: 10
      });
      await this.refreshAndNotify();

      // Parse params
      let params: Record<string, any> = {};
      try {
        params = JSON.parse(task.params);
      } catch (e) {
        throw new Error("Invalid JSON parameter configuration.");
      }

      // 2. Resolve input text prompts with IP Consistency (Prompt Harness system) dynamically
      if (task.projectId) {
        if (params.prompt && typeof params.prompt === 'string') {
          console.log(`[QueueWorker] Apply Harness rules on visual input: "${params.prompt}"`);
          params.prompt = await applyPromptHarnessRules(params.prompt, task.projectId);
        }
        if (params.text && typeof params.text === 'string' && task.type === TaskType.T2I) {
          console.log(`[QueueWorker] Apply Harness rules on visual input: "${params.text}"`);
          params.text = await applyPromptHarnessRules(params.text, task.projectId);
        }
      }

      let executionResult: any = null;

      const progressCallback = async (msg: string) => {
        // Parse progress if contains percentage
        let progressNum = 30;
        const pctMatch = msg.match(/(\d+)%/);
        if (pctMatch) {
          progressNum = Math.min(Math.max(parseInt(pctMatch[1], 10), 10), 99);
        } else if (msg.toLowerCase().includes("processing") || msg.toLowerCase().includes("running")) {
          progressNum = 50;
        } else if (msg.toLowerCase().includes("saving") || msg.toLowerCase().includes("saving image")) {
          progressNum = 90;
        }

        await updateBackgroundTask(task.id, {
          progress: progressNum,
          error: msg // Hold latest status log in error/status field temporarily
        });
        this.refreshAndNotify();
      };

      // 3. Coordinate specific heavy calculating pipeline
      switch (task.type) {
        case TaskType.TTS: {
          // params: text, audioPath or voicePrompt, language
          if (!params.text) throw new Error("Missing 'text' input parameter for TTS extraction.");
          // If reference design voice prompt is provided, run advanced Qwen-TTS All In One
          if (params.voicePrompt) {
            const localAudioPath = params.audioPath || `tts_voice_qwen_${task.id}.mp3`;
            executionResult = await comfy.runQwenTTSVoiceAllInOneRust(
              params.text,
              params.voicePrompt,
              localAudioPath,
              params.language || "中文",
              progressCallback
            );
          } else {
            // Otherwise run standard dual-speaker reference cloned voice TTS
            const referenceAudio = params.refAudio || "max.mp3";
            executionResult = await comfy.runTTS(params.text, referenceAudio, progressCallback);
          }
          break;
        }

        case TaskType.ASR: {
          // params: audioPath
          if (!params.audioPath) throw new Error("Missing 'audioPath' input parameter for Automatic Speech Recognition.");
          const asrRes = await comfy.runASRQwen(params.audioPath, progressCallback);
          executionResult = asrRes.srtText;
          break;
        }

        case TaskType.AUDIO: {
          // params: text, whisperPrompt, language
          if (!params.text) throw new Error("Missing 'text' parameter.");
          executionResult = await comfy.runQwenTTSVoiceAllInOne(
            params.text,
            params.whisperPrompt || "",
            params.language || "中文",
            progressCallback
          );
          break;
        }

        case TaskType.T2I: {
          // params: prompt, localPath, isTurbo
          if (!params.prompt) throw new Error("Missing 'prompt' parameter for Text-to-Image.");
          const targetPath = params.localPath || `t2i_gen_output_${task.id}.png`;
          executionResult = await comfy.runImageGenerationRust(
            params.prompt,
            targetPath,
            !!params.isTurbo,
            progressCallback
          );
          break;
        }

        case TaskType.I2I: {
          // Image-to-Image fits in comfy workflow or customized diffuse rules
          if (!params.prompt || !params.imagePath) throw new Error("Missing 'prompt' or 'imagePath' for Image-to-Image Diffuse.");
          // Fallback to standard rust image diffuse rendering
          const targetPath = params.localPath || `i2i_output_${task.id}.png`;
          executionResult = await comfy.runImageGenerationRust(
            params.prompt,
            targetPath,
            false,
            progressCallback
          );
          break;
        }

        case TaskType.T2V: {
          // params: prompt, negativePrompt, duration, width, height, fps, seed
          if (!params.prompt) throw new Error("Missing text prompt for Video rendering.");
          executionResult = await comfy.runLTXTextToVideo({
            prompt: params.prompt,
            negativePrompt: params.negativePrompt,
            duration: params.duration,
            width: params.width,
            height: params.height,
            fps: params.fps,
            seed: params.seed
          }, progressCallback);
          break;
        }

        case TaskType.I2V: {
          // params: image1, audio, prompt, negativePrompt, duration, width, height, fps, seed
          if (!params.image1 || !params.prompt) throw new Error("Missing target baseline image or scene prompt.");
          executionResult = await comfy.runLTXImageToVideo({
            image1: params.image1,
            audio: params.audio,
            prompt: params.prompt,
            negativePrompt: params.negativePrompt,
            duration: params.duration,
            width: params.width,
            height: params.height,
            fps: params.fps,
            seed: params.seed
          }, progressCallback);
          break;
        }

        case TaskType.LIPSYNC: {
          // params: image1, audio, prompt, negativePrompt, duration, width, height, fps, seed
          if (!params.image1 || !params.audio) throw new Error("Missing face avatar image or vocal speech audio parameters.");
          executionResult = await comfy.runLTXLipSync({
            image1: params.image1,
            audio: params.audio,
            prompt: params.prompt || "highly realistic talking head sequence",
            negativePrompt: params.negativePrompt,
            duration: params.duration,
            width: params.width || 512,
            height: params.height || 512,
            fps: params.fps || 24,
            seed: params.seed
          }, progressCallback);
          break;
        }

        case TaskType.COMFY_WORKFLOW: {
          // Submit abstract raw comfy prompts directly if custom pipelines required
          if (!params.workflow) throw new Error("Missing raw 'workflow' JSON node data map.");
          const promptId = await comfy.submitPrompt(params.workflow);
          executionResult = await comfy.waitForCompletion(promptId, progressCallback);
          break;
        }

        default: {
          throw new Error(`Unsupported Task Type processor: '${task.type}'`);
        }
      }

      // 4. Mark Task is successfully COMPLETED
      await updateBackgroundTask(task.id, {
        status: TaskStatus.COMPLETED,
        progress: 100,
        result: JSON.stringify({ data: executionResult }),
        completedAt: Date.now(),
        error: undefined // Clean the log holds
      });
      console.log(`[QueueWorker] Task completed successfully: #${task.id}`);

      // Handle recurrence
      if (params.recurringIntervalSeconds && params.recurringIntervalSeconds > 0) {
        this.handleRecurrentReschedule(task, params);
      }

    } catch (err: any) {
      console.error(`[QueueWorker] Failed to run task #${task.id}:`, err);
      // Mark as FAILED with error message
      await updateBackgroundTask(task.id, {
        status: TaskStatus.FAILED,
        progress: 0,
        error: err?.message || err?.toString() || "Unknown pipeline generation abort."
      });

      // Parse parameters to check for recurrence on failure
      let params: Record<string, any> = {};
      try {
        params = JSON.parse(task.params);
      } catch (e) {}
      if (params.recurringIntervalSeconds && params.recurringIntervalSeconds > 0) {
        this.handleRecurrentReschedule(task, params);
      }
    } finally {
      this.isRunning = false;
      this.currentTask = null;
      await this.refreshAndNotify();
      
      // Auto pulse immediate checks for next candidate in queue
      setTimeout(() => this.tick(), 500);
    }
  }

  /**
   * Terminate/cancel an active or pending task
   */
  public async cancelTask(id: string) {
    if (this.currentTask?.id === id) {
      // If currently executing, we reset running lock
      this.isRunning = false;
      this.currentTask = null;
    }
    await updateBackgroundTask(id, {
      status: TaskStatus.CANCELLED,
      progress: 0,
      error: "Task cancelled/aborted by supervisor."
    });
    this.refreshAndNotify();
  }

  /**
   * Helper to schedule the next run of a recurrent task
   */
  private handleRecurrentReschedule(task: BackgroundTask, params: Record<string, any>) {
    console.log(`[QueueWorker] Task #${task.id} has recurrence every ${params.recurringIntervalSeconds}s. Spawning next run...`);
    const nextScheduledAt = Date.now() + (params.recurringIntervalSeconds * 1000);
    
    let cleanName = task.name;
    if (cleanName.includes(" (Recurring Run)")) {
      cleanName = cleanName.split(" (Recurring Run)")[0];
    }

    setTimeout(async () => {
      try {
        await this.enqueue({
          projectId: task.projectId,
          name: `${cleanName} (Recurring Run)`,
          type: task.type,
          params: params,
          scheduledAt: nextScheduledAt,
          priority: task.priority
        });
      } catch (enqueueErr) {
        console.error("[QueueWorker] Failed to enqueue recurring run task:", enqueueErr);
      }
    }, 1000);
  }
}

export const queueWorker = new QueueWorkerManager();
