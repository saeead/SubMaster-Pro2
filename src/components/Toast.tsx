

import React, { useEffect } from 'react';
import { AlertCircle, X, CheckCircle, AlertTriangle } from 'lucide-react';

export type ToastType = 'error' | 'warning' | 'success';

interface ToastProps {
  message: string;
  type?: ToastType;
  onClose: () => void;
}

export const Toast: React.FC<ToastProps> = ({ message, type = 'error', onClose }) => {
  useEffect(() => {
    const timer = setTimeout(onClose, 5000);
    return () => clearTimeout(timer);
  }, [onClose]);

  const getStyle = () => {
    switch (type) {
      case 'warning':
        return {
          bg: 'bg-[#0a0e27]/95',
          border: 'border-yellow-500/50',
          shadow: 'shadow-[0_0_30px_rgba(234,179,8,0.2)]',
          iconBg: 'bg-yellow-500/20',
          textTitle: 'text-yellow-200',
          iconColor: 'text-yellow-500',
          Icon: AlertTriangle,
          title: 'توجه'
        };
      case 'success':
        return {
          bg: 'bg-[#0a0e27]/95',
          border: 'border-green-500/50',
          shadow: 'shadow-[0_0_30px_rgba(34,197,94,0.2)]',
          iconBg: 'bg-green-500/20',
          textTitle: 'text-green-200',
          iconColor: 'text-green-500',
          Icon: CheckCircle,
          title: 'موفقیت'
        };
      case 'error':
      default:
        return {
          bg: 'bg-[#0a0e27]/95',
          border: 'border-red-500/50',
          shadow: 'shadow-[0_0_30px_rgba(239,68,68,0.2)]',
          iconBg: 'bg-red-500/20',
          textTitle: 'text-red-200',
          iconColor: 'text-red-500',
          Icon: AlertCircle,
          title: 'خطا'
        };
    }
  };

  const style = getStyle();
  const IconComponent = style.Icon;

  return (
    <div className="relative w-full max-w-md px-4 animate-in slide-in-from-bottom-5 fade-in duration-300">
      <div className={`glass ${style.bg} border ${style.border} text-white p-4 rounded-2xl ${style.shadow} flex items-start gap-4 backdrop-blur-xl`}>
        <div className={`p-2 ${style.iconBg} rounded-full flex-shrink-0 mt-0.5`}>
           <IconComponent className={`w-5 h-5 ${style.iconColor}`} />
        </div>
        <div className="flex-1 min-w-0">
            <strong className={`block text-sm font-bold ${style.textTitle} mb-1`}>{style.title}</strong>
            <p className="text-sm text-white/80 leading-relaxed">{message}</p>
        </div>
        <button 
            onClick={onClose} 
            className="p-1 hover:bg-white/10 rounded-full transition-colors -mr-1 text-white/50 hover:text-white"
        >
             <X className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
};
