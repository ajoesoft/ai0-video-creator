import React, { createContext, useContext, useState, useEffect } from 'react';

export type ActualLanguageCode = 'en' | 'zh' | 'ar' | 'no' | 'fr' | 'es' | 'nl';
export type LanguageCode = ActualLanguageCode | 'auto';

export interface TranslationKeys {
  appName: string;
  system: string;
  localNode: string;
  masterNodeLink: string;
  render4K: string;
  
  // Navigation
  dashboard: string;
  models: string;
  configuration: string;
  editorSuite: string;
  discovery: string;
  
  scripting: string;
  visuals: string;
  audio: string;
  timeline: string;
  export: string;
  
  // Dashboard & Project general
  projectDetails: string;
  wordManagement: string;
  createProject: string;
  projectName: string;
  projectPrompt: string;
  noProjects: string;
  refresh: string;
  batchSync: string;
  
  // Audio Page specific
  auralSynthesis: string;
  freqOrch: string;
  acousticMapping: string;
  searchPlaceholder: string;
  speakExample: string;
  wordOnly: string;
  auralSynthed: string;
  auralMissing: string;
  noVocabMatch: string;
  synthesizing: string;
  reGenerate: string;
  generateVoice: string;
  linguisticMapping: string;
  mapTTS: string;
  activeCloner: string;
  diagnosticsDesc: string;
  
  // Settings
  globalSettings: string;
  workspacePath: string;
  saveSettings: string;
  workspaceConfigDesc: string;
  videoTranslation: string;
}

