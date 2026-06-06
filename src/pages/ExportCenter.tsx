import React, { useState } from 'react';
import { 
  Rocket, 
  Settings2, 
  FileVideo, 
  Monitor, 
  Wifi, 
  Play, 
  Camera, 
  Smartphone,
  Cpu,
  CheckCircle,
  Clock,
  ChevronRight,
  Download,
  Share2
} from 'lucide-react';
import { cn } from '@/src/lib/utils';
import { motion, AnimatePresence } from 'motion/react';

export function ExportCenter() {
  const [isExporting, setIsExporting] = useState(false);
  const [progress, setProgress] = useState(0);
  const [exportComplete, setExportComplete] = useState(false);

  const startExport = () => {
    setIsExporting(true);
    let current = 0;
    const interval = setInterval(() => {
      current += 2;
      setProgress(current);
      if (current >= 100) {
        clearInterval(interval);
        setIsExporting(false);
        setExportComplete(true);
      }
    }, 100);
  };

  const platforms = [
    { id: 'hd', icon: Monitor, label: 'Standard HD', desc: '1080p, 30fps, H.264' },
    { id: 'yt', icon: Play, label: 'YouTube Optimized', desc: '4K, 60fps, High Bitrate' },
    { id: 'ig', icon: Camera, label: 'Instagram / TikTok', desc: 'Vertical 9:16, 1080p' },
    { id: 'mobile', icon: Smartphone, label: 'Web Optimized', desc: '720p, Small File Size' },
  ];

  return (
    <div className="h-full flex flex-col p-10 space-y-10 overflow-auto custom-scrollbar">
      <div className="flex items-center justify-between border-b border-border-subtle pb-8">
        <div className="space-y-1">
          <h2 className="editorial-title text-4xl italic">Final Mastery</h2>
          <p className="mono-text opacity-40">Review your creation and render the final masterpiece.</p>
        </div>
        
        <div className="flex items-center gap-6">
           {exportComplete && (
             <motion.div 
               initial={{ opacity: 0, scale: 0.9 }}
               animate={{ opacity: 1, scale: 1 }}
               className="flex items-center gap-3 text-brand-primary font-bold text-[10px] uppercase tracking-widest bg-brand-primary/10 px-6 py-3 rounded-sm border border-brand-primary/20"
             >
                <CheckCircle className="w-4 h-4" />
                <span>Render Success</span>
             </motion.div>
           )}
           <button 
             onClick={startExport}
             disabled={isExporting}
             className="desktop-button-primary h-14 px-10 relative overflow-hidden group"
           >
             {isExporting ? (
               <div className="z-10 flex items-center gap-4">
                 <span>{progress}% SYNTHESIZED</span>
               </div>
             ) : (
               <div className="z-10 flex items-center gap-4">
                 <Rocket className="w-5 h-5" />
                 <span>INITIALIZE PRODUCTION</span>
               </div>
             )}
             
             {isExporting && (
               <div 
                 className="absolute inset-0 bg-brand-secondary transition-all duration-300"
                 style={{ width: `${progress}%` }}
               />
             )}
           </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-12">
        <div className="lg:col-span-8 space-y-12">
           {/* Summary Tool */}
           <div className="p-8 bg-black border border-border-subtle flex items-center gap-10">
              <div className="w-64 aspect-video bg-[#111114] border border-white/5 overflow-hidden relative group">
                 <img src="https://images.unsplash.com/photo-1451187580459-43490279c0fa?w=400" className="w-full h-full object-cover grayscale opacity-40 group-hover:grayscale-0 group-hover:opacity-80 transition-all duration-700" alt="thumbnail" />
                 <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                    <FileVideo className="w-10 h-10 text-white/20" />
                 </div>
              </div>
              <div className="flex-1 space-y-4">
                 <div className="flex items-center justify-between">
                    <h3 className="editorial-title text-3xl italic">Cyberpunk Vision 01</h3>
                    <button className="mono-text text-brand-primary hover:underline">Edit Meta</button>
                 </div>
                 <div className="flex items-center gap-8 mono-text opacity-40">
                    <div className="flex items-center gap-2"><Clock className="w-4 h-4" /> 00:01:24</div>
                    <div className="flex items-center gap-2"><FileVideo className="w-4 h-4" /> 4K RAW</div>
                    <div className="flex items-center gap-2"><Monitor className="w-4 h-4" /> 60 FPS</div>
                 </div>
                 <div className="pt-2 space-y-2">
                    <div className="h-0.5 w-full bg-white/5 overflow-hidden">
                       <div className="h-full bg-brand-primary w-2/3" />
                    </div>
                    <p className="mono-text opacity-20">STORAGE: ~1.2 GB ESTIMATED / LOCAL CACHING ACTIVE</p>
                 </div>
              </div>
           </div>

           {/* Export Formats */}
           <div className="space-y-6">
              <h3 className="mono-text text-brand-primary">PRESET ARCHIVES</h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                 {platforms.map(platform => (
                    <button 
                      key={platform.id}
                      className="p-8 bg-[#111114] border border-border-subtle hover:border-brand-primary/50 text-left transition-all group"
                    >
                       <div className="flex items-start gap-6">
                          <div className="p-4 bg-white/5 text-gray-500 group-hover:bg-brand-primary group-hover:text-black transition-all">
                             <platform.icon className="w-6 h-6" />
                          </div>
                          <div>
                             <h4 className="editorial-title text-2xl mb-1">{platform.label}</h4>
                             <p className="mono-text opacity-40">{platform.desc}</p>
                          </div>
                       </div>
                    </button>
                 ))}
              </div>
           </div>
        </div>

        <div className="lg:col-span-4 space-y-10">
           <div className="desktop-card p-10 bg-black border-brand-primary/20">
              <h3 className="mono-text text-brand-primary mb-8 flex items-center gap-3">
                 <Settings2 className="w-4 h-4" />
                 ACCELERATION
              </h3>
              <div className="space-y-8">
                 <div className="flex items-center justify-between group">
                    <div className="space-y-1">
                       <p className="mono-text font-black">GPU ENGAGEMENT</p>
                       <p className="text-[10px] text-gray-500 font-mono">NVENC PARALLELISM</p>
                    </div>
                    <div className="w-12 h-6 bg-brand-primary rounded-sm relative">
                       <div className="absolute right-1 top-1 w-4 h-4 bg-black rounded-sm" />
                    </div>
                 </div>
                 <div className="flex items-center justify-between opacity-40">
                    <div className="space-y-1">
                       <p className="mono-text font-black">INTERPOLATION</p>
                       <p className="text-[10px] text-gray-500 font-mono">NEURAL SHARPENING</p>
                    </div>
                    <div className="w-12 h-6 bg-white/10 rounded-sm relative">
                       <div className="absolute left-1 top-1 w-4 h-4 bg-gray-500 rounded-sm" />
                    </div>
                 </div>

                 <div className="bg-white/5 p-6 border border-white/5 flex items-center gap-4">
                    <Cpu className="w-6 h-6 text-brand-primary" />
                    <div className="mono-text">
                       <p className="font-bold text-white/60">RTX 4080 DETECTED</p>
                       <p className="opacity-20">CUDA CORES OPTIMIZED</p>
                    </div>
                 </div>
              </div>
           </div>

           <AnimatePresence>
             {exportComplete && (
               <motion.div 
                 initial={{ opacity: 0, y: 20 }}
                 animate={{ opacity: 1, y: 0 }}
                 className="p-10 bg-brand-primary/5 border border-brand-primary/20"
               >
                  <h3 className="editorial-title text-2xl text-brand-primary mb-8 underline decoration-brand-primary/30">Release Ready</h3>
                  <div className="space-y-4">
                     <button className="desktop-button-primary w-full h-14 flex items-center justify-center gap-3">
                        <Download className="w-4 h-4" /> REVEAL ARCHIVE
                     </button>
                     <button className="desktop-button-ghost w-full h-14 border border-white/10 flex items-center justify-center gap-3">
                        <Share2 className="w-4 h-4" /> TRANSMIT LINK
                     </button>
                  </div>
               </motion.div>
             )}
           </AnimatePresence>
        </div>
      </div>
    </div>
  );
}
