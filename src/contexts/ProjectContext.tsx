import { createContext, useContext, useState, ReactNode } from 'react';

// 项目类型定义
interface Project {
  id: string;
  name: string;
  path: string;
  createdAt: string;
}

// 上下文类型定义
interface ProjectContextType {
  currentProject: Project | null;
  projects: Project[];
  createProject: (name: string) => void;
  openProject: (project: Project) => void;
  closeProject: () => void;
}

const ProjectContext = createContext<ProjectContextType | undefined>(undefined);

// 提供者组件
export function ProjectProvider({ children }: { children: ReactNode }) {
  const [currentProject, setCurrentProject] = useState<Project | null>(null);
  const [projects, setProjects] = useState<Project[]>([]);

  // 创建新项目
  const createProject = (name: string) => {
    const newProject: Project = {
      id: Date.now().toString(),
      name,
      path: `./projects/${name}`,
      createdAt: new Date().toLocaleString(),
    };
    setProjects([...projects, newProject]);
    setCurrentProject(newProject);
  };

  // 打开已有项目
  const openProject = (project: Project) => {
    setCurrentProject(project);
  };

  // 关闭项目
  const closeProject = () => {
    setCurrentProject(null);
  };

  return (
    <ProjectContext.Provider value={{ currentProject, projects, createProject, openProject, closeProject }}>
      {children}
    </ProjectContext.Provider>
  );
}

// 自定义Hook
export const useProject = () => {
  const context = useContext(ProjectContext);
  if (!context) {
    throw new Error('useProject must be used within a ProjectProvider');
  }
  return context;
};