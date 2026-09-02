

import React, { useState, useEffect } from 'react';
import { Download, X, Palette, Type, LayoutTemplate, Layout, CheckCircle, Save, RefreshCw, FileText } from 'lucide-react';
import { StyleConfig, StyleTemplate } from '../types';
import { STYLE_TEMPLATES } from '../constants';

interface ExportModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (format: 'srt' | 'vtt' | 'ass', styles?: StyleConfig) => void;
  defaultFormat: 'srt' | 'vtt' | 'ass';
}

const FONT_OPTIONS = [
  { label: 'Default (Sans-Serif)', value: 'sans-serif' },
  // Persian Fonts
  { label: 'Vazirmatn (وزیرمتن)', value: 'Vazirmatn' },
  { label: 'Estedad (استعداد)', value: 'Estedad' },
  { label: 'Sahel (ساحل)', value: 'Sahel' },
  { label: 'Arad (آراد)', value: 'Arad' },
  { label: 'Lalezar (لاله‌زار)', value: 'Lalezar' },
  // English / Latin Fonts
  { label: 'Montserrat', value: 'Montserrat' },
  { label: 'Poppins', value: 'Poppins' },
  { label: 'Roboto', value: 'Roboto' },
  { label: 'Arial', value: 'Arial' },
  { label: 'Tahoma', value: 'Tahoma' },
];

const STYLE_STORAGE_KEY = 'submaster_pro_user_style_v1';

