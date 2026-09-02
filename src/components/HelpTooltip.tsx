
import React, { useState, useRef, useEffect } from 'react';
import { HelpCircle } from 'lucide-react';

interface HelpTooltipProps {
  text: string;
  className?: string;
  position?: 'top' | 'bottom' | 'left' | 'right';
  size?: 'sm' | 'md';
}

export const HelpTooltip: React.FC<HelpTooltipProps> = ({ 
  text, 
  className = '', 
  position = 'top',
  size = 'sm'
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const iconSize = size === 'sm' ? 'w-4 h-4' : 'w-5 h-5';
  
  const positionClasses = {
    top: 'bottom-full left-1/2 -translate-x-1/2 mb-2',
    bottom: 'top-full left-1/2 -translate-x-1/2 mt-2',
    left: 'right-full top-1/2 -translate-y-1/2 mr-2',
    right: 'left-full top-1/2 -translate-y-1/2 ml-2',
  };

  // Close tooltip if clicked outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen]);

  return (
    <div 
      ref={containerRef}
      className={`relative inline-flex items-center justify-center ${className}`}
    >
      <button 
        onClick={(e) => {
          e.stopPropagation(); // Prevent triggering other click events
          setIsOpen(!isOpen);
        }}
        className="focus:outline-none cursor-pointer p-0.5 rounded-full hover:bg-white/5 transition-colors"
        title="نمایش راهنما"
        type="button"
      >
        <HelpCircle 
          className={`${iconSize} transition-colors duration-200 ${isOpen ? 'text-primary' : 'text-text-muted hover:text-white'}`} 
        />
      </button>
      
      {/* Tooltip Body */}
      {isOpen && (
        <div className={`
          absolute ${positionClasses[position]} z-[100] w-64
          animate-in fade-in zoom-in-95 duration-200
        `}>
          <div className="bg-[#0a0e27] border border-white/20 text-white text-xs p-3 rounded-lg shadow-[0_4px_20px_rgba(0,0,0,0.5)] backdrop-blur-xl relative leading-relaxed text-right dir-rtl">
            {text}
            
            {/* Arrow */}
            <div className={`
              absolute w-2 h-2 bg-[#0a0e27] border-white/20 rotate-45
              ${position === 'top' ? 'bottom-[-5px] left-1/2 -translate-x-1/2 border-b border-r' : ''}
              ${position === 'bottom' ? 'top-[-5px] left-1/2 -translate-x-1/2 border-t border-l' : ''}
              ${position === 'left' ? 'right-[-5px] top-1/2 -translate-y-1/2 border-t border-r' : ''}
              ${position === 'right' ? 'left-[-5px] top-1/2 -translate-y-1/2 border-b border-l' : ''}
            `}></div>
          </div>
        </div>
      )}
    </div>
  );
};
