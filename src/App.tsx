
import React, { useState, useEffect, useRef, useCallback } from 'react';
import JSZip from 'jszip';
import { Header } from './components/Header';
import { Sidebar } from './components/Sidebar';
import { FileUpload } from './components/FileUpload';
import { StatsCard } from './components/StatsCard';
import { SubtitleEditor } from './components/SubtitleEditor';
import { SettingsModal } from './components/SettingsModal';
import { TimingModal } from './components/TimingModal';
import { ExportModal } from './components/ExportModal';
import { GlossaryModal } from './components/GlossaryModal';
import { TextTranslatorModal } from './components/TextTranslatorModal';
import { Toast, ToastType } from './components/Toast';
import { SubtitleBlock, AppStatus, BatchRequest, BatchResponse, AppSettings, AdjustmentConfig, StyleConfig, GlossaryItem, SubtitleFile, Modification, TranslationDiagnostic } from './types';
import { generateSubtitleFile, downloadFile, smartChunking, getSmartContextWindow, formatSubtitleForLanguage, adjustBlockTiming, validateNetflixStandards, fixNetflixStandards, optimizePersianStructure, paragraphChunking } from './services/subtitleUtils';
import { translateBatch, diagnoseConnection, retranslateSelectedBlocks, getTranslationDiagnostic, translateSkeletonPayload, ensureFreshGeminiFlashModels, isAbortError } from './services/geminiService';
import { buildSkeletonUserPrompt, extractTranslatedLinesByMarkerIds, normalizeSkeletonPersianHalfSpaces } from './services/methods/skeleton_str';
import { buildSubtitleTranslatorUserPrompt, extractTranslatedLinesByMarkerIds as extractSubtitleTranslatorLinesByMarkerIds, normalizeSubtitleTranslatorPersianHalfSpaces } from './services/methods/subtitle_translator_strategy';
import { getFromMemory, addToMemory } from './services/translationMemory';
import ProjectStateManager, { ProjectState, buildProjectStateFromFile } from './services/projectStateManager'; // Import Manager
import { TranslationJobRunner } from './services/translationJobRunner';
import { SKELETON_STR_CONTEXT_WINDOW, DELAY_BETWEEN_FILES_MS, APP_CONFIG, TOPIC_TEMPERATURE_DEFAULTS, getAdaptiveBatchDelay, getAdaptiveTranslationBatchSize } from './constants';
import { Loader2, Check, Wand2, History, ArrowUp, X } from 'lucide-react';

const SETTINGS_STORAGE_KEY = 'submaster_pro_settings_v1';
const VERSION_STORAGE_KEY = 'submaster_pro_version';

