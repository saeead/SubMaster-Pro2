import React from 'react';
import { BookOpen, Layers, Sparkles, Check, X, HelpCircle, ArrowRight } from 'lucide-react';
import { MultiFileGlossaryStrategy } from '../types';

interface MultiFileGlossaryModalProps {
  isOpen: boolean;
  onClose: () => void;
  fileCount: number;
  currentStrategy: MultiFileGlossaryStrategy;
  onSelectStrategy: (strategy: MultiFileGlossaryStrategy, autoExtract: boolean) => void;
}

export const MultiFileGlossaryModal: React.FC<MultiFileGlossaryModalProps> = ({
  isOpen,
  onClose,
  fileCount,
  currentStrategy,
  onSelectStrategy,
}) => {
  const [selectedStrategy, setSelectedStrategy] = React.useState<MultiFileGlossaryStrategy>(
    currentStrategy === 'ask' ? 'shared' : currentStrategy
  );
  const [autoExtract, setAutoExtract] = React.useState<boolean>(true);
  const [rememberChoice, setRememberChoice] = React.useState<boolean>(true);

  if (!isOpen) return null;

  const handleConfirm = () => {
    onSelectStrategy(rememberChoice ? selectedStrategy : selectedStrategy, autoExtract);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/75 backdrop-blur-md" onClick={onClose} />
      <div className="relative w-full max-w-xl dark:bg-[#0a0e27] bg-white border dark:border-cyan-500/30 border-cyan-500/40 rounded-3xl shadow-2xl overflow-hidden p-6 sm:p-7 space-y-6 animate-in fade-in zoom-in-95 duration-200">
        
        {/* Header */}
        <div className="flex items-start justify-between gap-4 border-b dark:border-white/10 border-slate-200 pb-4">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-2xl bg-gradient-to-tr from-secondary/20 via-cyan-500/20 to-secondary/10 border border-cyan-500/30 text-cyan-400">
              <Layers className="w-6 h-6 text-cyan-400" />
            </div>
            <div>
              <h3 className="text-base sm:text-lg font-black text-text flex items-center gap-2">
                <span>استراتژی واژه‌نامه برای چندین فایل</span>
                <span className="text-xs px-2.5 py-0.5 rounded-full font-mono bg-cyan-500/20 text-cyan-400 border border-cyan-500/30">
                  {fileCount} فایل در صف
                </span>
              </h3>
              <p className="text-xs text-text-muted mt-1 leading-relaxed">
                چندین فایل زیرنویس در صف پردازش قرار دارند. نحوه مدیریت و یکدست‌سازی واژه‌نامه را مشخص کنید:
              </p>
            </div>
          </div>
          <button 
            onClick={onClose} 
            className="p-1.5 rounded-full hover:bg-white/10 text-text-muted hover:text-text transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Options */}
        <div className="grid grid-cols-1 gap-3.5">
          {/* Option 1: Shared Glossary */}
          <div
            onClick={() => setSelectedStrategy('shared')}
            className={`cursor-pointer p-4 rounded-2xl border-2 transition-all flex items-start gap-3.5 ${
              selectedStrategy === 'shared'
                ? 'border-cyan-400 dark:bg-cyan-950/30 bg-cyan-50/80 shadow-[0_0_20px_rgba(0,240,255,0.15)]'
                : 'dark:border-white/10 border-slate-200 dark:bg-white/[0.02] bg-slate-50/60 hover:border-cyan-400/50'
            }`}
          >
            <div className={`mt-0.5 w-5 h-5 rounded-full border-2 flex items-center justify-center shrink-0 ${
              selectedStrategy === 'shared' ? 'border-cyan-400 bg-cyan-400 text-black' : 'border-slate-400 dark:border-white/30'
            }`}>
              {selectedStrategy === 'shared' && <Check className="w-3 h-3 stroke-[3]" />}
            </div>
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <span className="text-sm font-bold text-text">واژه‌نامه مشترک برای تمام فایل‌ها (پیشنهادی)</span>
                <span className="text-[10px] px-1.5 py-0.5 rounded bg-secondary/15 text-secondary border border-secondary/30 font-bold">
                  یکپارچه‌سازی کامل
                </span>
              </div>
              <p className="text-xs text-text-muted leading-relaxed">
                واژگان تخصصی کشف‌شده از تمام قسمت‌ها در یک واژه‌نامه واحد و مشترک تجمیع می‌شوند تا تضمین شود هر اصطلاح در تمام فایل‌ها دقیقاً با ترجمه‌ای یکدست ترجمه می‌شود.
              </p>
            </div>
          </div>

          {/* Option 2: Separate Glossary */}
          <div
            onClick={() => setSelectedStrategy('separate')}
            className={`cursor-pointer p-4 rounded-2xl border-2 transition-all flex items-start gap-3.5 ${
              selectedStrategy === 'separate'
                ? 'border-secondary dark:bg-secondary/10 bg-fuchsia-50/80 shadow-[0_0_20px_rgba(255,0,234,0.15)]'
                : 'dark:border-white/10 border-slate-200 dark:bg-white/[0.02] bg-slate-50/60 hover:border-secondary/50'
            }`}
          >
            <div className={`mt-0.5 w-5 h-5 rounded-full border-2 flex items-center justify-center shrink-0 ${
              selectedStrategy === 'separate' ? 'border-secondary bg-secondary text-white' : 'border-slate-400 dark:border-white/30'
            }`}>
              {selectedStrategy === 'separate' && <Check className="w-3 h-3 stroke-[3]" />}
            </div>
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <span className="text-sm font-bold text-text">واژه‌نامه جداگانه برای هر فایل</span>
                <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-500/15 text-text-muted border dark:border-white/10 border-slate-300 font-bold">
                  ایزوله
                </span>
              </div>
              <p className="text-xs text-text-muted leading-relaxed">
                هر فایل دارای واژه‌نامه تخصصی مختص به خود خواهد بود و واژگان فایل‌های مختلف با یکدیگر ادغام نخواهند شد (مناسب برای فایل‌های بی‌ارتباط با موضوعات کاملاً متفاوت).
              </p>
            </div>
          </div>
        </div>

        {/* Auto-Extract Workflow Toggle */}
        <div className="p-3.5 rounded-2xl border dark:border-white/10 border-slate-200 dark:bg-white/[0.02] bg-slate-50 space-y-2">
          <label className="flex items-start gap-3 cursor-pointer">
            <input
              type="checkbox"
              checked={autoExtract}
              onChange={(e) => setAutoExtract(e.target.checked)}
              className="mt-1 rounded accent-cyan-400 w-4 h-4 cursor-pointer"
            />
            <div className="space-y-0.5">
              <span className="text-xs font-bold text-text flex items-center gap-1.5">
                <Sparkles className="w-3.5 h-3.5 text-cyan-400" />
                <span>استخراج و ترجمه اتوماتیک واژگان قبل از شروع ترجمه هر فایل</span>
              </span>
              <p className="text-[11px] text-text-muted leading-relaxed">
                وقتی نوبت هر فایل در صف ترجمه رسید، سیستم ابتدا اصطلاحات آن فایل را با هوش مصنوعی استخراج و ترجمه کرده، ذخیره می‌کند و سپس پروسه ترجمه زیرنویس را آغاز می‌نماید.
              </p>
            </div>
          </label>
        </div>

        {/* Remember choice */}
        <div className="flex items-center justify-between text-xs text-text-muted px-1">
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={rememberChoice}
              onChange={(e) => setRememberChoice(e.target.checked)}
              className="rounded accent-secondary w-3.5 h-3.5 cursor-pointer"
            />
            <span>این انتخاب به عنوان پیش‌فرض در تنظیمات ذخیره شود</span>
          </label>
        </div>

        {/* Action Buttons */}
        <div className="flex items-center gap-3 pt-2">
          <button
            type="button"
            onClick={handleConfirm}
            className="flex-1 py-3 px-4 rounded-xl bg-gradient-to-r from-secondary via-purple-600 to-cyan-500 hover:opacity-95 text-white font-bold text-xs sm:text-sm transition-all shadow-lg shadow-cyan-500/20 flex items-center justify-center gap-2"
          >
            <Check className="w-4 h-4" />
            <span>تأیید و اعمال تنظیمات واژه‌نامه</span>
          </button>
          <button
            type="button"
            onClick={onClose}
            className="py-3 px-4 rounded-xl border dark:border-white/10 border-slate-300 text-xs font-semibold text-text-muted hover:text-text hover:bg-white/5 transition-all"
          >
            انصراف
          </button>
        </div>

      </div>
    </div>
  );
};
