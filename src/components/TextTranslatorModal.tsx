
import React, { useState } from 'react';
import { X, Copy, Languages, Sparkles, ArrowLeft, Loader2, Trash2, CheckCircle, ChevronDown, ClipboardPaste } from 'lucide-react';
import { AppSettings, TargetLanguage } from '../types';
import { translateFreeText } from '../services/geminiService';
import { TONE_OPTIONS, TOPIC_OPTIONS, TARGET_LANGUAGES } from '../constants';

interface TextTranslatorModalProps {
  isOpen: boolean;
  onClose: () => void;
  settings: AppSettings;
}

export const TextTranslatorModal: React.FC<TextTranslatorModalProps> = ({ isOpen, onClose, settings }) => {
  const [inputText, setInputText] = useState('');
  const [outputText, setOutputText] = useState('');
  const [targetLang, setTargetLang] = useState<TargetLanguage>('fa');
  const [isTranslating, setIsTranslating] = useState(false);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleTranslate = async () => {
    if (!inputText.trim()) return;
    
    // Check keys for Gemini; LM Studio uses the local OpenAI-compatible server instead.
    if (settings.aiProvider === 'gemini' && (settings.apiKeys.length === 0 || !settings.apiKeys.some(k => k.isValid && !k.isRateLimited))) {
        setError("لطفا ابتدا یک کلید API معتبر در تنظیمات وارد کنید.");
        return;
    }

    setIsTranslating(true);
    setError(null);
    setOutputText('');

    try {
        const result = await translateFreeText(inputText, settings, targetLang);
        setOutputText(result);
    } catch (err: any) {
        setError(err.message || "خطا در برقراری ارتباط با هوش مصنوعی");
    } finally {
        setIsTranslating(false);
    }
  };

  const handleCopy = () => {
      if (!outputText) return;
      navigator.clipboard.writeText(outputText);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
  };

  const handlePaste = async () => {
      try {
          const text = await navigator.clipboard.readText();
          setInputText(text);
      } catch (e) {
          console.error('Paste failed', e);
      }
  };

  const handleClear = () => {
      setInputText('');
      setOutputText('');
      setError(null);
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/80 backdrop-blur-md" onClick={onClose}></div>
      
      <div className="relative w-full max-w-5xl glass rounded-3xl overflow-hidden animate-in fade-in zoom-in-95 duration-200 flex flex-col h-[85vh] shadow-2xl">
        
        {/* Header Section */}
        <div className="px-6 py-4 border-b border-white/10 bg-[#0a0e27]/80 flex justify-between items-center z-20">
          <div className="flex items-center gap-3">
             <div className="bg-gradient-to-br from-[#00f0ff]/20 to-[#00f0ff]/5 p-2.5 rounded-xl border border-[#00f0ff]/20 shadow-[0_0_15px_rgba(0,240,255,0.1)]">
                <Languages className="w-5 h-5 text-[#00f0ff]" />
             </div>
             <div>
                 <h2 className="text-lg font-bold text-white tracking-wide">مترجم هوشمند متنی</h2>
                 <p className="text-[11px] text-white/40 mt-0.5 font-mono">Powered by Gemini AI</p>
             </div>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-white/10 rounded-full transition-colors group">
            <X className="w-6 h-6 text-white/40 group-hover:text-white transition-colors" />
          </button>
        </div>

        {/* Toolbar & Controls */}
        <div className="bg-[#0a0e27]/40 border-b border-white/5 px-6 py-3 flex flex-col md:flex-row items-center justify-between gap-4 z-10">
            
            {/* Language Flow */}
            <div className="flex items-center gap-3 bg-[#0a0e27] p-1.5 rounded-2xl border border-white/10 shadow-inner w-full md:w-auto justify-center md:justify-start">
                {/* Source Label */}
                <div className="px-4 py-2 rounded-xl bg-white/5 text-white/60 text-xs font-bold border border-white/5 cursor-default select-none">
                    تشخیص خودکار
                </div>

                {/* Arrow */}
                <ArrowLeft className="w-4 h-4 text-white/20" />

                {/* Target Selector */}
                <div className="relative group">
                    <select 
                        value={targetLang} 
                        onChange={(e) => setTargetLang(e.target.value as TargetLanguage)}
                        className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10"
                    >
                        {Object.entries(TARGET_LANGUAGES).map(([code, name]) => (
                            <option key={code} value={code} className="bg-[#0a0e27] text-white">
                                {name}
                            </option>
                        ))}
                    </select>
                    <div className="flex items-center gap-2 px-4 py-2 rounded-xl bg-[#ff00ea]/10 text-[#ff00ea] text-xs font-bold border border-[#ff00ea]/30 group-hover:bg-[#ff00ea]/20 group-hover:border-[#ff00ea]/50 transition-all cursor-pointer min-w-[140px] justify-between shadow-[0_0_10px_rgba(255,0,234,0.1)]">
                        <span>{TARGET_LANGUAGES[targetLang]}</span>
                        <ChevronDown className="w-3 h-3 opacity-70 group-hover:translate-y-0.5 transition-transform" />
                    </div>
                </div>
            </div>

            {/* Context Info */}
            <div className="hidden md:flex items-center gap-3 text-[10px] text-white/30 bg-white/5 px-4 py-2 rounded-full border border-white/5">
                 <span className="flex items-center gap-1.5">
                    <span className="w-1.5 h-1.5 rounded-full bg-[#00f0ff]"></span>
                    {TONE_OPTIONS[settings.tone]}
                 </span>
                 <span className="w-px h-3 bg-white/10"></span>
                 <span className="flex items-center gap-1.5">
                    <span className="w-1.5 h-1.5 rounded-full bg-[#ff00ea]"></span>
                    {TOPIC_OPTIONS[settings.topic]}
                 </span>
            </div>
        </div>

        {/* Main Workspace */}
        <div className="flex-1 flex flex-col md:flex-row p-6 gap-4 md:gap-6 overflow-hidden bg-gradient-to-b from-[#0a0e27]/50 to-[#0a0e27] relative">
            
            {/* Translate Button (Floating Center on Desktop) */}
            <div className="hidden md:flex absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-30">
                 <button 
                    onClick={handleTranslate}
                    disabled={isTranslating || !inputText.trim()}
                    className="group relative flex items-center justify-center w-14 h-14 rounded-2xl bg-[#0a0e27] border border-[#00f0ff]/30 text-[#00f0ff] shadow-[0_0_30px_rgba(0,240,255,0.2)] hover:shadow-[0_0_40px_rgba(0,240,255,0.4)] hover:scale-110 hover:border-[#00f0ff] transition-all disabled:opacity-50 disabled:scale-100 disabled:shadow-none"
                 >
                     <div className="absolute inset-0 bg-[#00f0ff]/10 rounded-2xl blur-md group-hover:bg-[#00f0ff]/20 transition-all"></div>
                     {isTranslating ? <Loader2 className="w-6 h-6 animate-spin relative z-10" /> : <Sparkles className="w-6 h-6 relative z-10 group-hover:rotate-12 transition-transform" />}
                 </button>
            </div>

            {/* Input Panel */}
            <div className="flex-1 flex flex-col h-full glass rounded-2xl border border-white/5 overflow-hidden transition-all focus-within:border-[#00f0ff]/30 focus-within:shadow-[0_0_20px_rgba(0,240,255,0.05)] group">
                <textarea 
                    value={inputText}
                    onChange={(e) => setInputText(e.target.value)}
                    placeholder="متن خود را اینجا بنویسید..."
                    className="flex-1 w-full bg-transparent p-5 text-sm text-white/90 focus:outline-none resize-none leading-8 custom-scrollbar placeholder-white/20"
                />
                
                {/* Input Footer Actions */}
                <div className="px-4 py-3 bg-[#0a0e27]/30 border-t border-white/5 flex justify-between items-center">
                     <span className="text-[10px] text-white/20 font-mono">
                        {inputText.length} chars
                     </span>
                     <div className="flex items-center gap-1">
                        {!inputText && (
                            <button 
                                onClick={handlePaste}
                                className="p-2 text-white/30 hover:text-[#00f0ff] hover:bg-[#00f0ff]/10 rounded-lg transition-all text-xs flex items-center gap-1"
                                title="Paste"
                            >
                                <ClipboardPaste className="w-4 h-4" />
                            </button>
                        )}
                        {inputText && (
                            <button 
                                onClick={handleClear}
                                className="p-2 text-white/30 hover:text-red-400 hover:bg-red-500/10 rounded-lg transition-all text-xs flex items-center gap-1"
                                title="Clear"
                            >
                                <Trash2 className="w-4 h-4" />
                            </button>
                        )}
                     </div>
                </div>
            </div>

            {/* Mobile Translate Button */}
            <div className="md:hidden flex justify-center">
                 <button 
                    onClick={handleTranslate}
                    disabled={isTranslating || !inputText.trim()}
                    className="w-full py-3 bg-gradient-to-r from-[#00f0ff] to-[#00c0cc] text-black font-bold rounded-xl shadow-[0_0_20px_rgba(0,240,255,0.3)] disabled:opacity-50 flex items-center justify-center gap-2"
                 >
                     {isTranslating ? <Loader2 className="w-5 h-5 animate-spin" /> : <Sparkles className="w-5 h-5" />}
                     {isTranslating ? 'در حال ترجمه...' : 'ترجمه کن'}
                 </button>
            </div>

            {/* Output Panel */}
            <div className={`flex-1 flex flex-col h-full glass rounded-2xl border overflow-hidden transition-all relative ${outputText ? 'border-[#ff00ea]/30 shadow-[0_0_20px_rgba(255,0,234,0.05)]' : 'border-white/5 border-dashed'}`}>
                {isTranslating ? (
                    <div className="flex-1 flex flex-col items-center justify-center text-white/50 gap-3">
                         <Loader2 className="w-8 h-8 animate-spin text-[#ff00ea]" />
                         <span className="text-xs animate-pulse">در حال تفکر و ترجمه...</span>
                    </div>
                ) : !outputText ? (
                    <div className="flex-1 flex flex-col items-center justify-center text-white/10 gap-2 select-none">
                         <Languages className="w-12 h-12" />
                         <span className="text-xs">نتیجه ترجمه اینجا نمایش داده می‌شود</span>
                    </div>
                ) : (
                    <textarea 
                        readOnly
                        value={outputText}
                        className={`flex-1 w-full bg-transparent p-5 text-sm text-white focus:outline-none resize-none leading-8 custom-scrollbar ${targetLang === 'fa' ? 'dir-rtl' : 'dir-ltr'}`}
                    />
                )}

                {/* Output Footer Actions */}
                <div className="px-4 py-3 bg-[#0a0e27]/30 border-t border-white/5 flex justify-between items-center">
                     <span className="text-[10px] text-white/20 font-mono">
                        {outputText ? `${outputText.length} chars` : ''}
                     </span>
                     {outputText && (
                        <button 
                            onClick={handleCopy}
                            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all border ${copied ? 'bg-green-500/10 text-green-400 border-green-500/20' : 'bg-white/5 text-white/50 border-white/5 hover:bg-white/10 hover:text-white'}`}
                        >
                            {copied ? <CheckCircle className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                            {copied ? 'کپی شد' : 'کپی'}
                        </button>
                     )}
                </div>
            </div>

        </div>
        
        {/* Footer / Error Area */}
        {error && (
            <div className="absolute bottom-6 left-6 right-6 z-50 animate-in slide-in-from-bottom-2">
                <div className="bg-red-500/10 border border-red-500/20 text-red-400 text-xs p-3 rounded-xl flex items-center gap-2 shadow-lg backdrop-blur-md">
                    <div className="w-2 h-2 rounded-full bg-red-500 animate-pulse"></div>
                    {error}
                </div>
            </div>
        )}

      </div>
    </div>
  );
};
