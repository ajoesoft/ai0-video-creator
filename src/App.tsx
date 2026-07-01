import React from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { AppLayout } from './components/AppLayout';
import { Dashboard } from './pages/Dashboard';
import { ProjectDetail } from './pages/ProjectDetail';
import { WordManagement } from './pages/WordManagement';
import { ScriptEditor } from './pages/ScriptEditor';
import { VisualsLibrary } from './pages/VisualsLibrary';
import { AudioEngine } from './pages/AudioEngine';
import { TimelineEditor } from './pages/TimelineEditor';
import { ExportCenter } from './pages/ExportCenter';
import { GlobalSettings } from './pages/GlobalSettings';
import { ModelManagement } from './pages/ModelManagement';
import { VideoTranslation } from './pages/VideoTranslation';
import { QueueManager } from './pages/QueueManager';
import { DigitalHuman } from './pages/DigitalHuman';
import { ReversePrompt } from './pages/ReversePrompt';
import { LanguageProvider } from './contexts/LanguageContext';

export default function App() {
  return (
    <LanguageProvider>
      <Router>
        <AppLayout>
          <Routes>
            <Route path="/" element={<Dashboard />} />
            <Route path="/translation" element={<VideoTranslation />} />
            <Route path="/models" element={<ModelManagement />} />
            <Route path="/queue" element={<QueueManager />} />
            <Route path="/settings" element={<GlobalSettings />} />
            
            <Route path="/project/:id">
              <Route index element={<Navigate to="details" replace />} />
              <Route path="details" element={<ProjectDetail />} />
              <Route path="words" element={<WordManagement />} />
              <Route path="script" element={<ScriptEditor />} />
              <Route path="visuals" element={<VisualsLibrary />} />
              <Route path="audio" element={<AudioEngine />} />
              <Route path="timeline" element={<TimelineEditor />} />
              <Route path="translation" element={<VideoTranslation />} />
              <Route path="export" element={<ExportCenter />} />
              <Route path="digital-human" element={<DigitalHuman />} />
              <Route path="reverse-prompt" element={<ReversePrompt />} />
            </Route>

            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </AppLayout>
      </Router>
    </LanguageProvider>
  );
}
