import React from 'react';
import {
  Ban,
  Settings,
  BookOpen,
  MessageSquareText,
  X,
  Globe,
  Tv,
  Palette,
  SlidersHorizontal,
  Shield,
  ChevronLeft,
  Sparkles
} from 'lucide-react';
import { AppSettings, OutputStandard, TargetLanguage, ToneType, TopicType } from '../types';
import { TARGET_LANGUAGES, TONE_OPTIONS, TOPIC_OPTIONS } from '../constants';
import { TemperatureControl } from './TemperatureControl';
import { SettingsCombobox } from './SettingsCombobox';

interface SidebarProps {
  settings: AppSettings;
  updateSettings: (newSettings: Partial<AppSettings>) => void;
  isOpen: boolean;
  onClose: () => void;
  onOpenSettings: () => void;
  onOpenGlossary: () => void;
  onOpenTextTranslator: () => void;
}

const standards: Array<{ value: OutputStandard; label: string; description: string; badge: string }> = [
  { value: 'normal', label: 'استاندارد عمومی', description: 'بدون محدودیت اختصاصی پخش', badge: 'عمومی' },
  { value: 'netflix', label: 'Netflix', description: '۴۲ کاراکتر در خط، ۲۰ CPS', badge: '۴۲ CPS' },
  { value: 'bbc', label: 'BBC', description: '۳۷ کاراکتر در خط، خوانایی بالا', badge: '۳۷ CPS' },
  { value: 'broadcast', label: 'تلویزیونی (Broadcast)', description: '۳۹ کاراکتر در خط، ۱۸ CPS', badge: '۳۹ CPS' },
];

const LANGUAGE_BADGES: Record<TargetLanguage, string> = {
  fa: 'FA',
  en: 'EN',
  ru: 'RU',
  zh: 'ZH',
  de: 'DE',
  es: 'ES',
};

const TONE_BADGES: Record<ToneType, string> = {
  conversational: 'محاوره',
  formal: 'رسمی',
  news: 'خبری',
  movie: 'سینما',
  podcast: 'پادکست',
};

const TOPIC_BADGES: Record<TopicType, string> = {
  educational: 'آموزش',
  entertainment: 'سرگرمی',
  podcast: 'صوتی',
  news: 'رسانه',
  sports: 'ورزش',
};