const translations: Record<ActualLanguageCode, TranslationKeys> = {
  en: {
    appName: "Ai0 Video Creator",
    system: "System",
    localNode: "Local Node",
    masterNodeLink: "Master Node Link",
    render4K: "Render 4K",
    dashboard: "Dashboard",
    models: "Models",
    configuration: "Configuration",
    editorSuite: "Editor Suite",
    discovery: "Discovery",
    scripting: "Scripting",
    visuals: "Visuals",
    audio: "Audio",
    timeline: "Timeline",
    export: "Export",
    projectDetails: "Project Details",
    wordManagement: "Word Management",
    createProject: "Create Project",
    projectName: "Project Name",
    projectPrompt: "Project Prompt",
    noProjects: "No projects found",
    refresh: "Refresh Words",
    batchSync: "Execute Batch Sync",
    auralSynthesis: "Aural Synthesis",
    freqOrch: "Frequency orchestration & linguistic mapping",
    acousticMapping: "Acoustic Mapping Archives",
    searchPlaceholder: "Search words & examples...",
    speakExample: "Speak Example",
    wordOnly: "Word Only",
    auralSynthed: "AURAL SYNTHED",
    auralMissing: "AURAL MISSING",
    noVocabMatch: "No vocabulary matches your workspace or filter.",
    synthesizing: "Synthesizing...",
    reGenerate: "Re-generate",
    generateVoice: "Generate Voice",
    linguisticMapping: "Linguistic Role Mapping",
    mapTTS: "Map vocabulary TTS text and sentence speech synthesis to customizable role templates. The active marker indicates the speaker clones used downstream.",
    activeCloner: "Active Cloner Framework",
    diagnosticsDesc: "Using rapid audio frame synthesis. Audio waveforms are outputted directly in high fidelity MP3 format and linked into vocabulary database records.",
    globalSettings: "Global Settings",
    workspacePath: "Workspace Path",
    saveSettings: "Save Settings",
    workspaceConfigDesc: "Global root folder for all raw assets, databases, and local caches.",
    videoTranslation: "Video Translation"
  },
  zh: {
    appName: "AI0 视频工作站",
    system: "系统",
    localNode: "本地节点",
    masterNodeLink: "主节点连接",
    render4K: "渲染 4K",
    dashboard: "仪表盘",
    models: "模型管理",
    configuration: "参数配置",
    editorSuite: "编辑套件",
    discovery: "资源发现",
    scripting: "脚本编辑",
    visuals: "视觉库",
    audio: "音频合成",
    timeline: "时间线",
    export: "媒体导出",
    projectDetails: "项目详情",
    wordManagement: "单词管理",
    createProject: "新建项目",
    projectName: "项目名称",
    projectPrompt: "项目提示词",
    noProjects: "未找到任何项目",
    refresh: "刷新词表",
    batchSync: "执行批量合成",
    auralSynthesis: "语音合成引擎",
    freqOrch: "音频频率编排与语言角色映射",
    acousticMapping: "声音映射档案馆",
    searchPlaceholder: "搜索单词或例句...",
    speakExample: "合成例句",
    wordOnly: "仅合成单词",
    auralSynthed: "已合成音频",
    auralMissing: "音频缺失",
    noVocabMatch: "没有匹配该工作区或筛选条件的单词。",
    synthesizing: "正在合成...",
    reGenerate: "重新合成",
    generateVoice: "合成语音",
    linguisticMapping: "语言角色映射",
    mapTTS: "将词汇的TTS文本和句子的语音合成映射到可自定义的角色模板中。处于激活状态的标记指示在下游使用的声音克隆主体。",
    activeCloner: "活动声音克隆框架",
    diagnosticsDesc: "使用高速音频帧合成技术。音频波形将以高保真MP3格式直接输出，并关联至词表数据库记录中。",
    globalSettings: "全局参数设置",
    workspacePath: "工作区路径",
    saveSettings: "保存设置",
    workspaceConfigDesc: "用于存储所有原始资产、数据库以及本地缓存的全局根目录文件夹。",
    videoTranslation: "视频翻译"
  },
  ar: {
    appName: "تاوري ستوديو الفيديو",
    system: "النظام",
    localNode: "العقدة المحلية",
    masterNodeLink: "رابط العقدة الرئيسية",
    render4K: "رندر 4K",
    dashboard: "لوحة التحكم",
    models: "النماذج",
    configuration: "الإعدادات",
    editorSuite: "مجموعة التحرير",
    discovery: "الاستكشاف",
    scripting: "كتابة السيناريو",
    visuals: "المؤثرات البصرية",
    audio: "الصوت",
    timeline: "المخطط الزمني",
    export: "التصدير",
    projectDetails: "تفاصيل المشروع",
    wordManagement: "إدارة الكلمات",
    createProject: "إنشاء مشروع",
    projectName: "اسم المشروع",
    projectPrompt: "وصف المشروع",
    noProjects: "لم يتم العثور على مشاريع",
    refresh: "تحديث الكلمات",
    batchSync: "مزامنة دفعة صوتية",
    auralSynthesis: "التوليف الصوتي",
    freqOrch: "تنسيق التردد والخرائط اللغوية",
    acousticMapping: "أرشيفات الخرائط الصوتية",
    searchPlaceholder: "بحث عن الكلمات والأمثلة...",
    speakExample: "نطق المثال",
    wordOnly: "الكلمة فقط",
    auralSynthed: "تم التوليف",
    auralMissing: "مفقود صوتياً",
    noVocabMatch: "لا توجد مفردات تطابق مساحة العمل أو التصفية الحالية.",
    synthesizing: "جاري التوليف...",
    reGenerate: "إعادة توليد",
    generateVoice: "توليد الصوت",
    linguisticMapping: "خرائط الأدوار اللغوية",
    mapTTS: "قم بمطابقة نص تحويل النص إلى كلام للمفردات وتوليف الكلام للجمل مع قوالب أدوار قابلة للتخصيص. العلامة النشطة تشير إلى الأصوات المستخدمة لاحقاً.",
    activeCloner: "إطار عمل محاكي الصوت النشط",
    diagnosticsDesc: "باستخدام توليف إطارات الصوت السريع. يتم إخراج الموجات الصوتية مباشرة بتنسيق MP3 عالي الدقة وربطها بسجلات قاعدة بيانات المفردات.",
    globalSettings: "الإعدادات العامة",
    workspacePath: "مسار مساحة العمل",
    saveSettings: "حفظ الإعدادات",
    workspaceConfigDesc: "المجلد الجذري العام لجميع الأصول الخام، قواعد البيانات وذاكرات التخزين المؤقت المحلية.",
    videoTranslation: "ترجمة الفيديو"
  },
  no: {
    appName: "AI0 Video Creator",
    system: "System",
    localNode: "Lokal Node",
    masterNodeLink: "Hovednodekobling",
    render4K: "Rendre 4K",
    dashboard: "Oversikt",
    models: "Modeller",
    configuration: "Konfigurasjon",
    editorSuite: "Redigeringssuite",
    discovery: "Oppdagelse",
    scripting: "Manuskript",
    visuals: "Visuelt",
    audio: "Lydsyntese",
    timeline: "Tidslinje",
    export: "Eksport",
    projectDetails: "Prosjektdetaljer",
    wordManagement: "Ordbehandling",
    createProject: "Opprett prosjekt",
    projectName: "Prosjektnavn",
    projectPrompt: "Prosjekt-ledetekst",
    noProjects: "Ingen prosjekter funnet",
    refresh: "Oppdater Ord",
    batchSync: "Synkroniser Lydfiler",
    auralSynthesis: "Lydsyntese",
    freqOrch: "Frekvensorkestrering & språklig kartlegging",
    acousticMapping: "Akustisk Kartleggingsarkiv",
    searchPlaceholder: "Søk i ord & eksempler...",
    speakExample: "Uttal Eksempel",
    wordOnly: "Bare Ord",
    auralSynthed: "LYD SYNTESISERT",
    auralMissing: "MANGLER LYD",
    noVocabMatch: "Ingen ord samsvarer med arbeidsområdet eller filteret ditt.",
    synthesizing: "Syntetiserer...",
    reGenerate: "Gjenskapt",
    generateVoice: "Generer Lyd",
    linguisticMapping: "Språklig Rollefordeling",
    mapTTS: "Koble ords TTS-tekst og setningstale til tilpassbare rollemaler. Den aktive rollen indikerer hvilken stemme som blir klonet.",
    activeCloner: "Aktiv Stemmekloning",
    diagnosticsDesc: "Rask lydrammesyntese. Lydfiler produseres direkte i høykvalitets MP3-format og lagres i databasens ordarkiv.",
    globalSettings: "Globale Innstillinger",
    workspacePath: "Arbeidsområde-sti",
    saveSettings: "Lagre Innstillinger",
    workspaceConfigDesc: "Global rotmappe for alle råressurser, databaser og lokale cacher.",
    videoTranslation: "Videooversettelse"
  },
  fr: {
    appName: "AI0 Vidéo Creator",
    system: "Système",
    localNode: "Nœud Local",
    masterNodeLink: "Lien Nœud Maître",
    render4K: "Rendre en 4K",
    dashboard: "Tableau de Bord",
    models: "Modèles",
    configuration: "Configuration",
    editorSuite: "Suite d'Édition",
    discovery: "Découverte",
    scripting: "Scripting",
    visuals: "Visuels",
    audio: "Synthèse Vocale",
    timeline: "Chronologie",
    export: "Exporter",
    projectDetails: "Détails du Projet",
    wordManagement: "Gestion des Mots",
    createProject: "Créer un Projet",
    projectName: "Nom du Projet",
    projectPrompt: "Prompt du Projet",
    noProjects: "Aucun projet trouvé",
    refresh: "Actualiser",
    batchSync: "Synthèse par Lot",
    auralSynthesis: "Synthèse Vocale",
    freqOrch: "Orchestration des fréquences & cartographie linguistique",
    acousticMapping: "Archives Cartographiques Acoustiques",
    searchPlaceholder: "Rechercher des mots & exemples...",
    speakExample: "Prononcer l'Exemple",
    wordOnly: "Mot Uniquement",
    auralSynthed: "SYNTHÈSE OK",
    auralMissing: "AUDIO MANQUANT",
    noVocabMatch: "Aucun vocabulaire ne correspond à votre espace ou filtre.",
    synthesizing: "Synthèse en cours...",
    reGenerate: "Régénérer",
    generateVoice: "Générer la Voix",
    linguisticMapping: "Cartographie des Rôles Linguistiques",
    mapTTS: "Associez le texte TTS du vocabulaire et la synthèse vocale des phrases à des modèles de rôles personnalisables. Le marqueur actif indique les clones vocaux utilisés en aval.",
    activeCloner: "Framework de Clonage Actif",
    diagnosticsDesc: "Synthèse rapide des trames audio. Les ondes audio sont directement exportées au format MP3 haute fidélité et liées à la base de données.",
    globalSettings: "Paramètres Globaux",
    workspacePath: "Chemin de l'Espace de Travail",
    saveSettings: "Sauvegarder les Paramètres",
    workspaceConfigDesc: "Dossier racine global contenant toutes les ressources brutes, bases de données et caches locaux.",
    videoTranslation: "Traduction Vidéo"
  },
  es: {
    appName: "AI0 Studio de Video",
    system: "Sistema",
    localNode: "Nodo Local",
    masterNodeLink: "Enlace Nodo Maestro",
    render4K: "Renderizar 4K",
    dashboard: "Panel",
    models: "Modelos",
    configuration: "Configuración",
    editorSuite: "Suite de Edición",
    discovery: "Descubrimiento",
    scripting: "Guion",
    visuals: "Visuales",
    audio: "Síntesis de Audio",
    timeline: "Línea de Tiempo",
    export: "Exportar",
    projectDetails: "Detalles del Proyecto",
    wordManagement: "Gestión de Palabras",
    createProject: "Crear Proyecto",
    projectName: "Nombre del Proyecto",
    projectPrompt: "Prompt del Proyecto",
    noProjects: "No se encontraron proyectos",
    refresh: "Actualizar Palabras",
    batchSync: "Generación en Lote",
    auralSynthesis: "Síntesis de Audio",
    freqOrch: "Orquestación de frecuencias y mapeo lingüístico",
    acousticMapping: "Archivos de Mapeo Acústico",
    searchPlaceholder: "Buscar palabras y ejemplos...",
    speakExample: "Pronunciar Ejemplo",
    wordOnly: "Solo Palabra",
    auralSynthed: "AUDIO SINTETIZADO",
    auralMissing: "SIN AUDIO",
    noVocabMatch: "Ninguna palabra coincide con su espacio de trabajo o filtro.",
    synthesizing: "Sintetizando...",
    reGenerate: "Regenerar",
    generateVoice: "Generar Voz",
    linguisticMapping: "Mapeo de Roles Lingüísticos",
    mapTTS: "Asocie el texto TTS del vocabulario y la síntesis de voz a plantillas de roles personalizables. El marcador activo indica el clonador de voz a utilizar.",
    activeCloner: "Marco de Clonación Activo",
    diagnosticsDesc: "Síntesis ultra rápida de trames de audio. Se exportan directamente en alta fidelidad en formato MP3 y se vinculan a la base de datos.",
    globalSettings: "Ajustes Globales",
    workspacePath: "Ruta de Espacio de Trabajo",
    saveSettings: "Guardar Ajustes",
    workspaceConfigDesc: "Carpeta raíz global para todos los activos originales, bases de datos y memorias caché locales.",
    videoTranslation: "Traducción de Video"
  },
  nl: {
    appName: "AI0 Video Studio",
    system: "Systeem",
    localNode: "Lokale Node",
    masterNodeLink: "Hoofdnodekoppeling",
    render4K: "Renderen in 4K",
    dashboard: "Dashboard",
    models: "Modellen",
    configuration: "Instellingen",
    editorSuite: "Editor Suite",
    discovery: "Ontdekking",
    scripting: "Scripting",
    visuals: "Visueel",
    audio: "Geluidsynthese",
    timeline: "Tijdlijn",
    export: "Exporteren",
    projectDetails: "Project Details",
    wordManagement: "Woordbeheer",
    createProject: "Project Aanmaken",
    projectName: "Projectnaam",
    projectPrompt: "Project Prompt",
    noProjects: "Geen projecten gevonden",
    refresh: "Woorden Vernieuwen",
    batchSync: "Batch-synthese",
    auralSynthesis: "Geluidsynthese",
    freqOrch: "Frequentie-orkestratie & taalkundige mapping",
    acousticMapping: "Akoestisch Archief",
    searchPlaceholder: "Zoek woorden & voorbeelden...",
    speakExample: "Spreek Voorbeeld",
    wordOnly: "Alleen Woord",
    auralSynthed: "AUDIO GESYNTREERD",
    auralMissing: "GEEN AUDIO",
    noVocabMatch: "Geen woorden gevonden die overeenkomen met uw filter.",
    synthesizing: "Synthetiseren...",
    reGenerate: "Opnieuw genereren",
    generateVoice: "Stem Genereren",
    linguisticMapping: "Taalkundige Roltoewijzing",
    mapTTS: "Koppel woord-TTS-tekst en spraaksynthese aan aanpasbare rolprofielen. De actieve markering geeft de stemcloner aan die in de verwerking wordt gebruikt.",
    activeCloner: "Actief Spraakcloningssysteem",
    diagnosticsDesc: "Gebruikmaken van snelle audioframesynthese. Audiogolven worden rechtstreeks opgenomen in mp3-indeling met hoge getrouwheid.",
    globalSettings: "Algemene Instellingen",
    workspacePath: "Werkruimtepad",
    saveSettings: "Instellingen Opslaan",
    workspaceConfigDesc: "Globale hoofdmap voor alle ruwe bestanden, databases en lokale caches.",
    videoTranslation: "Video Vertaling"
  }
};

