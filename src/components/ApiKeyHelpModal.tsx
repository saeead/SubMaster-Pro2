
import React from 'react';
import { X, ExternalLink, CheckCircle2, Terminal, MousePointerClick, Key } from 'lucide-react';

interface ApiKeyHelpModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const ApiKeyHelpModal: React.FC<ApiKeyHelpModalProps> = ({ isOpen, onClose }) => {
  if (!isOpen) return null;

  const steps = [
    {
      icon: <ExternalLink className="w-5 h-5 text-blue-400" />,
      title: 'ورود به گوگل AI Studio',
      description: 'ابتدا باید وارد پنل توسعه‌دهندگان گوگل شوید. اگر اکانت گوگل دارید، لاگین کنید.',
      action: {
        text: 'باز کردن Google AI Studio',
        link: 'https://aistudio.google.com/app/apikey'
      }
    },
    {
      icon: <MousePointerClick className="w-5 h-5 text-[#ff00ea]" />,
      title: 'دریافت کلید API',
      description: 'در منوی سمت چپ (یا بالای صفحه)، روی دکمه آبی رنگ "Get API Key" یا "Create API Key" کلیک کنید.',
    },
    {
      icon: <Terminal className="w-5 h-5 text-yellow-400" />,
      title: 'ساخت کلید جدید',
      description: 'در پنجره باز شده، گزینه "Create API Key in new project" را انتخاب کنید تا گوگل یک پروژه جدید برای شما بسازد.',
    },
    {
      icon: <Key className="w-5 h-5 text-[#00f0ff]" />,
      title: 'کپی و استفاده',
      description: 'کلید ساخته شده (رشته متنی طولانی که با AIza شروع می‌شود) را کپی کنید و در تنظیمات برنامه SubMaster Pro وارد نمایید.',
    }
  ];

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/80 backdrop-blur-md" onClick={onClose}></div>
      
      <div className="relative w-full max-w-2xl glass rounded-3xl overflow-hidden animate-in fade-in zoom-in-95 duration-300 flex flex-col max-h-[90vh]">
        
        {/* Header */}
        <div className="p-6 border-b border-white/10 bg-[#0a0e27]/80 flex justify-between items-center">
          <div>
            <h2 className="text-xl font-bold text-white flex items-center gap-2">
              <span className="bg-[#00f0ff]/20 p-2 rounded-lg border border-[#00f0ff]/30">
                <Key className="w-5 h-5 text-[#00f0ff]" />
              </span>
              راهنمای دریافت کلید API
            </h2>
            <p className="text-xs text-white/50 mt-1 pr-1">مراحل ساده برای فعال‌سازی هوش مصنوعی Gemini</p>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-white/10 rounded-full transition-colors group">
            <X className="w-6 h-6 text-white/60 group-hover:text-red-400 transition-colors" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto custom-scrollbar p-6 bg-[#0a0e27]/50 space-y-8">
          
          <div className="bg-blue-500/10 border border-blue-500/20 rounded-xl p-4 flex gap-3">
             <div className="mt-1"><CheckCircle2 className="w-5 h-5 text-blue-400" /></div>
             <div className="text-sm text-blue-100/80 leading-relaxed">
               <strong>نکته مهم:</strong> استفاده از مدل‌های Flash برای اکثر کاربران رایگان است، اما ممکن است نیاز باشد برای دسترسی به این سرویس از ابزارهای تغییر IP (فیلترشکن) استفاده کنید زیرا گوگل برخی مناطق را محدود کرده است.
             </div>
          </div>

          <div className="relative border-r-2 border-white/10 mr-3 space-y-10 py-2">
            {steps.map((step, index) => (
              <div key={index} className="relative pr-8 group">
                {/* Timeline Dot */}
                <div className="absolute -right-[9px] top-0 w-4 h-4 rounded-full bg-[#0a0e27] border-2 border-[#00f0ff] z-10 group-hover:bg-[#00f0ff] group-hover:shadow-[0_0_10px_#00f0ff] transition-all"></div>
                
                <div className="flex flex-col gap-2">
                  <div className="flex items-center gap-2">
                    {step.icon}
                    <h3 className="text-lg font-bold text-white">{step.title}</h3>
                  </div>
                  
                  <p className="text-sm text-white/70 leading-7 text-justify pl-4">
                    {step.description}
                  </p>

                  {step.action && (
                    <a 
                      href={step.action.link} 
                      target="_blank" 
                      rel="noreferrer"
                      className="mt-2 inline-flex items-center gap-2 bg-[#00f0ff]/10 hover:bg-[#00f0ff]/20 text-[#00f0ff] border border-[#00f0ff]/30 px-4 py-2 rounded-lg text-sm font-bold w-fit transition-all hover:scale-105"
                    >
                      {step.action.text}
                      <ExternalLink className="w-4 h-4" />
                    </a>
                  )}
                </div>
              </div>
            ))}
          </div>

        </div>

        {/* Footer */}
        <div className="p-4 border-t border-white/10 bg-[#0a0e27]/80 flex justify-end">
           <button 
              onClick={onClose}
              className="px-6 py-2.5 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-white text-sm transition-colors"
           >
              متوجه شدم
           </button>
        </div>

      </div>
    </div>
  );
};