export const Sidebar: React.FC<SidebarProps> = ({
  settings,
  updateSettings,
  isOpen,
  onClose,
  onOpenSettings,
  onOpenGlossary,
  onOpenTextTranslator
}) => {
  const protectedTermsCount = settings.doNotTranslateTerms
    ? settings.doNotTranslateTerms.split(',').filter(t => t.trim().length > 0).length
    : 0;

  return (
    <>
      {/* Mobile Backdrop */}
      {isOpen && (
        <div
          className="fixed inset-0 z-40 bg-slate-950/60 backdrop-blur-sm transition-opacity duration-300 md:hidden"
          onClick={onClose}
          aria-hidden="true"
        />
      )}

      {/* Main Sidebar Panel */}
      <aside
        className={`fixed inset-y-0 right-0 z-50 flex h-full w-[22rem] flex-col border-l border-[#1e2a5e] bg-[var(--bg-elevated)] shadow-2xl transition-all duration-300 ease-out md:static md:h-screen md:w-[22rem] md:translate-x-0 md:bg-surface/30 md:shadow-none md:backdrop-blur-xl ${
          isOpen ? 'translate-x-0' : 'translate-x-full md:translate-x-0'
        }`}
      >
        {/* Header Bar */}
        <div className="flex h-16 shrink-0 items-center justify-between border-b border-[#1e2a5e] px-5">
          <div className="flex items-center gap-2.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-xl border border-[#24336a] bg-[#1a2550] text-primary shadow-xs">
              <SlidersHorizontal className="h-4 w-4" />
            </div>
            <div>
              <div className="flex items-center gap-1.5">
                <h2 className="text-sm font-bold text-text">تنظیمات ترجمه</h2>
                <span className="flex h-2 w-2 items-center justify-center">
                  <span className="relative inline-flex h-2 w-2 rounded-full bg-primary" />
                </span>
              </div>
              <p className="text-[10px] font-medium text-text-muted">SubAI Studio Engine</p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="flex h-8 w-8 items-center justify-center rounded-lg text-text-muted transition-colors hover:bg-surfaceHighlight hover:text-text md:hidden"
            aria-label="بستن منوی تنظیمات"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Scrollable Configuration Sections */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          
          {/* Section 1: Language & Broadcasting Standard */}
          <div className="rounded-2xl border border-[#1e2a5e] bg-surface/40 p-3.5 space-y-3.5 backdrop-blur-md shadow-xs transition-all hover:border-[#2b3c7e]">
            <div className="flex items-center justify-between px-1">
              <span className="flex items-center gap-1.5 text-[11px] font-bold tracking-wider text-text-muted">
                <Globe className="h-3.5 w-3.5 text-primary" />
                <span>زبان و استاندارد پخش</span>
              </span>
            </div>

            <SettingsCombobox
              label="زبان خروجی"
              icon={<Globe className="h-3.5 w-3.5" />}
              value={settings.targetLanguage}
              onChange={(targetLanguage) => updateSettings({ targetLanguage: targetLanguage as TargetLanguage })}
              options={Object.entries(TARGET_LANGUAGES).map(([value, label]) => ({
                value: value as TargetLanguage,
                label,
              }))}
              description="اعمال برای کل فرایند ترجمه، بازبینی و ویرایش زیرنویس."
            />

            <SettingsCombobox
              label="استاندارد خروجی زیرنویس"
              icon={<Tv className="h-3.5 w-3.5" />}
              value={settings.outputStandard}
              onChange={(outputStandard) => updateSettings({ outputStandard: outputStandard as OutputStandard })}
              options={standards}
              description="کنترل محدودیت کاراکتر در خط و نرخ خوانش (CPS)."
            />
          </div>

          {/* Section 2: Tone & Context */}
          <div className="rounded-2xl border border-[#1e2a5e] bg-surface/40 p-3.5 space-y-3.5 backdrop-blur-md shadow-xs transition-all hover:border-[#2b3c7e]">
            <div className="flex items-center justify-between px-1">
              <span className="flex items-center gap-1.5 text-[11px] font-bold tracking-wider text-text-muted">
                <Palette className="h-3.5 w-3.5 text-secondary" />
                <span>لحن و بافت متن</span>
              </span>
            </div>

            <SettingsCombobox
              label="لحن ترجمه"
              icon={<Palette className="h-3.5 w-3.5" />}
              value={settings.tone}
              onChange={(tone) => updateSettings({ tone: tone as ToneType })}
              options={Object.entries(TONE_OPTIONS).map(([value, label]) => ({
                value: value as ToneType,
                label,
              }))}
            />

            <SettingsCombobox
              label="موضوع محتوا"
              icon={<Sparkles className="h-3.5 w-3.5" />}
              value={settings.topic}
              onChange={(topic) => updateSettings({ topic: topic as TopicType })}
              options={Object.entries(TOPIC_OPTIONS).map(([value, label]) => ({
                value: value as TopicType,
                label,
              }))}
            />
          </div>

          {/* Section 3: AI Quality & Sampling Controls */}
          <TemperatureControl
            temperature={settings.temperature}
            topic={settings.topic}
            onChange={(temperature) => updateSettings({ temperature })}
          />

          {/* Section 4: Protected Vocabulary & Glossary */}
          <div className="rounded-2xl border border-[#1e2a5e] bg-surface/40 p-3.5 space-y-3 backdrop-blur-md shadow-xs transition-all hover:border-[#2b3c7e]">
            <div className="flex items-center justify-between px-1">
              <div className="flex items-center gap-1.5 text-xs font-bold text-text">
                <Shield className="h-3.5 w-3.5 text-primary" />
                <span>اصطلاحات محافظت‌شده</span>
              </div>
              {protectedTermsCount > 0 ? (
                <span className="rounded-md border border-[#24336a] bg-[#1a2550] px-1.5 py-0.5 font-mono text-[10px] font-semibold text-primary">
                  {protectedTermsCount} اصطلاح
                </span>
              ) : (
                <span className="text-[10px] text-text-muted">اختیاری</span>
              )}
            </div>

            <textarea
              id="do-not-translate-terms"
              value={settings.doNotTranslateTerms}
              onChange={(e) => updateSettings({ doNotTranslateTerms: e.target.value })}
              placeholder="مثال: React, API, SubMaster, Docker"
              className="min-h-[84px] w-full resize-y rounded-xl border border-[#1e2a5e] bg-[var(--input-bg,#060a20)] p-3 font-mono text-xs leading-5 text-text placeholder:text-text-muted/50 shadow-inner transition-all duration-200 focus:border-[#2b3c7e] focus:outline-none focus:ring-1 focus:ring-[#2b3c7e]"
              dir="auto"
            />
            
            <p className="flex items-center gap-1 px-1 text-[11px] leading-relaxed text-text-muted">
              <span>اصطلاح‌ها را با ویرگول انگلیسی (,) جدا کنید تا بدون تغییر حفظ شوند.</span>
            </p>
          </div>

          {/* Specialized Glossary Quick Access (for educational topic) */}
          {settings.topic === 'educational' && (
            <button
              onClick={onOpenGlossary}
              type="button"
              className="group flex min-h-[46px] w-full items-center justify-between rounded-xl border border-[#24336a] bg-[#141d42] px-3.5 py-2.5 text-sm font-semibold text-text shadow-xs transition-all duration-200 hover:border-[#2f428a] hover:bg-[#182350] active:scale-[0.995]"
            >
              <div className="flex items-center gap-2">
                <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-secondary/20 text-secondary">
                  <BookOpen className="h-4 w-4" />
                </div>
                <div className="text-right">
                  <div className="text-xs font-bold text-text">واژه‌نامه تخصصی آموزشی</div>
                  <div className="text-[10px] text-text-muted">اصطلاحات و تعاریف معین</div>
                </div>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="rounded-full bg-secondary/20 px-2 py-0.5 font-mono text-xs font-bold text-secondary">
                  {settings.glossary.length}
                </span>
                <ChevronLeft className="h-4 w-4 text-text-muted transition-transform group-hover:-translate-x-0.5" />
              </div>
            </button>
          )}

        </div>

        {/* Footer Actions */}
        <div className="shrink-0 border-t border-[#1e2a5e] bg-surface/50 p-4 backdrop-blur-lg space-y-2.5">
          <button
            onClick={onOpenTextTranslator}
            type="button"
            className="group flex min-h-[44px] w-full items-center justify-center gap-2 rounded-xl border border-[#273875] bg-gradient-to-r from-[#121a3e] to-[#182455] px-4 py-2.5 text-sm font-bold text-text shadow-sm transition-all duration-200 hover:border-[#384e9c] hover:from-[#172354] hover:to-[#1e2e6d] hover:text-white hover:shadow-md active:scale-[0.99] focus:outline-none focus:ring-1 focus:ring-[#384e9c]"
          >
            <MessageSquareText className="h-4 w-4 text-primary transition-transform group-hover:scale-110" />
            <span>ترجمه فوری متن و دیالوگ</span>
          </button>

          <button
            onClick={onOpenSettings}
            type="button"
            className="group flex min-h-[42px] w-full items-center justify-center gap-2 rounded-xl border border-[#1e2a5e] bg-surface/80 px-4 py-2.5 text-sm font-semibold text-text shadow-xs transition-all duration-200 hover:border-[#2b3c7e] hover:bg-surfaceHighlight active:scale-[0.99] focus:outline-none focus:ring-1 focus:ring-[#2b3c7e]"
          >
            <Settings className="h-4 w-4 text-text-muted transition-transform duration-300 group-hover:rotate-45 group-hover:text-text" />
            <span>تنظیمات پیشرفته سیستم</span>
          </button>
        </div>
      </aside>
    </>
  );
};
