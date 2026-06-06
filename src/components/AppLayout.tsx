import React, { useState, useRef, useEffect } from 'react';
import { Sidebar } from './Sidebar';
import { motion, AnimatePresence } from 'motion/react';
import { useLocation } from 'react-router-dom';
import { useTranslation, LANGUAGE_LABELS, LanguageCode } from '../contexts/LanguageContext';
import { Globe, ChevronDown, Check } from 'lucide-react';

export function AppLayout({ children }: { children: React.ReactNode }) {
  const location = useLocation();
  const { language, setLanguage, t } = useTranslation();
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

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
                   <span className="mono-text tracking-wide whitespace-nowrap text-xs font-semibold">{LANGUAGE_LABELS[language]}</span>
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
                          {language === lang && (
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
             <button className="desktop-button-primary">
                {t('render4K')}
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
    </div>
  );
}
