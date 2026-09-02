

import React, { useRef, useState } from 'react';
import { Plus, Upload, Copy, FileJson } from 'lucide-react';
import { parseSRT, parseVTT, parseASS, optimizeSubtitleBlocks } from '../services/subtitleUtils';
import { SubtitleBlock, AppStatus, OutputStandard } from '../types';
import { APP_CONFIG } from '../constants';
import { ProjectState } from '../services/projectStateManager';
import { HelpTooltip } from './HelpTooltip';

interface FileUploadProps {
  onLoad: (files: { blocks: SubtitleBlock[], filename: string, type: 'SRT' | 'VTT' | 'ASS', size: number }[]) => void;
  onProjectLoad: (projectState: ProjectState) => void;
  status: AppStatus;
  onError: (msg: string) => void;
  outputStandard: OutputStandard;
  variant?: 'full' | 'compact';
}

export const FileUpload: React.FC<FileUploadProps> = ({ onLoad, onProjectLoad, status, onError, outputStandard, variant = 'full' }) => {
  const inputRef = useRef<HTMLInputElement>(null);
  const [isDragging, setIsDragging] = useState(false);

  const validateFiles = (files: FileList): string[] => {
    const errors: string[] = [];
    
    if (files.length > APP_CONFIG.maxFilesPerUpload) {
        errors.push(`حداکثر ${APP_CONFIG.maxFilesPerUpload} فایل به صورت همزمان قابل آپلود است.`);
        return errors;
    }

    for (let i = 0; i < files.length; i++) {
        const file = files[i];
        if (file.size > APP_CONFIG.maxFileSize) {
            errors.push(`فایل "${file.name}" بیش از حد مجاز است (Max 100MB)`);
        }
        const ext = file.name.split('.').pop()?.toLowerCase();
        if (!ext || !['srt', 'vtt', 'ass', 'ssa', 'json'].includes(ext)) {
            errors.push(`فرمت فایل "${file.name}" پشتیبانی نمی‌شود`);
        }
    }
    
    return errors;
  };

  const processFiles = async (files: FileList) => {
    const validationErrors = validateFiles(files);
    if (validationErrors.length > 0) {
      onError(validationErrors.join(' | '));
      return;
    }

    const processedFiles: { blocks: SubtitleBlock[], filename: string, type: 'SRT' | 'VTT' | 'ASS', size: number }[] = [];

    try {
      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        const text = await file.text();
        const extension = file.name.split('.').pop()?.toLowerCase();
        
        // Handle Project Backup File
        if (extension === 'json') {
            try {
                const projectState = JSON.parse(text);
                // Basic Schema Validation
                if (projectState.id && projectState.allBlocks && projectState.totalChunks !== undefined) {
                    onProjectLoad(projectState as ProjectState);
                    return; // Stop processing other files if a backup is loaded
                } else {
                    onError('فایل JSON معتبر نیست (ساختار پروژه یافت نشد).');
                    return;
                }
            } catch (e) {
                onError('خطا در خواندن فایل پشتیبان.');
                return;
            }
        }

        let blocks: SubtitleBlock[] = [];
        let type: 'SRT' | 'VTT' | 'ASS' = 'SRT';

        if (extension === 'vtt') {
          type = 'VTT';
          blocks = parseVTT(text);
        } else if (extension === 'ass' || extension === 'ssa') {
          type = 'ASS';
          blocks = parseASS(text);
        } else {
          blocks = parseSRT(text);
        }

        if (blocks.length > 0) {
            // Optimization (Merge short lines, fix timing)
            const optimizedBlocks = optimizeSubtitleBlocks(blocks, outputStandard);
            processedFiles.push({
                blocks: optimizedBlocks,
                filename: file.name,
                type: type,
                size: file.size
            });
        }
      }

      if (processedFiles.length === 0) {
        // Error is handled inside loop for JSON or generic error
        if (files[0].name.endsWith('.json')) return; 
        onError('هیچ فایل زیرنویس معتبری یافت نشد.');
        return;
      }

      onLoad(processedFiles);
    } catch (err) {
      onError('خطا در پردازش فایل‌ها.');
      console.error(err);
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = () => {
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      processFiles(e.dataTransfer.files);
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      processFiles(e.target.files);
    }
  };

  if (status !== AppStatus.IDLE) return null;

  if (variant === 'compact') {
    return (
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        className="flex min-w-[150px] flex-shrink-0 items-center justify-center gap-2 rounded-xl border border-dashed border-primary/50 bg-primary/10 px-4 py-3 text-sm font-bold text-primary transition-all hover:-translate-y-0.5 hover:border-primary hover:bg-primary/20 hover:shadow-[0_0_18px_rgba(0,240,255,0.18)]"
        title="افزودن فایل جدید"
      >
        <input
          type="file"
          ref={inputRef}
          onChange={handleChange}
          className="hidden"
          accept=".srt,.vtt,.ass,.ssa,.json"
          multiple
        />
        <Plus className="h-5 w-5" />
        <span>افزودن فایل</span>
      </button>
    );
  }

  return (
    <div className="w-full animate-in fade-in slide-in-from-bottom-8 duration-500">
      <div
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        onClick={() => inputRef.current?.click()}
        className={`
          glass relative overflow-hidden rounded-3xl p-12 text-center cursor-pointer transition-all duration-300 group
          ${isDragging 
            ? 'border-primary bg-primary/5' 
            : 'border-border hover:border-primary/50 hover:bg-surface'
          }
        `}
      >
        <input 
          type="file" 
          ref={inputRef} 
          onChange={handleChange} 
          className="hidden" 
          accept=".srt,.vtt,.ass,.ssa,.json"
          multiple
        />
        
        {/* Glow Effect */}
        <div className={`absolute inset-0 bg-gradient-to-r from-primary/0 via-primary/5 to-primary/0 transition-transform duration-1000 ${isDragging ? 'translate-x-0' : '-translate-x-full'}`}></div>

        <div className="relative z-10 flex flex-col items-center justify-center space-y-6">
          <div className={`p-6 rounded-2xl transition-all duration-300 ${isDragging ? 'bg-primary shadow-[0_0_30px_rgba(0,240,255,0.4)]' : 'bg-background border border-border group-hover:border-primary/50 group-hover:shadow-[0_0_20px_rgba(0,240,255,0.2)]'}`}>
            <div className="relative">
                 <Upload className={`w-10 h-10 ${isDragging ? 'text-background' : 'text-primary'}`} />
                 <Copy className={`absolute -right-2 -bottom-2 w-5 h-5 ${isDragging ? 'text-background/70' : 'text-secondary'}`} />
            </div>
          </div>
          <div>
            <h3 className="text-2xl font-bold text-text mb-2">فایل‌ها را بکشید و رها کنید</h3>
            <p className="text-text-muted">پشتیبانی از آپلود همزمان تا {APP_CONFIG.maxFilesPerUpload} فایل</p>
          </div>
          <div className="flex items-center gap-2 text-xs text-text-muted bg-surface px-3 py-1 rounded-full border border-border">
            <span className="uppercase">srt, vtt, ass</span>
            <span>|</span>
            <span className="flex items-center gap-1">
                <FileJson className="w-3 h-3" /> 
                Backup JSON
                <HelpTooltip text="فایل‌های پشتیبان (JSON) که قبلاً دانلود کرده‌اید را اینجا رها کنید تا پروژه شما دقیقاً به حالت قبل برگردد (Restore)." position="top" />
            </span>
            <span>|</span>
            <span className={`${outputStandard === 'netflix' ? 'text-[#E50914]' : 'text-primary'}`}>
                {outputStandard === 'netflix' ? 'Netflix Optimized' : 'Standard Optimized'}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
};