interface LanguageContextType {
  language: 'en' | 'zh' | 'ar' | 'no' | 'fr' | 'es' | 'nl';
  selectedLanguage: LanguageCode;
  translations: TranslationKeys;
  setLanguage: (lang: LanguageCode) => void;
  t: (key: keyof TranslationKeys) => string;
}

const LanguageContext = createContext<LanguageContextType | undefined>(undefined);

export const LANGUAGE_LABELS: Record<LanguageCode, string> = {
  auto: "跟随系统 (Auto)",
  en: "English",
  zh: "中文",
  ar: "العربية",
  no: "Norsk",
  fr: "Français",
  es: "Español",
  nl: "Nederlands"
};

export const LanguageProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [selectedLanguage, setSelectedLanguage] = useState<LanguageCode>(() => {
    const saved = localStorage.getItem('app_language');
    if (saved && (saved === 'en' || saved === 'zh' || saved === 'ar' || saved === 'no' || saved === 'fr' || saved === 'es' || saved === 'nl' || saved === 'auto')) {
      return saved as LanguageCode;
    }
    return 'auto'; // Default to auto
  });

  const getSystemLanguage = (): 'en' | 'zh' | 'ar' | 'no' | 'fr' | 'es' | 'nl' => {
    const sysLang = (navigator.language || '').toLowerCase();
    const code = sysLang.split('-')[0];
    if (['en', 'zh', 'ar', 'no', 'fr', 'es', 'nl'].includes(code)) {
      return code as any;
    }
    return 'en'; // Default fallback
  };

  const resolvedLanguage = selectedLanguage === 'auto' ? getSystemLanguage() : selectedLanguage;

  const setLanguage = (lang: LanguageCode) => {
    setSelectedLanguage(lang);
    localStorage.setItem('app_language', lang);
  };

  useEffect(() => {
    // Handle RTL document alignment for Arabic
    if (resolvedLanguage === 'ar') {
      document.documentElement.dir = 'rtl';
      document.documentElement.lang = 'ar';
    } else {
      document.documentElement.dir = 'ltr';
      document.documentElement.lang = resolvedLanguage;
    }
  }, [resolvedLanguage]);

  const t = (key: keyof TranslationKeys) => {
    return translations[resolvedLanguage][key] || translations['en'][key];
  };

  return (
    <LanguageContext.Provider value={{ 
      language: resolvedLanguage, 
      selectedLanguage, 
      translations: translations[resolvedLanguage], 
      setLanguage, 
      t 
    }}>
      {children}
    </LanguageContext.Provider>
  );
};

export const useTranslation = () => {
  const context = useContext(LanguageContext);
  if (context === undefined) {
    throw new Error('useTranslation must be used within a LanguageProvider');
  }
  return context;
};
