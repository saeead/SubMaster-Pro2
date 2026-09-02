
import React, { useState, useEffect, useRef } from 'react';
import { Thermometer, Sparkles, Target, RotateCcw } from 'lucide-react';
import { TopicType } from '../types';
import { TOPIC_TEMPERATURE_DEFAULTS } from '../constants';

interface TemperatureControlProps {
  temperature: number;
  topic: TopicType;
  onChange: (val: number) => void;
}

export const TemperatureControl: React.FC<TemperatureControlProps> = ({ temperature, topic, onChange }) => {
  const [localTemp, setLocalTemp] = useState(temperature);
  const [isDragging, setIsDragging] = useState(false);

  // Sync local state when prop changes (e.g. via reset or topic change)
  useEffect(() => {
    setLocalTemp(temperature);
  }, [temperature]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = parseFloat(e.target.value);
    setLocalTemp(value);
    onChange(value);
  };

  const handleReset = () => {
    const preset = TOPIC_TEMPERATURE_DEFAULTS[topic];
    if (preset) {
        setLocalTemp(preset.value);
        onChange(preset.value);
    }
  };

  const getLabel = () => {
    if (localTemp < 0.4) return "دقت بالا (Precision)";
    if (localTemp < 0.7) return "متعادل (Balanced)";
    return "خلاقیت بالا (Creative)";
  };

  const getGradientPosition = () => {
    return (localTemp * 100).toFixed(0);
  };

  const presetDescription = TOPIC_TEMPERATURE_DEFAULTS[topic]?.description || '';

  return (
    <div className="bg-[#0a0e27]/40 backdrop-blur-sm rounded-xl p-5 border border-white/10 mt-2 transition-all hover:border-white/20">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <div className="p-1.5 bg-[#00f0ff]/10 rounded-lg">
             <Thermometer className="w-4 h-4 text-[#00f0ff]" />
          </div>
          <h3 className="text-white text-sm font-semibold">کنترل کیفیت ترجمه</h3>
        </div>
        <span className="text-[10px] font-mono text-[#00f0ff] bg-[#00f0ff]/10 border border-[#00f0ff]/20 px-2 py-0.5 rounded-md">
          {localTemp.toFixed(2)}
        </span>
      </div>

      {/* Description */}
      <p className="text-[10px] text-white/50 mb-4 h-8 leading-tight">
        {presetDescription}
      </p>

      {/* Slider */}
      <div className="relative mb-6 px-1">
        <input
          type="range"
          min="0"
          max="1"
          step="0.05"
          value={localTemp}
          onChange={handleChange}
          onMouseDown={() => setIsDragging(true)}
          onMouseUp={() => setIsDragging(false)}
          onTouchStart={() => setIsDragging(true)}
          onTouchEnd={() => setIsDragging(false)}
          className="w-full h-2 rounded-full appearance-none cursor-pointer outline-none relative z-10"
          style={{
            background: `linear-gradient(to right, #3B82F6 0%, #8B5CF6 50%, #EC4899 100%)`
          }}
        />
        
        {/* Thumb Glow Effect (CSS only handles standard thumb, this adds extra glow logic if needed, 
            but for now we rely on standard input styling plus custom thumb CSS injected globally or below) */}
         <style>{`
            input[type=range]::-webkit-slider-thumb {
                -webkit-appearance: none;
                height: 18px;
                width: 18px;
                border-radius: 50%;
                background: #ffffff;
                cursor: pointer;
                box-shadow: 0 0 10px rgba(255, 255, 255, 0.5);
                margin-top: -4px; /* Adjust for vertical alignment */
                transition: transform 0.1s;
            }
            input[type=range]::-webkit-slider-thumb:hover {
                transform: scale(1.2);
                box-shadow: 0 0 15px rgba(255, 255, 255, 0.8);
            }
            input[type=range]::-webkit-slider-runnable-track {
                width: 100%;
                height: 8px;
                cursor: pointer;
                border-radius: 999px;
            }
         `}</style>
      </div>

      {/* Labels */}
      <div className="flex justify-between text-[10px] text-white/30 mb-3 px-1">
        <div className="flex items-center gap-1">
          <Target className="w-3 h-3 text-blue-400" />
          <span>دقت</span>
        </div>
        <div className="flex items-center gap-1">
          <Sparkles className="w-3 h-3 text-pink-400" />
          <span>خلاقیت</span>
        </div>
      </div>

      {/* Status Bar */}
      <div className="bg-[#0a0e27] rounded-lg p-2 text-center border border-white/5 flex items-center justify-between px-3">
        <span className="text-xs text-white/80 font-medium w-full text-center">
          {getLabel()}
        </span>
      </div>

      {/* Reset Button */}
      {localTemp !== TOPIC_TEMPERATURE_DEFAULTS[topic]?.value && (
          <button
            onClick={handleReset}
            className="w-full mt-3 text-[10px] text-white/40 hover:text-[#00f0ff] transition-colors flex items-center justify-center gap-1 animate-in fade-in"
          >
            <RotateCcw className="w-3 h-3" />
            بازگشت به پیش‌فرض ({TOPIC_TEMPERATURE_DEFAULTS[topic]?.value})
          </button>
      )}
    </div>
  );
};
