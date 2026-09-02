
import React, { useState, useEffect } from 'react';
import { X, Cpu, Key, Plus, Trash2, CheckCircle, AlertTriangle, Loader2, Database, ToggleRight, ToggleLeft, ExternalLink, HelpCircle } from 'lucide-react';
import { AIProvider, AppSettings, OpenAICompatibleService, UserAPIKey } from '../types';
import { diagnoseConnection, validateAPIConnection } from '../services/geminiService';
import { getMemorySize, clearMemory } from '../services/translationMemory';
import { TARGET_LANGUAGES } from '../constants';
import { HelpTooltip } from './HelpTooltip';
import { ApiKeyHelpModal } from './ApiKeyHelpModal';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  settings: AppSettings;
  updateSettings: (newSettings: Partial<AppSettings>) => void;
}

const SUBTITLE_TRANSLATOR_SERVICE_PRESETS = [
  { name: 'LM Studio TranslateGemma', baseUrl: 'http://127.0.0.1:1234/v1/chat/completions', model: 'translategemma-4b-it' },
  { name: 'llama.cpp TranslateGemma', baseUrl: 'http://127.0.0.1:8080/v1/chat/completions', model: 'translategemma-4b-it' },
  { name: 'koboldcpp MiLMMT', baseUrl: 'http://127.0.0.1:5001/v1/chat/completions', model: 'MiLMMT-46-4B-v1.0' },
  { name: 'OpenRouter Free', baseUrl: 'https://openrouter.ai/api/v1/chat/completions', model: 'google/gemma-3n-e4b-it:free' },
  { name: 'LiteLLM Gateway', baseUrl: 'http://127.0.0.1:4000/v1/chat/completions', model: '' }
];

