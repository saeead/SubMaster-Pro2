
import React, { useState } from 'react';
import { X, Clock, Calculator, Percent, MoveRight, Sliders, CheckCircle2, ShieldAlert, Layers, FileText } from 'lucide-react';
import { AdjustmentConfig, AdjustmentMode } from '../types';

interface TimingModalProps {
  isOpen: boolean;
  onClose: () => void;
  onApply: (config: AdjustmentConfig, scope: 'current' | 'all') => void;
  onNetflixCheck: () => void;
  hasMultipleFiles: boolean;
}

export const TimingModal: React.FC<TimingModalProps> = ({ isOpen, onClose, onApply, onNetflixCheck, hasMultipleFiles }) => {
  const [activeTab, setActiveTab] = useState<'adjust' | 'netflix'>('adjust');
  const [mode, setMode] = useState<AdjustmentMode>('seconds');
  
  // State for inputs
  const [secondsVal, setSecondsVal] = useState<number>(0);
  const [targetSide, setTargetSide] = useState<AdjustmentConfig['target']>('shift');
  
  const [percentVal, setPercentVal] = useState<number>(100);
  const [fixedVal, setFixedVal] = useState<number>(3);
  const [recalcCps, setRecalcCps] = useState<number>(20);

  if (!isOpen) return null;

  const handleApply = (scope: 'current' | 'all') => {
    let val = 0;
    if (mode === 'seconds') val = secondsVal;
    else if (mode === 'percent') val = percentVal;
    else if (mode === 'fixed') val = fixedVal;
    else if (mode === 'recalculate') val = recalcCps;

    onApply({
      mode,
      value: val,
      target: mode === 'seconds' ? targetSide : 'end' // Default others to extend end
    }, scope);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose}></div>
      
      <div className="relative w-full max-w-md glass rounded-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-200">
        <div className="p-6">
          <div className="flex justify-between items-center mb-6">
            <h2 className="text-xl font-bold text-text flex items-center gap-2">
              <Clock className="w-6 h-6 text-primary" />
              ابزارهای زمان‌بندی
            </h2>
            <button onClick={onClose} className="p-2 hover:bg-surfaceHighlight rounded-full transition-colors">
              <X className="w-5 h-5 text-text-muted" />
            </button>
          </div>

          {/* Tabs */}
          <div className="flex p-1 dark:bg-[#0a0e27] bg-slate-100 rounded-xl border dark:border-white/10 border-slate-200 mb-6">
             <button 
                onClick={() => setActiveTab('adjust')}
                className={`flex-1 py-2 text-sm font-bold rounded-lg transition-all ${activeTab === 'adjust' ? 'dark:bg-white/10 bg-white text-text shadow-sm' : 'text-text-muted hover:text-text'}`}
             >
                تنظیم زمان (Adjust)
             </button>
             <button 
                onClick={() => setActiveTab('netflix')}
                className={`flex-1 py-2 text-sm font-bold rounded-lg transition-all ${activeTab === 'netflix' ? 'bg-[#E50914]/20 text-[#E50914] shadow-sm' : 'text-text-muted hover:text-text'}`}
             >
                استاندارد Netflix
             </button>
          </div>

          {activeTab === 'adjust' && (
            <div className="space-y-6">
               {/* Mode Select */}
               <div className="grid grid-cols-2 gap-3">
                  <button onClick={() => setMode('seconds')} className={`p-3 rounded-xl border text-sm flex flex-col items-center gap-2 transition-all ${mode === 'seconds' ? 'bg-primary/15 border-primary text-primary font-bold shadow-xs' : 'dark:bg-white/5 bg-slate-50 dark:border-white/10 border-slate-200 text-text-muted hover:text-text'}`}>
                      <MoveRight className="w-5 h-5" /> Seconds
                  </button>
                  <button onClick={() => setMode('percent')} className={`p-3 rounded-xl border text-sm flex flex-col items-center gap-2 transition-all ${mode === 'percent' ? 'bg-primary/15 border-primary text-primary font-bold shadow-xs' : 'dark:bg-white/5 bg-slate-50 dark:border-white/10 border-slate-200 text-text-muted hover:text-text'}`}>
                      <Percent className="w-5 h-5" /> Percent
                  </button>
                  <button onClick={() => setMode('recalculate')} className={`p-3 rounded-xl border text-sm flex flex-col items-center gap-2 transition-all ${mode === 'recalculate' ? 'bg-primary/15 border-primary text-primary font-bold shadow-xs' : 'dark:bg-white/5 bg-slate-50 dark:border-white/10 border-slate-200 text-text-muted hover:text-text'}`}>
                      <Calculator className="w-5 h-5" /> Recalculate
                  </button>
                  <button onClick={() => setMode('fixed')} className={`p-3 rounded-xl border text-sm flex flex-col items-center gap-2 transition-all ${mode === 'fixed' ? 'bg-primary/15 border-primary text-primary font-bold shadow-xs' : 'dark:bg-white/5 bg-slate-50 dark:border-white/10 border-slate-200 text-text-muted hover:text-text'}`}>
                      <Sliders className="w-5 h-5" /> Fixed
                  </button>
               </div>

               <div className="dark:bg-[#0a0e27]/50 bg-slate-50 p-4 rounded-xl border dark:border-white/10 border-slate-200 shadow-xs">
                  
                  {/* Seconds Controls */}
                  {mode === 'seconds' && (
                      <div className="space-y-4">
                          <label className="text-xs text-text-muted block">نوع تغییر</label>
                          <select 
                              value={targetSide} 
                              onChange={(e) => setTargetSide(e.target.value as any)}
                              className="w-full dark:bg-[#0a0e27] bg-white border dark:border-white/10 border-slate-200 rounded-lg p-2 dark:text-white text-slate-900 text-sm focus:border-primary outline-none shadow-xs"
                          >
                              <option value="shift" className="dark:bg-[#0a0e27] bg-white dark:text-white text-slate-900">Shift All (جابجایی کلی)</option>
                              <option value="end" className="dark:bg-[#0a0e27] bg-white dark:text-white text-slate-900">Extend End (افزایش پایان)</option>
                              <option value="start" className="dark:bg-[#0a0e27] bg-white dark:text-white text-slate-900">Extend Start (افزایش شروع)</option>
                              <option value="both" className="dark:bg-[#0a0e27] bg-white dark:text-white text-slate-900">Extend Both (از دو طرف)</option>
                          </select>

                          <label className="text-xs text-text-muted block">مقدار (ثانیه) - منفی برای کاهش</label>
                          <input 
                              type="number" 
                              step="0.1"
                              value={secondsVal}
                              onChange={(e) => setSecondsVal(parseFloat(e.target.value))}
                              className="w-full dark:bg-[#0a0e27] bg-white border dark:border-white/10 border-slate-200 rounded-lg p-2 dark:text-white text-slate-900 text-sm focus:border-primary outline-none dir-ltr shadow-xs"
                          />
                      </div>
                  )}

                  {/* Percent Controls */}
                  {mode === 'percent' && (
                      <div className="space-y-4">
                          <label className="text-xs text-text-muted block">درصد تغییر (100 = بدون تغییر)</label>
                          <div className="flex items-center gap-2">
                            <input 
                                type="number" 
                                value={percentVal}
                                onChange={(e) => setPercentVal(parseFloat(e.target.value))}
                                className="flex-1 dark:bg-[#0a0e27] bg-white border dark:border-white/10 border-slate-200 rounded-lg p-2 dark:text-white text-slate-900 text-sm focus:border-primary outline-none dir-ltr shadow-xs"
                            />
                            <span className="text-text font-bold">%</span>
                          </div>
                          <p className="text-[10px] text-text-muted">مثال: 120 درصد طول نمایش را 20% افزایش می‌دهد.</p>
                      </div>
                  )}

                  {/* Recalculate Controls */}
                  {mode === 'recalculate' && (
                      <div className="space-y-4">
                          <label className="text-xs text-text-muted block">سرعت خواندن (کاراکتر در ثانیه)</label>
                          <input 
                              type="number" 
                              value={recalcCps}
                              onChange={(e) => setRecalcCps(parseFloat(e.target.value))}
                              className="w-full dark:bg-[#0a0e27] bg-white border dark:border-white/10 border-slate-200 rounded-lg p-2 dark:text-white text-slate-900 text-sm focus:border-primary outline-none dir-ltr shadow-xs"
                          />
                          <p className="text-[10px] text-text-muted">استاندارد نتفلیکس: حداکثر 20 کاراکتر بر ثانیه.</p>
                      </div>
                  )}

                  {/* Fixed Controls */}
                  {mode === 'fixed' && (
                      <div className="space-y-4">
                          <label className="text-xs text-text-muted block">مدت زمان ثابت (ثانیه)</label>
                          <input 
                              type="number" 
                              step="0.1"
                              value={fixedVal}
                              onChange={(e) => setFixedVal(parseFloat(e.target.value))}
                              className="w-full dark:bg-[#0a0e27] bg-white border dark:border-white/10 border-slate-200 rounded-lg p-2 dark:text-white text-slate-900 text-sm focus:border-primary outline-none dir-ltr shadow-xs"
                          />
                      </div>
                  )}
               </div>

               {/* Action Buttons */}
               <div className="flex flex-col gap-2">
                   <button 
                      onClick={() => handleApply('current')}
                      className={`w-full py-3 bg-[#00f0ff]/10 hover:bg-[#00f0ff]/20 text-[#00f0ff] border border-[#00f0ff]/20 font-bold rounded-xl transition-all flex items-center justify-center gap-2`}
                   >
                      {hasMultipleFiles ? <FileText className="w-5 h-5" /> : <CheckCircle2 className="w-5 h-5" />}
                      {hasMultipleFiles ? 'اعمال به فایل جاری' : 'اعمال تغییرات'}
                   </button>
                   
                   {hasMultipleFiles && (
                       <button 
                          onClick={() => handleApply('all')}
                          className="w-full py-3 bg-[#ff00ea]/10 hover:bg-[#ff00ea]/20 text-[#ff00ea] border border-[#ff00ea]/20 font-bold rounded-xl transition-all flex items-center justify-center gap-2"
                       >
                          <Layers className="w-5 h-5" />
                          اعمال به همه فایل‌ها
                       </button>
                   )}
               </div>
            </div>
          )}

          {activeTab === 'netflix' && (
             <div className="space-y-4 text-center">
                 <div className="p-4 bg-[#E50914]/10 rounded-xl border border-[#E50914]/20 flex flex-col items-center gap-4">
                     <ShieldAlert className="w-12 h-12 text-[#E50914]" />
                     <div className="space-y-1">
                         <h3 className="text-white font-bold">Netflix Quality Check</h3>
                         <p className="text-xs text-white/60">استانداردهای سخت‌گیرانه نتفلیکس را روی زیرنویس اعمال و خطاها را شناسایی می‌کند.</p>
                     </div>
                     <ul className="text-xs text-white/50 text-right space-y-1 list-disc list-inside w-full">
                         <li>حداکثر 42 کاراکتر در هر خط</li>
                         <li>حداکثر 20 کاراکتر در ثانیه (Reading Speed)</li>
                         <li>حداقل زمان نمایش: 0.83 ثانیه</li>
                         <li>حداکثر زمان نمایش: 7 ثانیه</li>
                         <li>رعایت فاصله حداقل 2 فریم بین زیرنویس‌ها</li>
                     </ul>
                 </div>
                 
                 <button 
                  onClick={() => { onNetflixCheck(); onClose(); }}
                  className="w-full py-3 bg-[#E50914] hover:bg-[#b20710] text-white font-bold rounded-xl shadow-lg shadow-[#E50914]/20 transition-all"
               >
                  بررسی استاندارد
               </button>
             </div>
          )}
        </div>
      </div>
    </div>
  );
};
