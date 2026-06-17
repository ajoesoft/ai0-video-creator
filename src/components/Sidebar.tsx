import React from 'react';
import { 
  LayoutDashboard, 
  FileText, 
  Image as ImageIcon, 
  Mic2, 
  GanttChart, 
  Video, 
  Settings,
  Database,
  Plus,
  PanelLeft,
  ChevronRight,
  Languages
} from 'lucide-react';
import { cn } from '@/src/lib/utils';
import { Link, useLocation } from 'react-router-dom';
import { useTranslation } from '../contexts/LanguageContext';

import { fetchProjectById } from '../lib/db';
import { ask } from '@tauri-apps/plugin-dialog';

interface NavItem {
  label: string;
  icon: React.ElementType;
  path: string;
  active?: boolean;
}

export function Sidebar() {
  const location = useLocation();
  const path = location.pathname;
  const [isCollapsed, setIsCollapsed] = React.useState(false);
  const { t } = useTranslation();

  // Determine if we're in a project context
  const isProjectView = path.startsWith('/project/');
  const projectId = isProjectView ? path.split('/')[2] : null;

  const [sceneType, setSceneType] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (projectId) {
      fetchProjectById(projectId).then(p => {
        if (p) {
          setSceneType(p.sceneType);
        }
      }).catch(err => console.error("Sidebar project fetch failed:", err));
    } else {
      setSceneType(null);
    }
  }, [projectId]);

  const mainNav: NavItem[] = [
    { label: t('dashboard'), icon: LayoutDashboard, path: '/' },
    { label: t('models'), icon: Database, path: '/models' },
    { label: 'Queue', icon: GanttChart, path: '/queue' },
  ];

  const projectNav: NavItem[] = isProjectView ? (
    sceneType === 'video_translation' ? [
      { label: 'Details', icon: Settings, path: `/project/${projectId}/details` },
      { label: t('videoTranslation') || 'Translation Workspace', icon: Languages, path: `/project/${projectId}/translation` },
    ] : [
      { label: 'Details', icon: Settings, path: `/project/${projectId}/details` },
      { label: t('scripting'), icon: FileText, path: `/project/${projectId}/script` },
      { label: t('visuals'), icon: ImageIcon, path: `/project/${projectId}/visuals` },
      { label: t('audio'), icon: Mic2, path: `/project/${projectId}/audio` },
      { label: t('timeline'), icon: GanttChart, path: `/project/${projectId}/timeline` },
      { label: t('export'), icon: Video, path: `/project/${projectId}/export` },
    ]
  ) : [];

  return (
    <aside 
      className={cn(
        "h-full bg-black border-r border-border-subtle flex flex-col shrink-0 transition-all duration-300 ease-in-out relative",
        isCollapsed ? "w-20" : "w-64"
      )}
    >
      <div className={cn("p-6 flex items-center justify-between mb-4", isCollapsed ? "flex-col gap-4" : "flex-row")}>
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 bg-brand-primary rounded-sm flex items-center justify-center font-bold text-black shadow-lg shadow-brand-primary/10 shrink-0">
            AVC
          </div>
          {!isCollapsed && (
            <span className="font-semibold tracking-[0.2em] text-[10px] uppercase opacity-80 text-white truncate animate-in fade-in duration-500">AI0 Video Creator</span>
          )}
        </div>
        <button 
          onClick={() => setIsCollapsed(!isCollapsed)}
          className="p-2 hover:bg-white/10 rounded-sm text-gray-500 hover:text-white transition-colors"
        >
          {isCollapsed ? <ChevronRight className="w-4 h-4" /> : <PanelLeft className="w-4 h-4" />}
        </button>
      </div>

      <nav className="flex-1 px-4 space-y-6 overflow-y-auto overflow-x-hidden custom-scrollbar">
        <div className="space-y-1">
          {!isCollapsed && <p className="px-3 mb-3 text-[10px] font-bold text-gray-600 uppercase tracking-[0.2em] animate-in fade-in duration-500">{t('discovery')}</p>}
          {mainNav.map((item) => (
            <NavLink key={item.path} item={item} active={path === item.path} isCollapsed={isCollapsed} />
          ))}
        </div>

        {isProjectView && (
          <div className="animate-in fade-in slide-in-from-left-2 duration-500 space-y-1">
            {!isCollapsed && <p className="px-3 mb-3 text-[10px] font-bold text-gray-600 uppercase tracking-[0.2em]">{t('editorSuite')}</p>}
            {projectNav.map((item) => (
              <NavLink key={item.path} item={item} active={path === item.path} isCollapsed={isCollapsed} />
            ))}
          </div>
        )}

        {!isCollapsed && (
          <div className="pt-6 border-t border-border-subtle space-y-4 animate-in fade-in duration-700">
            <div className="bg-white/5 rounded-sm p-4 border border-border-subtle">
              <div className="text-[9px] uppercase tracking-tighter opacity-40 mb-3 font-mono font-bold">Local Compute Health</div>
              <div className="flex justify-between items-center text-[11px] mb-2">
                <span className="text-gray-400">Ollama / Qwen-7B</span>
                <span className="text-green-500">●</span>
              </div>
              <div className="flex justify-between items-center text-[11px]">
                <span className="text-gray-400">ComfyUI / LTX-2.3</span>
                <span className="text-green-500">●</span>
              </div>
            </div>
          </div>
        )}
      </nav>

      <div className="p-4 bg-black/40">
        {!isCollapsed && (
          <div className="flex items-center gap-2 px-3 text-[9px] font-mono opacity-30 uppercase tracking-widest mb-4 whitespace-nowrap overflow-hidden">
            <span>Python 3.11</span>
            <span>|</span>
            <span>SQLite 3.0</span>
          </div>
        )}
        <NavLink 
          item={{ label: t('configuration'), icon: Settings, path: '/settings' }} 
          active={path === '/settings'} 
          isCollapsed={isCollapsed}
        />
      </div>
    </aside>
  );
}

function NavLink({ item, active, isCollapsed }: { item: NavItem; active: boolean; isCollapsed: boolean; key?: string }) {
  const handleClick = async (e: React.MouseEvent) => {
    if ((window as any).isTaskRunning) {
      e.preventDefault();
      const confirmed = await ask('A task is currently running. All progress might be lost. Exit anyway?', {
        title: 'Task in Progress',
        kind: 'warning',
      });
      if (confirmed) {
        window.location.href = item.path;
      }
    }
  };

  return (
    <Link
      to={item.path}
      onClick={handleClick}
      title={isCollapsed ? item.label : undefined}
      className={cn(
        "flex items-center gap-3 px-3 py-2 transition-all group border-l-2 h-10",
        active 
          ? "border-brand-primary bg-white/5 text-white" 
          : "border-transparent text-white/40 hover:text-white",
        isCollapsed && "justify-center px-0"
      )}
    >
      <item.icon className={cn("w-4 h-4 transition-colors shrink-0", active ? "text-brand-primary" : "text-gray-600 group-hover:text-gray-300")} strokeWidth={active ? 2.5 : 2} />
      {!isCollapsed && <span className="font-medium text-[13px] tracking-tight truncate animate-in fade-in slide-in-from-left-1 duration-300">{item.label}</span>}
    </Link>
  );
}
