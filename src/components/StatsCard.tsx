

import React from 'react';
import { SubtitleFile, AppStatus, NetflixError, TranslationMethod } from '../types';
import { Play, Pause, Download, FileText, Clock, Hash, Timer, HardDrive, Trash2, XCircle, RefreshCw, Settings2, Wand2, Archive, Save, FileJson, Sparkles } from 'lucide-react';
import { HelpTooltip } from './HelpTooltip';

interface StatsCardProps {
  activeFile: SubtitleFile;
  activeFileIndex: number;
  totalFiles: number;
  translationMethod: TranslationMethod;
  onTranslationMethodChange: (method: TranslationMethod) => void;
  onStart: () => void;
  onPause: () => void;
  onCancel: () => void;
  onDownload: () => void;
  onDownloadZip: () => void;
  onNewProject: () => void;
  onOpenTimingTools: () => void;
  onFixErrors: () => void;
  onSave?: () => void;
  onExportBackup?: () => void;
  onOptimizeStructure?: () => void; // New Prop
}

export const StatsCard: React.FC<StatsCardProps> = ({ 
  activeFile,
  activeFileIndex,
  totalFiles,
  translationMethod,
  onTranslationMethodChange,
  onStart, 
  onPause, 
  onCancel,
  onDownload,
  onDownloadZip,
  onNewProject,
  onOpenTimingTools,
  onFixErrors,
  onSave,
  onExportBackup,
  onOptimizeStructure
}) => {
  const blocks = activeFile.blocks;
  const status = activeFile.status;
  
  const total = blocks.length;
  const translatedCount = blocks.filter(b => b.translatedText).length;
  // Calculate percentage based on processed count if translating, otherwise block ratio
  const percentage = status === AppStatus.TRANSLATING 
      ? Math.round(activeFile.progress) 
      : Math.round((translatedCount / total) * 100) || 0;

  const formatFileSize = (bytes?: number) => {
    if (!bytes) return 'Unknown';
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  const isProcessing = status === AppStatus.TRANSLATING;
  const isPaused = status === AppStatus.PAUSED;
  const isCompleted = status === AppStatus.COMPLETED;
  const isCancelled = status === AppStatus.CANCELLED;
  const isReady = status === AppStatus.READY;
  const isError = status === AppStatus.ERROR;
  const validationErrors = activeFile.netflixErrors || [];
  const hasErrors = validationErrors.length > 0;
  const diagnostic = activeFile.diagnostic;
  const hasTranslation = translatedCount > 0;
  const canDownloadOutput = isCompleted || ((isPaused || isCancelled || isError) && hasTranslation);

  // Tools should be available if we have blocks loaded, regardless of translation status (mostly)
  const showTools = blocks.length > 0 && !isProcessing;

  return (
    <div className="glass rounded-3xl p-8 mb-8 animate-in fade-in slide-in-from-bottom-4 relative overflow-visible group">
      
      {/* File Info Header */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-6 mb-8 border-b border-white/5 pb-8">
        <div className="flex items-center gap-4 w-full">
            <div className="w-12 h-12 rounded-xl bg-[#00f0ff]/10 border border-[#00f0ff]/20 flex items-center justify-center flex-shrink-0 relative">
                <FileText className="w-6 h-6 text-[#00f0ff]" />
                {totalFiles > 1 && (
                    <span className="absolute -top-2 -right-2 bg-[#ff00ea] text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full">
                        {activeFileIndex + 1}/{totalFiles}
                    </span>
                )}
            </div>
            <div className="min-w-0 flex-1">
                <div className="flex items-center justify-between flex-wrap gap-2">
                    <h3 className="text-xl font-bold text-white truncate dir-ltr text-right max-w-md order-1" title={activeFile.name}>
                    {activeFile.name}
                    </h3>
                    
                    <div className="flex items-center gap-2 md:mr-4 order-2 md:order-2 ml-auto md:ml-0">
                        {/* Manual Save (Browser) */}
                        {onSave && (
                            <div className="flex items-center gap-1">
                                <button 
                                    onClick={onSave}
                                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-green-500/10 hover:bg-green-500/20 text-green-400 border border-green-500/20 transition-all text-xs font-bold"
                                    title="ذخیره وضعیت در حافظه مرورگر"
                                >
                                    <Save className="w-4 h-4" />
                                    <span>ذخیره</span>
                                </button>
                                <HelpTooltip 
                                    text="این گزینه پروژه شما را در حافظه مرورگر (Local Storage) ذخیره می‌کند. اگر کش مرورگر را پاک کنید، این اطلاعات از بین می‌رود." 
                                    position="bottom"
                                />
                            </div>
                        )}

                        {/* Export Backup (File) */}
                        {onExportBackup && (
                            <div className="flex items-center gap-1">
                                <button 
                                    onClick={onExportBackup}
                                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-blue-500/10 hover:bg-blue-500/20 text-blue-400 border border-blue-500/20 transition-all text-xs font-bold"
                                    title="دانلود فایل پروژه (JSON)"
                                >
                                    <FileJson className="w-4 h-4" />
                                    <span>بکاپ</span>
                                </button>
                                <HelpTooltip 
                                    text="دانلود کامل پروژه به‌صورت فایل JSON. برای بازیابی (Restore)، کافیست این فایل را در صفحه اصلی برنامه آپلود کنید تا پروژه شما دقیقاً به همین حالت برگردد." 
                                    position="bottom"
                                />
                            </div>
                        )}

                        {/* Timing Tools Button */}
                        {showTools && (
                            <button 
                                onClick={onOpenTimingTools}
                                className="p-1.5 rounded-lg hover:bg-[#00f0ff]/10 text-[#00f0ff]/70 hover:text-[#00f0ff] transition-colors"
                                title="ابزارهای زمان‌بندی و استاندارد نتفلیکس"
                            >
                                <Settings2 className="w-5 h-5" />
                            </button>
                        )}

                        {/* Delete/Remove File Icon */}
                        {(isReady || isCancelled || isCompleted || isError) && (
                            <button 
                                onClick={onNewProject}
                                className="p-1.5 rounded-lg hover:bg-red-500/10 text-white/30 hover:text-red-400 transition-colors"
                                title="حذف فایل / پروژه جدید"
                            >
                                <Trash2 className="w-5 h-5" />
                            </button>
                        )}
                    </div>
                </div>
                <div className="flex flex-wrap items-center gap-4 mt-2 text-xs text-white/50">
                    <span className="flex items-center gap-1"><Hash className="w-3 h-3"/> {total} خط</span>
                    <span className="flex items-center gap-1"><Clock className="w-3 h-3"/> {blocks[blocks.length-1]?.endTime}</span>
                    <span className="flex items-center gap-1"><HardDrive className="w-3 h-3"/> {formatFileSize(activeFile.size)}</span>
                    {activeFile.processingDuration && (
                        <span className="flex items-center gap-1 text-[#00f0ff] animate-in fade-in"><Timer className="w-3 h-3"/> زمان پردازش: {activeFile.processingDuration}</span>
                    )}
                </div>
            </div>
        </div>
      </div>

      {/* Progress & Controls */}
      <div className="space-y-6">
         {/* Progress Bar Container */}
        <div className="relative pt-1">
            <div className="flex mb-2 items-center justify-between">
                <div className="text-right">
                    <span className={`text-xs font-semibold inline-block py-1 px-2 uppercase rounded-full border 
                        ${isCompleted ? 'text-green-400 bg-green-400/10 border-green-400/20' : 
                          isCancelled ? 'text-red-400 bg-red-400/10 border-red-400/20' :
                          'text-[#00f0ff] bg-[#00f0ff]/10 border-[#00f0ff]/20'}`}>
                        {activeFile.progressMessage || (isProcessing ? 'در حال ترجمه...' : 'آماده پردازش')}
                    </span>
                </div>
                <div className="text-right">
                    <span className="text-sm font-bold text-white">{percentage}%</span>
                </div>
            </div>
            
            <div className="overflow-hidden h-4 mb-4 text-xs flex rounded-full bg-[#0a0e27] border border-white/10 relative">
                <div 
                    style={{ width: `${percentage}%` }} 
                    className={`
                        shadow-none flex flex-col text-center whitespace-nowrap text-white justify-center transition-all duration-500
                        ${isCompleted ? 'bg-green-500 shadow-[0_0_20px_rgba(34,197,94,0.4)]' : 
                          isCancelled ? 'bg-red-500/50 grayscale' :
                          'bg-gradient-to-r from-[#00f0ff] to-[#ff00ea]'}
                        ${isProcessing ? 'animate-pulse-neon' : ''}
                    `}
                >
                     {isProcessing && (
                         <div className="absolute inset-0 bg-white/20 animate-pulse"></div>
                     )}
                </div>
            </div>
        </div>

        {!isProcessing && (isReady || isPaused || isError) && (
            <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4 space-y-3">
                <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-2">
                    <div>
                        <h4 className="text-sm font-bold text-white">روش ترجمه</h4>
                        <p className="text-xs text-white/50 mt-1">قبل از شروع ترجمه انتخاب کنید متن با روش پیش‌فرض ارسال شود یا به متن یک‌پارچه پاراگرافی تبدیل شود.</p>
                    </div>
                    <div className="flex w-full flex-col gap-3 md:w-auto md:min-w-[560px]">
                    <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-2" role="radiogroup" aria-label="روش ترجمه">
                        <button
                            type="button"
                            role="radio"
                            aria-checked={translationMethod === 'default'}
                            onClick={() => onTranslationMethodChange('default')}
                            className={`rounded-xl border px-4 py-3 text-right transition-all ${translationMethod === 'default' ? 'border-[#00f0ff] bg-[#00f0ff]/10 text-white shadow-[0_0_15px_rgba(0,240,255,0.15)]' : 'border-white/10 bg-black/10 text-white/60 hover:bg-white/5'}`}
                        >
                            <span className="block text-sm font-bold">متد پیش‌فرض</span>
                            <span className="block text-[11px] mt-1">ارسال بلوک‌های JSON با قوانین قبلی نرم‌افزار</span>
                        </button>
                        <button
                            type="button"
                            role="radio"
                            aria-checked={translationMethod === 'paragraph'}
                            onClick={() => onTranslationMethodChange('paragraph')}
                            className={`rounded-xl border px-4 py-3 text-right transition-all ${translationMethod === 'paragraph' ? 'border-[#ff00ea] bg-[#ff00ea]/10 text-white shadow-[0_0_15px_rgba(255,0,234,0.15)]' : 'border-white/10 bg-black/10 text-white/60 hover:bg-white/5'}`}
                        >
                            <span className="block text-sm font-bold">متد پاراگراف</span>
                            <span className="block text-[11px] mt-1">متن یک‌پارچه با نشانگر ID و بازگردانی به زمان‌بندی اصلی</span>
                        </button>

                        <button
                            type="button"
                            role="radio"
                            aria-checked={translationMethod === 'subtitle_translator'}
                            onClick={() => onTranslationMethodChange('subtitle_translator')}
                            title="بر اساس راهبرد rockbenben/subtitle-translator: استخراج محلی ساختار، ترجمهٔ فقط دیالوگ‌ها، و بازنشانی ترجمه در همان جایگاه‌های اصلی."
                            className={`rounded-xl border px-4 py-3 text-right transition-all ${translationMethod === 'subtitle_translator' ? 'border-[#38bdf8] bg-[#38bdf8]/10 text-white shadow-[0_0_15px_rgba(56,189,248,0.15)]' : 'border-white/10 bg-black/10 text-white/60 hover:bg-white/5'}`}
                        >
                            <span className="block text-sm font-bold">Subtitle Translator</span>
                            <span className="block text-[11px] mt-1">گزینهٔ مستقل الهام‌گرفته از ریپوی NewZone: فقط متن گفتار ترجمه می‌شود و ساختار هر بلوک دست‌نخورده بازسازی می‌گردد.</span>
                        </button>
                        <button
                            type="button"
                            role="radio"
                            aria-checked={translationMethod === 'skeleton_str'}
                            onClick={() => onTranslationMethodChange('skeleton_str')}
                            title="ساختار فایل در دستگاه شما می‌ماند؛ فقط دیالوگ‌ها با بافت پیرامونی ترجمه و سپس در زمان‌بندی اصلی بازگردانده می‌شوند."
                            className={`rounded-xl border px-4 py-3 text-right transition-all ${translationMethod === 'skeleton_str' ? 'border-[#a3e635] bg-[#a3e635]/10 text-white shadow-[0_0_15px_rgba(163,230,53,0.15)]' : 'border-white/10 bg-black/10 text-white/60 hover:bg-white/5'}`}
                        >
                            <span className="block text-sm font-bold">Skeleton STR <span className="text-xs font-normal">(اسکلت‌محور STR)</span></span>
                            <span className="block text-[11px] mt-1">فقط دیالوگ‌ها را با دسته‌های بافت‌دار و شماره‌گذاری‌شده ترجمه می‌کند و آن‌ها را در زمان‌بندی اصلی می‌نویسد. روش‌های دیگر تغییری نمی‌کنند.</span>
                        </button>
                    </div>
                    </div>
                </div>
            </div>
        )}

        {diagnostic && (
            <div className={`rounded-2xl border p-4 ${
                diagnostic.severity === 'error'
                    ? 'bg-red-500/10 border-red-500/30'
                    : diagnostic.severity === 'warning'
                        ? 'bg-yellow-500/10 border-yellow-500/30'
                        : 'bg-blue-500/10 border-blue-500/30'
            }`}>
                <div className="flex items-start gap-3">
                    <XCircle className={`w-5 h-5 mt-0.5 flex-shrink-0 ${
                        diagnostic.severity === 'error' ? 'text-red-400' : diagnostic.severity === 'warning' ? 'text-yellow-400' : 'text-blue-400'
                    }`} />
                    <div className="space-y-2 text-sm">
                        <div className="flex flex-wrap items-center gap-2">
                            <strong className="text-white">{diagnostic.title}</strong>
                            <span className="text-[10px] px-2 py-0.5 rounded-full bg-white/10 text-white/60 dir-ltr">{diagnostic.code}</span>
                        </div>
                        <p className="text-white/75 leading-relaxed"><span className="text-white/90 font-bold">علت احتمالی:</span> {diagnostic.cause}</p>
                        <p className="text-white/75 leading-relaxed"><span className="text-white/90 font-bold">راه‌حل پیشنهادی:</span> {diagnostic.recovery}</p>
                        {diagnostic.technicalDetails && (
                            <details className="text-white/55">
                                <summary className="cursor-pointer hover:text-white transition-colors">جزئیات فنی</summary>
                                <pre className="mt-2 max-h-28 overflow-auto rounded-lg bg-black/30 p-3 text-[11px] whitespace-pre-wrap dir-ltr text-left">
                                    {diagnostic.technicalDetails}
                                </pre>
                            </details>
                        )}
                    </div>
                </div>
            </div>
        )}

        {/* Action Buttons - Centered and 1/3 Width on Desktop */}
        <div className="flex flex-col md:flex-row items-center justify-center gap-4">
             {/* Netflix Fix Button */}
             {hasErrors && onFixErrors && (
                 <button 
                    onClick={onFixErrors}
                    className="w-full md:w-1/3 bg-[#E50914] hover:bg-[#b20710] text-white font-bold py-3 px-6 rounded-xl shadow-[0_0_20px_rgba(229,9,20,0.4)] transition-all flex items-center justify-center gap-2 animate-in slide-in-from-top-2"
                 >
                     <Wand2 className="w-5 h-5" />
                     اصلاح خودکار ({validationErrors.length})
                 </button>
             )}

             {/* Persian Structure Optimization Button */}
             {hasTranslation && !isProcessing && onOptimizeStructure && (
                  <button 
                     onClick={onOptimizeStructure}
                     className="w-full md:w-1/3 bg-indigo-500/10 hover:bg-indigo-500/20 text-indigo-400 border border-indigo-500/20 font-bold py-3 px-6 rounded-xl transition-all flex items-center justify-center gap-2 animate-in slide-in-from-top-2"
                  >
                      <Sparkles className="w-5 h-5" />
                      بهینه‌سازی ساختار
                  </button>
             )}

             {/* Start / Resume */}
             {(isReady || isPaused || isError) && !hasErrors && (
                 <button 
                    onClick={onStart}
                    className="w-full md:w-1/3 bg-gradient-to-r from-[#00f0ff] to-[#00c0cc] text-black font-bold py-3 px-6 rounded-xl shadow-[0_0_20px_rgba(0,240,255,0.3)] hover:shadow-[0_0_30px_rgba(0,240,255,0.5)] transition-all transform hover:-translate-y-1 flex items-center justify-center gap-2"
                 >
                    <Play className="w-5 h-5 fill-current" />
                    {totalFiles > 1 ? 'ترجمه نوبتی' : (isPaused ? 'ادامه ترجمه' : 'شروع ترجمه')}
                 </button>
             )}

             {/* Pause */}
             {isProcessing && (
                <button 
                    onClick={onPause}
                    className="w-full md:w-1/3 bg-white/10 hover:bg-white/20 text-white font-bold py-3 px-6 rounded-xl border border-white/10 transition-all flex items-center justify-center gap-2"
                 >
                    <Pause className="w-5 h-5 fill-current" />
                    توقف
                 </button>
             )}

             {/* Cancel */}
             {(isProcessing || isPaused) && (
                 <button 
                    onClick={onCancel}
                    className="w-full md:w-1/3 bg-red-500/10 hover:bg-red-500/20 text-red-400 hover:text-red-300 font-bold py-3 px-6 rounded-xl border border-red-500/20 transition-all flex items-center justify-center gap-2"
                 >
                    <XCircle className="w-5 h-5" />
                    لغو
                 </button>
             )}

             {/* Download Output */}
             {canDownloadOutput && (
                 <button 
                    onClick={onDownload}
                    className="w-full md:w-1/3 bg-[#ff00ea]/10 text-[#ff00ea] border border-[#ff00ea] hover:bg-[#ff00ea]/20 shadow-[0_0_15px_rgba(255,0,234,0.2)] font-bold py-3 px-6 rounded-xl transition-all flex items-center justify-center gap-2 animate-in zoom-in"
                  >
                    <Download className="w-5 h-5" />
                    {isCompleted ? 'دانلود فایل' : 'خروجی فایل فعلی'}
                  </button>
             )}
             
             {/* Download ALL ZIP */}
             {totalFiles > 1 && (
                 <button 
                    onClick={onDownloadZip}
                    className="w-full md:w-1/3 bg-white/10 hover:bg-white/20 text-white border border-white/20 font-bold py-3 px-6 rounded-xl transition-all flex items-center justify-center gap-2"
                    title="دانلود همه فایل‌ها بصورت زیپ"
                  >
                    <Archive className="w-5 h-5" />
                    دانلود ZIP
                  </button>
             )}

             {/* New Project / Replace File */}
             {(isCompleted || isCancelled) && (
                 <button 
                    onClick={onNewProject}
                    className="w-full md:w-1/3 bg-white/5 hover:bg-white/10 text-white/70 hover:text-white border border-white/10 font-bold py-3 px-6 rounded-xl transition-all flex items-center justify-center gap-2"
                  >
                    <RefreshCw className="w-5 h-5" />
                    پروژه جدید
                  </button>
             )}
        </div>
      </div>
    </div>
  );
};