export const ExportModal: React.FC<ExportModalProps> = ({ isOpen, onClose, onConfirm, defaultFormat }) => {
  const [format, setFormat] = useState<'srt' | 'vtt' | 'ass'>(defaultFormat);
  const [useStyles, setUseStyles] = useState(false);
  const [activeTemplate, setActiveTemplate] = useState<string>('custom');
  const [isSavedFeedback, setIsSavedFeedback] = useState(false);
  
  const [styles, setStyles] = useState<StyleConfig>({
    useStyles: false,
    fontFamily: 'Vazirmatn',
    fontSize: 20,
    primaryColor: '#ffffff',
    secondaryColor: '#000000',
    backgroundColor: '#000000',
    backgroundOpacity: 100, 
    isBold: false,
    borderStyle: 'outline',
    outlineWidth: 2,
    shadowDepth: 0,
    alignment: 2
  });

  useEffect(() => {
    setFormat(defaultFormat);
  }, [defaultFormat, isOpen]);

  // Load User Defaults on Mount
  useEffect(() => {
      if (isOpen) {
          const savedStyles = localStorage.getItem(STYLE_STORAGE_KEY);
          if (savedStyles) {
              try {
                  const parsed = JSON.parse(savedStyles);
                  setStyles(prev => ({ 
                      ...prev, 
                      ...parsed,
                      // Ensure backward compatibility if backgroundOpacity doesn't exist in saved data
                      backgroundOpacity: parsed.backgroundOpacity ?? 100
                  }));
                  if (parsed.useStyles) {
                      setUseStyles(true);
                  }
              } catch (e) {
                  console.error("Failed to load saved styles", e);
              }
          }
      }
  }, [isOpen]);

  // When format changes to SRT, disable styles. When others, allow.
  useEffect(() => {
    if (format === 'srt') {
        setUseStyles(false);
    } else {
        // Auto-enable for ASS usually
        if (format === 'ass') setUseStyles(true);
    }
  }, [format]);

  const applyTemplate = (templateKey: string) => {
      setActiveTemplate(templateKey);
      if (templateKey === 'custom') return;

      const tmpl = STYLE_TEMPLATES[templateKey];
      if (tmpl) {
          setStyles({ ...tmpl.config, useStyles: true });
          setUseStyles(true);
      }
  };

  const handleSaveAsDefault = () => {
      const configToSave = { ...styles, useStyles };
      localStorage.setItem(STYLE_STORAGE_KEY, JSON.stringify(configToSave));
      
      // Visual feedback
      setIsSavedFeedback(true);
      setTimeout(() => setIsSavedFeedback(false), 2000);
  };

  if (!isOpen) return null;

  const handleConfirm = () => {
    onConfirm(format, { ...styles, useStyles });
  };

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-md" onClick={onClose}></div>
      
      <div className="relative w-full max-w-4xl glass rounded-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-200 flex flex-col max-h-[90vh]">
        
        {/* Header */}
        <div className="p-6 border-b border-border flex justify-between items-center bg-background/90">
          <h2 className="text-xl font-bold text-text flex items-center gap-2">
            <Download className="w-6 h-6 text-secondary" />
            تنظیمات خروجی و استایل
          </h2>
          <button onClick={onClose} className="p-2 hover:bg-surface rounded-full transition-colors">
            <X className="w-5 h-5 text-text-muted" />
          </button>
        </div>

        <div className="flex-1 flex flex-col md:flex-row overflow-hidden">
            
            {/* Sidebar Controls */}
            <div className="w-full md:w-1/3 border-l border-border bg-surface/30 p-4 overflow-y-auto custom-scrollbar flex flex-col">
                
                {/* Format Selection */}
                <div className="mb-6 space-y-3">
                    <label className="text-xs text-text-muted font-bold block uppercase">فرمت فایل</label>
                    <div className="grid grid-cols-1 gap-2">
                        <button 
                            onClick={() => setFormat('srt')}
                            className={`px-3 py-2 text-sm font-bold rounded-lg transition-all text-right border ${format === 'srt' ? 'bg-primary/20 border-primary text-primary' : 'border-border text-text-muted hover:text-text'}`}
                        >
                            SRT (استاندارد)
                        </button>
                        <button 
                            onClick={() => setFormat('vtt')}
                            className={`px-3 py-2 text-sm font-bold rounded-lg transition-all text-right border ${format === 'vtt' ? 'bg-primary/20 border-primary text-primary' : 'border-border text-text-muted hover:text-text'}`}
                        >
                            VTT (وب)
                        </button>
                        <button 
                            onClick={() => setFormat('ass')}
                            className={`px-3 py-2 text-sm font-bold rounded-lg transition-all text-right border ${format === 'ass' ? 'bg-secondary/20 border-secondary text-secondary' : 'border-border text-text-muted hover:text-text'}`}
                        >
                            SSA/ASS (پیشرفته)
                        </button>
                    </div>
                </div>

                {/* Templates (Only for VTT/ASS) */}
                {format !== 'srt' && (
                    <div className="mb-6 space-y-3">
                         <label className="text-xs text-text-muted font-bold block uppercase">قالب‌های آماده</label>
                         <div className="grid grid-cols-2 gap-2">
                             {Object.entries(STYLE_TEMPLATES).map(([key, tmpl]) => (
                                 <button
                                    key={key}
                                    onClick={() => applyTemplate(key)}
                                    className={`px-2 py-2 text-xs font-medium rounded-lg transition-all border ${activeTemplate === key ? 'bg-white/10 border-white text-white' : 'border-border text-text-muted hover:text-text'}`}
                                 >
                                     {tmpl.name}
                                 </button>
                             ))}
                             <button
                                onClick={() => setActiveTemplate('custom')}
                                className={`px-2 py-2 text-xs font-medium rounded-lg transition-all border ${activeTemplate === 'custom' ? 'bg-white/10 border-white text-white' : 'border-border text-text-muted hover:text-text'}`}
                             >
                                 شخصی‌سازی
                             </button>
                         </div>
                    </div>
                )}
                
                <div className="flex-1"></div>

                {/* Save Default Button */}
                {format !== 'srt' && useStyles && (
                    <button
                        onClick={handleSaveAsDefault}
                        className={`
                            mt-4 w-full py-2.5 px-3 rounded-xl border font-bold text-xs flex items-center justify-center gap-2 transition-all
                            ${isSavedFeedback 
                                ? 'bg-green-500/20 border-green-500 text-green-400' 
                                : 'bg-surface border-border text-text-muted hover:text-text hover:border-text-muted'
                            }
                        `}
                    >
                        {isSavedFeedback ? <CheckCircle className="w-4 h-4" /> : <Save className="w-4 h-4" />}
                        {isSavedFeedback ? 'ذخیره شد' : 'ذخیره تنظیمات فعلی به عنوان پیش‌فرض'}
                    </button>
                )}
            </div>

            {/* Main Content Area */}
            <div className="flex-1 p-6 overflow-y-auto custom-scrollbar bg-background">
                
                {format === 'srt' ? (
                    <div className="h-full flex flex-col items-center justify-center text-center text-text-muted space-y-4">
                        <div className="p-4 rounded-full bg-surface border border-border">
                             <FileText className="w-8 h-8 opacity-50" />
                        </div>
                        <p className="max-w-xs">فرمت SRT ساده‌ترین فرمت زیرنویس است و از تنظیمات رنگ و فونت پشتیبانی نمی‌کند.</p>
                        <button onClick={() => setFormat('ass')} className="text-primary text-sm hover:underline">
                            تغییر به فرمت حرفه‌ای (ASS)
                        </button>
                    </div>
                ) : (
                    <div className="space-y-6">
                        
                        {/* Improved Toggle Switch Row */}
                        <div className="flex items-center justify-between bg-surface/50 p-4 rounded-xl border border-border">
                            <div className="flex flex-col gap-1">
                                <h3 className="text-base font-bold text-text">تنظیمات ظاهری</h3>
                                <span className="text-xs text-text-muted">شخصی‌سازی رنگ و فونت زیرنویس</span>
                            </div>
                            
                            {/* Toggle Button with enforced LTR for predictable mechanics */}
                            <button 
                                onClick={() => setUseStyles(!useStyles)}
                                dir="ltr" 
                                className={`relative w-14 h-8 rounded-full transition-colors duration-300 ease-in-out focus:outline-none flex items-center p-1 ${useStyles ? 'bg-secondary' : 'bg-gray-700'}`}
                            >
                                <span 
                                    className={`block w-6 h-6 bg-white rounded-full shadow-md transform transition-transform duration-300 ease-in-out ${useStyles ? 'translate-x-6' : 'translate-x-0'}`} 
                                />
                            </button>
                        </div>

                        {useStyles && (
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 animate-in fade-in slide-in-from-bottom-2">
                                {/* Font & Size */}
                                <div className="space-y-4">
                                     <div className="space-y-2">
                                        <label className="text-xs text-primary font-bold">فونت</label>
                                        <select 
                                            value={styles.fontFamily}
                                            onChange={(e) => { setStyles({...styles, fontFamily: e.target.value}); setActiveTemplate('custom'); }}
                                            className="w-full bg-[#0a0e27] border border-border rounded-lg p-2 text-white text-sm focus:border-secondary outline-none appearance-none"
                                        >
                                            {FONT_OPTIONS.map(opt => (
                                                <option key={opt.value} value={opt.value} className="bg-[#0a0e27] text-white py-2">
                                                    {opt.label}
                                                </option>
                                            ))}
                                        </select>
                                     </div>
                                     <div className="space-y-2">
                                        <label className="text-xs text-primary font-bold">سایز (Pt)</label>
                                        <input 
                                            type="number" 
                                            value={styles.fontSize}
                                            onChange={(e) => { setStyles({...styles, fontSize: parseInt(e.target.value)}); setActiveTemplate('custom'); }}
                                            className="w-full bg-surface border border-border rounded-lg p-2 text-text text-sm focus:border-secondary outline-none"
                                        />
                                     </div>
                                     <div className="flex items-center gap-4 pt-2">
                                         <label className="flex items-center gap-2 cursor-pointer">
                                             <input 
                                                type="checkbox" 
                                                checked={styles.isBold}
                                                onChange={(e) => { setStyles({...styles, isBold: e.target.checked}); setActiveTemplate('custom'); }}
                                                className="accent-secondary"
                                             />
                                             <span className="text-sm text-text">Bold</span>
                                         </label>
                                     </div>
                                </div>

                                {/* Colors */}
                                <div className="space-y-4">
                                     <div className="flex items-center justify-between">
                                        <label className="text-xs text-primary font-bold">رنگ اصلی</label>
                                        <input 
                                            type="color" 
                                            value={styles.primaryColor}
                                            onChange={(e) => { setStyles({...styles, primaryColor: e.target.value}); setActiveTemplate('custom'); }}
                                            className="w-8 h-8 rounded bg-transparent cursor-pointer"
                                        />
                                     </div>
                                     <div className="flex items-center justify-between">
                                        <label className="text-xs text-primary font-bold">رنگ حاشیه/سایه</label>
                                        <input 
                                            type="color" 
                                            value={styles.secondaryColor}
                                            onChange={(e) => { setStyles({...styles, secondaryColor: e.target.value}); setActiveTemplate('custom'); }}
                                            className="w-8 h-8 rounded bg-transparent cursor-pointer"
                                        />
                                     </div>
                                     
                                     {/* Background Color & Opacity */}
                                     <div className="space-y-2">
                                         <div className="flex items-center justify-between">
                                            <label className="text-xs text-primary font-bold">رنگ پس‌زمینه (Box)</label>
                                            <input 
                                                type="color" 
                                                value={styles.backgroundColor}
                                                onChange={(e) => { setStyles({...styles, backgroundColor: e.target.value}); setActiveTemplate('custom'); }}
                                                className="w-8 h-8 rounded bg-transparent cursor-pointer"
                                            />
                                         </div>
                                         <div className="pt-1">
                                             <div className="flex justify-between text-[10px] text-text-muted mb-1">
                                                 <span>شفافیت (Opacity):</span>
                                                 <span>{styles.backgroundOpacity ?? 100}%</span>
                                             </div>
                                             <input 
                                                 type="range"
                                                 min="0"
                                                 max="100"
                                                 value={styles.backgroundOpacity ?? 100}
                                                 onChange={(e) => { setStyles({...styles, backgroundOpacity: parseInt(e.target.value)}); setActiveTemplate('custom'); }}
                                                 className="w-full h-1.5 bg-surface rounded-lg appearance-none cursor-pointer accent-secondary"
                                             />
                                         </div>
                                     </div>
                                </div>

                                {/* Border & Style */}
                                <div className="space-y-4 md:col-span-2">
                                     <div className="space-y-2">
                                        <label className="text-xs text-primary font-bold">استایل حاشیه</label>
                                        <div className="flex bg-surface p-1 rounded-lg border border-border">
                                            <button onClick={() => { setStyles({...styles, borderStyle: 'outline'}); setActiveTemplate('custom'); }} className={`flex-1 py-1 text-xs rounded ${styles.borderStyle === 'outline' ? 'bg-primary text-background font-bold' : 'text-text-muted'}`}>Outline</button>
                                            <button onClick={() => { setStyles({...styles, borderStyle: 'box'}); setActiveTemplate('custom'); }} className={`flex-1 py-1 text-xs rounded ${styles.borderStyle === 'box' ? 'bg-primary text-background font-bold' : 'text-text-muted'}`}>Box</button>
                                            <button onClick={() => { setStyles({...styles, borderStyle: 'none'}); setActiveTemplate('custom'); }} className={`flex-1 py-1 text-xs rounded ${styles.borderStyle === 'none' ? 'bg-primary text-background font-bold' : 'text-text-muted'}`}>None</button>
                                        </div>
                                     </div>
                                </div>
                            </div>
                        )}
                        
                        {/* Preview Box */}
                        <div className="mt-4 bg-gray-800 rounded-xl overflow-hidden border border-border relative h-40 flex items-end justify-center pb-6 bg-[url('https://images.unsplash.com/photo-1536440136628-849c177e76a1?q=80&w=1000&auto=format&fit=crop')] bg-cover bg-center">
                            <div className="absolute inset-0 bg-black/10"></div>
                            {useStyles ? (
                                <div 
                                    style={{
                                        fontFamily: styles.fontFamily.split(',')[0],
                                        fontSize: `${Math.max(14, styles.fontSize)}px`, // Min size for preview readability
                                        color: styles.primaryColor,
                                        fontWeight: styles.isBold ? 'bold' : 'normal',
                                        textShadow: styles.borderStyle === 'outline' ? 
                                            `-1px -1px 0 ${styles.secondaryColor}, 1px -1px 0 ${styles.secondaryColor}, -1px 1px 0 ${styles.secondaryColor}, 1px 1px 0 ${styles.secondaryColor}` : 'none',
                                        // Preview implementation of box + opacity
                                        backgroundColor: styles.borderStyle === 'box' 
                                            ? `${styles.backgroundColor}${Math.round((styles.backgroundOpacity ?? 100) * 2.55).toString(16).padStart(2,'0')}` 
                                            : 'transparent',
                                        padding: '4px 8px',
                                        borderRadius: '4px',
                                        textAlign: 'center'
                                    }}
                                    className="relative z-10"
                                >
                                    پیش‌نمایش زیرنویس
                                    <br />
                                    Subtitle Preview
                                </div>
                            ) : (
                                <div className="text-white text-lg drop-shadow-md relative z-10">
                                    پیش‌نمایش زیرنویس (Default)
                                </div>
                            )}
                        </div>
                    </div>
                )}
            </div>
        </div>

        <div className="p-4 border-t border-border bg-background flex justify-between items-center">
           <span className="text-xs text-text-muted">
               {format === 'ass' ? 'پیشنهاد: بهترین کیفیت با ASS' : format === 'vtt' ? 'مناسب برای وب' : 'ساده و استاندارد'}
           </span>
           <button 
              onClick={handleConfirm}
              className="bg-gradient-to-r from-primary to-secondary text-white font-bold py-2.5 px-8 rounded-xl shadow-lg hover:shadow-xl hover:scale-105 transition-all flex items-center gap-2"
           >
              <Download className="w-5 h-5" />
              دانلود
           </button>
        </div>

      </div>
    </div>
  );
};
