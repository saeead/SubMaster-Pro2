import React from 'react';
import { Ban, Settings, BookOpen, MessageSquareText, X } from 'lucide-react';
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

const standards: Array<{ value: OutputStandard; label: string; description: string }> = [
  { value: 'normal', label: 'استاندارد عمومی', description: 'بدون محدودیت اختصاصی پخش' },
  { value: 'netflix', label: 'Netflix', description: '۴۲ کاراکتر، ۲۰ CPS' },
  { value: 'bbc', label: 'BBC', description: '۳۷ کاراکتر، خوانایی بالا' },
  { value: 'broadcast', label: 'تلویزیونی', description: '۳۹ کاراکتر، ۱۸ CPS' },
];

export const Sidebar: React.FC<SidebarProps> = ({ settings, updateSettings, isOpen, onClose, onOpenSettings, onOpenGlossary, onOpenTextTranslator }) => (
  <>
    {isOpen && <div className="fixed inset-0 z-30 bg-slate-950/40 backdrop-blur-sm md:hidden" onClick={onClose} />}
    <aside className={`fixed inset-y-0 right-0 z-40 flex h-full w-[22rem] flex-col overflow-y-auto border-l border-border bg-[var(--bg-elevated)] p-5 shadow-2xl transition-transform duration-300 md:static md:h-screen md:w-80 md:translate-x-0 md:bg-transparent md:shadow-none ${isOpen ? 'translate-x-0' : 'translate-x-full md:translate-x-0'}`}>
      <div className="mb-6 flex items-center justify-between md:hidden">
        <p className="text-base font-bold text-text">تنظیمات ترجمه</p>
        <button onClick={onClose} className="rounded-lg p-2 text-text-muted hover:bg-surfaceHighlight hover:text-text" aria-label="بستن منوی تنظیمات"><X className="h-5 w-5" /></button>
      </div>

      <div className="space-y-5">
        <SettingsCombobox label="لحن ترجمه" value={settings.tone} onChange={(tone) => updateSettings({ tone: tone as ToneType })} options={Object.entries(TONE_OPTIONS).map(([value, label]) => ({ value: value as ToneType, label }))} />
        <SettingsCombobox label="زبان خروجی" value={settings.targetLanguage} onChange={(targetLanguage) => updateSettings({ targetLanguage: targetLanguage as TargetLanguage })} options={Object.entries(TARGET_LANGUAGES).map(([value, label]) => ({ value: value as TargetLanguage, label }))} description="این انتخاب برای ترجمه، ویرایش و نام فایل خروجی اعمال می‌شود." />
        <SettingsCombobox label="استاندارد خروجی" value={settings.outputStandard} onChange={(outputStandard) => updateSettings({ outputStandard: outputStandard as OutputStandard })} options={standards} description="محدودیت‌های خوانایی و شکست خط را در کل فرایند اعمال می‌کند." />
        <SettingsCombobox label="موضوع محتوا" value={settings.topic} onChange={(topic) => updateSettings({ topic: topic as TopicType })} options={Object.entries(TOPIC_OPTIONS).map(([value, label]) => ({ value: value as TopicType, label }))} />

        <section className="rounded-xl border border-border bg-surface p-4">
          <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-text"><Ban className="h-4 w-4 text-primary" /> اصطلاحات محافظت‌شده</div>
          <textarea id="do-not-translate-terms" value={settings.doNotTranslateTerms} onChange={(e) => updateSettings({ doNotTranslateTerms: e.target.value })} placeholder="مثال: React, API, SubMaster" className="min-h-24 w-full resize-y rounded-lg border border-border bg-background p-3 text-sm leading-6 text-text placeholder:text-text-muted focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/30" dir="auto" />
          <p className="mt-2 text-xs leading-5 text-text-muted">اصطلاح‌ها را با ویرگول انگلیسی جدا کنید تا بدون ترجمه حفظ شوند.</p>
        </section>

        {settings.topic === 'educational' && <button onClick={onOpenGlossary} className="flex min-h-11 w-full items-center justify-between rounded-lg border border-secondary/30 bg-secondary/10 px-3 text-sm font-semibold text-text transition hover:bg-secondary/15"><span className="flex items-center gap-2"><BookOpen className="h-4 w-4 text-secondary" />واژه‌نامه تخصصی</span><span className="rounded-full bg-secondary/20 px-2 py-0.5 text-xs text-text">{settings.glossary.length}</span></button>}

        <TemperatureControl temperature={settings.temperature} topic={settings.topic} onChange={(temperature) => updateSettings({ temperature })} />
      </div>

      <div className="mt-auto space-y-3 pt-6">
        <button onClick={onOpenTextTranslator} className="flex min-h-11 w-full items-center justify-center gap-2 rounded-lg bg-primary px-4 text-sm font-bold text-slate-950 shadow-sm transition hover:brightness-110 focus:outline-none focus:ring-2 focus:ring-primary/50"><MessageSquareText className="h-4 w-4" />ترجمه متن</button>
        <button onClick={onOpenSettings} className="flex min-h-11 w-full items-center justify-center gap-2 rounded-lg border border-border bg-surface px-4 text-sm font-semibold text-text transition hover:bg-surfaceHighlight"><Settings className="h-4 w-4" />تنظیمات پیشرفته</button>
      </div>
    </aside>
  </>
);