const App: React.FC = () => {
  // --- STATE ---
  const [files, setFiles] = useState<SubtitleFile[]>([]);
  const [activeFileId, setActiveFileId] = useState<string | null>(null);
  const [savedProjects, setSavedProjects] = useState<string[]>([]); // Track saved sessions
  
  const [toast, setToast] = useState<Array<{id: number; msg: string; type: ToastType}>>([]);
  const toastIdRef = useRef(0);
  
  // UI State
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isTimingModalOpen, setIsTimingModalOpen] = useState(false);
  const [isExportModalOpen, setIsExportModalOpen] = useState(false);
  const [isGlossaryModalOpen, setIsGlossaryModalOpen] = useState(false);
  const [isTranslatorOpen, setIsTranslatorOpen] = useState(false);
  
  const [completionToast, setCompletionToast] = useState<boolean>(false);
  const [showScrollTop, setShowScrollTop] = useState(false);
  const [isRetranslatingSelection, setIsRetranslatingSelection] = useState(false);

  // Settings State
  const [settings, setSettings] = useState<AppSettings>({
    tone: 'conversational',
    topic: 'educational',
    temperature: 0.35, 
    outputFormat: 'vtt', 
    outputStandard: 'normal',
    translationMethod: 'default',
    model: 'standard', 
    aiProvider: 'gemini',
    lmStudioBaseUrl: 'http://localhost:1234/v1',
    lmStudioModel: 'local-model',
    openAICompatibleServices: [],
    activeOpenAICompatibleServiceId: undefined,
    customPrompt: '',
    apiKeys: [],
    enableTranslationMemory: true,
    glossary: [],
    doNotTranslateTerms: '',
    theme: 'dark',
    targetLanguage: 'fa'
  });

  // Refs for processing
  const filesRef = useRef<SubtitleFile[]>([]);
  const isTranslatingRef = useRef<boolean>(false);
  const isPausedRef = useRef<boolean>(false); 
  const autoPipelineActiveRef = useRef<boolean>(false);
  const settingsRef = useRef<AppSettings>(settings);
  const scrollContainerRef = useRef<HTMLDivElement | null>(null);
  const jobRunnerRef = useRef<TranslationJobRunner | null>(null);

  useEffect(() => { filesRef.current = files; }, [files]);
  useEffect(() => { settingsRef.current = settings; }, [settings]);


  const handleMainScroll = () => {
    const container = scrollContainerRef.current;
    if (!container) return;
    setShowScrollTop(container.scrollTop > 320);
  };

  const scrollToTop = () => {
    scrollContainerRef.current?.scrollTo({ top: 0, behavior: 'smooth' });
  };

  // Apply Theme
  useEffect(() => {
     const root = document.documentElement;
     if (settings.theme === 'light') {
         root.setAttribute('data-theme', 'light');
         root.classList.remove('dark');
         root.classList.add('light');
     } else {
         root.removeAttribute('data-theme');
         root.classList.add('dark');
         root.classList.remove('light');
     }
  }, [settings.theme]);

  // Load settings & saved projects
  useEffect(() => {
    const savedSettings = localStorage.getItem(SETTINGS_STORAGE_KEY);
    if (savedSettings) {
      try {
        const parsed = JSON.parse(savedSettings);
        if (!parsed.apiKeys) parsed.apiKeys = [];
        if (!parsed.outputStandard) parsed.outputStandard = 'normal';
        if (!parsed.translationMethod) parsed.translationMethod = 'default';
        if (parsed.enableTranslationMemory === undefined) parsed.enableTranslationMemory = true;
        if (!parsed.glossary) parsed.glossary = [];
        if (!parsed.doNotTranslateTerms) parsed.doNotTranslateTerms = '';
        if (!parsed.aiProvider) parsed.aiProvider = 'gemini';
        if (!parsed.lmStudioBaseUrl) parsed.lmStudioBaseUrl = 'http://localhost:1234/v1';
        if (!parsed.lmStudioModel) parsed.lmStudioModel = 'local-model';
        if (!parsed.openAICompatibleServices) parsed.openAICompatibleServices = [];
        if (parsed.temperature === undefined) parsed.temperature = 0.7; 
        if (!parsed.theme) parsed.theme = 'dark';
        if (!parsed.targetLanguage) parsed.targetLanguage = 'fa';
        setSettings(prev => ({ ...prev, ...parsed }));
      } catch (error) {
        console.error('Failed to load settings from local storage:', error);
      }
    }

    localStorage.setItem(VERSION_STORAGE_KEY, APP_CONFIG.version);

    // Check for saved project states
    const projects = ProjectStateManager.listSavedProjects();
    setSavedProjects(projects);
  }, []);

  // --- SAVE LOGIC ---

  // Reusable function to save current state
  const saveCurrentProjectState = useCallback(() => {
    if (files.length > 0) {
      files.forEach(file => {
        ProjectStateManager.saveProjectState(file.id, buildProjectStateFromFile(file));
      });
      setSavedProjects(ProjectStateManager.listSavedProjects());
    }
  }, [files]);

  // Auto-Save Logic (Debounced slightly by React batched updates, runs on file change)
  useEffect(() => {
    saveCurrentProjectState();
  }, [files, saveCurrentProjectState]); 

  // Manual Save Handler (To LocalStorage)
  const handleManualSave = () => {
    saveCurrentProjectState();
    showToast('پروژه با موفقیت در مرورگر ذخیره شد.', 'success');
  };

  // Export Project to JSON File (Portable)
  const handleExportProjectFile = () => {
    const file = getActiveFile();
    if (!file) return;

    const state: ProjectState = buildProjectStateFromFile(file);

    const jsonString = JSON.stringify(state, null, 2);
    const fileName = `${file.name.replace(/\.[^/.]+$/, "")}_backup.json`;
    downloadFile(fileName, jsonString);
    showToast('فایل پشتیبان پروژه دانلود شد.', 'success');
  };

  // Automatically save state to LocalStorage and trigger JSON file download on pause or cancel
  const autoExportProjectState = (fileToExport: SubtitleFile, reason: 'paused' | 'cancelled') => {
    try {
      const state: ProjectState = buildProjectStateFromFile(fileToExport);
      ProjectStateManager.saveProjectState(fileToExport.id, state);
      setSavedProjects(ProjectStateManager.listSavedProjects());

      const baseName = fileToExport.name.replace(/\.[^/.]+$/, "");
      const fileName = `${baseName}_${reason}_backup.json`;
      const jsonString = JSON.stringify(state, null, 2);
      downloadFile(fileName, jsonString);
    } catch (err) {
      console.error('Failed to auto-export project state:', err);
    }
  };


  // Auto-adjust temperature when topic changes
  useEffect(() => {
    const preset = TOPIC_TEMPERATURE_DEFAULTS[settings.topic];
    if (preset) {
      setSettings(prev => {
        if (prev.temperature === preset.value) return prev;
        return { ...prev, temperature: preset.value };
      });
    }
  }, [settings.topic]);

  const updateSettings = (newSettings: Partial<AppSettings>) => {
    setSettings(prev => {
      const updated = { ...prev, ...newSettings };
      localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(updated));
      return updated;
    });
  };

  const handleUpdateGlossary = (newGlossary: GlossaryItem[]) => {
      updateSettings({ glossary: newGlossary });
  };

  const showToast = (msg: string, type: ToastType = 'error') => {
    const id = ++toastIdRef.current;
    setToast(prev => [...prev, { id, msg, type }].slice(-5));
  };

  const dismissToast = (id: number) => setToast(prev => prev.filter(item => item.id !== id));

  const showDiagnosticToast = (diagnostic: TranslationDiagnostic) => {
    showToast(`${diagnostic.title}: ${diagnostic.recovery}`, diagnostic.severity === 'info' ? 'success' : diagnostic.severity);
  };

  // Dynamic Gemini Flash Model Discovery on app startup
  useEffect(() => {
    const activeKey = settings.apiKeys.find(k => k.isValid && !k.isRateLimited)?.key || settings.apiKeys[0]?.key;
    if (activeKey) {
      ensureFreshGeminiFlashModels(activeKey).catch(err => {
        console.warn('[App] Background Gemini model discovery notice:', err?.message || err);
      });
    }
  }, [settings.apiKeys]);

  // Model auto-fallback notification listener
  useEffect(() => {
    const handleModelFallbackEvent = (e: Event) => {
      const customEvent = e as CustomEvent<{ fromModel: string; toModel: string; message: string }>;
      if (customEvent.detail?.message) {
        showToast(customEvent.detail.message, 'warning');
      }
    };

    window.addEventListener('submaster_model_fallback', handleModelFallbackEvent);
    return () => {
      window.removeEventListener('submaster_model_fallback', handleModelFallbackEvent);
    };
  }, []);

  // --- FILE MANAGEMENT ---

  const handleFilesLoaded = (loadedFiles: { blocks: SubtitleBlock[], filename: string, type: 'SRT' | 'VTT' | 'ASS', size: number }[]) => {
    const isCurrentlyTranslating = isTranslatingRef.current;
    const isAutoPipelineActive = autoPipelineActiveRef.current;

    const newFiles: SubtitleFile[] = loadedFiles.map(f => ({
      id: crypto.randomUUID(),
      name: f.filename,
      size: f.size,
      type: f.type,
      originalType: f.type,
      blocks: f.blocks,
      status: AppStatus.READY,
      progress: 0,
      progressMessage: (isCurrentlyTranslating || isAutoPipelineActive) ? 'در صف ترجمه...' : undefined,
      diagnostic: null,
      processedCount: 0,
      activeTranslationBlockIds: [],
      netflixErrors: [],
      // Initialize History
      modificationsMade: [],
      historyPointer: -1
    }));

    // Update synchronous ref immediately so running tasks can find the new files without delay
    filesRef.current = [...filesRef.current, ...newFiles];
    setFiles(prev => [...prev, ...newFiles]);

    if (activeFileId === null && newFiles.length > 0) {
      setActiveFileId(newFiles[0].id);
    }

    // If batch translation is actively running, dynamically enqueue into the active runner
    if (isCurrentlyTranslating && jobRunnerRef.current) {
      newFiles.forEach(f => {
        jobRunnerRef.current?.enqueue(f.id);
      });
      showToast(
        newFiles.length === 1 
          ? `فایل "${newFiles[0].name}" به صف پردازش فعلی افزوده شد و پس از فایل‌های قبلی به صورت خودکار ترجمه می‌شود.`
          : `${newFiles.length} فایل جدید به صف پردازش فعلی افزوده شدند و به صورت خودکار ترجمه می‌شوند.`, 
        'info'
      );
    } else if (isAutoPipelineActive) {
      showToast(
        newFiles.length === 1
          ? `فایل "${newFiles[0].name}" به پروژه افزوده شد؛ ترجمه خودکار آغاز می‌شود...`
          : `${newFiles.length} فایل جدید به پروژه افزوده شدند؛ ترجمه خودکار آغاز می‌شود...`,
        'info'
      );
      setTimeout(() => {
        startBatchTranslation();
      }, 80);
    } else {
      setToast([]);
    }
  };

  // Handle Importing a Backup JSON file
  const handleProjectImport = (projectState: ProjectState) => {
    const restoredFile: SubtitleFile = {
        id: projectState.id || crypto.randomUUID(),
        name: projectState.name,
        size: 0, // Not strictly needed for resume
        type: projectState.type,
        originalType: projectState.type,
        blocks: projectState.allBlocks,
        status: projectState.status as AppStatus,
        progress: projectState.progress,
        processedCount: projectState.completedChunks,
        netflixErrors: [],
        // Restore History if available
        modificationsMade: projectState.modificationsMade || [],
        historyPointer: projectState.modificationsMade ? projectState.modificationsMade.length - 1 : -1
    };

    // If importing a completed file, ensure status is reflected
    if (restoredFile.progress >= 100) {
        restoredFile.status = AppStatus.COMPLETED;
    } else if (restoredFile.status === AppStatus.TRANSLATING) {
        restoredFile.status = AppStatus.PAUSED; // Don't auto-start translating
    }

    setFiles([restoredFile]); // Replace current workspace? Or append? Let's replace for a cleaner state restore.
    setActiveFileId(restoredFile.id);
    
    // Save to LS immediately so it sticks
    ProjectStateManager.saveProjectState(restoredFile.id, projectState);
    setSavedProjects(ProjectStateManager.listSavedProjects());

    showToast(`پروژه "${projectState.name}" با موفقیت بازیابی شد.`, 'success');
  };

  const handleResumeSession = () => {
    const loadedFiles: SubtitleFile[] = [];
    savedProjects.forEach(pid => {
        const pState = ProjectStateManager.loadProjectState(pid);
        if (pState) {
            loadedFiles.push({
                id: pState.id,
                name: pState.name,
                size: 0, // Metadata lost in simple schema, not critical
                type: pState.type,
                originalType: pState.type,
                blocks: pState.allBlocks,
                status: pState.status as AppStatus,
                progress: pState.progress,
                processedCount: pState.completedChunks,
                netflixErrors: [],
                modificationsMade: pState.modificationsMade || [],
                historyPointer: pState.modificationsMade ? pState.modificationsMade.length - 1 : -1
            });
        }
    });

    if (loadedFiles.length > 0) {
        setFiles(loadedFiles);
        setActiveFileId(loadedFiles[0].id);
        showToast(`نشست قبلی با ${loadedFiles.length} فایل بازیابی شد.`, 'success');
    }
  };

  const handleClearSavedSessions = () => {
      savedProjects.forEach(pid => ProjectStateManager.deleteProjectState(pid));
      setSavedProjects([]);
      showToast('تاریخچه ذخیره شده پاک شد.', 'success');
  };

  const handleFileError = (msg: string) => {
    showToast(msg, 'error');
  };

  const resetProject = () => {
    files.forEach(f => ProjectStateManager.deleteProjectState(f.id));
    
    autoPipelineActiveRef.current = false;
    jobRunnerRef.current?.cancelAll();
    setFiles([]);
    setActiveFileId(null);
    setToast([]);
    setCompletionToast(false);
    isTranslatingRef.current = false;
    isPausedRef.current = false;
    setSavedProjects(ProjectStateManager.listSavedProjects());
  };

  const removeFile = (fileId: string) => {
    const removedIndex = files.findIndex(file => file.id === fileId);
    if (removedIndex === -1) return;
    ProjectStateManager.deleteProjectState(fileId);

    // If active translation runner is running, safely dequeue or abort this file
    if (jobRunnerRef.current) {
      jobRunnerRef.current.abortFile(fileId);
    }

    filesRef.current = filesRef.current.filter(file => file.id !== fileId);
    setFiles(prev => prev.filter(file => file.id !== fileId));
    if (activeFileId === fileId) {
      const remaining = filesRef.current;
      setActiveFileId(remaining[Math.min(removedIndex, remaining.length - 1)]?.id || null);
    }
    showToast('فایل از پروژه حذف شد.', 'success');
  };

  const updateBlock = (fileId: string, blockId: number, text: string) => {
    setFiles(prev => prev.map(f => {
      if (f.id === fileId) {
        return {
          ...f,
          blocks: f.blocks.map(b => b.id === blockId ? { ...b, translatedText: text } : b)
        };
      }
      return f;
    }));
  };

  const getActiveFile = () => {
    return files.find(f => f.id === activeFileId) || files[0];
  };

  const getActiveFileIndex = () => {
    return files.findIndex(f => f.id === activeFileId);
  }

  // --- UNDO / REDO LOGIC ---

  const handleCommitChange = (blockId: number, oldText: string, newText: string) => {
      if (!activeFileId || oldText === newText) return;

      setFiles(prev => prev.map(f => {
          if (f.id === activeFileId) {
              const newHistory = f.modificationsMade.slice(0, f.historyPointer + 1);
              newHistory.push({
                  blockId,
                  oldState: { translatedText: oldText },
                  newState: { translatedText: newText },
                  timestamp: new Date().toISOString()
              });
              
              return {
                  ...f,
                  modificationsMade: newHistory,
                  historyPointer: newHistory.length - 1
              };
          }
          return f;
      }));
  };

  const handleUndo = useCallback(() => {
      if (!activeFileId) return;
      
      setFiles(prev => prev.map(f => {
          if (f.id === activeFileId && f.historyPointer > -1) {
              let currentPtr = f.historyPointer;
              let currentMod = f.modificationsMade[currentPtr];
              const groupId = currentMod.groupId;
              
              let newBlocks = [...f.blocks];

              // Logic loop to handle grouped actions (undo all actions with same GroupID)
              do {
                   currentMod = f.modificationsMade[currentPtr];
                   newBlocks = newBlocks.map(b => {
                        if (b.id === currentMod.blockId) {
                            return { ...b, ...currentMod.oldState };
                        }
                        return b;
                   });
                   currentPtr--;
              } while (
                  groupId && 
                  currentPtr > -1 && 
                  f.modificationsMade[currentPtr].groupId === groupId
              );

              return {
                  ...f,
                  blocks: newBlocks,
                  historyPointer: currentPtr
              };
          }
          return f;
      }));
      showToast('Undo performed', 'success');
  }, [activeFileId]);

  const handleRetranslateSelectedBlocks = async (blockIds: number[]) => {
      if (!activeFileId || blockIds.length === 0 || isRetranslatingSelection) return;
      const file = filesRef.current.find(f => f.id === activeFileId);
      if (!file) return;

      const selectedSet = new Set(blockIds);
      const selectedIndexes = file.blocks
          .map((block, index) => selectedSet.has(block.id) ? index : -1)
          .filter(index => index !== -1);
      if (selectedIndexes.length === 0) return;

      const segments = selectedIndexes.reduce<number[][]>((acc, index) => {
          const lastSegment = acc[acc.length - 1];
          if (!lastSegment || index !== lastSegment[lastSegment.length - 1] + 1) {
              acc.push([index]);
          } else {
              lastSegment.push(index);
          }
          return acc;
      }, []);
      const selectedBlocks = selectedIndexes.map(index => file.blocks[index]);

      const onKeyRateLimit = (failedKey: string) => {
          showToast(`کلید API (...${failedKey.slice(-4)}) به محدودیت رسید. جایگزینی با کلید بعدی...`, 'warning');
          setSettings(prev => ({
              ...prev,
              apiKeys: prev.apiKeys.map(k => k.key === failedKey ? { ...k, isRateLimited: true } : k)
          }));
      };

      setIsRetranslatingSelection(true);
      showToast(`${selectedBlocks.length} بلوک برای ترجمه دوباره ارسال شد.`, 'warning');

      try {
          const segmentResults = [];
          for (const segment of segments) {
              const segmentStart = segment[0];
              const segmentEnd = segment[segment.length - 1] + 1;
              const { contextStart, contextEnd } = getSmartContextWindow(file.blocks, segmentStart, segmentEnd, 6);
              const contextPre = file.blocks
                  .slice(contextStart, segmentStart)
                  .map(block => ({ id: block.id, text: `${block.originalText} (Persian: ${block.translatedText || 'N/A'})` }));
              const contextPost = file.blocks
                  .slice(segmentEnd, contextEnd)
                  .map(block => ({ id: block.id, text: block.originalText }));
              const targetSegment = file.blocks.slice(segmentStart, segmentEnd);

              const translatedSegment = await retranslateSelectedBlocks(
                  targetSegment.map(block => ({
                      id: block.id,
                      text: block.originalText,
                      previousTranslatedText: block.translatedText || '',
                      problemHint: 'user-selected for retranslation'
                  })),
                  contextPre,
                  contextPost,
                  settingsRef.current,
                  onKeyRateLimit
              );
              segmentResults.push(translatedSegment);
          }
          const results = segmentResults.flat();
          const resultMap = new Map(results.map(result => [result.id, formatSubtitleForLanguage(result.translatedText, settingsRef.current.targetLanguage)]));
          const groupId = crypto.randomUUID();

          setFiles(prev => prev.map(currentFile => {
              if (currentFile.id !== activeFileId) return currentFile;
              const newHistory = currentFile.modificationsMade ? currentFile.modificationsMade.slice(0, currentFile.historyPointer + 1) : [];
              const newBlocks = currentFile.blocks.map(block => {
                  const translatedText = resultMap.get(block.id);
                  if (!translatedText) return block;
                  newHistory.push({
                      blockId: block.id,
                      oldState: { translatedText: block.translatedText },
                      newState: { translatedText },
                      groupId,
                      timestamp: new Date().toISOString()
                  });
                  if (settingsRef.current.enableTranslationMemory) {
                      addToMemory(block.originalText, translatedText);
                  }
                  return { ...block, translatedText };
              });

              return {
                  ...currentFile,
                  blocks: newBlocks,
                  processedCount: newBlocks.filter(block => !!block.translatedText).length,
                  modificationsMade: newHistory,
                  historyPointer: newHistory.length - 1
              };
          }));

          showToast('ترجمه دوباره بلوک‌های انتخاب‌شده با موفقیت جایگذاری شد.', 'success');
      } catch (error: any) {
          if (isAbortError(error)) return;
          console.error('Retranslation error:', error);
          showToast(error.message || 'ترجمه دوباره بلوک‌های انتخاب‌شده ناموفق بود.', 'error');
      } finally {
          setIsRetranslatingSelection(false);
      }
  };

  const handleRedo = useCallback(() => {
      if (!activeFileId) return;

      setFiles(prev => prev.map(f => {
          if (f.id === activeFileId && f.historyPointer < f.modificationsMade.length - 1) {
              let currentPtr = f.historyPointer + 1;
              let currentMod = f.modificationsMade[currentPtr];
              const groupId = currentMod.groupId;

              let newBlocks = [...f.blocks];

              // Logic loop to handle grouped actions (redo all actions with same GroupID)
              do {
                   currentMod = f.modificationsMade[currentPtr];
                   newBlocks = newBlocks.map(b => {
                        if (b.id === currentMod.blockId) {
                            return { ...b, ...currentMod.newState };
                        }
                        return b;
                   });
                   
                   // Check next item to see if it belongs to same group
                   if (groupId && currentPtr < f.modificationsMade.length - 1) {
                       if (f.modificationsMade[currentPtr + 1].groupId === groupId) {
                           currentPtr++;
                           continue;
                       }
                   }
                   break; // Stop if next item is not in group or end of list
              } while (true);

              return {
                  ...f,
                  blocks: newBlocks,
                  historyPointer: currentPtr
              };
          }
          return f;
      }));
       showToast('Redo performed', 'success');
  }, [activeFileId]);

  // Keyboard Shortcuts for Undo/Redo
  useEffect(() => {
      const handleKeyDown = (e: KeyboardEvent) => {
          if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
              e.preventDefault();
              if (e.shiftKey) {
                  handleRedo();
              } else {
                  handleUndo();
              }
          }
          // Support Ctrl+Y for Redo on Windows
          if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'y' && !e.shiftKey) {
              e.preventDefault();
              handleRedo();
          }
      };

      window.addEventListener('keydown', handleKeyDown);
      return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleUndo, handleRedo]);

  // --- BATCH ACTION LOGIC ---

  const handleFindReplace = (find: string, replace: string, scope: 'current' | 'all') => {
    if (!find) return;
    let totalOccurrences = 0;
    const targetFiles = scope === 'all' ? files : files.filter(f => f.id === activeFileId);
    
    // Batch ID for Undo/Redo Grouping
    const groupId = crypto.randomUUID();

    const updatedFiles = files.map(f => {
       if (!targetFiles.find(tf => tf.id === f.id)) return f;

       const newHistory = f.modificationsMade ? f.modificationsMade.slice(0, f.historyPointer + 1) : [];
       let fileOccurrences = 0;
       
       const newBlocks = f.blocks.map(block => {
         if (block.translatedText && block.translatedText.includes(find)) {
            const newText = block.translatedText.replaceAll(find, replace);
            if (newText !== block.translatedText) {
                fileOccurrences++;
                
                // Add to history
                newHistory.push({
                    blockId: block.id,
                    oldState: { translatedText: block.translatedText },
                    newState: { translatedText: newText },
                    groupId: groupId,
                    timestamp: new Date().toISOString()
                });

                return { ...block, translatedText: newText };
            }
         }
         return block;
       });

       totalOccurrences += fileOccurrences;
       return { 
           ...f, 
           blocks: newBlocks,
           modificationsMade: newHistory,
           historyPointer: newHistory.length - 1
       };
    });

    if (totalOccurrences > 0) {
      setFiles(updatedFiles);
      showToast(`${totalOccurrences} مورد در ${scope === 'all' ? 'همه فایل‌ها' : 'فایل جاری'} جایگزین شد.`, 'success');
    } else {
      showToast('موردی برای جایگزینی یافت نشد.', 'warning');
    }
  };

  const handleTimingAdjustment = (config: AdjustmentConfig, scope: 'current' | 'all') => {
    if (!activeFileId && files.length === 0) return;

    let updatedCount = 0;
    setFiles(prev => prev.map(f => {
        const shouldUpdate = scope === 'all' || f.id === activeFileId;
        if (shouldUpdate) {
            updatedCount++;
            return {
                ...f,
                blocks: adjustBlockTiming(f.blocks, config),
                netflixErrors: [] 
            };
        }
        return f;
    }));
    showToast(`تغییرات زمان‌بندی روی ${scope === 'all' ? 'همه فایل‌ها' : 'فایل جاری'} اعمال شد.`, 'success');
  };

  const handleNetflixCheck = () => {
    if (!activeFileId) return;
    const file = files.find(f => f.id === activeFileId);
    if (!file) return;

    const errors = validateNetflixStandards(file.blocks, settings.outputStandard);
    setFiles(prev => prev.map(f => f.id === file.id ? { ...f, netflixErrors: errors } : f));
    
    if (errors.length === 0) {
       showToast("هیچ خطایی مطابق استاندارد انتخاب شده یافت نشد.", 'success');
    }
  };

  const handleFixNetflixErrors = () => {
    if (!activeFileId) return;
    const file = files.find(f => f.id === activeFileId);
    if (!file) return;

    // Batch ID for Undo/Redo
    const groupId = crypto.randomUUID();
    const newHistory = file.modificationsMade ? file.modificationsMade.slice(0, file.historyPointer + 1) : [];

    // Calculate fixes based on current standard
    const fixedBlocks = fixNetflixStandards(file.blocks, settings.outputStandard);
    
    // Determine which blocks actually changed to log them in history
    let changesCount = 0;
    fixedBlocks.forEach((newBlock) => {
        const oldBlock = file.blocks.find(b => b.id === newBlock.id);
        if (oldBlock) {
             const textChanged = oldBlock.translatedText !== newBlock.translatedText;
             const timeChanged = oldBlock.endTime !== newBlock.endTime;

             if (textChanged || timeChanged) {
                 changesCount++;
                 newHistory.push({
                     blockId: newBlock.id,
                     oldState: { 
                         translatedText: oldBlock.translatedText, 
                         endTime: oldBlock.endTime 
                     },
                     newState: { 
                         translatedText: newBlock.translatedText, 
                         endTime: newBlock.endTime 
                     },
                     groupId: groupId,
                     timestamp: new Date().toISOString()
                 });
             }
        }
    });

    const remainingErrors = validateNetflixStandards(fixedBlocks, settings.outputStandard);

    setFiles(prev => prev.map(f => f.id === file.id ? { 
        ...f, 
        blocks: fixedBlocks, 
        netflixErrors: remainingErrors,
        modificationsMade: newHistory,
        historyPointer: newHistory.length - 1
    } : f));

    if (remainingErrors.length === 0) {
        showToast("تمامی خطاها با موفقیت برطرف شدند!", 'success');
    } else {
        showToast(`اصلاح خودکار انجام شد. ${remainingErrors.length} مورد باقی مانده است.`, 'warning');
    }
  };


  const handleAutoFixSelectedBlocks = (blockIds: number[]) => {
      if (!activeFileId || blockIds.length === 0) return;
      const file = files.find(f => f.id === activeFileId);
      if (!file) return;

      const selectedIds = new Set(blockIds);
      const fixedBlocks = fixNetflixStandards(file.blocks, settings.outputStandard);
      const fixedById = new Map(fixedBlocks.map(block => [block.id, block]));
      const groupId = crypto.randomUUID();
      const newHistory = file.modificationsMade ? file.modificationsMade.slice(0, file.historyPointer + 1) : [];
      let changesCount = 0;

      const updatedBlocks = file.blocks.map(block => {
          if (!selectedIds.has(block.id)) return block;
          const fixedBlock = fixedById.get(block.id);
          if (!fixedBlock) return block;

          const textChanged = block.translatedText !== fixedBlock.translatedText;
          const endTimeChanged = block.endTime !== fixedBlock.endTime;
          if (textChanged || endTimeChanged) {
              changesCount++;
              newHistory.push({
                  blockId: block.id,
                  oldState: {
                      translatedText: block.translatedText,
                      endTime: block.endTime
                  },
                  newState: {
                      translatedText: fixedBlock.translatedText,
                      endTime: fixedBlock.endTime
                  },
                  groupId,
                  timestamp: new Date().toISOString()
              });
          }

          return {
              ...block,
              translatedText: fixedBlock.translatedText,
              endTime: fixedBlock.endTime
          };
      });

      const remainingErrors = validateNetflixStandards(updatedBlocks, settings.outputStandard);
      setFiles(prev => prev.map(f => f.id === activeFileId ? {
          ...f,
          blocks: updatedBlocks,
          netflixErrors: remainingErrors,
          modificationsMade: newHistory,
          historyPointer: newHistory.length - 1
      } : f));

      showToast(
          changesCount > 0
              ? `اصلاح خودکار روی ${changesCount} بلوک انتخاب‌شده اعمال شد.`
              : 'برای بلوک‌های انتخاب‌شده اصلاحی لازم نبود.',
          changesCount > 0 ? 'success' : 'warning'
      );
  };

  const handleDeleteSelectedBlocks = (blockIds: number[]) => {
      if (!activeFileId || blockIds.length === 0) return;
      const file = files.find(f => f.id === activeFileId);
      if (!file) return;

      const selectedIds = new Set(blockIds);
      const deletedCount = file.blocks.filter(block => selectedIds.has(block.id)).length;
      const remainingBlocks = file.blocks
          .filter(block => !selectedIds.has(block.id))
          .map((block, index) => ({ ...block, id: index + 1, index: index + 1 }));
      const translatedCount = remainingBlocks.filter(block => !!block.translatedText).length;

      setFiles(prev => prev.map(currentFile => currentFile.id === activeFileId ? {
          ...currentFile,
          blocks: remainingBlocks,
          processedCount: translatedCount,
          progress: remainingBlocks.length > 0 ? (translatedCount / remainingBlocks.length) * 100 : 0,
          netflixErrors: validateNetflixStandards(remainingBlocks, settings.outputStandard),
          modificationsMade: [],
          historyPointer: -1
      } : currentFile));

      showToast(`${deletedCount} بلوک حذف شد.`, 'success');
  };

  const handleOptimizePersianStructure = () => {
      if (!activeFileId) return;
      const file = files.find(f => f.id === activeFileId);
      if (!file) return;

      const optimizedBlocks = optimizePersianStructure(file.blocks);
      
      const newErrors = validateNetflixStandards(optimizedBlocks, settings.outputStandard);

      setFiles(prev => prev.map(f => f.id === activeFileId ? {
          ...f,
          blocks: optimizedBlocks,
          netflixErrors: newErrors
      } : f));

      showToast('ساختار زیرنویس بر اساس زبان فارسی بهینه‌سازی شد.', 'success');
  };

  // --- EXPORT LOGIC ---

  const handleOpenExportModal = () => {
    setIsExportModalOpen(true);
  };

  const handleConfirmDownload = (format: 'srt' | 'vtt' | 'ass', styles?: StyleConfig) => {
    const file = getActiveFile();
    if (!file) return;

    const outputName = file.name.replace(/\.(srt|vtt|ass|ssa)$/i, `_${settings.targetLanguage}.${format}`);
    const content = generateSubtitleFile(file.blocks, format, styles);
    downloadFile(outputName, content);
    setIsExportModalOpen(false);
  };

  const handleDownloadZip = async () => {
      const zip = new JSZip();
      
      files.forEach(f => {
         const format = settings.outputFormat;
         const outputName = f.name.replace(/\.(srt|vtt|ass|ssa)$/i, `_${settings.targetLanguage}.${format}`);
         const content = generateSubtitleFile(f.blocks, format); 
         zip.file(outputName, content);
      });

      const blob = await zip.generateAsync({type: "blob"});
      const element = document.createElement('a');
      element.href = URL.createObjectURL(blob);
      element.download = "subtitles_batch.zip";
      document.body.appendChild(element);
      element.click();
      document.body.removeChild(element);
  };

  // --- TRANSLATION LOGIC ---


  const translateTaggedBatchWithRecovery = async (
    targetBlocks: SubtitleBlock[],
    contextBlocks: SubtitleBlock[],
    targetStartIndex: number,
    targetEndIndex: number,
    isSubtitleTranslatorMethod: boolean,
    signal?: AbortSignal
  ): Promise<BatchResponse[]> => {
    const contextLines = contextBlocks.map(block =>
      block.translatedText
        ? `${block.originalText} (existing ${settingsRef.current.targetLanguage} translation: ${block.translatedText})`
        : block.originalText
    );
    const sourceById = new Map(targetBlocks.map(block => [block.id, block.originalText]));
    const translatedById = new Map<number, string>();
    const buildSelectivePayload = (group: SubtitleBlock[]): string => {
      const targetIds = new Set(group.map(block => block.id));
      const relativeIndices = group.map(block => contextBlocks.findIndex(item => item.id === block.id)).filter(index => index >= 0);
      const from = relativeIndices.length ? Math.min(...relativeIndices) : targetStartIndex;
      const to = relativeIndices.length ? Math.max(...relativeIndices) + 1 : targetEndIndex;
      const padding = Math.min(80, Math.max(1, Math.floor(SKELETON_STR_CONTEXT_WINDOW / 2)));
      const windowStart = Math.max(0, from - padding);
      const windowEnd = Math.min(contextBlocks.length, to + padding);
      return contextBlocks.slice(windowStart, windowEnd).map((block, offset) => {
        const absolute = windowStart + offset;
        const line = contextLines[absolute];
        const timedSource = `{${block.startTime} --> ${block.endTime}} ${block.originalText}`;
        return targetIds.has(block.id)
          ? `[TRANSLATE_${block.id}]${timedSource}[/TRANSLATE_${block.id}]`
          : `[CONTEXT]${line}[/CONTEXT]`;
      }).join('\n');
    };

    const requestGroup = async (group: SubtitleBlock[], attempt: number): Promise<void> => {
      if (group.length === 0) return;
      const groupIds = group.map(block => block.id);
      const payload = buildSelectivePayload(group);
      const prompt = isSubtitleTranslatorMethod
        ? buildSubtitleTranslatorUserPrompt(payload, group.length, settingsRef.current.targetLanguage, groupIds)
        : buildSkeletonUserPrompt(payload, group.length, settingsRef.current.targetLanguage, groupIds);
      const response = await translateSkeletonPayload(prompt, settingsRef.current, signal);
      const extracted = isSubtitleTranslatorMethod
        ? extractSubtitleTranslatorLinesByMarkerIds(response, groupIds, group.map(block => block.originalText), contextLines)
        : extractTranslatedLinesByMarkerIds(response, groupIds, group.map(block => block.originalText), contextLines);

      const missing: SubtitleBlock[] = [];
      extracted.forEach((value, index) => {
        const block = group[index];
        const normalized = value && settingsRef.current.targetLanguage === 'fa'
          ? (isSubtitleTranslatorMethod ? normalizeSubtitleTranslatorPersianHalfSpaces(value) : normalizeSkeletonPersianHalfSpaces(value))
          : value;
        if (
          normalized
          && normalized.trim()
          && normalized.trim() !== sourceById.get(block.id)?.trim()
        ) {
          translatedById.set(block.id, normalized);
        } else {
          missing.push(block);
        }
      });

      if (missing.length === 0) return;
      if (attempt === 0) {
        await requestGroup(missing, 1);
        return;
      }

      const fallbackSettings = { ...settingsRef.current, translationMethod: 'default' as const };
      const fallbackResults = await translateBatch(
        missing.map(block => ({ id: block.id, text: block.originalText })),
        contextBlocks.slice(0, targetStartIndex).map(block => ({ id: block.id, text: `${block.originalText} (${settingsRef.current.targetLanguage}: ${block.translatedText || 'N/A'})` })),
        contextBlocks.slice(targetEndIndex).map(block => ({ id: block.id, text: block.originalText })),
        fallbackSettings,
        undefined,
        settingsRef.current.aiProvider !== 'gemini',
        signal
      );
      fallbackResults.forEach(result => {
        if (result.translatedText?.trim() && result.translatedText.trim() !== sourceById.get(result.id)?.trim()) {
          translatedById.set(result.id, result.translatedText.trim());
        }
      });

      const stillMissing = missing.filter(block => !translatedById.get(block.id)?.trim());
      if (stillMissing.length > 0) {
        throw new Error(`tagged_translation_incomplete: missing or unchanged translations for ids: ${stillMissing.map(block => block.id).join(', ')}`);
      }
    };

    await requestGroup(targetBlocks, 0);
    const balancedTranslations = balanceTaggedTranslations(targetBlocks, translatedById);
    return targetBlocks.map(block => ({
      id: block.id,
      translatedText: balancedTranslations.get(block.id) || ''
    }));
  };

  const balanceTaggedTranslations = (targetBlocks: SubtitleBlock[], translatedById: Map<number, string>): Map<number, string> => {
    const values = targetBlocks.map(block => translatedById.get(block.id)?.trim() || '');
    const lengths = values.filter(Boolean).map(value => value.length);
    const averageLength = lengths.length ? lengths.reduce((sum, value) => sum + value, 0) / lengths.length : 0;
    const shouldRebalance = values.some(value => !value)
      || (lengths.length > 1 && Math.max(...lengths) > averageLength * 1.9 && Math.min(...lengths) < averageLength * 0.55);
    if (!shouldRebalance) return translatedById;

    const combined = values.filter(Boolean).join(' ').replace(/\s+/g, ' ').trim();
    if (!combined) return translatedById;

    const pieces = combined
      .split(/(?<=[.!?؟،؛])\s+|\s+(?=(?:و|اما|ولی|که|تا|برای|چون)\s)/u)
      .map(piece => piece.trim())
      .filter(Boolean);
    if (pieces.length < targetBlocks.length) return translatedById;

    const sourceLengths = targetBlocks.map(block => Math.max(12, block.originalText.length));
    const totalSourceLength = sourceLengths.reduce((sum, value) => sum + value, 0);
    const totalChars = combined.length;
    const rebalanced = new Map<number, string>();
    let pieceIndex = 0;

    targetBlocks.forEach((block, index) => {
      const remainingBlocks = targetBlocks.length - index;
      const targetChars = Math.max(24, Math.round(totalChars * (sourceLengths[index] / totalSourceLength)));
      const bucket: string[] = [];

      while (
        pieceIndex < pieces.length
        && (bucket.length === 0 || bucket.join(' ').length < targetChars)
        && (pieces.length - pieceIndex) > remainingBlocks - 1
      ) {
        bucket.push(pieces[pieceIndex++]);
      }

      rebalanced.set(block.id, bucket.join(' ').trim());
    });

    return Array.from(rebalanced.values()).every(Boolean) ? rebalanced : translatedById;
  };

  const updateFileStatus = (id: string, updates: Partial<SubtitleFile>) => {
      setFiles(prev => prev.map(f => f.id === id ? { ...f, ...updates } : f));
  };

  const processFile = async (fileId: string, signal?: AbortSignal) => {
     const file = filesRef.current.find(f => f.id === fileId);
     if (!file) return;

     updateFileStatus(fileId, { status: AppStatus.TRANSLATING, progressMessage: 'در حال تقسیم‌بندی...', diagnostic: null });
     const startTime = Date.now();

     const isParagraphMethod = settingsRef.current.translationMethod === 'paragraph';
     const isSkeletonMethod = settingsRef.current.translationMethod === 'skeleton_str' || settingsRef.current.translationMethod === 'subtitle_translator';
     const isSubtitleTranslatorMethod = settingsRef.current.translationMethod === 'subtitle_translator';
     const adaptiveBatchSize = getAdaptiveTranslationBatchSize(settingsRef.current.aiProvider, settingsRef.current.model, settingsRef.current.translationMethod);
     const chunks = isParagraphMethod ? paragraphChunking(file.blocks) : smartChunking(file.blocks, adaptiveBatchSize);
     const totalChunks = chunks.length;

     let startChunkIndex = 0;
     let completed = 0;

     for (let i = 0; i < totalChunks; i++) {
        const chunk = chunks[i];
        const targetBlocks = chunk.blocks.slice(chunk.targetStartIndex, chunk.targetEndIndex);
        const isChunkComplete = targetBlocks.every(b => !!b.translatedText && b.translatedText.trim() !== '');
        if (isChunkComplete) {
            completed += targetBlocks.length;
            startChunkIndex = i + 1;
        } else {
            break;
        }
     }
     
     if (startChunkIndex > 0) {
        const initialProgress = (completed / file.blocks.length) * 100;
        updateFileStatus(fileId, { progress: initialProgress, processedCount: completed });
     }

     const onKeyRateLimit = (failedKey: string) => {
        showToast(`کلید API (...${failedKey.slice(-4)}) به محدودیت رسید. جایگزینی با کلید بعدی...`, 'warning');
        setSettings(prev => ({
            ...prev,
            apiKeys: prev.apiKeys.map(k => k.key === failedKey ? { ...k, isRateLimited: true } : k)
        }));
     };

     for (let i = startChunkIndex; i < totalChunks; i++) {
        // Critical: Check if stopped. If stopped via Pause, don't set to Cancelled.
        if (signal?.aborted || !isTranslatingRef.current) {
            if (isPausedRef.current) {
                // Stopped because of Pause
                updateFileStatus(fileId, { status: AppStatus.PAUSED, progressMessage: 'توقف موقت (ذخیره شد)', activeTranslationBlockIds: [] });
                return;
            } else {
                // Stopped because of Cancel
                updateFileStatus(fileId, { status: AppStatus.CANCELLED, progressMessage: 'لغو شده', activeTranslationBlockIds: [] });
                return;
            }
        }

        const chunk = chunks[i];
        const targetBlocks = chunk.blocks.slice(chunk.targetStartIndex, chunk.targetEndIndex);
        const postContextBlocks = chunk.blocks.slice(chunk.targetEndIndex);

        // Fetch latest state of blocks from filesRef to include actual existing translations for preceding context
        const currentFile = filesRef.current.find(f => f.id === fileId) || file;
        const currentBlocks = currentFile.blocks;
        const targetFirstId = targetBlocks[0]?.id;
        const fileTargetIndex = targetFirstId !== undefined 
          ? currentBlocks.findIndex(b => b.id === targetFirstId)
          : -1;

        // Ensure at least 3 blocks (up to 6) of preceding context with their actual translatedText
        let preContextBlocks: SubtitleBlock[] = [];
        if (fileTargetIndex > 0) {
          const desiredPreCount = Math.min(fileTargetIndex, Math.max(3, chunk.targetStartIndex));
          const preStartIndex = Math.max(0, fileTargetIndex - desiredPreCount);
          preContextBlocks = currentBlocks.slice(preStartIndex, fileTargetIndex);
        } else {
          preContextBlocks = chunk.blocks.slice(0, chunk.targetStartIndex);
        }

        const blockRangeMessage = targetBlocks.length > 0
            ? `بلوک‌های ${targetBlocks[0].index} تا ${targetBlocks[targetBlocks.length - 1].index}`
            : 'بدون بلوک هدف';
        updateFileStatus(fileId, { progressMessage: `پردازش بخش ${i + 1} از ${totalChunks} (${blockRangeMessage})...`, diagnostic: null, activeTranslationBlockIds: targetBlocks.map(block => block.id) });

        let cachedCount = 0;
        if (settingsRef.current.enableTranslationMemory) {
            targetBlocks.forEach(block => {
                if (!block.translatedText) {
                    const cached = getFromMemory(block.originalText);
                    if (cached) {
                        block.translatedText = cached;
                        cachedCount++;
                    }
                }
            });
            if (cachedCount > 0) {
                setFiles(prev => prev.map(f => f.id === fileId ? { ...f } : f));
            }
        }

        const effectiveTarget = targetBlocks.filter(b => !b.translatedText);
        const successfulResultIds = new Set<number>();
        
        if (effectiveTarget.length > 0) {
            const targetRequest: BatchRequest[] = effectiveTarget.map(b => ({ id: b.id, text: b.originalText }));
            const preContextReq: BatchRequest[] = preContextBlocks.map(b => ({
              id: b.id,
              text: b.translatedText
                ? `${b.originalText} (existing ${settingsRef.current.targetLanguage} translation: ${b.translatedText})`
                : `${b.originalText} (${settingsRef.current.targetLanguage}: N/A)`
            }));
            const postContextReq: BatchRequest[] = postContextBlocks.map(b => ({ id: b.id, text: b.originalText }));

            try {
                // Both branches return promises. Await the selected request before
                // iterating its mapped results; otherwise Skeleton STR leaves a
                // Promise here and `results.forEach` crashes the React flow.
                const taggedContextBlocks = [...preContextBlocks, ...targetBlocks, ...postContextBlocks];
                const taggedTargetStartIndex = preContextBlocks.length;
                const taggedTargetEndIndex = taggedTargetStartIndex + targetBlocks.length;

                const results = await (isSkeletonMethod
                    ? (() => {
                        return translateTaggedBatchWithRecovery(effectiveTarget, taggedContextBlocks, taggedTargetStartIndex, taggedTargetEndIndex, isSubtitleTranslatorMethod, signal);
                      })()
                    : translateBatch(targetRequest, preContextReq, postContextReq, settingsRef.current, onKeyRateLimit, isParagraphMethod, signal));

                results.filter(res => !!res.translatedText?.trim()).forEach(res => successfulResultIds.add(res.id));
                setFiles(prev => prev.map(f => {
                    if (f.id === fileId) {
                        const newBlocks = [...f.blocks];
                        results.forEach(res => {
                            if (!res.translatedText || !res.translatedText.trim()) return;
                            const formattedText = formatSubtitleForLanguage(res.translatedText, settingsRef.current.targetLanguage);
                            const idx = newBlocks.findIndex(b => b.id === res.id);
                            if (idx !== -1) {
                                newBlocks[idx].translatedText = formattedText;
                                if (settingsRef.current.enableTranslationMemory) {
                                    addToMemory(newBlocks[idx].originalText, formattedText);
                                }
                            }
                        });
                        return { ...f, blocks: newBlocks };
                    }
                    return f;
                }));

                const delay = getAdaptiveBatchDelay(settingsRef.current.aiProvider, settingsRef.current.model);
                if (delay > 0) await new Promise(resolve => setTimeout(resolve, delay));

            } catch (err: any) {
                // Aborting is an intentional pause/cancel action, never a translation error.
                if (isAbortError(err, signal) || !isTranslatingRef.current) {
                    updateFileStatus(fileId, {
                        status: isPausedRef.current ? AppStatus.PAUSED : AppStatus.CANCELLED,
                        progressMessage: isPausedRef.current ? 'توقف موقت (ذخیره شد)' : 'لغو شده',
                        activeTranslationBlockIds: []
                    });
                    return;
                }
                console.error("Batch processing error:", err);
                const diagnostic = getTranslationDiagnostic(
                    err,
                    settingsRef.current,
                    `File: ${file.name}, chunk ${i + 1}/${totalChunks}`
                );
                
                const errorMessage = (err.message || err.toString() || "").toLowerCase();
                
                // --- NEW CONNECTION HANDLING ---
                if (errorMessage.includes('fetch failed') || errorMessage.includes('location')) {
                    updateFileStatus(fileId, { 
                         status: AppStatus.PAUSED, 
                         progressMessage: 'خطای اتصال (توقف)',
                         activeTranslationBlockIds: [],
                         diagnostic
                    });
                    showDiagnosticToast(diagnostic);
                    isTranslatingRef.current = false;
                    return;
                }

                const isOverloaded = errorMessage.includes('overloaded') || 
                                     errorMessage.includes('503') || 
                                     errorMessage.includes('unavailable') ||
                                     errorMessage.includes('service unavailable');

                if (isOverloaded) {
                     updateFileStatus(fileId, { 
                         status: AppStatus.PAUSED, 
                         progressMessage: 'توقف خودکار (سرور/مدل شلوغ است)',
                         activeTranslationBlockIds: [],
                         diagnostic
                     });
                     showDiagnosticToast(diagnostic);
                     isTranslatingRef.current = false; 
                     return;
                }

                if (!isTranslatingRef.current && isPausedRef.current) {
                     updateFileStatus(fileId, { status: AppStatus.PAUSED, progressMessage: 'توقف موقت (ذخیره شد)', activeTranslationBlockIds: [] });
                     return;
                }

                const isQuotaError = errorMessage.includes("429") || 
                                     errorMessage.includes("quota") || 
                                     errorMessage.includes("پایان اعتبار") || 
                                     errorMessage.includes("resource_exhausted") ||
                                     errorMessage.includes("too many requests");

                if (isQuotaError) {
                     updateFileStatus(fileId, { 
                         status: AppStatus.PAUSED, 
                         progressMessage: 'توقف: پایان اعتبار یا سهمیه',
                         activeTranslationBlockIds: [],
                         diagnostic
                     });
                     showDiagnosticToast(diagnostic);
                     isTranslatingRef.current = false; 
                     return; 
                }

                updateFileStatus(fileId, { status: AppStatus.ERROR, progressMessage: 'خطا در ترجمه', activeTranslationBlockIds: [], diagnostic });
                showDiagnosticToast(diagnostic);
                throw err;
            }
        }

        const translatedInChunk = targetBlocks.filter(block => !!block.translatedText?.trim() || successfulResultIds.has(block.id)).length;
        completed += translatedInChunk;
        const progress = (completed / file.blocks.length) * 100;
        updateFileStatus(fileId, { progress, processedCount: completed });
     }

     let finalBlocks = filesRef.current.find(f => f.id === fileId)?.blocks || [];
     
     if (settingsRef.current.outputStandard !== 'normal') {
         updateFileStatus(fileId, { progressMessage: 'بهینه‌سازی بر اساس استاندارد...' });
         await new Promise(r => setTimeout(r, 800));
         finalBlocks = fixNetflixStandards(finalBlocks, settingsRef.current.outputStandard);
         const errors = validateNetflixStandards(finalBlocks, settingsRef.current.outputStandard);
         updateFileStatus(fileId, { blocks: finalBlocks, netflixErrors: errors });
     } else {
         const errors = validateNetflixStandards(finalBlocks, settingsRef.current.outputStandard);
         updateFileStatus(fileId, { netflixErrors: errors });
     }

     const duration = Date.now() - startTime;
     const seconds = Math.floor(duration / 1000);
     const minutes = Math.floor(seconds / 60);
     const durationStr = minutes > 0 ? `${minutes}m ${seconds % 60}s` : `${seconds}s`;

     updateFileStatus(fileId, { 
         status: AppStatus.COMPLETED, 
         progress: 100, 
         progressMessage: 'تکمیل شد',
         activeTranslationBlockIds: [],
         diagnostic: null,
         processingDuration: durationStr
     });
  };

  const startBatchTranslation = async () => {
    if (jobRunnerRef.current) {
      showToast('فرایند قبلی هنوز در حال توقف است؛ چند لحظه صبر کنید و دوباره ادامه را بزنید.', 'warning');
      return;
    }

    const activeSettings = settingsRef.current;
    const isKeylessProvider = activeSettings.aiProvider === 'lm_studio' || activeSettings.aiProvider === 'openai_compatible' || activeSettings.aiProvider === 'gtx' || activeSettings.aiProvider === 'edge' || activeSettings.aiProvider === 'deeplx';
    const hasAvailableKeys = activeSettings.apiKeys.some(k => k.isValid && !k.isRateLimited);
    
    if (!isKeylessProvider && activeSettings.apiKeys.length === 0) {
      showToast("هیچ کلید API تعریف نشده است.", 'error');
      setIsSettingsOpen(true);
      return;
    }
    
    if (!isKeylessProvider && !hasAvailableKeys) {
        setSettings(prev => ({
            ...prev,
            apiKeys: prev.apiKeys.map(k => ({...k, isRateLimited: false}))
        }));
    }

    const pendingFiles = filesRef.current.filter(f =>
        (f.status === AppStatus.READY || 
        f.status === AppStatus.ERROR || 
        f.status === AppStatus.PAUSED ||
        f.status === AppStatus.CANCELLED) &&
        f.blocks.some(b => !b.translatedText || b.translatedText.trim() === '')
    );
    
    if (pendingFiles.length === 0) {
        showToast('همه فایل‌ها قبلاً ترجمه شده‌اند.', 'warning');
        return;
    }

    const activeFile = filesRef.current.find(f => f.id === activeFileId);
    const targetFile = (activeFile && pendingFiles.some(f => f.id === activeFile.id))
      ? activeFile
      : pendingFiles[0];
    const firstFileId = targetFile.id;
    updateFileStatus(firstFileId, {
        status: AppStatus.TRANSLATING, 
        progressMessage: activeSettings.aiProvider === 'lm_studio' ? 'در حال بررسی اتصال به LM Studio...' : activeSettings.aiProvider === 'openai_compatible' ? 'در حال بررسی اتصال به سرویس OpenAI Compatible...' : isKeylessProvider ? 'در حال بررسی اتصال به سرویس ترجمه...' : 'در حال بررسی اتصال به سرور گوگل (DNS/VPN)...'
    });

    const testKey = isKeylessProvider ? undefined : activeSettings.apiKeys.find(k => k.isValid)?.key;
    if (isKeylessProvider || testKey) {
        const diagnosisError = await diagnoseConnection(testKey, activeSettings);
        if (diagnosisError) {
             const diagnostic = getTranslationDiagnostic(
                new Error(diagnosisError),
                activeSettings,
                'Pre-flight connection diagnosis before translation start'
             );
             updateFileStatus(firstFileId, { 
                status: AppStatus.PAUSED, 
                progressMessage: 'خطای اتصال',
                diagnostic
             });
             showDiagnosticToast(diagnostic);
             return;
        }
    }

    autoPipelineActiveRef.current = true;
    isTranslatingRef.current = true;
    isPausedRef.current = false; 
    setCompletionToast(false);

    let stoppedEarly = false;

    const runner = new TranslationJobRunner(async (job, signal) => {
        const file = filesRef.current.find(item => item.id === job.fileId);
        if (!file) return;
        setActiveFileId(file.id);
        await processFile(file.id, signal);
        const current = filesRef.current.find(item => item.id === job.fileId);
        if (current?.status === AppStatus.PAUSED) job.status = 'paused';
        if (current?.status === AppStatus.CANCELLED) job.status = 'cancelled';
    });
    jobRunnerRef.current = runner;
    pendingFiles.forEach(file => runner.enqueue(file.id));

    try {
        await runner.run();
        stoppedEarly = runner.getSnapshot().some(job => job.status === 'paused') || runner.getCancelledAll();
    } catch (e) {
        if (!isAbortError(e)) {
            console.error("Batch Queue Error", e);
        }
    } finally {
        jobRunnerRef.current = null;
        isTranslatingRef.current = false;
        if (!stoppedEarly && !runner.getCancelledAll()) {
            autoPipelineActiveRef.current = false;
            setCompletionToast(true); 
        }
    }
  };

  const pauseTranslation = () => {
    isTranslatingRef.current = false;
    isPausedRef.current = true; 
    autoPipelineActiveRef.current = false;
    jobRunnerRef.current?.pauseActive();

    const currentFile = filesRef.current.find(f => f.id === activeFileId);
    if (currentFile) {
      const updated = { ...currentFile, status: AppStatus.PAUSED, progressMessage: 'توقف موقت', activeTranslationBlockIds: [] };
      autoExportProjectState(updated, 'paused');
    }
    
    setFiles(prev => prev.map(f => {
      if (f.status === AppStatus.TRANSLATING) {
        const updated = { ...f, status: AppStatus.PAUSED, progressMessage: 'توقف موقت', activeTranslationBlockIds: [] };
        if (f.id !== activeFileId) {
          autoExportProjectState(updated, 'paused');
        }
        return updated;
      }
      return f;
    }));
    
    showToast('پروژه متوقف شد؛ وضعیت ذخیره و فایل پشتیبان JSON برای ادامه کار دانلود شد.', 'warning');
  };

  const cancelCurrentTranslation = () => {
    const currentFile = filesRef.current.find(f => f.id === activeFileId);
    if (currentFile) {
      const updated = { ...currentFile, status: AppStatus.CANCELLED, progressMessage: 'لغو شد', activeTranslationBlockIds: [] };
      autoExportProjectState(updated, 'cancelled');
    }

    if (!jobRunnerRef.current || !jobRunnerRef.current.isProcessing()) {
      if (activeFileId) {
        updateFileStatus(activeFileId, {
          status: AppStatus.CANCELLED,
          progressMessage: 'لغو شد',
          activeTranslationBlockIds: []
        });
      }
      return;
    }

    const hasMoreInQueue = jobRunnerRef.current.getQueueLength() > 0;
    jobRunnerRef.current.cancelActive();

    if (activeFileId) {
      updateFileStatus(activeFileId, {
        status: AppStatus.CANCELLED,
        progressMessage: 'لغو شد',
        activeTranslationBlockIds: []
      });
    }

    if (hasMoreInQueue) {
      showToast(
        currentFile 
          ? `ترجمه "${currentFile.name}" لغو و فایل JSON ذخیره شد؛ ترجمه فایل بعدی در صف آغاز می‌شود...` 
          : 'ترجمه فایل جاری لغو شد؛ ترجمه فایل بعدی در صف آغاز می‌شود...',
        'info'
      );
    } else {
      isTranslatingRef.current = false;
      showToast('ترجمه فایل جاری لغو شد و فایل JSON برای ادامه کار دانلود گردید.', 'warning');
    }
  };

  const cancelAllTranslations = () => {
    isTranslatingRef.current = false;
    isPausedRef.current = false; 
    autoPipelineActiveRef.current = false;
    jobRunnerRef.current?.cancelAll();

    filesRef.current.forEach(f => {
      if (f.status === AppStatus.TRANSLATING || f.status === AppStatus.PAUSED || f.progressMessage?.includes('صف')) {
        const updated = { ...f, status: AppStatus.CANCELLED, progressMessage: 'لغو شد', activeTranslationBlockIds: [] };
        autoExportProjectState(updated, 'cancelled');
      }
    });

    setFiles(prev => prev.map(f => 
        (f.status === AppStatus.TRANSLATING || f.status === AppStatus.PAUSED || f.progressMessage?.includes('صف')) 
        ? { ...f, status: AppStatus.CANCELLED, progressMessage: 'لغو شد', activeTranslationBlockIds: [] } 
        : f
    ));
    showToast('ترجمه تمام فایل‌های صف لغو شد و فایل JSON برای ادامه کار دانلود گردید.', 'warning');
  };

  const cancelTranslation = () => {
    const hasMoreInQueue = (jobRunnerRef.current?.getQueueLength() || 0) > 0;
    if (hasMoreInQueue) {
      cancelCurrentTranslation();
    } else {
      cancelAllTranslations();
    }
  };

  return (
    <div className="flex flex-col md:flex-row min-h-screen bg-background text-text transition-colors duration-300">
      
      <Sidebar 
        settings={settings} 
        updateSettings={updateSettings} 
        isOpen={isSidebarOpen}
        onClose={() => setIsSidebarOpen(false)}
        onOpenSettings={() => { setIsSettingsOpen(true); setIsSidebarOpen(false); }}
        onOpenGlossary={() => { setIsGlossaryModalOpen(true); setIsSidebarOpen(false); }}
        onOpenTextTranslator={() => { setIsTranslatorOpen(true); setIsSidebarOpen(false); }}
      />

      <div ref={scrollContainerRef} onScroll={handleMainScroll} className="flex-1 flex flex-col relative overflow-hidden h-screen overflow-y-auto">
            <Header
            theme={settings.theme}
            onToggleSidebar={() => setIsSidebarOpen(!isSidebarOpen)}
            onToggleTheme={() => updateSettings({ theme: settings.theme === 'dark' ? 'light' : 'dark' })}
            />

        <main className="flex-1 px-4 md:px-8 py-8 w-full max-w-7xl mx-auto pb-24">
            
            {files.length === 0 ? (
                <div className="flex flex-col items-center justify-center min-h-[60vh] gap-6">
                     <div className="text-center mb-4 space-y-4">
                        <h2 className="text-4xl md:text-5xl font-montserrat font-bold text-text leading-tight">
                            Translation <br />
                            <span className="text-transparent bg-clip-text bg-gradient-to-r from-primary to-secondary">Reimagined</span>
                        </h2>
                        <p className="text-text-muted text-lg max-w-xl mx-auto">
                             مترجم هوشمند با قابلیت تشخیص لحن و موضوع. فایل خود را آپلود کنید و از نتیجه حرفه‌ای لذت ببرید.
                        </p>
                    </div>
                    <FileUpload
                        onLoad={handleFilesLoaded} 
                        onProjectLoad={handleProjectImport}
                        onError={handleFileError} 
                        status={AppStatus.IDLE} 
                        outputStandard={settings.outputStandard} 
                    />
                    {savedProjects.length > 0 && (
                        <div className="flex flex-col items-center gap-2 animate-in fade-in slide-in-from-bottom-2 mt-4">
                            <button onClick={handleResumeSession} className="flex items-center gap-2 px-6 py-3 rounded-full bg-white/5 border border-white/10 hover:bg-white/10 hover:border-[#00f0ff]/50 transition-all text-sm text-text">
                                <History className="w-4 h-4 text-[#00f0ff]" />
                                <span>بازیابی نشست قبلی ({savedProjects.length} فایل ذخیره شده)</span>
                            </button>
                            <button onClick={handleClearSavedSessions} className="text-[10px] text-text-muted/50 hover:text-red-400 transition-colors">پاکسازی تاریخچه</button>
                        </div>
                    )}
                </div>
            ) : (
                <>
                    <div className="flex overflow-x-auto gap-2 mb-6 pb-2 custom-scrollbar">
                        <FileUpload
                            onLoad={handleFilesLoaded}
                            onProjectLoad={handleProjectImport}
                            onError={handleFileError}
                            status={AppStatus.IDLE}
                            outputStandard={settings.outputStandard}
                            variant="compact"
                        />
                        {files.map(file => {
                            const isQueued = jobRunnerRef.current?.getSnapshot().some(j => j.fileId === file.id && j.status === 'queued') || (file.status === AppStatus.READY && file.progressMessage?.includes('صف'));
                            return (
                            <div key={file.id} className={`flex items-center gap-2 px-3 py-2 rounded-xl border transition-all min-w-[170px] max-w-[240px] flex-shrink-0 ${activeFileId === file.id ? 'bg-primary/10 border-primary text-text shadow-[0_0_15px_rgba(0,240,255,0.1)]' : 'bg-surface border-border text-text-muted hover:bg-surfaceHighlight'}`}>
                              <button type="button" onClick={() => setActiveFileId(file.id)} className="flex min-w-0 flex-1 items-center gap-2 text-right">
                                <div className={`w-2 h-2 rounded-full ${
                                  file.status === AppStatus.COMPLETED ? 'bg-green-500' : 
                                  file.status === AppStatus.TRANSLATING ? 'bg-yellow-500 animate-pulse' : 
                                  file.status === AppStatus.ERROR ? 'bg-red-500' : 
                                  file.status === AppStatus.PAUSED ? 'bg-orange-400' : 
                                  isQueued ? 'bg-cyan-400 animate-pulse' :
                                  'bg-text/20'
                                }`}></div>
                                <span className="truncate text-sm font-medium direction-ltr">{file.name}</span>
                                {isQueued && (
                                  <span className="text-[10px] px-1.5 py-0.5 rounded bg-cyan-500/15 text-cyan-400 font-normal mr-auto border border-cyan-500/20 whitespace-nowrap">
                                    در صف
                                  </span>
                                )}
                                {file.status === AppStatus.COMPLETED && <Check className="w-3 h-3 text-green-500 ml-auto" />}
                              </button>
                              <button type="button" onClick={() => removeFile(file.id)} className="rounded-full p-1 text-text-muted transition-colors hover:bg-red-500/15 hover:text-red-400" aria-label={`بستن ${file.name}`} title="بستن فایل"><X className="h-4 w-4" /></button>
                            </div>
                        );})}
                    </div>
                    <StatsCard 
                      activeFile={getActiveFile()} 
                      activeFileIndex={getActiveFileIndex()} 
                      totalFiles={files.length} 
                      translationMethod={settings.translationMethod} 
                      onTranslationMethodChange={(translationMethod) => updateSettings({ translationMethod })} 
                      onStart={startBatchTranslation} 
                      onPause={pauseTranslation} 
                      onCancel={cancelTranslation} 
                      onCancelCurrent={cancelCurrentTranslation}
                      onCancelAll={cancelAllTranslations}
                      hasQueuedFiles={(jobRunnerRef.current?.getQueueLength() || 0) > 0 || files.some(f => f.id !== activeFileId && (f.status === AppStatus.READY || f.status === AppStatus.PAUSED || f.progressMessage?.includes('صف')))}
                      onDownload={handleOpenExportModal} 
                      onDownloadZip={handleDownloadZip} 
                      onNewProject={resetProject} 
                      onOpenTimingTools={() => setIsTimingModalOpen(true)} 
                      onFixErrors={handleFixNetflixErrors} 
                      onSave={handleManualSave} 
                      onExportBackup={handleExportProjectFile} 
                      onOptimizeStructure={handleOptimizePersianStructure} 
                    />
                    <div className="mb-6 glass p-6 rounded-2xl border border-border space-y-3">
                         <label className="text-sm font-bold text-text flex items-center gap-2"><Wand2 className="w-4 h-4 text-secondary" />پرامپت اختصاصی (Custom Prompt)</label>
                         <textarea value={settings.customPrompt} onChange={(e) => updateSettings({ customPrompt: e.target.value })} placeholder="دستورالعمل خاصی دارید؟ اینجا بنویسید..." className="w-full dark:bg-[#0a0e27]/60 bg-white text-sm text-text placeholder-text-muted focus:outline-none resize-none h-24 rounded-xl p-4 border dark:border-white/10 border-slate-200 focus:border-secondary/60 transition-all shadow-xs" dir="auto" />
                    </div>
                    <SubtitleEditor blocks={getActiveFile().blocks} onUpdateBlock={(id, text) => activeFileId && updateBlock(activeFileId, id, text)} validationErrors={getActiveFile().netflixErrors} onFindReplace={handleFindReplace} hasMultipleFiles={files.length > 1} onCommitChange={handleCommitChange} onUndo={handleUndo} onRedo={handleRedo} canUndo={!!getActiveFile()?.modificationsMade && getActiveFile().historyPointer > -1} canRedo={!!getActiveFile()?.modificationsMade && getActiveFile().historyPointer < getActiveFile().modificationsMade.length - 1} onRetranslateSelected={handleRetranslateSelectedBlocks} onAutoFixSelected={handleAutoFixSelectedBlocks} onDeleteSelected={handleDeleteSelectedBlocks} isRetranslatingSelection={isRetranslatingSelection} activeTranslationBlockIds={getActiveFile().activeTranslationBlockIds || []} />
                </>
            )}
        </main>
        <footer className="w-full py-6 text-center text-text-muted text-xs border-t border-border mt-auto">
            <p className="font-montserrat">Designed and developed with ❤️ by Saeid Bagherian</p>
        </footer>
        {showScrollTop && (
            <button
                type="button"
                onClick={scrollToTop}
                className="fixed bottom-6 left-6 z-50 flex h-12 w-12 items-center justify-center rounded-full border border-primary/40 bg-background/80 text-primary shadow-[0_0_25px_rgba(0,240,255,0.25)] backdrop-blur-xl transition-all hover:-translate-y-1 hover:bg-primary/10 hover:text-text focus:outline-none focus:ring-2 focus:ring-primary/60"
                aria-label="اسکرول به بالای صفحه"
                title="رفتن به بالای صفحه"
            >
                <ArrowUp className="h-5 w-5" />
            </button>
        )}
      </div>
      <SettingsModal isOpen={isSettingsOpen} onClose={() => setIsSettingsOpen(false)} settings={settings} updateSettings={updateSettings} />
      <TimingModal isOpen={isTimingModalOpen} onClose={() => setIsTimingModalOpen(false)} onApply={handleTimingAdjustment} onNetflixCheck={handleNetflixCheck} hasMultipleFiles={files.length > 1} />
      <ExportModal isOpen={isExportModalOpen} onClose={() => setIsExportModalOpen(false)} onConfirm={(format, styles) => { updateSettings({ outputFormat: format }); handleConfirmDownload(format, styles); }} defaultFormat={settings.outputFormat} />
      <GlossaryModal isOpen={isGlossaryModalOpen} onClose={() => setIsGlossaryModalOpen(false)} glossary={settings.glossary} onUpdate={handleUpdateGlossary} />
      <TextTranslatorModal isOpen={isTranslatorOpen} onClose={() => setIsTranslatorOpen(false)} settings={settings} />
       {files.some(f => f.status === AppStatus.TRANSLATING) && (
            <div className="fixed bottom-8 right-8 glass border border-primary/50 text-text px-6 py-4 rounded-2xl shadow-[0_0_30px_rgba(0,0,0,0.5)] flex items-center gap-4 z-50 animate-in slide-in-from-bottom-10">
                <div className="relative">
                     <div className="absolute inset-0 bg-primary blur opacity-50 animate-pulse"></div>
                     <Loader2 className="w-6 h-6 animate-spin text-primary relative z-10" />
                </div>
                <div className="flex flex-col">
                    <span className="text-sm font-bold">{getActiveFile().progressMessage || 'در حال پردازش...'}</span>
                    <span className="text-xs text-text-muted">{activeFileId && getActiveFile()?.name}</span>
                </div>
            </div>
        )}
        {toast.length > 0 && (
          <div className="fixed bottom-6 inset-x-0 z-[100] flex flex-col items-center gap-3 pointer-events-none px-4">
            {[...toast].reverse().map(item => (
              <div key={item.id} className="pointer-events-auto w-full max-w-md flex justify-center">
                <Toast message={item.msg} type={item.type} onClose={() => dismissToast(item.id)} />
              </div>
            ))}
          </div>
        )}
        {completionToast && !files.some(f => f.status === AppStatus.PAUSED || f.status === AppStatus.ERROR) && (
             <div className="fixed bottom-6 inset-x-0 z-[60] flex justify-center pointer-events-none px-4 animate-in slide-in-from-bottom-5 fade-in duration-300">
                <div className="glass bg-background/95 border border-green-500/50 text-text p-4 rounded-2xl shadow-[0_0_30px_rgba(34,197,94,0.2)] flex items-start gap-4 backdrop-blur-xl pointer-events-auto w-full max-w-md">
                    <div className="p-2 bg-green-500/20 rounded-full flex-shrink-0 mt-0.5"><Loader2 className="w-5 h-5 text-green-500" /></div>
                    <div className="flex-1 min-w-0">
                        <strong className="block text-sm font-bold text-green-500 mb-1">عملیات تکمیل شد</strong>
                        <p className="text-sm text-text-muted leading-relaxed">پردازش فایل‌ها با موفقیت به پایان رسید.</p>
                    </div>
                    <button onClick={() => setCompletionToast(false)} className="p-1 hover:bg-surface rounded-full transition-colors -mr-1 text-text-muted hover:text-text"><Loader2 className="w-4 h-4 rotate-45" /></button>
                </div>
            </div>
        )}
    </div>
  );
};

export default App;
