import React, { useState, useEffect, useRef } from 'react';
import { 
  X, BookOpen, Plus, Trash2, Save, FileText, Sparkles, Zap, 
  RefreshCw, Check, CheckSquare, Square, Download, Search, 
  Loader2, AlertTriangle, Layers, ArrowLeft, ArrowRight, CheckCircle2 
} from 'lucide-react';
import { GlossaryItem, SubtitleFile, AppSettings, GlossaryExtractionProgress } from '../types';
import { 
  convertSubtitleToPlainText, 
  executeAutomaticGlossaryExtraction, 
  unifyAndDeduplicateGlossary, 
  loadFinalFileGlossary, 
  loadTempChunkGlossary 
} from '../services/glossaryExtractionService';

interface GlossaryModalProps {
  isOpen: boolean;
  onClose: () => void;
  glossary: GlossaryItem[];
  onUpdate: (newGlossary: GlossaryItem[]) => void;
  activeFile?: SubtitleFile;
  files?: SubtitleFile[];
  settings?: AppSettings;
  onSaveExtractedGlossaryToFile?: (fileId: string, extracted: GlossaryItem[]) => void;
  initialTab?: 'list' | 'bulk' | 'auto';
}

export const GlossaryModal: React.FC<GlossaryModalProps> = ({ 
  isOpen, 
  onClose, 
  glossary, 
  onUpdate,
  activeFile,
  files = [],
  settings,
  onSaveExtractedGlossaryToFile,
  initialTab = 'list'
}) => {
  const [items, setItems] = useState<GlossaryItem[]>(glossary);
  const [newTerm, setNewTerm] = useState('');
  const [newTranslation, setNewTranslation] = useState('');
  const [bulkInput, setBulkInput] = useState('');
  const [activeTab, setActiveTab] = useState<'list' | 'bulk' | 'auto'>(initialTab);
  const [searchTerm, setSearchTerm] = useState('');

  // Auto-extraction states
  const [selectedFileId, setSelectedFileId] = useState<string>(activeFile?.id || files[0]?.id || '');
  const [isExtracting, setIsExtracting] = useState<boolean>(false);
  const [progress, setProgress] = useState<GlossaryExtractionProgress | null>(null);
  const [extractedItems, setExtractedItems] = useState<GlossaryItem[]>([]);
  const [selectedExtractedIndices, setSelectedExtractedIndices] = useState<Set<number>>(new Set());
  const [extractedSearch, setExtractedSearch] = useState<string>('');
  const [extractionError, setExtractionError] = useState<string | null>(null);
  const [successNotice, setSuccessNotice] = useState<string | null>(null);
  const [plainTextPreview, setPlainTextPreview] = useState<string | null>(null);
  const [showPlainTextModal, setShowPlainTextModal] = useState<boolean>(false);

  const abortControllerRef = useRef<AbortController | null>(null);

  // Sync internal state when prop changes or modal opens
  useEffect(() => {
    setItems(glossary);
  }, [glossary, isOpen]);

  // Set default selected file and load existing extracted glossary when modal opens
  useEffect(() => {
    if (isOpen) {
      const currentId = activeFile?.id || files[0]?.id || '';
      setSelectedFileId(currentId);
      loadExistingExtractedForFile(currentId);
      if (initialTab) {
        setActiveTab(initialTab);
      }
    }
  }, [isOpen, activeFile?.id, initialTab]);

  const loadExistingExtractedForFile = (targetFileId: string) => {
    if (!targetFileId) return;

    const file = files.find(f => f.id === targetFileId) || (activeFile?.id === targetFileId ? activeFile : null);
    
    // Priority: file.extractedGlossary -> saved in final storage -> saved in temp storage
    let loaded: GlossaryItem[] = [];
    if (file?.extractedGlossary && file.extractedGlossary.length > 0) {
      loaded = file.extractedGlossary;
    } else {
      const savedFinal = loadFinalFileGlossary(targetFileId);
      if (savedFinal && savedFinal.length > 0) {
        loaded = savedFinal;
      } else {
        const savedTemp = loadTempChunkGlossary(targetFileId);
        if (savedTemp && savedTemp.length > 0 && settings) {
          loaded = unifyAndDeduplicateGlossary(savedTemp, settings.glossary);
        }
      }
    }

    setExtractedItems(loaded);
    setSelectedExtractedIndices(new Set(loaded.map((_, idx) => idx)));
  };

  const handleFileSelectionChange = (newFileId: string) => {
    setSelectedFileId(newFileId);
    setExtractionError(null);
    setSuccessNotice(null);
    loadExistingExtractedForFile(newFileId);
  };

  if (!isOpen) return null;

  const currentSelectedFile = files.find(f => f.id === selectedFileId) || activeFile;

  // --- MANUAL LIST MANAGEMENT ---
  const handleAdd = () => {
    if (newTerm.trim() && newTranslation.trim()) {
      const newItem = { term: newTerm.trim(), translation: newTranslation.trim() };
      if (!items.some(i => i.term.toLowerCase() === newItem.term.toLowerCase())) {
         setItems([...items, newItem]);
         setNewTerm('');
         setNewTranslation('');
      }
    }
  };

  const handleRemove = (term: string) => {
    setItems(items.filter(i => i.term !== term));
  };

  // --- BULK IMPORT ---
  const handleBulkImport = () => {
    if (!bulkInput.trim()) return;
    
    const lines = bulkInput.split('\n');
    const newItems: GlossaryItem[] = [];
    
    lines.forEach(line => {
        const separator = line.includes('->') ? '->' : line.includes(':') ? ':' : ',';
        const parts = line.split(separator);
        if (parts.length >= 2) {
            const term = parts[0].trim();
            const translation = parts[1].trim();
            if (term && translation) {
                newItems.push({ term, translation });
            }
        }
    });

    const filteredNew = newItems.filter(ni => !items.some(ex => ex.term.toLowerCase() === ni.term.toLowerCase()));
    
    setItems([...items, ...filteredNew]);
    setBulkInput('');
    setActiveTab('list');
  };

  const handleSave = () => {
    onUpdate(items);
    onClose();
  };

  // --- AUTOMATIC EXTRACTION WORKFLOW ---
  const handleStartExtraction = async () => {
    if (!currentSelectedFile || !currentSelectedFile.blocks || currentSelectedFile.blocks.length === 0) {
      setExtractionError('لطفاً ابتدا یک فایل زیرنویس معتبر انتخاب کنید.');
      return;
    }

    if (!settings) {
      setExtractionError('تنظیمات برنامه در دسترس نیست.');
      return;
    }

    setIsExtracting(true);
    setExtractionError(null);
    setSuccessNotice(null);

    const controller = new AbortController();
    abortControllerRef.current = controller;

    try {
      const result = await executeAutomaticGlossaryExtraction({
        file: currentSelectedFile,
        settings,
        signal: controller.signal,
        onProgress: (p, intermediate) => {
          setProgress(p);
          setExtractedItems(intermediate);
          setSelectedExtractedIndices(new Set(intermediate.map((_, idx) => idx)));
        }
      });

      setExtractedItems(result.unifiedGlossary);
      setSelectedExtractedIndices(new Set(result.unifiedGlossary.map((_, idx) => idx)));
      setPlainTextPreview(result.plainText);

      if (onSaveExtractedGlossaryToFile && currentSelectedFile) {
        onSaveExtractedGlossaryToFile(currentSelectedFile.id, result.unifiedGlossary);
      }

      setSuccessNotice(`استخراج با موفقیت به پایان رسید: ${result.unifiedGlossary.length} اصطلاح تخصصی با ترجمه یکدست آماده است.`);
    } catch (err: any) {
      if (err.name === 'AbortError') {
        setExtractionError('فرایند استخراج توسط کاربر متوقف شد.');
      } else {
        setExtractionError(err.message || 'خطا در استخراج خودکار واژگان تخصصی.');
      }
    } finally {
      setIsExtracting(false);
      abortControllerRef.current = null;
    }
  };

  const handleCancelExtraction = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    setIsExtracting(false);
  };

  const handlePreviewPlainText = () => {
    if (!currentSelectedFile || !currentSelectedFile.blocks) return;
    const text = convertSubtitleToPlainText(currentSelectedFile.blocks);
    setPlainTextPreview(text);
    setShowPlainTextModal(true);
  };

  // Toggle selection for an extracted item
  const handleToggleExtractedIndex = (index: number) => {
    const next = new Set(selectedExtractedIndices);
    if (next.has(index)) {
      next.delete(index);
    } else {
      next.add(index);
    }
    setSelectedExtractedIndices(next);
  };

  const handleSelectAllExtracted = () => {
    if (selectedExtractedIndices.size === extractedItems.length) {
      setSelectedExtractedIndices(new Set());
    } else {
      setSelectedExtractedIndices(new Set(extractedItems.map((_, idx) => idx)));
    }
  };

  // Import selected extracted items into the active working glossary
  const handleImportExtractedIntoGlossary = () => {
    const toImport = extractedItems.filter((_, idx) => selectedExtractedIndices.has(idx));
    if (toImport.length === 0) return;

    // Strict unification with existing items so that every term has 1 uniform translation
    const unified = unifyAndDeduplicateGlossary(toImport, items);
    setItems(unified);
    onUpdate(unified);
    setSuccessNotice(`${toImport.length} واژه تخصصی به واژه‌نامه تخصصی آموزشی افزوده شد.`);
    setActiveTab('list');
  };

  // Download extracted items as JSON or TXT
  const handleDownloadExtracted = (format: 'json' | 'txt') => {
    if (extractedItems.length === 0) return;

    let content = '';
    let filename = `glossary_${currentSelectedFile?.name || 'subtitles'}.${format}`;
    let mimeType = 'text/plain';

    if (format === 'json') {
      content = JSON.stringify(extractedItems, null, 2);
      mimeType = 'application/json';
    } else {
      content = extractedItems.map(item => `${item.term} : ${item.translation}`).join('\n');
    }

    const blob = new Blob([content], { type: `${mimeType};charset=utf-8` });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  };

  // Filter items in list
  const filteredListItems = items.filter(i => 
    i.term.toLowerCase().includes(searchTerm.toLowerCase()) || 
    i.translation.includes(searchTerm)
  );

  // Filter items in extracted
  const filteredExtractedItems = extractedItems.filter(i => 
    i.term.toLowerCase().includes(extractedSearch.toLowerCase()) || 
    i.translation.includes(extractedSearch)
  );

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center p-3 sm:p-4">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-md" onClick={onClose}></div>
      
      <div className="relative w-full max-w-2xl glass rounded-3xl overflow-hidden animate-in fade-in zoom-in-95 duration-200 flex flex-col max-h-[90vh] shadow-2xl border dark:border-cyan-500/20 border-cyan-500/30">
        
        {/* Header */}
        <div className="p-4 sm:p-5 border-b dark:border-white/10 border-slate-200 flex justify-between items-center dark:bg-[#0a0e27]/80 bg-white/80 backdrop-blur-md">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-gradient-to-tr from-secondary/20 to-cyan-500/20 text-secondary border border-secondary/30">
              <BookOpen className="w-5 h-5 text-secondary" />
            </div>
            <div>
              <h2 className="text-base sm:text-lg font-black text-text flex items-center gap-2">
                <span>واژه‌نامه تخصصی آموزشی</span>
                <span className="text-[10px] px-2 py-0.5 rounded-full font-mono bg-secondary/15 text-secondary border border-secondary/30">
                  {items.length} واژه
                </span>
              </h2>
              <p className="text-[11px] text-text-muted mt-0.5">
                تضمین ترجمه مشترک، یکدست و استاندارد برای واژگان و اصطلاحات تخصصی
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button 
              onClick={() => setActiveTab('auto')} 
              className={`hidden sm:flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold transition-all shadow-xs border ${
                activeTab === 'auto'
                  ? 'bg-gradient-to-r from-secondary to-cyan-500 text-white border-transparent'
                  : 'dark:bg-white/5 bg-slate-100 hover:bg-secondary/15 text-secondary border-secondary/30'
              }`}
            >
              <Zap className="w-3.5 h-3.5" />
              <span>استخراج اتوماتیک</span>
            </button>

            <button onClick={onClose} className="p-2 hover:bg-white/10 rounded-full transition-colors text-text-muted hover:text-text">
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Tabs Bar */}
        <div className="flex px-4 pt-2 gap-2 sm:gap-4 border-b dark:border-white/5 border-slate-200 dark:bg-[#0a0e27]/40 bg-slate-50/70 overflow-x-auto">
          <button 
            onClick={() => setActiveTab('list')}
            className={`pb-3 pt-1 text-xs sm:text-sm font-bold transition-all relative flex items-center gap-1.5 whitespace-nowrap ${
              activeTab === 'list' ? 'text-secondary' : 'text-text-muted hover:text-text'
            }`}
          >
            <BookOpen className="w-4 h-4" />
            <span>لیست واژگان جاری ({items.length})</span>
            {activeTab === 'list' && <div className="absolute bottom-0 left-0 w-full h-0.5 bg-secondary rounded-t-full shadow-[0_0_8px_rgba(255,0,234,0.8)]"></div>}
          </button>

          <button 
            onClick={() => setActiveTab('auto')}
            className={`pb-3 pt-1 text-xs sm:text-sm font-bold transition-all relative flex items-center gap-1.5 whitespace-nowrap ${
              activeTab === 'auto' ? 'text-cyan-400' : 'text-text-muted hover:text-text'
            }`}
          >
            <Sparkles className="w-4 h-4 text-cyan-400" />
            <span>⚡ استخراج اتوماتیک از زیرنویس</span>
            {extractedItems.length > 0 && (
              <span className="text-[10px] px-1.5 py-0.2 rounded-md bg-cyan-500/20 text-cyan-400 border border-cyan-500/30">
                {extractedItems.length}
              </span>
            )}
            {activeTab === 'auto' && <div className="absolute bottom-0 left-0 w-full h-0.5 bg-cyan-400 rounded-t-full shadow-[0_0_8px_rgba(0,240,255,0.8)]"></div>}
          </button>

          <button 
            onClick={() => setActiveTab('bulk')}
            className={`pb-3 pt-1 text-xs sm:text-sm font-bold transition-all relative flex items-center gap-1.5 whitespace-nowrap ${
              activeTab === 'bulk' ? 'text-secondary' : 'text-text-muted hover:text-text'
            }`}
          >
            <FileText className="w-4 h-4" />
            <span>افزودن گروهی (متن)</span>
            {activeTab === 'bulk' && <div className="absolute bottom-0 left-0 w-full h-0.5 bg-secondary rounded-t-full shadow-[0_0_8px_rgba(255,0,234,0.8)]"></div>}
          </button>
        </div>

        {/* Tab Contents */}
        <div className="p-4 sm:p-5 overflow-y-auto custom-scrollbar flex-1 dark:bg-[#0a0e27]/30 bg-slate-50/50">
            
            {/* --- TAB 1: CURRENT GLOSSARY LIST --- */}
            {activeTab === 'list' && (
                <div className="space-y-4">
                    {/* Add New Input Form */}
                    <div className="p-3 rounded-2xl border dark:border-white/10 border-slate-200 dark:bg-white/[0.02] bg-white shadow-xs space-y-2">
                        <div className="text-xs font-bold text-text mb-1">افزودن اصطلاح جدید:</div>
                        <div className="flex flex-col sm:flex-row gap-2">
                            <input 
                                value={newTerm}
                                onChange={(e) => setNewTerm(e.target.value)}
                                placeholder="واژه اصلی (انگلیسی)"
                                dir="ltr"
                                className="flex-1 dark:bg-[#0a0e27] bg-slate-50 border dark:border-white/10 border-slate-200 rounded-xl px-3 py-2 text-sm dark:text-white text-slate-900 focus:border-secondary focus:outline-none shadow-xs"
                            />
                            <input 
                                value={newTranslation}
                                onChange={(e) => setNewTranslation(e.target.value)}
                                placeholder="ترجمه استاندارد و یکدست فارسی"
                                dir="rtl"
                                className="flex-1 dark:bg-[#0a0e27] bg-slate-50 border dark:border-white/10 border-slate-200 rounded-xl px-3 py-2 text-sm dark:text-white text-slate-900 focus:border-secondary focus:outline-none shadow-xs"
                            />
                            <button 
                                onClick={handleAdd}
                                disabled={!newTerm || !newTranslation}
                                className="bg-gradient-to-r from-secondary to-cyan-500 hover:opacity-90 text-white rounded-xl px-4 py-2 flex items-center justify-center gap-1.5 text-xs font-bold transition-all disabled:opacity-30 disabled:cursor-not-allowed shadow-xs"
                            >
                                <Plus className="w-4 h-4" />
                                <span>افزودن</span>
                            </button>
                        </div>
                    </div>

                    {/* Search & Filter Header */}
                    {items.length > 5 && (
                      <div className="relative">
                        <Search className="w-4 h-4 text-text-muted absolute right-3 top-2.5" />
                        <input
                          type="text"
                          value={searchTerm}
                          onChange={(e) => setSearchTerm(e.target.value)}
                          placeholder="جست‌وجو در واژه‌ها یا ترجمه‌ها..."
                          className="w-full pr-9 pl-3 py-2 text-xs rounded-xl dark:bg-[#0a0e27] bg-white border dark:border-white/10 border-slate-200 text-text focus:outline-none focus:border-secondary shadow-xs"
                        />
                      </div>
                    )}

                    {/* List Items */}
                    <div className="space-y-2 mt-2">
                        {items.length === 0 ? (
                            <div className="text-center py-10 text-text-muted text-sm border-2 border-dashed dark:border-white/10 border-slate-300 rounded-2xl p-6 space-y-3">
                                <BookOpen className="w-8 h-8 mx-auto text-text-muted/40" />
                                <p>هنوز واژه‌ای به این واژه‌نامه اضافه نشده است.</p>
                                <button
                                  type="button"
                                  onClick={() => setActiveTab('auto')}
                                  className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-cyan-500/15 text-cyan-500 border border-cyan-500/30 text-xs font-bold hover:bg-cyan-500/25 transition-all"
                                >
                                  <Sparkles className="w-4 h-4" />
                                  <span>استخراج اتوماتیک واژگان از این زیرنویس</span>
                                </button>
                            </div>
                        ) : (
                            filteredListItems.map((item, idx) => (
                                <div key={idx} className="flex items-center justify-between p-3 dark:bg-[#0a0e27] bg-white rounded-xl border dark:border-white/10 border-slate-200 group hover:border-secondary/50 transition-all shadow-xs">
                                    <div className="flex items-center gap-3 w-full overflow-hidden">
                                        <span className="dark:text-white/95 text-slate-800 text-sm font-bold w-1/2 dir-ltr truncate font-mono" title={item.term}>
                                          {item.term}
                                        </span>
                                        <span className="text-secondary text-xs">➜</span>
                                        <span className="text-secondary dark:text-cyan-300 text-sm font-semibold w-1/2 dir-rtl truncate text-right" title={item.translation}>
                                          {item.translation}
                                        </span>
                                    </div>
                                    <button 
                                        onClick={() => handleRemove(item.term)}
                                        className="text-text-muted hover:text-rose-500 transition-colors p-2 rounded-lg hover:bg-rose-500/10 mr-1"
                                        title="حذف این واژه"
                                    >
                                        <Trash2 className="w-4 h-4" />
                                    </button>
                                </div>
                            ))
                        )}
                    </div>
                </div>
            )}

            {/* --- TAB 2: AUTOMATIC AI EXTRACTION WORKFLOW --- */}
            {activeTab === 'auto' && (
                <div className="space-y-4">
                    {/* Active File Selector Banner */}
                    <div className="p-3.5 rounded-2xl border dark:border-cyan-500/30 border-cyan-500/40 dark:bg-cyan-950/20 bg-cyan-50/70 space-y-2">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                            <div className="flex items-center gap-2">
                                <Layers className="w-4 h-4 text-cyan-400" />
                                <span className="text-xs font-bold text-text">فایل مبنا برای استخراج واژگان:</span>
                            </div>

                            {files.length > 1 ? (
                              <select
                                value={selectedFileId}
                                onChange={(e) => handleFileSelectionChange(e.target.value)}
                                disabled={isExtracting}
                                className="text-xs py-1 px-2.5 rounded-lg dark:bg-[#0a0e27] bg-white border dark:border-white/10 border-slate-300 text-text focus:outline-none focus:border-cyan-400 font-medium"
                              >
                                {files.map(f => (
                                  <option key={f.id} value={f.id}>
                                    {f.name} ({f.blocks.length} خط)
                                  </option>
                                ))}
                              </select>
                            ) : (
                              <span className="text-xs font-bold text-cyan-600 dark:text-cyan-300 font-mono">
                                {currentSelectedFile?.name || 'فایلی انتخاب نشده'}
                              </span>
                            )}
                        </div>

                        {currentSelectedFile && (
                          <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] text-text-muted pt-1 border-t dark:border-white/5 border-slate-200">
                            <span>تعداد دیالوگ‌ها: {currentSelectedFile.blocks.length} قطعه</span>
                            <button
                              type="button"
                              onClick={handlePreviewPlainText}
                              className="text-cyan-500 hover:underline flex items-center gap-1 font-medium"
                            >
                              <FileText className="w-3.5 h-3.5" />
                              <span>مشاهده فایل متنی ساده (تبدیل‌شده)</span>
                            </button>
                          </div>
                        )}
                    </div>

                    {/* Workflow Explanation Banner */}
                    <div className="p-3 rounded-xl border dark:border-white/10 border-slate-200 dark:bg-white/[0.02] bg-white text-[11px] text-text-muted space-y-1.5 leading-relaxed">
                        <div className="font-bold text-text flex items-center gap-1.5">
                            <Sparkles className="w-3.5 h-3.5 text-secondary" />
                            <span>مراحل استخراج اتوماتیک و یکدست‌سازی هوشمند:</span>
                        </div>
                        <p>
                          ۱. تبدیل کامل زیرنویس به فایل متنی ساده (حذف شماره‌ها، تگ‌ها و کدهای زمانی).
                          <br />
                          ۲. تقسیم متن به چانک‌های متعدد و بهینه (جهت کنترل فشار روی مدل و پیشگیری از خطا).
                          <br />
                          ۳. استخراج تخصصی واژگان و اصطلاحات هر چانک در فایل موقت.
                          <br />
                          ۴. تجمیع نهایی و <strong>تضمین ترجمه مشترک و یکپارچه</strong> برای جلوگیری از ترجمه‌های متفاوت برای یک واژه.
                        </p>
                    </div>

                    {/* Extraction Progress Indicator */}
                    {isExtracting && (
                        <div className="p-4 rounded-2xl border border-cyan-500/40 bg-cyan-500/10 space-y-3 animate-in fade-in duration-200">
                            <div className="flex items-center justify-between text-xs">
                                <span className="font-bold text-cyan-400 flex items-center gap-2">
                                    <Loader2 className="w-4 h-4 animate-spin" />
                                    <span>
                                      در حال پردازش چانک {progress?.currentChunk || 1} از {progress?.totalChunks || '?'}...
                                    </span>
                                </span>
                                <span className="font-mono text-cyan-300 text-xs">
                                    {progress ? Math.round((progress.currentChunk / (progress.totalChunks || 1)) * 100) : 0}٪
                                </span>
                            </div>

                            <div className="w-full bg-cyan-950/40 rounded-full h-2 overflow-hidden border border-cyan-500/30">
                                <div 
                                    className="bg-gradient-to-r from-secondary to-cyan-400 h-full rounded-full transition-all duration-300"
                                    style={{ width: `${progress ? Math.min(100, Math.round((progress.currentChunk / (progress.totalChunks || 1)) * 100)) : 10}%` }}
                                />
                            </div>

                            <div className="flex items-center justify-between text-[11px] text-text-muted">
                                <span>{extractedItems.length} واژه تخصصی کشف و یکدست شد.</span>
                                <button
                                    type="button"
                                    onClick={handleCancelExtraction}
                                    className="text-rose-400 hover:text-rose-300 underline font-bold"
                                >
                                    توقف استخراج
                                </button>
                            </div>
                        </div>
                    )}

                    {/* Action Trigger Button */}
                    {!isExtracting && (
                        <div className="flex flex-col sm:flex-row gap-2">
                            <button
                                type="button"
                                onClick={handleStartExtraction}
                                disabled={!currentSelectedFile}
                                className="flex-1 py-3 px-4 rounded-xl bg-gradient-to-r from-secondary via-purple-600 to-cyan-500 hover:opacity-95 text-white font-black text-xs sm:text-sm transition-all shadow-lg shadow-cyan-500/20 flex items-center justify-center gap-2 disabled:opacity-50"
                            >
                                <Zap className="w-4 h-4" />
                                <span>
                                  {extractedItems.length > 0 ? 'استخراج مجدد واژگان تخصصی' : 'شروع استخراج اتوماتیک واژگان'}
                                </span>
                            </button>
                        </div>
                    )}

                    {/* Error Notice */}
                    {extractionError && (
                        <div className="p-3 rounded-xl border border-rose-500/30 bg-rose-500/10 text-xs text-rose-400 flex items-center gap-2">
                            <AlertTriangle className="w-4 h-4 shrink-0" />
                            <span>{extractionError}</span>
                        </div>
                    )}

                    {/* Success Notice */}
                    {successNotice && (
                        <div className="p-3 rounded-xl border border-emerald-500/30 bg-emerald-500/10 text-xs text-emerald-400 flex items-center justify-between gap-2">
                            <div className="flex items-center gap-2">
                                <CheckCircle2 className="w-4 h-4 shrink-0" />
                                <span>{successNotice}</span>
                            </div>
                            <button onClick={() => setSuccessNotice(null)} className="text-emerald-300 hover:text-white">
                                <X className="w-3.5 h-3.5" />
                            </button>
                        </div>
                    )}

                    {/* Extracted Items Results Table */}
                    {extractedItems.length > 0 && (
                        <div className="space-y-3 pt-2">
                            <div className="flex flex-wrap items-center justify-between gap-2 p-2 rounded-xl dark:bg-white/[0.02] bg-white border dark:border-white/10 border-slate-200">
                                <div className="flex items-center gap-2">
                                    <button
                                      type="button"
                                      onClick={handleSelectAllExtracted}
                                      className="flex items-center gap-1.5 text-xs text-text-muted hover:text-text font-medium"
                                    >
                                      {selectedExtractedIndices.size === extractedItems.length ? (
                                        <CheckSquare className="w-4 h-4 text-cyan-400" />
                                      ) : (
                                        <Square className="w-4 h-4 text-text-muted" />
                                      )}
                                      <span>انتخاب همه ({extractedItems.length})</span>
                                    </button>
                                </div>

                                <div className="flex items-center gap-1.5 mr-auto">
                                    <button
                                      type="button"
                                      onClick={() => handleDownloadExtracted('json')}
                                      className="flex items-center gap-1 px-2.5 py-1 rounded-lg border dark:border-white/10 border-slate-200 text-[11px] text-text-muted hover:text-text hover:border-cyan-500/40 transition-all"
                                      title="دانلود فایل JSON واژه‌نامه"
                                    >
                                      <Download className="w-3 h-3" />
                                      <span>JSON</span>
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => handleDownloadExtracted('txt')}
                                      className="flex items-center gap-1 px-2.5 py-1 rounded-lg border dark:border-white/10 border-slate-200 text-[11px] text-text-muted hover:text-text hover:border-cyan-500/40 transition-all"
                                      title="دانلود فایل متنی TXT واژه‌نامه"
                                    >
                                      <Download className="w-3 h-3" />
                                      <span>TXT</span>
                                    </button>
                                </div>
                            </div>

                            {/* Extracted Search */}
                            <div className="relative">
                                <Search className="w-3.5 h-3.5 text-text-muted absolute right-3 top-2.5" />
                                <input
                                  type="text"
                                  value={extractedSearch}
                                  onChange={(e) => setExtractedSearch(e.target.value)}
                                  placeholder="فیلتر در واژگان استخراج‌شده..."
                                  className="w-full pr-8 pl-3 py-1.5 text-xs rounded-xl dark:bg-[#0a0e27] bg-white border dark:border-white/10 border-slate-200 text-text focus:outline-none focus:border-cyan-400"
                                />
                            </div>

                            {/* Extracted Rows */}
                            <div className="space-y-1.5 max-h-[260px] overflow-y-auto custom-scrollbar pr-1">
                                {filteredExtractedItems.map((item, idx) => {
                                    const originalIdx = extractedItems.findIndex(i => i.term === item.term);
                                    const isSelected = selectedExtractedIndices.has(originalIdx);

                                    return (
                                        <div 
                                          key={idx} 
                                          onClick={() => handleToggleExtractedIndex(originalIdx)}
                                          className={`flex items-center justify-between p-2.5 rounded-xl border transition-all cursor-pointer text-xs ${
                                            isSelected 
                                              ? 'dark:border-cyan-500/40 border-cyan-500/50 dark:bg-cyan-950/20 bg-cyan-50/60' 
                                              : 'dark:border-white/5 border-slate-200 dark:bg-black/20 bg-white opacity-75 hover:opacity-100'
                                          }`}
                                        >
                                            <div className="flex items-center gap-2.5 w-full overflow-hidden">
                                                <div className="shrink-0 text-cyan-400">
                                                    {isSelected ? <CheckSquare className="w-4 h-4" /> : <Square className="w-4 h-4 text-text-muted" />}
                                                </div>
                                                <span className="font-mono font-bold text-text dir-ltr truncate w-1/2" title={item.term}>
                                                  {item.term}
                                                </span>
                                                <span className="text-secondary text-xs shrink-0">➜</span>
                                                <span className="font-semibold text-cyan-600 dark:text-cyan-300 dir-rtl truncate w-1/2 text-right" title={item.translation}>
                                                  {item.translation}
                                                </span>
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>

                            {/* Import Button */}
                            <div className="p-3 rounded-2xl border dark:border-cyan-500/30 border-cyan-500/40 dark:bg-cyan-950/30 bg-cyan-50/80 space-y-2">
                                <div className="flex flex-wrap items-center justify-between gap-2">
                                    <button
                                        type="button"
                                        onClick={handleImportExtractedIntoGlossary}
                                        disabled={selectedExtractedIndices.size === 0}
                                        className="w-full sm:w-auto px-4 py-2 rounded-xl bg-gradient-to-r from-secondary to-cyan-500 text-white font-bold text-xs hover:opacity-90 transition-all flex items-center justify-center gap-2 disabled:opacity-50 shadow-xs"
                                    >
                                        <Check className="w-4 h-4" />
                                        <span>افزودن موارد انتخابی به واژه‌نامه تخصصی آموزشی ({selectedExtractedIndices.size})</span>
                                    </button>
                                </div>
                                <p className="text-[10px] text-text-muted">
                                    💡 <strong>اعمال خودکار با شروع ترجمه:</strong> حتی در صورت عدم کلیک روی این دکمه، با زدن دکمه «شروع ترجمه» در صفحه اصلی، این اصطلاحات به‌صورت خودکار به واژه‌نامه آموزشی ایمپورت شده و ترجمه یکپارچه انجام خواهد شد.
                                </p>
                            </div>
                        </div>
                    )}
                </div>
            )}

            {/* --- TAB 3: BULK TEXT INPUT --- */}
            {activeTab === 'bulk' && (
                <div className="space-y-4 h-full flex flex-col">
                    <div className="bg-secondary/10 border border-secondary/20 rounded-xl p-3 text-xs text-text">
                        <p className="font-bold mb-1 text-secondary">راهنما:</p>
                        هر خط باید شامل یک واژه و ترجمه آن باشد که با <b>:</b> یا <b>-&gt;</b> جدا شده‌اند.
                        <br/>
                        مثال: <code className="dark:bg-black/30 bg-slate-200/70 px-1 rounded text-secondary font-mono">Quantum Computing: رایانش کوانتومی</code>
                    </div>
                    <textarea 
                        value={bulkInput}
                        onChange={(e) => setBulkInput(e.target.value)}
                        className="flex-1 w-full dark:bg-[#0a0e27] bg-white border dark:border-white/10 border-slate-200 rounded-xl p-4 text-sm dark:text-white text-slate-900 focus:border-secondary focus:outline-none resize-none font-mono min-h-[200px] shadow-xs"
                        placeholder={`Machine Learning: یادگیری ماشین\nNeural Network: شبکه عصبی\n...`}
                    />
                    <button 
                        onClick={handleBulkImport}
                        disabled={!bulkInput.trim()}
                        className="w-full py-2.5 bg-gradient-to-r from-secondary to-cyan-500 text-white rounded-xl flex items-center justify-center gap-2 text-xs font-bold transition-all disabled:opacity-40"
                    >
                        <FileText className="w-4 h-4" />
                        <span>پردازش و افزودن به لیست</span>
                    </button>
                </div>
            )}
            
        </div>

        {/* Footer */}
        <div className="p-4 sm:p-5 border-t dark:border-white/10 border-slate-200 dark:bg-[#0a0e27]/80 bg-white/80 flex flex-wrap items-center justify-between gap-3 backdrop-blur-md">
            <div className="text-xs text-text-muted">
                مجموع: <span className="font-bold text-text font-mono">{items.length}</span> اصطلاح تخصصی ذخیره‌شده
            </div>

            <button 
                onClick={handleSave}
                className="py-2.5 px-6 bg-gradient-to-r from-secondary to-cyan-500 hover:opacity-95 text-white font-bold rounded-xl shadow-lg shadow-secondary/20 transition-all flex items-center gap-2 text-xs sm:text-sm mr-auto"
            >
                <Save className="w-4 h-4" />
                <span>ذخیره و تأیید واژه‌نامه</span>
            </button>
        </div>

      </div>

      {/* Plain Text Preview Modal */}
      {showPlainTextModal && plainTextPreview && (
        <div className="fixed inset-0 z-[80] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={() => setShowPlainTextModal(false)}></div>
          <div className="relative w-full max-w-lg glass rounded-2xl overflow-hidden p-5 space-y-3 dark:bg-[#0a0e27] bg-white border border-cyan-500/30 shadow-2xl">
            <div className="flex items-center justify-between border-b dark:border-white/10 border-slate-200 pb-3">
              <h3 className="text-sm font-bold text-text flex items-center gap-2">
                <FileText className="w-4 h-4 text-cyan-400" />
                <span>فایل متنی ساده تبدیل‌شده از زیرنویس</span>
              </h3>
              <button onClick={() => setShowPlainTextModal(false)} className="p-1 rounded-lg hover:bg-white/10 text-text-muted">
                <X className="w-4 h-4" />
              </button>
            </div>
            <textarea
              readOnly
              value={plainTextPreview}
              className="w-full h-64 p-3 text-xs font-mono dark:bg-black/30 bg-slate-50 rounded-xl border dark:border-white/10 border-slate-200 text-text resize-none focus:outline-none custom-scrollbar"
            />
            <div className="flex justify-between items-center text-xs text-text-muted">
              <span>طول متن: {plainTextPreview.length} کاراکتر</span>
              <button
                type="button"
                onClick={() => {
                  navigator.clipboard.writeText(plainTextPreview);
                  alert('متن با موفقیت کپی شد.');
                }}
                className="px-3 py-1.5 rounded-lg bg-cyan-500/15 text-cyan-400 border border-cyan-500/30 text-xs font-bold hover:bg-cyan-500/25"
              >
                کپی متن ساده
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