export const SettingsModal: React.FC<SettingsModalProps> = ({ isOpen, onClose, settings, updateSettings }) => {
  const [newKeyInput, setNewKeyInput] = useState('');
  const [isValidating, setIsValidating] = useState(false);
  const [validationError, setValidationError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [connectionTestMessage, setConnectionTestMessage] = useState<string | null>(null);
  const [isTestingLocalConnection, setIsTestingLocalConnection] = useState(false);
  const [memSize, setMemSize] = useState(getMemorySize());
  const [serviceNameInput, setServiceNameInput] = useState('');
  const [serviceBaseUrlInput, setServiceBaseUrlInput] = useState('');
  const [serviceApiKeyInput, setServiceApiKeyInput] = useState('');
  const [serviceModelInput, setServiceModelInput] = useState('');
  const [openAIServiceMessage, setOpenAIServiceMessage] = useState<string | null>(null);
  const [isTestingOpenAIService, setIsTestingOpenAIService] = useState(false);
  
  // State for Help Modal
  const [isHelpOpen, setIsHelpOpen] = useState(false);

  // Update memory size whenever modal opens
  useEffect(() => {
    if (isOpen) {
      setMemSize(getMemorySize());
    }
  }, [isOpen]);

  const activeOpenAIService = settings.openAICompatibleServices.find(service => service.id === settings.activeOpenAICompatibleServiceId)
      || settings.openAICompatibleServices[0];

  const selectProvider = (provider: AIProvider) => {
      // Provider-specific credentials stay stored for later use, but only the
      // selected provider is ever consulted by the translation transport.
      updateSettings({ aiProvider: provider });
      setConnectionTestMessage(null);
      setOpenAIServiceMessage(null);
  };

  if (!isOpen) return null;

  const handleAddKeys = async () => {
    if (!newKeyInput.trim()) return;
    
    setIsValidating(true);
    setValidationError(null);
    setSuccessMessage(null);

    const rawKeys = newKeyInput.split(/[\n\r, ]+/);
    const uniqueCandidates: string[] = Array.from(new Set(rawKeys.map(k => k.trim()).filter(k => k.length > 0)));

    if (uniqueCandidates.length === 0) {
        setIsValidating(false);
        return;
    }

    const keysToAdd: UserAPIKey[] = [];
    let duplicateCount = 0;
    let invalidCount = 0;

    await Promise.all(uniqueCandidates.map(async (keyStr) => {
        if (settings.apiKeys.some(k => k.key === keyStr)) {
            duplicateCount++;
            return;
        }

        const isValid = await validateAPIConnection(keyStr);
        if (isValid) {
            keysToAdd.push({
                key: keyStr,
                isValid: true,
                isRateLimited: false,
                addedAt: Date.now(),
                label: `Personal Key`
            });
        } else {
            invalidCount++;
        }
    }));

    if (keysToAdd.length > 0) {
        const startIndex = settings.apiKeys.length + 1;
        const labeledKeys = keysToAdd.map((k, i) => ({
            ...k,
            label: `Personal Key ${startIndex + i}`
        }));
        
        updateSettings({ apiKeys: [...settings.apiKeys, ...labeledKeys] });
        setNewKeyInput('');
        
        let msg = `${keysToAdd.length} کلید با موفقیت اضافه شد.`;
        if (duplicateCount > 0) msg += ` (${duplicateCount} تکراری)`;
        if (invalidCount > 0) msg += ` (${invalidCount} نامعتبر)`;
        setSuccessMessage(msg);
    } else {
        if (duplicateCount > 0 && invalidCount === 0) {
            setValidationError('همه کلیدهای وارد شده تکراری هستند.');
        } else {
            setValidationError('هیچ کلید معتبری یافت نشد. لطفاً از صحت کلیدها اطمینان حاصل کنید.');
        }
    }

    setIsValidating(false);
  };

  const removeKey = (keyToRemove: string) => {
    updateSettings({ apiKeys: settings.apiKeys.filter(k => k.key !== keyToRemove) });
  };

  const handleClearMemory = () => {
      if (confirm('آیا از پاک کردن تمام جملات حافظه ترجمه و واژه‌نامه اختصاصی اطمینان دارید؟')) {
          clearMemory();
          updateSettings({ glossary: [] });
          setMemSize(0);
      }
  };

  const handleTestLocalConnection = async () => {
      setIsTestingLocalConnection(true);
      setConnectionTestMessage(null);
      const error = await diagnoseConnection(undefined, { ...settings, aiProvider: 'lm_studio' });
      setConnectionTestMessage(error || '✅ اتصال به LM Studio برقرار است.');
      setIsTestingLocalConnection(false);
  };

  const buildOpenAIServiceFromInputs = (): OpenAICompatibleService | null => {
      const name = serviceNameInput.trim();
      const baseUrl = serviceBaseUrlInput.trim();
      const apiKey = serviceApiKeyInput.trim();
      const model = serviceModelInput.trim();
      if (!name || !baseUrl) return null;
      return { id: crypto.randomUUID(), name, baseUrl, apiKey, model };
  };

  const handleSaveOpenAIService = () => {
      const service = buildOpenAIServiceFromInputs();
      if (!service) {
          setOpenAIServiceMessage('⚠️ نام سرویس و Base URL الزامی هستند. API Key و نام مدل برای سرویس‌های محلی/دروازه‌ای می‌توانند خالی باشند.');
          return;
      }
      updateSettings({
          openAICompatibleServices: [...settings.openAICompatibleServices, service],
          activeOpenAICompatibleServiceId: service.id,
          aiProvider: 'openai_compatible'
      });
      setServiceNameInput('');
      setServiceBaseUrlInput('');
      setServiceApiKeyInput('');
      setServiceModelInput('');
      setOpenAIServiceMessage('✅ سرویس ترجمه ذخیره شد و به‌عنوان سرویس فعال انتخاب شد.');
  };

  const handleRemoveOpenAIService = (serviceId: string) => {
      const remainingServices = settings.openAICompatibleServices.filter(service => service.id !== serviceId);
      updateSettings({
          openAICompatibleServices: remainingServices,
          activeOpenAICompatibleServiceId: remainingServices[0]?.id
      });
  };

  const handleTestOpenAIService = async (service?: OpenAICompatibleService) => {
      const serviceToTest = service || buildOpenAIServiceFromInputs();
      if (!serviceToTest) {
          setOpenAIServiceMessage('⚠️ برای تست اتصال، حداقل نام سرویس و Base URL را وارد کنید.');
          return;
      }
      setIsTestingOpenAIService(true);
      setOpenAIServiceMessage(null);
      const error = await diagnoseConnection(undefined, {
          ...settings,
          aiProvider: 'openai_compatible',
          openAICompatibleServices: [serviceToTest],
          activeOpenAICompatibleServiceId: serviceToTest.id
      });
      setOpenAIServiceMessage(error || `✅ اتصال به ${serviceToTest.name} برقرار است.`);
      setIsTestingOpenAIService(false);
  };

  return (
    <>
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
        <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose}></div>
        
        <div className="relative w-full max-w-lg glass rounded-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-200 max-h-[90vh] flex flex-col">
          <div className="p-6 overflow-y-auto custom-scrollbar">
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-xl font-bold text-white flex items-center gap-2">
                <Cpu className="w-6 h-6 text-[#ff00ea]" />
                تنظیمات موتور هوش مصنوعی
              </h2>
              <button onClick={onClose} className="p-2 hover:bg-white/10 rounded-full transition-colors">
                <X className="w-5 h-5 text-white/60" />
              </button>
            </div>

            <div className="space-y-8">
              
              {/* Translation Memory */}
              <div className="space-y-4">
                  <h3 className="text-sm text-[#00f0ff] font-bold uppercase tracking-wider flex items-center gap-2">
                      <Database className="w-4 h-4" />
                      حافظه ترجمه (Translation Memory)
                  </h3>
                  
                  <div 
                      onClick={() => updateSettings({ enableTranslationMemory: !settings.enableTranslationMemory })}
                      className={`
                          cursor-pointer flex items-center justify-between p-4 rounded-xl border transition-all
                          ${settings.enableTranslationMemory ? 'bg-[#00f0ff]/10 border-[#00f0ff] shadow-[0_0_15px_rgba(0,240,255,0.15)]' : 'bg-white/5 border-white/10 hover:bg-white/10'}
                      `}
                  >
                      <div className="flex flex-col">
                          <span className="text-white font-medium text-sm">استفاده از حافظه ترجمه</span>
                          <span className="text-xs text-white/50 mt-1">
                              ذخیره و استفاده مجدد از جملات تکراری برای افزایش سرعت و کاهش هزینه.
                          </span>
                          <span className="text-[11px] text-white/40 mt-2">
                              {memSize} جمله در حافظه ترجمه و {settings.glossary.length} واژه در واژه‌نامه ذخیره شده است.
                          </span>
                      </div>
                      <div className={`transition-colors ${settings.enableTranslationMemory ? 'text-[#00f0ff]' : 'text-white/30'}`}>
                          {settings.enableTranslationMemory ? <ToggleRight className="w-8 h-8" /> : <ToggleLeft className="w-8 h-8" />}
                      </div>
                  </div>
                  
                  {(memSize > 0 || settings.glossary.length > 0) && (
                      <button 
                          onClick={handleClearMemory}
                          className="text-xs text-red-400 hover:text-red-300 flex items-center gap-1 px-2 py-1 rounded hover:bg-red-500/10 transition-colors"
                      >
                          <Trash2 className="w-3 h-3" />
                          ریست حافظه و واژه‌نامه
                      </button>
                  )}
              </div>

              {/* AI Provider */}
              <div className="space-y-4">
                <h3 className="text-sm text-[#00f0ff] font-bold uppercase tracking-wider flex items-center gap-2">
                  <Cpu className="w-4 h-4" />
                  انتخاب ارائه‌دهنده هوش مصنوعی
                </h3>

                <div className="grid grid-cols-1 gap-3">
                  <button
                    onClick={() => selectProvider('gemini')}
                    className={`p-4 rounded-xl border text-right transition-all min-h-[86px] whitespace-normal ${settings.aiProvider === 'gemini' ? 'bg-[#00f0ff]/10 border-[#00f0ff] text-white' : 'bg-white/5 border-white/10 text-white/60 hover:bg-white/10'}`}
                  >
                    <span className="block text-sm font-bold">Gemini</span>
                    <span className="block text-xs mt-1 leading-5 text-white/70">ترجمه ابری با کلید API گوگل</span>
                  </button>
                  <button
                    onClick={() => selectProvider('lm_studio')}
                    className={`p-4 rounded-xl border text-right transition-all min-h-[86px] whitespace-normal ${settings.aiProvider === 'lm_studio' ? 'bg-[#ff00ea]/10 border-[#ff00ea] text-white' : 'bg-white/5 border-white/10 text-white/60 hover:bg-white/10'}`}
                  >
                    <span className="block text-sm font-bold">LM Studio</span>
                    <span className="block text-xs mt-1 leading-5 text-white/70">مدل محلی بدون API Key</span>
                  </button>
                  <button
                    onClick={() => selectProvider('openai_compatible')}
                    className={`p-4 rounded-xl border text-right transition-all min-h-[86px] whitespace-normal ${settings.aiProvider === 'openai_compatible' ? 'bg-green-400/10 border-green-400 text-white' : 'bg-white/5 border-white/10 text-white/60 hover:bg-white/10'}`}
                  >
                    <span className="block text-sm font-bold">OpenAI Compatible</span>
                    <span className="block text-xs mt-1 leading-5 text-white/70">Chat Completions با Base URL و API Key</span>
                  </button>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 pt-1">
                    {([
                      ['gtx', 'GTX API (Free)', 'گوگل ترجمه، بدون API Key'],
                      ['edge', 'Edge API (Free)', 'Microsoft Edge، بدون API Key'],
                      ['deeplx', 'DeepLX (Free)', 'DeepL-compatible، بدون API Key']
                    ] as const).map(([provider, name, description]) => (
                      <button key={provider} type="button" onClick={() => selectProvider(provider)} className={`rounded-xl border p-3 text-right transition-all ${settings.aiProvider === provider ? 'border-amber-300 bg-amber-400/10 text-white' : 'border-white/10 bg-white/5 text-white/60 hover:bg-white/10'}`}>
                        <span className="block text-xs font-bold">{name}</span>
                        <span className="mt-1 block text-[10px] leading-4 text-white/55">{description}</span>
                      </button>
                    ))}
                  </div>
                </div>

                {(['gtx', 'edge', 'deeplx'] as AIProvider[]).includes(settings.aiProvider) && (
                  <div className="rounded-xl border border-amber-300/25 bg-amber-400/5 p-4 text-xs leading-relaxed text-amber-100">
                    این ارائه‌دهندهٔ رایگان به API Key یا Base URL نیاز ندارد. ترجمه در درخواست‌های کوچک انجام می‌شود تا ساختار و صفحه‌بندی زیرنویس حفظ شود. در صورت محدودیت یا CORS سرویس، ارائه‌دهندهٔ رایگان دیگری را انتخاب کنید.
                  </div>
                )}

                {settings.aiProvider === 'lm_studio' && (
                  <div className="bg-[#0a0e27]/50 rounded-xl p-4 border border-white/10 space-y-3">
                    <p className="text-xs text-white/60 leading-relaxed">
                      در LM Studio بخش Local Server را روشن کنید. پیش‌فرض برنامه با آدرس OpenAI-compatible یعنی http://localhost:1234/v1 کار می‌کند.
                    </p>
                    <label className="block text-xs text-white/50">آدرس سرور LM Studio</label>
                    <input
                      value={settings.lmStudioBaseUrl}
                      onChange={(e) => updateSettings({ lmStudioBaseUrl: e.target.value })}
                      className="w-full bg-[#0a0e27] border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:border-[#00f0ff] focus:outline-none font-mono"
                      placeholder="http://localhost:1234/v1"
                    />
                    <label className="block text-xs text-white/50">نام مدل بارگذاری‌شده</label>
                    <input
                      value={settings.lmStudioModel}
                      onChange={(e) => updateSettings({ lmStudioModel: e.target.value })}
                      className="w-full bg-[#0a0e27] border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:border-[#00f0ff] focus:outline-none font-mono"
                      placeholder="local-model"
                    />
                    <button
                      onClick={handleTestLocalConnection}
                      disabled={isTestingLocalConnection}
                      className="w-full bg-[#ff00ea]/10 hover:bg-[#ff00ea]/20 text-[#ff00ea] border border-[#ff00ea]/20 py-2 rounded-lg flex items-center justify-center gap-2 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {isTestingLocalConnection ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle className="w-4 h-4" />}
                      <span>{isTestingLocalConnection ? 'در حال تست اتصال...' : 'تست اتصال به مدل محلی'}</span>
                    </button>
                    {connectionTestMessage && (
                      <p className={`text-xs flex items-center gap-1 p-2 rounded border ${connectionTestMessage.startsWith('✅') ? 'text-green-400 bg-green-500/5 border-green-500/10' : 'text-red-400 bg-red-500/5 border-red-500/10'}`}>
                        {connectionTestMessage}
                      </p>
                    )}
                  </div>
                )}
              </div>

              {settings.aiProvider === 'openai_compatible' && (
                <div className="bg-[#0a0e27]/50 rounded-xl p-4 border border-white/10 space-y-4">
                  <div className="space-y-2">
                    <h3 className="text-sm text-green-400 font-bold">سرویس‌های OpenAI Compatible</h3>
                    <p className="text-xs text-white/60 leading-relaxed">
                      هر سرویس باید endpoint سازگار با Chat Completions داشته باشد. می‌توانید Base URL مثل https://example.com/v1 یا URL کامل .../chat/completions را وارد کنید.
                    </p>
                  </div>

                  <div className="space-y-2">
                    <p className="text-xs text-white/50">پریست‌های سریع برای روش Subtitle Translator:</p>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      {SUBTITLE_TRANSLATOR_SERVICE_PRESETS.map(preset => (
                        <button
                          key={preset.name}
                          type="button"
                          onClick={() => {
                            setServiceNameInput(preset.name);
                            setServiceBaseUrlInput(preset.baseUrl);
                            setServiceModelInput(preset.model);
                            setOpenAIServiceMessage(null);
                          }}
                          className="rounded-lg border border-green-400/20 bg-green-400/10 px-3 py-2 text-right text-[11px] text-green-100 transition-all hover:bg-green-400/20"
                        >
                          <span className="block font-bold">{preset.name}</span>
                          <span className="block truncate font-mono text-[10px] text-white/45">{preset.model || 'server default model'}</span>
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="grid grid-cols-1 gap-3">
                    <input
                      value={serviceNameInput}
                      onChange={(e) => { setServiceNameInput(e.target.value); setOpenAIServiceMessage(null); }}
                      className="w-full bg-[#0a0e27] border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:border-green-400 focus:outline-none"
                      placeholder="نام سرویس، مثلا OpenRouter یا Local Proxy"
                    />
                    <input
                      value={serviceBaseUrlInput}
                      onChange={(e) => { setServiceBaseUrlInput(e.target.value); setOpenAIServiceMessage(null); }}
                      className="w-full bg-[#0a0e27] border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:border-green-400 focus:outline-none font-mono"
                      placeholder="Base URL یا URL کامل chat/completions"
                    />
                    <input
                      value={serviceApiKeyInput}
                      onChange={(e) => { setServiceApiKeyInput(e.target.value); setOpenAIServiceMessage(null); }}
                      className="w-full bg-[#0a0e27] border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:border-green-400 focus:outline-none font-mono"
                      placeholder="API Key (برای لوکال/دروازه بدون احراز هویت اختیاری است)"
                      type="password"
                    />
                    <input
                      value={serviceModelInput}
                      onChange={(e) => { setServiceModelInput(e.target.value); setOpenAIServiceMessage(null); }}
                      className="w-full bg-[#0a0e27] border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:border-green-400 focus:outline-none font-mono"
                      placeholder="نام مدل، مثلا gpt-4o-mini یا qwen/qwen3-30b"
                    />
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    <button
                      onClick={() => handleTestOpenAIService()}
                      disabled={isTestingOpenAIService}
                      className="bg-green-400/10 hover:bg-green-400/20 text-green-400 border border-green-400/20 py-2 rounded-lg flex items-center justify-center gap-2 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {isTestingOpenAIService ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle className="w-4 h-4" />}
                      <span>{isTestingOpenAIService ? 'در حال تست...' : 'تست اتصال'}</span>
                    </button>
                    <button
                      onClick={handleSaveOpenAIService}
                      className="bg-[#00f0ff]/10 hover:bg-[#00f0ff]/20 text-[#00f0ff] border border-[#00f0ff]/20 py-2 rounded-lg flex items-center justify-center gap-2 transition-all"
                    >
                      <Plus className="w-4 h-4" />
                      ذخیره سرویس ترجمه
                    </button>
                  </div>

                  {openAIServiceMessage && (
                    <p className={`text-xs flex items-center gap-1 p-2 rounded border ${openAIServiceMessage.startsWith('✅') ? 'text-green-400 bg-green-500/5 border-green-500/10' : 'text-red-400 bg-red-500/5 border-red-500/10'}`}>
                      {openAIServiceMessage}
                    </p>
                  )}

                  {settings.openAICompatibleServices.length > 0 && (
                    <div className="space-y-2">
                      <p className="text-xs text-white/50">سرویس‌های ذخیره‌شده:</p>
                      {settings.openAICompatibleServices.map(service => (
                        <div key={service.id} className={`p-3 rounded-lg border flex items-center justify-between gap-3 ${activeOpenAIService?.id === service.id ? 'bg-green-400/10 border-green-400/40' : 'bg-[#0a0e27] border-white/10'}`}>
                          <button
                            onClick={() => updateSettings({ activeOpenAICompatibleServiceId: service.id, aiProvider: 'openai_compatible' })}
                            className="flex-1 text-right min-w-0"
                          >
                            <span className="block text-sm text-white truncate">{service.name}</span>
                            <span className="block text-[10px] text-white/40 truncate direction-ltr">{service.baseUrl} • {service.model}</span>
                          </button>
                          <button
                            onClick={() => handleTestOpenAIService(service)}
                            disabled={isTestingOpenAIService}
                            className="text-green-400 hover:text-green-300 p-1 disabled:opacity-50"
                            title="تست اتصال"
                          >
                            <CheckCircle className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => handleRemoveOpenAIService(service.id)}
                            className="text-white/30 hover:text-red-400 p-1"
                            title="حذف سرویس"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* Gemini-only credentials */}
              {settings.aiProvider === 'gemini' && (<>
              {/* API Key Management */}
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                    <h3 className="text-sm text-[#00f0ff] font-bold uppercase tracking-wider flex items-center gap-2">
                      <Key className="w-4 h-4" />
                      مدیریت کلیدهای API
                    </h3>
                    
                    {/* Help & Get Key Buttons */}
                    <div className="flex items-center gap-2">
                       <button
                          onClick={() => setIsHelpOpen(true)}
                          className="text-[10px] bg-white/5 hover:bg-white/10 text-white/70 hover:text-white px-2 py-1 rounded-lg transition-colors flex items-center gap-1 border border-white/5"
                       >
                           <HelpCircle className="w-3 h-3" />
                           آموزش دریافت
                       </button>
                       <a 
                          href="https://aistudio.google.com/app/apikey" 
                          target="_blank" 
                          rel="noreferrer"
                          className="text-[10px] bg-[#00f0ff]/10 hover:bg-[#00f0ff]/20 text-[#00f0ff] px-2 py-1 rounded-lg transition-colors flex items-center gap-1 border border-[#00f0ff]/20"
                       >
                           <ExternalLink className="w-3 h-3" />
                           دریافت کلید
                       </a>
                    </div>
                </div>
                
                <div className="bg-[#0a0e27]/50 rounded-xl p-4 border border-white/10 space-y-4">
                  <p className="text-xs text-white/60 leading-relaxed">
                    کلیدهای API خود را وارد کنید. می‌توانید چندین کلید را به صورت همزمان وارد کنید.
                  </p>

                  <div className="flex flex-col gap-2">
                    <textarea 
                      value={newKeyInput}
                      onChange={(e) => { setNewKeyInput(e.target.value); setValidationError(null); setSuccessMessage(null); }}
                      placeholder="کلیدهای API را اینجا وارد کنید..."
                      className="w-full bg-[#0a0e27] border border-white/10 rounded-lg px-4 py-3 text-sm text-white focus:border-[#00f0ff] focus:outline-none min-h-[100px] resize-y custom-scrollbar font-mono leading-6"
                    />
                    <button 
                      onClick={handleAddKeys}
                      disabled={!newKeyInput.trim() || isValidating}
                      className="w-full bg-[#00f0ff]/10 hover:bg-[#00f0ff]/20 text-[#00f0ff] border border-[#00f0ff]/20 py-2 rounded-lg flex items-center justify-center gap-2 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {isValidating ? <Loader2 className="w-5 h-5 animate-spin" /> : <Plus className="w-5 h-5" />}
                      <span>{isValidating ? 'در حال بررسی...' : 'افزودن کلیدها'}</span>
                    </button>
                  </div>
                  
                  {validationError && (
                    <p className="text-xs text-red-400 flex items-center gap-1 animate-in fade-in bg-red-500/5 p-2 rounded border border-red-500/10">
                      <AlertTriangle className="w-3 h-3" />
                      {validationError}
                    </p>
                  )}
                  
                  {successMessage && (
                    <p className="text-xs text-green-400 flex items-center gap-1 animate-in fade-in bg-green-500/5 p-2 rounded border border-green-500/10">
                      <CheckCircle className="w-3 h-3" />
                      {successMessage}
                    </p>
                  )}

                  <div className="space-y-2 mt-4 max-h-[200px] overflow-y-auto custom-scrollbar pr-1">
                    {settings.apiKeys.map((k, idx) => (
                      <div key={idx} className="flex items-center justify-between p-3 bg-[#0a0e27] rounded-lg border border-white/10 group hover:border-white/20 transition-all">
                        <div className="flex items-center gap-3">
                          <div className={`w-2 h-2 rounded-full flex-shrink-0 ${k.isValid ? 'bg-green-500 shadow-[0_0_8px_rgba(34,197,94,0.5)]' : 'bg-red-500'}`}></div>
                          <div className="flex flex-col min-w-0">
                             <span className="text-xs text-white font-mono truncate">
                               {k.key.slice(0, 8)}...{k.key.slice(-6)}
                             </span>
                             <span className="text-[10px] text-white/40 truncate">
                               {k.label} {k.isRateLimited && <span className="text-yellow-500 font-bold ml-1">(Rate Limited)</span>}
                             </span>
                          </div>
                        </div>
                        <button 
                          onClick={() => removeKey(k.key)}
                          className="text-white/20 hover:text-red-400 transition-colors p-1"
                          title="حذف کلید"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              {/* Gemini-only model selection */}
              <div className="space-y-4">
                 <div className="flex items-center gap-2">
                     <label className="text-sm text-white/70 block font-bold">انتخاب مدل پردازشی</label>
                     <HelpTooltip 
                          text="مدل‌های Gemini 3 دارای قابلیت‌های ایجنتی و درک محیطی بالاتری هستند. مدل‌های 2.5 Pro برای استدلال‌های پیچیده ایده‌آل می‌باشند." 
                          position="bottom"
                     />
                 </div>
                 
                 <div className="grid grid-cols-1 gap-3">
                    
                    {/* Standard (3.0 Flash) */}
                    <div 
                      onClick={() => updateSettings({ model: 'standard' })}
                      className={`
                          cursor-pointer p-4 rounded-xl border transition-all flex items-start gap-3
                          ${settings.model === 'standard' 
                              ? 'bg-[#00f0ff]/10 border-[#00f0ff] shadow-[0_0_15px_rgba(0,240,255,0.15)]' 
                              : 'bg-white/5 border-white/10 hover:bg-white/10'
                          }
                      `}
                    >
                        <div className={`mt-1 w-4 h-4 rounded-full border flex items-center justify-center ${settings.model === 'standard' ? 'border-[#00f0ff]' : 'border-white/30'}`}>
                            {settings.model === 'standard' && <div className="w-2 h-2 rounded-full bg-[#00f0ff]" />}
                        </div>
                        <div>
                          <h3 className="text-white font-medium text-sm">پیش‌فرض هوشمند (Gemini 3.0 Flash)</h3>
                          <p className="text-xs text-white/50 mt-1">مدل پیش‌فرض برای ترجمه‌های سریع. قابلیت‌های ایجنتیک بالا در درک زمان‌بندی‌ها.</p>
                        </div>
                    </div>

                    {/* Professional (3.0 Pro) */}
                    <div 
                      onClick={() => updateSettings({ model: 'professional' })}
                      className={`
                          cursor-pointer p-4 rounded-xl border transition-all flex items-start gap-3
                          ${settings.model === 'professional' 
                              ? 'bg-[#ff00ea]/10 border-[#ff00ea] shadow-[0_0_15px_rgba(255,0,234,0.15)]' 
                              : 'bg-white/5 border-white/10 hover:bg-white/10'
                          }
                      `}
                    >
                        <div className={`mt-1 w-4 h-4 rounded-full border flex items-center justify-center ${settings.model === 'professional' ? 'border-[#ff00ea]' : 'border-white/30'}`}>
                            {settings.model === 'professional' && <div className="w-2 h-2 rounded-full bg-[#ff00ea]" />}
                        </div>
                        <div>
                          <h3 className="text-white font-medium text-sm">استدلال پیشرفته (Gemini 3.0 Pro)</h3>
                          <p className="text-xs text-white/50 mt-1">بهترین گزینه برای بخش‌های دشوار و دیالوگ‌های پیچیده با استدلال (Reasoning) بالا.</p>
                        </div>
                    </div>

                     {/* Flash (2.5 Flash) */}
                     <div 
                      onClick={() => updateSettings({ model: 'flash' })}
                      className={`
                          cursor-pointer p-4 rounded-xl border transition-all flex items-start gap-3
                          ${settings.model === 'flash' 
                              ? 'bg-yellow-400/10 border-yellow-400 shadow-[0_0_15px_rgba(250,204,21,0.15)]' 
                              : 'bg-white/5 border-white/10 hover:bg-white/10'
                          }
                      `}
                    >
                        <div className={`mt-1 w-4 h-4 rounded-full border flex items-center justify-center ${settings.model === 'flash' ? 'border-yellow-400' : 'border-white/30'}`}>
                            {settings.model === 'flash' && <div className="w-2 h-2 rounded-full bg-yellow-400" />}
                        </div>
                        <div>
                          <h3 className="text-white font-medium text-sm">پایدار و متعادل (Gemini 2.5 Flash)</h3>
                          <p className="text-xs text-white/50 mt-1">مدل پایدار و متعادل برای پروژه‌های طولانی با هزینه بهینه.</p>
                        </div>
                    </div>

                     {/* Flash Lite (Economic) */}
                     <div 
                      onClick={() => updateSettings({ model: 'flash_lite' })}
                      className={`
                          cursor-pointer p-4 rounded-xl border transition-all flex items-start gap-3
                          ${settings.model === 'flash_lite' 
                              ? 'bg-green-400/10 border-green-400 shadow-[0_0_15px_rgba(74,222,128,0.15)]' 
                              : 'bg-white/5 border-white/10 hover:bg-white/10'
                          }
                      `}
                    >
                        <div className={`mt-1 w-4 h-4 rounded-full border flex items-center justify-center ${settings.model === 'flash_lite' ? 'border-green-400' : 'border-white/30'}`}>
                            {settings.model === 'flash_lite' && <div className="w-2 h-2 rounded-full bg-green-400" />}
                        </div>
                        <div>
                          <h3 className="text-white font-medium text-sm">اقتصادی (Gemini Flash Lite)</h3>
                          <p className="text-xs text-white/50 mt-1">گزینه‌ای اقتصادی برای زیرنویس‌های ساده و سریع با کمترین مصرف توکن.</p>
                        </div>
                    </div>

                 </div>
              </div>
              </>)}

              <button 
                  onClick={onClose}
                  className="w-full py-3 bg-gradient-to-r from-[#00f0ff] to-[#00c0cc] text-black font-bold rounded-xl shadow-lg shadow-[#00f0ff]/20 hover:shadow-[#00f0ff]/40 transition-all mt-4"
              >
                  تایید و بستن
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Helper Modal */}
      <ApiKeyHelpModal isOpen={isHelpOpen} onClose={() => setIsHelpOpen(false)} />
    </>
  );
};
