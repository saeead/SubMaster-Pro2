
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
    <div className="rounded-2xl border border-[#1e2a5e] bg-surface/50 p-4 shadow-sm backdrop-blur-md transition-all duration-200 hover:border-[#2b3c7e]">
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <div className="flex h-7 w-7 items-center justify-center rounded-lg border border-[#24336a] bg-[#1a2550] text-primary">
             <Thermometer className="w-3.5 h-3.5" />
          </div>
          <div>
            <h3 className="text-xs font-bold text-text">کیفیت و خلاقیت هوش مصنوعی</h3>
            <span className="text-[10px] text-text-muted">تنظیم دمای نمونه‌برداری مدل</span>
          </div>
        </div>
        <span className="rounded-md border border-[#24336a] bg-[#1a2550] px-2 py-0.5 font-mono text-xs font-bold text-primary shadow-xs">
          {localTemp.toFixed(2)}
        </span>
      </div>

      {/* Description */}
      {presetDescription && (
        <p className="mb-3 text-[11px] leading-relaxed text-text-muted">
          {presetDescription}
        </p>
      )}

      {/* Slider */}
      <div className="relative mb-3 px-0.5">
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
          className="relative z-10 h-2 w-full cursor-pointer appearance-none rounded-full outline-none"
          style={{
            background: `linear-gradient(to right, #3B82F6 0%, #8B5CF6 50%, #EC4899 100%)`
          }}
          aria-label="تنظیم دمای مدل"
        />
        
         <style>{`
            input[type=range]::-webkit-slider-thumb {
                -webkit-appearance: none;
                height: 18px;
                width: 18px;
                border-radius: 50%;
                background: #38bdf8;
                border: 2px solid #1e2a5e;
                cursor: pointer;
                box-shadow: 0 0 10px rgba(30, 42, 94, 0.6);
                margin-top: -5px;
                transition: transform 0.15s ease, box-shadow 0.15s ease;
            }
            input[type=range]::-webkit-slider-thumb:hover {
                transform: scale(1.15);
                box-shadow: 0 0 14px rgba(46, 64, 133, 0.8);
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
      <div className="mb-2.5 flex justify-between px-0.5 text-[10px] text-text-muted">
        <div className="flex items-center gap-1">
          <Target className="w-3 h-3 text-blue-500" />
          <span>دقت و ترجمه خطی</span>
        </div>
        <div className="flex items-center gap-1">
          <Sparkles className="w-3 h-3 text-pink-500" />
          <span>انعطاف و خلاقیت</span>
        </div>
      </div>

      {/* Status Bar */}
      <div className="flex items-center justify-between rounded-lg border border-[#1e2a5e] bg-[#131b3e] px-3 py-1.5 text-center">
        <span className="w-full text-center text-xs font-semibold text-text">
          {getLabel()}
        </span>
      </div>

      {/* Reset Button */}
      {localTemp !== TOPIC_TEMPERATURE_DEFAULTS[topic]?.value && (
          <button
            onClick={handleReset}
            className="mt-2.5 flex w-full items-center justify-center gap-1.5 text-xs text-text-muted transition-colors hover:text-primary"
          >
            <RotateCcw className="w-3 h-3" />
            <span>بازگشت به پیش‌فرض موضوع ({TOPIC_TEMPERATURE_DEFAULTS[topic]?.value})</span>
          </button>
      )}
    </div>
  );
};
