
import React, { useEffect, useState } from 'react';
import { SubtitleBlock, NetflixError } from '../types';
import { Clock, AlertTriangle, Search, Replace, ArrowLeft, Layers, Undo, Redo, CheckSquare, Square, Languages, X, Loader2, Wand2, Trash2, ChevronsDown, ChevronsUp } from 'lucide-react';

interface SubtitleEditorProps {
  blocks: SubtitleBlock[];
  onUpdateBlock: (id: number, text: string) => void;
  validationErrors?: NetflixError[];
  onFindReplace: (find: string, replace: string, scope: 'current' | 'all') => void;
  hasMultipleFiles: boolean;
  
  // Undo/Redo Props
  onUndo: () => void;
  onRedo: () => void;
  canUndo: boolean;
  canRedo: boolean;
  onCommitChange: (id: number, oldText: string, newText: string) => void;
  onRetranslateSelected: (ids: number[]) => Promise<void> | void;
  onAutoFixSelected: (ids: number[]) => void;
  onDeleteSelected: (ids: number[]) => void;
  isRetranslatingSelection?: boolean;
  activeTranslationBlockIds?: number[];
}

export const SubtitleEditor: React.FC<SubtitleEditorProps> = ({ 
  blocks, 
  onUpdateBlock, 
  validationErrors = [],
  onFindReplace,
  hasMultipleFiles,
  onUndo,
  onRedo,
  canUndo,
  canRedo,
  onCommitChange,
  onRetranslateSelected,
  onAutoFixSelected,
  onDeleteSelected,
  isRetranslatingSelection = false,
  activeTranslationBlockIds = []
}) => {
  const [findTerm, setFindTerm] = useState('');
  const [replaceTerm, setReplaceTerm] = useState('');
  const [scope, setScope] = useState<'current' | 'all'>('current');
  const [selectedBlockIds, setSelectedBlockIds] = useState<number[]>([]);
  const [selectionAnchorId, setSelectionAnchorId] = useState<number | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const blocksPerPage = 50;

  useEffect(() => {
    const availableIds = new Set(blocks.map(block => block.id));
    setSelectedBlockIds(prev => prev.filter(id => availableIds.has(id)));
  }, [blocks]);

  const totalPages = Math.max(1, Math.ceil(blocks.length / blocksPerPage));
  const activePage = activeTranslationBlockIds.length > 0
    ? Math.floor(Math.max(0, blocks.findIndex(block => block.id === activeTranslationBlockIds[0])) / blocksPerPage) + 1
    : null;

  useEffect(() => {
    setCurrentPage(previous => Math.min(Math.max(1, previous), totalPages));
  }, [totalPages]);

  // Follow the translation worker so the currently processed chunk is visible.
  useEffect(() => {
    if (activePage) setCurrentPage(activePage);
  }, [activePage]);

  const visibleBlocks = blocks.slice((currentPage - 1) * blocksPerPage, currentPage * blocksPerPage);

  const selectedCount = selectedBlockIds.length;
  const selectedSet = new Set(selectedBlockIds);
  const activeTranslationSet = new Set(activeTranslationBlockIds);

  const toggleBlockSelection = (id: number, shiftKey = false) => {
    const currentIndex = blocks.findIndex(block => block.id === id);
    const anchorIndex = selectionAnchorId === null ? -1 : blocks.findIndex(block => block.id === selectionAnchorId);

    if (shiftKey && anchorIndex !== -1 && currentIndex !== -1) {
      const [from, to] = anchorIndex < currentIndex ? [anchorIndex, currentIndex] : [currentIndex, anchorIndex];
      const rangeIds = blocks.slice(from, to + 1).map(block => block.id);
      setSelectedBlockIds(prev => Array.from(new Set([...prev, ...rangeIds])));
      return;
    }

    setSelectionAnchorId(id);
    setSelectedBlockIds(prev => prev.includes(id) ? prev.filter(item => item !== id) : [...prev, id]);
  };

  const selectAllBlocks = () => {
    setSelectedBlockIds(blocks.map(block => block.id));
  };

  const clearSelection = () => {
    setSelectedBlockIds([]);
    setSelectionAnchorId(null);
  };

  const getSelectionAnchorIndex = () => {
    const anchorId = selectionAnchorId ?? selectedBlockIds[0];
    return blocks.findIndex(block => block.id === anchorId);
  };

  const selectBlocksBelow = () => {
    const anchorIndex = getSelectionAnchorIndex();
    if (anchorIndex === -1) return;
    setSelectedBlockIds(blocks.slice(anchorIndex).map(block => block.id));
  };

  const selectBlocksAbove = () => {
    const anchorIndex = getSelectionAnchorIndex();
    if (anchorIndex === -1) return;
    setSelectedBlockIds(blocks.slice(0, anchorIndex + 1).map(block => block.id));
  };

  const handleAutoFixSelection = () => {
    if (selectedBlockIds.length === 0) return;
    onAutoFixSelected(selectedBlockIds);
    clearSelection();
  };

  const handleDeleteSelection = () => {
    if (selectedBlockIds.length === 0) return;
    onDeleteSelected(selectedBlockIds);
    clearSelection();
  };

  const handleRetranslateSelection = async () => {
    if (selectedBlockIds.length === 0) return;
    await onRetranslateSelected(selectedBlockIds);
    clearSelection();
  };
  
  const getErrorForBlock = (id: number) => {
    return validationErrors.find(e => e.blockId === id);
  };

  const handleReplaceClick = () => {
    if (findTerm.trim()) {
      onFindReplace(findTerm, replaceTerm, scope);
    }
  };

  return (
    <div className="space-y-6 pb-20">
      
      {/* Find & Replace Tool Bar */}
      <div className="glass rounded-2xl p-6 border border-[#00f0ff]/20 animate-in fade-in slide-in-from-top-4">
        <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2 text-[#00f0ff]">
                <Replace className="w-5 h-5" />
                <h3 className="font-bold text-sm">تصحیح گروهی کلمات (Find & Replace)</h3>
            </div>
            
            <div className="flex items-center gap-3">
                {/* Separate Square Undo / Redo Buttons */}
                <div className="flex items-center gap-2 mr-4">
                    <button 
                        onClick={onUndo}
                        disabled={!canUndo}
                        className={`
                            w-9 h-9 flex items-center justify-center rounded-xl border transition-all duration-200
                            ${canUndo 
                                ? 'bg-[#0a0e27] hover:bg-white/10 border-white/10 text-white hover:border-[#00f0ff]/50' 
                                : 'bg-black/20 border-transparent text-white/20 cursor-not-allowed'
                            }
                        `}
                        title="Undo (Ctrl+Z)"
                    >
                        <Undo className="w-4 h-4" />
                    </button>
                    <button 
                        onClick={onRedo}
                        disabled={!canRedo}
                        className={`
                            w-9 h-9 flex items-center justify-center rounded-xl border transition-all duration-200
                            ${canRedo 
                                ? 'bg-[#0a0e27] hover:bg-white/10 border-white/10 text-white hover:border-[#00f0ff]/50' 
                                : 'bg-black/20 border-transparent text-white/20 cursor-not-allowed'
                            }
                        `}
                        title="Redo (Ctrl+Shift+Z)"
                    >
                        <Redo className="w-4 h-4" />
                    </button>
                </div>

                <div className="flex bg-[#0a0e27] rounded-lg p-1 border border-white/10">
                        <button 
                            onClick={() => setScope('current')}
                            className={`px-3 py-1 text-xs rounded transition-colors ${scope === 'current' ? 'bg-white/10 text-white' : 'text-white/50'}`}
                        >
                            فایل جاری
                        </button>
                        <button 
                            onClick={() => setScope('all')}
                            className={`px-3 py-1 text-xs rounded transition-colors flex items-center gap-1 ${scope === 'all' ? 'bg-[#ff00ea]/20 text-[#ff00ea]' : 'text-white/50'}`}
                        >
                            <Layers className="w-3 h-3" />
                            اعمال برای تمام فایل‌ها
                        </button>
                </div>
            </div>
        </div>
        
        <div className="flex flex-col md:flex-row gap-4 items-end">
          <div className="flex-1 w-full space-y-2">
             <label className="text-xs text-white/50 pr-1">کلمه اشتباه (موجود در متن)</label>
             <div className="relative">
                <input 
                  value={findTerm}
                  onChange={(e) => setFindTerm(e.target.value)}
                  placeholder="مثلاً: گالکسی"
                  className="w-full bg-[#0a0e27] border border-white/10 rounded-xl py-3 px-4 pl-10 text-sm text-white focus:border-[#00f0ff] focus:outline-none transition-colors"
                />
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/30" />
             </div>
          </div>

          <div className="hidden md:flex pb-3 text-white/20">
             <ArrowLeft className="w-6 h-6" />
          </div>

          <div className="flex-1 w-full space-y-2">
             <label className="text-xs text-white/50 pr-1">کلمه صحیح (جایگزین شود)</label>
             <input 
                value={replaceTerm}
                onChange={(e) => setReplaceTerm(e.target.value)}
                placeholder="مثلاً: کهکشان"
                className="w-full bg-[#0a0e27] border border-white/10 rounded-xl py-3 px-4 text-sm text-white focus:border-[#00f0ff] focus:outline-none transition-colors"
             />
          </div>

          <button 
            onClick={handleReplaceClick}
            disabled={!findTerm.trim()}
            className="w-full md:w-auto bg-[#00f0ff]/10 hover:bg-[#00f0ff]/20 text-[#00f0ff] border border-[#00f0ff]/20 font-bold py-3 px-6 rounded-xl transition-all disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap flex items-center justify-center gap-2"
          >
             <Replace className="w-4 h-4" />
             {scope === 'all' ? 'جایگزینی در تمام فایل‌ها' : 'جایگزینی در فایل جاری'}
          </button>
        </div>
      </div>

      {/* Blocks List */}
      <div className="space-y-4">
        {visibleBlocks.map((block) => {
          const error = getErrorForBlock(block.id);
          const hasError = !!error;
          
          return (
            <div 
              key={block.id} 
              className={`
                group relative glass rounded-2xl p-6 pr-16 transition-all duration-300
                ${selectedSet.has(block.id)
                  ? 'border-[#ff00ea] bg-[#ff00ea]/10 shadow-[0_0_22px_rgba(255,0,234,0.16)]'
                  : activeTranslationSet.has(block.id)
                  ? 'border-orange-400 bg-orange-500/10 shadow-[0_0_24px_rgba(251,146,60,0.20)]'
                  : hasError 
                  ? 'border-[#E50914] bg-[#E50914]/5' 
                  : block.translatedText 
                      ? 'border-[#00f0ff]/30 hover:border-[#00f0ff]/50' 
                      : 'border-white/5 hover:border-white/20'
                }
              `}
            >
              <button
                type="button"
                onClick={(event) => toggleBlockSelection(block.id, event.shiftKey)}
                className={`absolute right-5 top-6 z-20 rounded-lg p-1.5 transition-all ${selectedSet.has(block.id) ? 'bg-[#ff00ea]/20 text-[#ff00ea]' : 'bg-[#0a0e27]/80 text-white/40 hover:text-[#ff00ea] hover:bg-[#ff00ea]/10'}`}
                aria-pressed={selectedSet.has(block.id)}
                aria-label={`انتخاب بلوک ${block.index}`}
                title="انتخاب برای ترجمه دوباره؛ با Shift بازه بین دو بلوک انتخاب می‌شود"
              >
                {selectedSet.has(block.id) ? <CheckSquare className="w-5 h-5" /> : <Square className="w-5 h-5" />}
              </button>

              {activeTranslationSet.has(block.id) && !selectedSet.has(block.id) && (
                <div className="absolute top-0 right-20 -translate-y-1/2 rounded-full border border-orange-300/60 bg-[#2b1a13]/95 px-3 py-1 text-[10px] font-bold text-orange-50 shadow-[0_8px_24px_rgba(0,0,0,0.45)] backdrop-blur-xl z-10 whitespace-nowrap">
                  در حال ترجمه
                </div>
              )}

              {/* Error Message */}
              {hasError && (
                <div className="absolute top-0 left-1/2 -translate-x-1/2 -translate-y-1/2 bg-[#E50914] text-white text-[10px] py-1 px-3 rounded-full flex items-center gap-1 shadow-lg z-10 whitespace-nowrap">
                    <AlertTriangle className="w-3 h-3" />
                    {error.message}
                </div>
              )}

              {/* Header: ID and Time */}
              <div className="flex justify-between items-center mb-4 text-xs font-mono">
                <div className="flex items-center gap-3">
                    <span className={`${hasError ? 'text-[#E50914]' : 'text-[#00f0ff]'} font-bold`}>#{block.index}</span>
                    <div className="flex items-center gap-2 bg-[#0a0e27] px-3 py-1.5 rounded-lg border border-white/10 text-white/50">
                        <Clock className="w-3 h-3" />
                        <span>{block.startTime}</span>
                        <span className="text-white/20">➜</span>
                        <span>{block.endTime}</span>
                    </div>
                </div>
              </div>
    
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6" dir="ltr">
                {/* Original Text */}
                <div className="relative group/input" dir="ltr">
                    <label className="absolute -top-3 left-3 px-2 bg-[#0a0e27] text-[10px] text-white/40 uppercase tracking-wider rounded border border-white/10">Original</label>
                    <div 
                        className="w-full p-4 bg-[#0a0e27]/50 rounded-xl text-white/80 text-sm leading-7 dir-ltr text-left border border-white/5 min-h-[100px]"
                    >
                        {block.originalText}
                    </div>
                </div>
    
                {/* Translated Text */}
                <div className="relative group/input" dir="rtl">
                    <label className={`absolute -top-3 right-3 px-2 bg-[#0a0e27] text-[10px] uppercase tracking-wider rounded border ${hasError ? 'text-[#E50914] border-[#E50914]/50' : 'text-[#00f0ff] border-[#00f0ff]/20'}`}>Persian</label>
                    <textarea
                        value={block.translatedText || ''}
                        onChange={(e) => onUpdateBlock(block.id, e.target.value)}
                        onFocus={(e) => {
                             // Capture original value on focus to detect changes for Undo stack
                             e.currentTarget.dataset.originalValue = block.translatedText || '';
                        }}
                        onBlur={(e) => {
                            const oldVal = e.currentTarget.dataset.originalValue;
                            const newVal = block.translatedText || '';
                            // Only commit if text actually changed from when user focused
                            if (oldVal !== undefined && oldVal !== newVal) {
                                onCommitChange(block.id, oldVal, newVal);
                            }
                        }}
                        placeholder="در انتظار ترجمه..."
                        className={`
                            w-full p-4 bg-[#0a0e27] rounded-xl text-sm leading-7 dir-rtl text-right resize-y min-h-[100px] focus:outline-none border transition-all
                            ${block.translatedText 
                                ? 'text-white border-white/10 focus:border-[#00f0ff]/50' 
                                : 'text-white/30 border-white/5 focus:border-white/20 italic'
                            }
                        `}
                        dir="rtl"
                    />
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {totalPages > 1 && (
        <nav className="flex flex-wrap items-center justify-center gap-2 rounded-2xl border border-white/10 bg-[#0a0e27]/50 p-4" aria-label="صفحه‌بندی زیرنویس">
          <span className="ml-2 text-xs text-white/50">صفحه {currentPage} از {totalPages} (هر صفحه ۵۰ بلوک)</span>
          {Array.from({ length: totalPages }, (_, index) => index + 1).map(page => (
            <button key={page} type="button" onClick={() => setCurrentPage(page)} aria-current={page === currentPage ? 'page' : undefined} className={`min-w-9 rounded-lg border px-3 py-2 text-xs font-bold transition-all ${page === currentPage ? 'border-[#00f0ff] bg-[#00f0ff]/15 text-[#00f0ff]' : 'border-white/10 bg-white/5 text-white/60 hover:bg-white/10'}`}>
              {page}
            </button>
          ))}
        </nav>
      )}

      {selectedCount > 0 && (
        <div className="fixed bottom-8 left-1/2 z-[65] w-[calc(100%-2rem)] max-w-3xl -translate-x-1/2 animate-in slide-in-from-bottom-4 fade-in">
          <div className="glass flex flex-col gap-3 rounded-2xl border border-[#ff00ea]/30 bg-background/95 p-3 shadow-[0_0_30px_rgba(255,0,234,0.18)] backdrop-blur-xl sm:flex-row sm:items-center sm:justify-between">
            <div className="text-center text-sm font-bold text-text sm:text-right">
              {selectedCount} بلوک انتخاب شده است
            </div>
            <div className="grid grid-cols-4 gap-2 sm:grid-cols-7">
              <button
                type="button"
                onClick={selectAllBlocks}
                disabled={selectedCount === blocks.length || isRetranslatingSelection}
                className="flex min-h-[58px] flex-col items-center justify-center gap-1 rounded-xl border border-white/10 bg-white/5 px-2 py-2 text-[10px] font-bold leading-tight text-white/80 transition-all hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-40"
              >
                <CheckSquare className="h-4 w-4" />
                <span>همه</span>
              </button>
              <button
                type="button"
                onClick={selectBlocksBelow}
                disabled={isRetranslatingSelection}
                className="flex min-h-[58px] flex-col items-center justify-center gap-1 rounded-xl border border-white/10 bg-white/5 px-2 py-2 text-[10px] font-bold leading-tight text-white/80 transition-all hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-40"
              >
                <ChevronsDown className="h-4 w-4" />
                <span>انتخاب پایینی‌ها</span>
              </button>
              <button
                type="button"
                onClick={selectBlocksAbove}
                disabled={isRetranslatingSelection}
                className="flex min-h-[58px] flex-col items-center justify-center gap-1 rounded-xl border border-white/10 bg-white/5 px-2 py-2 text-[10px] font-bold leading-tight text-white/80 transition-all hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-40"
              >
                <ChevronsUp className="h-4 w-4" />
                <span>انتخاب بالایی‌ها</span>
              </button>
              <button
                type="button"
                onClick={handleAutoFixSelection}
                disabled={isRetranslatingSelection}
                className="flex min-h-[58px] flex-col items-center justify-center gap-1 rounded-xl border border-[#E50914]/30 bg-[#E50914]/10 px-2 py-2 text-[10px] font-bold leading-tight text-red-200 transition-all hover:bg-[#E50914]/20 disabled:cursor-not-allowed disabled:opacity-50"
              >
                <Wand2 className="h-4 w-4" />
                <span>اصلاح خودکار</span>
              </button>
              <button
                type="button"
                onClick={handleRetranslateSelection}
                disabled={isRetranslatingSelection}
                className="flex min-h-[58px] flex-col items-center justify-center gap-1 rounded-xl border border-[#00f0ff]/30 bg-[#00f0ff]/10 px-2 py-2 text-[10px] font-bold leading-tight text-[#00f0ff] transition-all hover:bg-[#00f0ff]/20 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {isRetranslatingSelection ? <Loader2 className="h-4 w-4 animate-spin" /> : <Languages className="h-4 w-4" />}
                <span>ترجمه دوباره</span>
              </button>
              <button
                type="button"
                onClick={handleDeleteSelection}
                disabled={isRetranslatingSelection}
                className="flex min-h-[58px] flex-col items-center justify-center gap-1 rounded-xl border border-red-500/20 bg-red-500/10 px-2 py-2 text-[10px] font-bold leading-tight text-red-300 transition-all hover:bg-red-500/20 disabled:cursor-not-allowed disabled:opacity-50"
              >
                <Trash2 className="h-4 w-4" />
                <span>حذف</span>
              </button>
              <button
                type="button"
                onClick={clearSelection}
                disabled={isRetranslatingSelection}
                className="flex min-h-[58px] flex-col items-center justify-center gap-1 rounded-xl border border-white/10 bg-white/5 px-2 py-2 text-[10px] font-bold leading-tight text-white/60 transition-all hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-50"
              >
                <X className="h-4 w-4" />
                <span>لغو</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
