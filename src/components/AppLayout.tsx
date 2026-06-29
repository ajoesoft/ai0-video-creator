import React, { useState, useRef, useEffect } from 'react';
import { Sidebar } from './Sidebar';
import { motion, AnimatePresence } from 'motion/react';
import { useLocation } from 'react-router-dom';
import { useTranslation, LANGUAGE_LABELS, LanguageCode } from '../contexts/LanguageContext';
import { 
  Globe, 
  ChevronDown, 
  Check, 
  MessageSquare, 
  Send, 
  Copy, 
  Trash2, 
  X, 
  RefreshCw, 
  Loader2, 
  Bot, 
  Sliders 
} from 'lucide-react';
import { getSetting, setSetting, fetchProjectById, fetchSystemPrompts } from '../lib/db';
import { DEFAULT_SYSTEM_PROMPTS, SystemPrompt } from '../pages/GlobalSettings';

interface ChatMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
}

export function AppLayout({ children }: { children: React.ReactNode }) {
  const location = useLocation();
  const { language, selectedLanguage, setLanguage, t } = useTranslation();
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Chat States
  const [isChatOpen, setIsChatOpen] = useState(false);
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [systemPrompt, setSystemPrompt] = useState('You are a professional video translation and editing assistant. Help the user configure settings, translate text, write scripts, or answer questions about audio, voice cloning, and model execution.');
  const [showSystemPrompt, setShowSystemPrompt] = useState(false);
  const [userMsg, setUserMsg] = useState('');
  const [isSending, setIsSending] = useState(false);
  
  const [ollamaModels, setOllamaModels] = useState<string[]>([]);
  const [selectedModel, setSelectedModel] = useState('qwen:7b');
  const [isFetchingModels, setIsFetchingModels] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  
  const [ollamaAddr, setOllamaAddr] = useState('127.0.0.1');
  const [ollamaPort, setOllamaPort] = useState('11434');
  const [copiedIndex, setCopiedIndex] = useState<number | null>(null);

  const chatBottomRef = useRef<HTMLDivElement>(null);

  // Auto scroll chat to bottom when new messages arrive
  useEffect(() => {
    if (chatBottomRef.current) {
      chatBottomRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [chatMessages, isSending]);

  // Close dropdown on click outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Update dynamic system prompt based on route and active project configuration
  useEffect(() => {
    async function updateSystemPrompt() {
      const match = location.pathname.match(/\/project\/([^\/]+)\/([^\/]+)/);
      if (!match) {
        // Fallback to default overall prompt if not inside a project route
        setSystemPrompt('You are a professional video translation and editing assistant. Help the user configure settings, translate text, write scripts, or answer questions about audio, voice cloning, and model execution.');
        return;
      }

      const projectId = match[1];
      const section = match[2];

      // Map route sections to classifications
      let classification: 'details' | 'script' | 'visuals' | 'audio' | null = null;
      if (section === 'details') classification = 'details';
      else if (section === 'script') classification = 'script';
      else if (section === 'visuals') classification = 'visuals';
      else if (section === 'audio') classification = 'audio';

      if (!classification) {
        setSystemPrompt('You are a professional video translation and editing assistant. Help the user configure settings, translate text, write scripts, or answer questions about audio, voice cloning, and model execution.');
        return;
      }

      try {
        // Load custom prompts from database or defaults
        let prompts = await fetchSystemPrompts();
        if (!prompts || prompts.length === 0) {
          prompts = DEFAULT_SYSTEM_PROMPTS;
        }

        const matchingPromptObj = prompts.find(p => p.classification === classification);
        let basePrompt = matchingPromptObj?.prompt || DEFAULT_SYSTEM_PROMPTS.find(p => p.classification === classification)?.prompt || '';

        // Fetch project details to enrich prompt with style & sceneType
        const project = await fetchProjectById(projectId);

        if (project) {
          const projectName = project.name || 'Untitled Project';
          const projectType = project.sceneType || 'Unknown';
          const projectStyle = project.visualStyle || 'Cinematic';

          if (classification === 'details') {
            setSystemPrompt(
              `${basePrompt}\n\n` +
              `[Active Project Context / 当前项目上下文]\n` +
              `- Project Name: ${projectName}\n` +
              `- Scene Type (场景类型/类型): ${projectType}\n` +
              `- Visual Style (视觉风格/风格): ${projectStyle}\n\n` +
              `Constraint Directive (行为约束):\n` +
              `1. The user is currently in the "Project Details" view, focusing on project configuration and cover image generation (生成封面图片/cover image).\n` +
              `2. Act as a master design director and style consultant.\n` +
              `3. Tailor all advice, themes, and generated prompt ideas to match the specified project type (${projectType}) and style (${projectStyle}).\n` +
              `4. Help the user synthesize consistent style guidelines, select fitting color schemes, and write prompt descriptions for the project's cover image.`
            );
          } else if (classification === 'script') {
            setSystemPrompt(
              `${basePrompt}\n\n` +
              `[Active Project Context / 当前项目上下文]\n` +
              `- Project Name: ${projectName}\n` +
              `- Scene Type (场景类型/类型): ${projectType}\n\n` +
              `Constraint Directive (行为约束):\n` +
              `1. The user is currently in the "Script Synthesis" view, synthesizing speech, dialogue, direction, image, and video scripts (生成 speech, dialog, direction, image, video).\n` +
              `2. Act as an elite screenwriter and screenplay maestro.\n` +
              `3. Guide the user in drafting precise character dialogues (dialog), voiceover narration lines (speech), director's cues (camera angles, movements, and directions), and rich visual prompts (image and video scene descriptions).\n` +
              `4. Ensure dialogues and camera cues form a cohesive dramatic narrative that suits the '${projectType}' layout.`
            );
          } else if (classification === 'visuals') {
            setSystemPrompt(
              `${basePrompt}\n\n` +
              `[Active Project Context / 当前项目上下文]\n` +
              `- Project Name: ${projectName}\n\n` +
              `Constraint Directive (行为约束):\n` +
              `1. The user is currently in the "Visual Database" view, managing consistent characters (IPs) and environments (生成 IP 角色与环境等).\n` +
              `2. Act as a lead character designer and worldbuilding sculptor.\n` +
              `3. Assist the user in defining and managing characters (IP roles), props, clothing, environment presets, and locations.\n` +
              `4. Focus on maintaining strict physical details, lighting rules, mood settings, and prompt syntax to keep character likeness and environmental style consistent across consecutive generations.`
            );
          } else if (classification === 'audio') {
            setSystemPrompt(
              `${basePrompt}\n\n` +
              `[Active Project Context / 当前项目上下文]\n` +
              `- Project Name: ${projectName}\n` +
              `- Scene Type (场景类型/类型): ${projectType}\n\n` +
              `Constraint Directive (行为约束):\n` +
              `1. The user is currently in the "Audio Design" view, creating and optimizing voice timbres and acoustic environments (生成音频设计，适应角色的音频声色).\n` +
              `2. Act as an expert sound designer and voice casting director.\n` +
              `3. Help the user choose or clone high-fidelity voices, customize speaking speed, emotional pitch, and vocal quality matching specific roles.\n` +
              `4. Ensure characters receive consistent, natural-sounding voiceovers that sync smoothly with their screenplay tone.`
            );
          }
        } else {
          setSystemPrompt(basePrompt);
        }
      } catch (err) {
        console.error("Error updating system prompt based on route:", err);
      }
    }

    updateSystemPrompt();
  }, [location.pathname]);

  // Fetch Ollama connection info and active models
  const openChatAndLoad = async () => {
    setIsChatOpen(true);
    setErrorMsg(null);
    try {
      const addr = await getSetting('ollama_address') || '127.0.0.1';
      const port = await getSetting('ollama_port') || '11434';
      const activeModel = await getSetting('model_ollama_active_model') || 'qwen:7b';
      
      setOllamaAddr(addr);
      setOllamaPort(port);
      setSelectedModel(activeModel);

      await fetchModelsForChat(addr, port, activeModel);
    } catch (err: any) {
      console.error("Failed to load settings:", err);
    }
  };

   const fetchModelsForChat = async (addr: string, port: string, activeModel: string) => {
    setIsFetchingModels(true);
    setErrorMsg(null);
    try {
      const cleanAddr = addr.startsWith('http://') || addr.startsWith('https://') 
        ? addr 
        : `http://${addr}`;
      const response = await fetch(`${cleanAddr}:${port}/api/tags`);
      if (response.ok) {
        const data = await response.json();
        if (data && Array.isArray(data.models)) {
          const names = data.models.map((m: any) => m.name);
          setOllamaModels(names);
          if (names.length > 0) {
            if (names.includes(activeModel)) {
              setSelectedModel(activeModel);
            } else {
              setSelectedModel(names[0]);
              await setSetting('model_ollama_active_model', names[0]);
            }
          } else {
            setOllamaModels([activeModel]);
          }
        } else {
          setOllamaModels([activeModel]);
        }
      } else {
        throw new Error(`Server returned status ${response.status}`);
      }
    } catch (err: any) {
      console.warn("Failed to fetch Ollama models in chat:", err);
      setErrorMsg(`Cannot connect to Ollama at ${addr}:${port}. Ensure service is running and CORS is allowed.`);
      setOllamaModels([activeModel]);
    } finally {
      setIsFetchingModels(false);
    }
  };

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!userMsg.trim() || isSending) return;

    const currentMsg = userMsg;
    setUserMsg('');
    setErrorMsg(null);

    const newUserMessage: ChatMessage = { role: 'user', content: currentMsg };
    const updatedMessages = [...chatMessages, newUserMessage];
    setChatMessages(updatedMessages);

    setIsSending(true);

    try {
      const cleanAddr = ollamaAddr.startsWith('http://') || ollamaAddr.startsWith('https://') 
        ? ollamaAddr 
        : `http://${ollamaAddr}`;
      
      const payloadMessages = [];
      if (systemPrompt.trim()) {
        payloadMessages.push({ role: 'system', content: systemPrompt });
      }
      payloadMessages.push(...updatedMessages);

      const response = await fetch(`${cleanAddr}:${ollamaPort}/api/chat`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          model: selectedModel,
          messages: payloadMessages,
          stream: false
        })
      });

      if (!response.ok) {
        throw new Error(`Ollama responds with error status: ${response.status}`);
      }

      const data = await response.json();
      if (data && data.message) {
        setChatMessages(prev => [...prev, {
          role: 'assistant',
          content: data.message.content
        }]);
      } else {
        throw new Error("Invalid response format received from Ollama.");
      }
    } catch (err: any) {
      console.error("Failed to query Ollama:", err);
      setErrorMsg(`Failed to query Ollama API. Connection status: Offline. Details: ${err.message || err}`);
    } finally {
      setIsSending(false);
    }
  };

  const copyToClipboard = (text: string, index: number) => {
    navigator.clipboard.writeText(text);
    setCopiedIndex(index);
    setTimeout(() => {
      setCopiedIndex(null);
    }, 2000);
  };

  return (
    <div className="flex h-screen w-screen overflow-hidden text-gray-100 font-sans">
      <Sidebar />
      <main className="flex-1 relative flex flex-col min-w-0 bg-[#111114]">
        <header className="h-20 border-b border-border-subtle flex items-center px-8 justify-between bg-black/20 backdrop-blur-sm z-10">
          <div className="flex flex-col">
             <div className="flex items-center gap-2 text-[10px] uppercase tracking-[0.2em] text-white/40 font-bold">
                <span>{t('system')}</span>
                <span className="opacity-30">/</span>
                <span className="text-white/60">{t('localNode')}</span>
             </div>
             <h1 className="editorial-title text-xl italic mt-0.5">{t('appName')}</h1>
          </div>
          <div className="flex items-center gap-6">
             {/* Language Selector Dropdown */}
              <div className="relative" ref={dropdownRef}>
                 <button 
                   onClick={() => setIsOpen(!isOpen)}
                   className="flex items-center gap-2 px-3.5 py-2 bg-white/5 border border-white/5 hover:border-brand-primary/30 rounded-md transition-all text-sm hover:bg-white/10"
                 >
                    <Globe className="w-4 h-4 text-brand-primary" />
                    <span className="mono-text tracking-wide whitespace-nowrap text-xs font-semibold">{LANGUAGE_LABELS[selectedLanguage]}</span>
                    <ChevronDown className="w-3.5 h-3.5 text-white/40" />
                 </button>

                 <AnimatePresence>
                   {isOpen && (
                     <motion.div 
                       initial={{ opacity: 0, y: 8 }}
                       animate={{ opacity: 1, y: 0 }}
                       exit={{ opacity: 0, y: 8 }}
                       className="absolute right-0 mt-2 w-48 bg-[#09090b] border border-white/15 rounded-md shadow-2xl z-50 py-1.5 overflow-hidden"
                     >
                       {(Object.keys(LANGUAGE_LABELS) as LanguageCode[]).map((lang) => (
                         <button
                           key={lang}
                           onClick={() => {
                             setLanguage(lang);
                             setIsOpen(false);
                           }}
                           className="w-full flex items-center justify-between px-4 py-2 hover:bg-brand-primary hover:text-black transition-all text-xs font-medium text-white/80 active:opacity-75 text-left"
                           style={{ textAlign: language === 'ar' ? 'right' : 'left' }}
                         >
                           <span>{LANGUAGE_LABELS[lang]}</span>
                           {selectedLanguage === lang && (
                             <Check className="w-3.5 h-3.5 shrink-0 ml-2" />
                           )}
                         </button>
                       ))}
                     </motion.div>
                   )}
                 </AnimatePresence>
              </div>

             <div className="flex items-center gap-2 hidden sm:flex">
                <div className="w-1.5 h-1.5 rounded-full bg-brand-primary animate-pulse" />
                <span className="text-[10px] font-mono text-brand-primary font-bold uppercase tracking-widest">{t('masterNodeLink')}</span>
             </div>
             <button 
               onClick={openChatAndLoad}
               className="desktop-button-primary flex items-center gap-2 cursor-pointer transition-all duration-200"
             >
                <MessageSquare className="w-4 h-4 text-black shrink-0" />
                <span>Chat</span>
             </button>
          </div>
        </header>

        <div className="flex-1 overflow-auto custom-scrollbar relative">
          <AnimatePresence mode="wait">
            <motion.div
              key={location.pathname}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.2, ease: "easeOut" }}
              className="h-full"
            >
              {children}
            </motion.div>
          </AnimatePresence>
        </div>
      </main>

      {/* Dynamic Ollama Chat Dialogue Popup Modal (句中显示) */}
      <AnimatePresence>
        {isChatOpen && (
          <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-fade-in">
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 15 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 15 }}
              transition={{ duration: 0.2, ease: "easeOut" }}
              className="bg-[#0e0e11] border border-white/10 rounded-xl w-full max-w-2xl h-[600px] flex flex-col overflow-hidden shadow-2xl relative text-white"
            >
              {/* Modal Header */}
              <div className="h-14 border-b border-white/5 bg-black/30 flex items-center justify-between px-5 py-3.5">
                <div className="flex items-center gap-2.5">
                  <div className="w-7 h-7 bg-brand-primary/10 rounded-md flex items-center justify-center text-brand-primary">
                    <Bot className="w-4 h-4" />
                  </div>
                  <div>
                    <h2 className="text-sm font-bold tracking-tight">Ollama AI Chat Assistant</h2>
                    <p className="text-[10px] font-mono text-gray-400">Connected to http://{ollamaAddr}:{ollamaPort}</p>
                  </div>
                </div>
                
                <button
                  type="button"
                  onClick={() => setIsChatOpen(false)}
                  className="w-8 h-8 rounded-full bg-white/5 hover:bg-white/10 flex items-center justify-center transition-colors text-gray-400 hover:text-white cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {/* Collapsible System Prompt Settings Block */}
              <div className="border-b border-white/5 bg-[#121215]">
                <button
                  type="button"
                  onClick={() => setShowSystemPrompt(!showSystemPrompt)}
                  className="w-full px-5 py-2 flex items-center justify-between text-xs text-gray-400 hover:text-white transition-colors border-b border-white/5 hover:bg-white/[0.02]"
                >
                  <span className="flex items-center gap-1.5 font-medium">
                    <Sliders className="w-3.5 h-3.5 text-brand-primary" />
                    Configure System Prompt (系统提示词行为指令)
                  </span>
                  <span className="text-[10px] bg-white/5 px-2 py-0.5 rounded font-mono">
                    {showSystemPrompt ? 'Hide (收起)' : 'Show (展开)'}
                  </span>
                </button>
                
                <AnimatePresence>
                  {showSystemPrompt && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: "auto", opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      className="overflow-hidden px-5 py-3 space-y-2 bg-black/20"
                    >
                      <label className="text-[9px] font-bold text-gray-500 uppercase tracking-widest block font-sans">System Persona指令</label>
                      <textarea
                        value={systemPrompt}
                        onChange={(e) => setSystemPrompt(e.target.value)}
                        rows={3}
                        className="w-full bg-black/40 border border-white/10 rounded-lg p-2.5 text-xs focus:border-brand-primary focus:outline-none focus:ring-1 focus:ring-brand-primary/30 text-gray-200 resize-none font-sans"
                        placeholder="Define how the assistant should behave..."
                      />
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>

              {/* Chat Message Stream Panel */}
              <div className="flex-1 overflow-y-auto p-5 space-y-4 custom-scrollbar bg-black/10">
                {chatMessages.length === 0 ? (
                  <div className="h-full flex flex-col items-center justify-center text-center p-6 space-y-3">
                    <div className="w-12 h-12 rounded-full bg-white/5 flex items-center justify-center text-gray-500 border border-white/5">
                      <MessageSquare className="w-6 h-6" />
                    </div>
                    <div className="space-y-1 max-w-sm">
                      <p className="text-xs text-gray-200 font-semibold">Welcome to local LLM Sandbox Chat</p>
                      <p className="text-[11px] text-gray-500 leading-relaxed">
                        This dialog queries the local Ollama daemon directly. You can use it to compose translations, troubleshoot pipeline scripts, or configure system behavior.
                      </p>
                    </div>
                  </div>
                ) : (
                  chatMessages.map((msg, index) => {
                    const isUser = msg.role === 'user';
                    return (
                      <div
                        key={index}
                        className={`flex gap-3 ${isUser ? 'justify-end' : 'justify-start'}`}
                      >
                        {!isUser && (
                          <div className="w-7 h-7 bg-brand-primary/10 border border-brand-primary/20 text-brand-primary font-bold rounded-md flex items-center justify-center text-xs shrink-0 mt-0.5">
                            AI
                          </div>
                        )}
                        <div
                          className={`group relative rounded-xl px-4 py-2.5 text-xs shadow-sm max-w-[80%] leading-relaxed ${
                            isUser
                              ? 'bg-brand-primary text-black font-semibold rounded-tr-none'
                              : 'bg-white/5 border border-white/10 text-gray-200 rounded-tl-none font-sans'
                          }`}
                        >
                          <div className="whitespace-pre-wrap">{msg.content}</div>
                          
                          {/* Copy trigger absolute position inside AI bubble */}
                          {!isUser && (
                            <button
                              type="button"
                              onClick={() => copyToClipboard(msg.content, index)}
                              className="absolute right-2.5 bottom-2 opacity-0 group-hover:opacity-100 transition-opacity duration-150 p-1.5 rounded-md bg-[#0e0e11] hover:bg-white/10 text-gray-400 hover:text-white cursor-pointer"
                              title="Copy generated result (拷贝结果)"
                            >
                              {copiedIndex === index ? (
                                <Check className="w-3.5 h-3.5 text-brand-primary" />
                              ) : (
                                <Copy className="w-3.5 h-3.5" />
                              )}
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })
                )}

                {/* Loading indicator balloon */}
                {isSending && (
                  <div className="flex gap-3 justify-start">
                    <div className="w-7 h-7 bg-brand-primary/10 border border-brand-primary/20 text-brand-primary font-bold rounded-md flex items-center justify-center text-xs shrink-0 animate-pulse mt-0.5">
                      AI
                    </div>
                    <div className="bg-white/5 border border-white/10 text-gray-400 rounded-xl rounded-tl-none px-4 py-3 text-xs flex items-center gap-2">
                      <Loader2 className="w-3.5 h-3.5 animate-spin text-brand-primary" />
                      <span>Thinking and responding from Ollama model ({selectedModel})...</span>
                    </div>
                  </div>
                )}

                {errorMsg && (
                  <div className="p-3 bg-red-500/10 border border-red-500/20 text-red-400 rounded-lg text-[11px] leading-relaxed flex items-start gap-2 max-w-lg mx-auto animate-fade-in">
                    <X className="w-4 h-4 shrink-0 mt-0.5" />
                    <div>
                      <span className="font-bold">Ollama API Error:</span> {errorMsg}
                    </div>
                  </div>
                )}
                
                <div ref={chatBottomRef} />
              </div>

              {/* Model Selection and Controls Footer bar */}
              <div className="px-5 py-3.5 bg-black/40 border-t border-white/5 flex items-center justify-between text-xs gap-4 shrink-0">
                <div className="flex items-center gap-2">
                  <span className="text-gray-400 font-medium">Active Model:</span>
                  <div className="flex items-center gap-1.5 bg-white/5 border border-white/10 rounded px-2.5 py-1">
                    <select
                      value={selectedModel}
                      onChange={async (e) => {
                        const val = e.target.value;
                        setSelectedModel(val);
                        await setSetting('model_ollama_active_model', val);
                      }}
                      className="bg-transparent border-0 text-white focus:outline-none focus:ring-0 text-xs font-medium pr-1 cursor-pointer"
                    >
                      {ollamaModels.map(name => (
                        <option key={name} value={name} className="bg-[#121214] text-white">
                          {name}
                        </option>
                      ))}
                    </select>
                    
                    <button
                      type="button"
                      onClick={() => fetchModelsForChat(ollamaAddr, ollamaPort, selectedModel)}
                      disabled={isFetchingModels}
                      className="text-gray-400 hover:text-white disabled:opacity-50 cursor-pointer"
                      title="Rescan models (重扫模型列表)"
                    >
                      <RefreshCw className={`w-3.5 h-3.5 ${isFetchingModels ? 'animate-spin' : ''}`} />
                    </button>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => setChatMessages([])}
                  className="flex items-center gap-1.5 text-[10px] uppercase font-mono tracking-widest text-red-400 hover:text-red-300 transition-colors"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  Clear Chat (清空历史)
                </button>
              </div>

              {/* Dialogue prompt form */}
              <form onSubmit={handleSendMessage} className="p-4 bg-black/60 border-t border-white/15 flex items-center gap-3 shrink-0">
                <input
                  type="text"
                  value={userMsg}
                  onChange={(e) => setUserMsg(e.target.value)}
                  placeholder="Type message to Ollama AI assistant..."
                  className="flex-1 bg-white/5 border border-white/10 rounded-lg px-4 py-3 text-xs focus:outline-none focus:border-brand-primary placeholder:text-gray-500 font-sans text-white bg-black/40"
                  disabled={isSending}
                />
                
                <button
                  type="submit"
                  disabled={isSending || !userMsg.trim()}
                  className="bg-brand-primary text-black disabled:bg-white/10 disabled:text-white/30 rounded-lg p-2.5 font-bold transition-all shrink-0 flex items-center justify-center cursor-pointer"
                >
                  {isSending ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Send className="w-4 h-4" />
                  )}
                </button>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
