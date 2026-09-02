
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
            <h2 className="text-xl font-bold text-white flex items-center gap-2">
              <Clock className="w-6 h-6 text-[#00f0ff]" />
              ابزارهای زمان‌بندی
            </h2>
            <button onClick={onClose} className="p-2 hover:bg-white/10 rounded-full transition-colors">
              <X className="w-5 h-5 text-white/60" />
            </button>
          </div>

          {/* Tabs */}
          <div className="flex p-1 bg-[#0a0e27] rounded-xl border border-white/10 mb-6">
             <button 
                onClick={() => setActiveTab('adjust')}
                className={`flex-1 py-2 text-sm font-bold rounded-lg transition-all ${activeTab === 'adjust' ? 'bg-white/10 text-white shadow' : 'text-white/40 hover:text-white'}`}
             >
                تنظیم زمان (Adjust)
             </button>
             <button 
                onClick={() => setActiveTab('netflix')}
                className={`flex-1 py-2 text-sm font-bold rounded-lg transition-all ${activeTab === 'netflix' ? 'bg-[#E50914]/20 text-[#E50914] shadow' : 'text-white/40 hover:text-white'}`}
             >
                استاندارد Netflix
             </button>
          </div>

          {activeTab === 'adjust' && (
            <div className="space-y-6">
               {/* Mode Select */}
               <div className="grid grid-cols-2 gap-3">
                  <button onClick={() => setMode('seconds')} className={`p-3 rounded-xl border text-sm flex flex-col items-center gap-2 ${mode === 'seconds' ? 'bg-[#00f0ff]/10 border-[#00f0ff] text-[#00f0ff]' : 'bg-white/5 border-white/10 text-white/60'}`}>
                      <MoveRight className="w-5 h-5" /> Seconds
                  </button>
                  <button onClick={() => setMode('percent')} className={`p-3 rounded-xl border text-sm flex flex-col items-center gap-2 ${mode === 'percent' ? 'bg-[#00f0ff]/10 border-[#00f0ff] text-[#00f0ff]' : 'bg-white/5 border-white/10 text-white/60'}`}>
                      <Percent className="w-5 h-5" /> Percent
                  </button>
                  <button onClick={() => setMode('recalculate')} className={`p-3 rounded-xl border text-sm flex flex-col items-center gap-2 ${mode === 'recalculate' ? 'bg-[#00f0ff]/10 border-[#00f0ff] text-[#00f0ff]' : 'bg-white/5 border-white/10 text-white/60'}`}>
                      <Calculator className="w-5 h-5" /> Recalculate
                  </button>
                  <button onClick={() => setMode('fixed')} className={`p-3 rounded-xl border text-sm flex flex-col items-center gap-2 ${mode === 'fixed' ? 'bg-[#00f0ff]/10 border-[#00f0ff] text-[#00f0ff]' : 'bg-white/5 border-white/10 text-white/60'}`}>
                      <Sliders className="w-5 h-5" /> Fixed
                  </button>
               </div>

               <div className="bg-[#0a0e27]/50 p-4 rounded-xl border border-white/10">
                  
                  {/* Seconds Controls */}
                  {mode === 'seconds' && (
                      <div className="space-y-4">
                          <label className="text-xs text-white/50 block">نوع تغییر</label>
                          <select 
                             value={targetSide} 
                             onChange={(e) => setTargetSide(e.target.value as any)}
                             className="w-full bg-[#0a0e27] border border-white/10 rounded-lg p-2 text-white text-sm focus:border-[#00f0ff] outline-none"
                          >
                              <option value="shift">Shift All (جابجایی کلی)</option>
                              <option value="end">Extend End (افزایش پایان)</option>
                              <option value="start">Extend Start (افزایش شروع)</option>
                              <option value="both">Extend Both (از دو طرف)</option>
                          </select>

                          <label className="text-xs text-white/50 block">مقدار (ثانیه) - منفی برای کاهش</label>
                          <input 
                              type="number" 
                              step="0.1"
                              value={secondsVal}
                              onChange={(e) => setSecondsVal(parseFloat(e.target.value))}
                              className="w-full bg-[#0a0e27] border border-white/10 rounded-lg p-2 text-white text-sm focus:border-[#00f0ff] outline-none dir-ltr"
                          />
                      </div>
                  )}

                  {/* Percent Controls */}
                  {mode === 'percent' && (
                      <div className="space-y-4">
                          <label className="text-xs text-white/50 block">درصد تغییر (100 = بدون تغییر)</label>
                          <div className="flex items-center gap-2">
                            <input 
                                type="number" 
                                value={percentVal}
                                onChange={(e) => setPercentVal(parseFloat(e.target.value))}
                                className="flex-1 bg-[#0a0e27] border border-white/10 rounded-lg p-2 text-white text-sm focus:border-[#00f0ff] outline-none dir-ltr"
                            />
                            <span className="text-white">%</span>
                          </div>
                          <p className="text-[10px] text-white/40">مثال: 120 درصد طول نمایش را 20% افزایش می‌دهد.</p>
                      </div>
                  )}

                  {/* Recalculate Controls */}
                  {mode === 'recalculate' && (
                      <div className="space-y-4">
                          <label className="text-xs text-white/50 block">سرعت خواندن (کاراکتر در ثانیه)</label>
                          <input 
                              type="number" 
                              value={recalcCps}
                              onChange={(e) => setRecalcCps(parseFloat(e.target.value))}
                              className="w-full bg-[#0a0e27] border border-white/10 rounded-lg p-2 text-white text-sm focus:border-[#00f0ff] outline-none dir-ltr"
                          />
                          <p className="text-[10px] text-white/40">استاندارد نتفلیکس: حداکثر 20 کاراکتر بر ثانیه.</p>
                      </div>
                  )}

                  {/* Fixed Controls */}
                  {mode === 'fixed' && (
                      <div className="space-y-4">
                          <label className="text-xs text-white/50 block">مدت زمان ثابت (ثانیه)</label>
                          <input 
                              type="number" 
                              step="0.1"
                              value={fixedVal}
                              onChange={(e) => setFixedVal(parseFloat(e.target.value))}
                              className="w-full bg-[#0a0e27] border border-white/10 rounded-lg p-2 text-white text-sm focus:border-[#00f0ff] outline-none dir-ltr"
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
