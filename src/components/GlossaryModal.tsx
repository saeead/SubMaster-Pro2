import React, { useState } from 'react';
import { X, BookOpen, Plus, Trash2, Save, FileText } from 'lucide-react';
import { GlossaryItem } from '../types';

interface GlossaryModalProps {
  isOpen: boolean;
  onClose: () => void;
  glossary: GlossaryItem[];
  onUpdate: (newGlossary: GlossaryItem[]) => void;
}

export const GlossaryModal: React.FC<GlossaryModalProps> = ({ isOpen, onClose, glossary, onUpdate }) => {
  const [items, setItems] = useState<GlossaryItem[]>(glossary);
  const [newTerm, setNewTerm] = useState('');
  const [newTranslation, setNewTranslation] = useState('');
  const [bulkInput, setBulkInput] = useState('');
  const [activeTab, setActiveTab] = useState<'list' | 'bulk'>('list');

  // Sync internal state when prop changes or modal opens
  React.useEffect(() => {
    setItems(glossary);
  }, [glossary, isOpen]);

  if (!isOpen) return null;

  const handleAdd = () => {
    if (newTerm.trim() && newTranslation.trim()) {
      const newItem = { term: newTerm.trim(), translation: newTranslation.trim() };
      // Prevent duplicates
      if (!items.some(i => i.term.toLowerCase() === newItem.term.toLowerCase())) {
         setItems([...items, newItem]);
         setNewTerm('');
         setNewTranslation('');
      }
    }
  };

  const handleRemove = (term: string) => {
    setItems(items.filter(i => i.term !== term));
  };

  const handleBulkImport = () => {
    if (!bulkInput.trim()) return;
    
    const lines = bulkInput.split('\n');
    const newItems: GlossaryItem[] = [];
    
    lines.forEach(line => {
        // Supports "Term: Translation" or "Term -> Translation" or "Term, Translation"
        const separator = line.includes('->') ? '->' : line.includes(':') ? ':' : ',';
        const parts = line.split(separator);
        if (parts.length >= 2) {
            const term = parts[0].trim();
            const translation = parts[1].trim();
            if (term && translation) {
                newItems.push({ term, translation });
            }
        }
    });

    // Merge keeping existing ones if not present in new list, OR just append?
    // Let's filter out duplicates from newItems based on existing items
    const filteredNew = newItems.filter(ni => !items.some(ex => ex.term.toLowerCase() === ni.term.toLowerCase()));
    
    setItems([...items, ...filteredNew]);
    setBulkInput('');
    setActiveTab('list');
  };

  const handleSave = () => {
    onUpdate(items);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose}></div>
      
      <div className="relative w-full max-w-lg glass rounded-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-200 flex flex-col max-h-[85vh]">
        
        {/* Header */}
        <div className="p-5 border-b border-white/10 flex justify-between items-center bg-[#0a0e27]/50">
          <h2 className="text-lg font-bold text-white flex items-center gap-2">
            <BookOpen className="w-5 h-5 text-[#ff00ea]" />
            واژه‌نامه اختصاصی (Custom Glossary)
          </h2>
          <button onClick={onClose} className="p-2 hover:bg-white/10 rounded-full transition-colors">
            <X className="w-5 h-5 text-white/60" />
          </button>
        </div>

        {/* Tabs */}
        <div className="flex p-4 pb-0 gap-4 border-b border-white/5">
             <button 
                onClick={() => setActiveTab('list')}
                className={`pb-2 text-sm font-medium transition-colors relative ${activeTab === 'list' ? 'text-[#ff00ea]' : 'text-white/50 hover:text-white'}`}
             >
                لیست کلمات
                {activeTab === 'list' && <div className="absolute bottom-0 left-0 w-full h-0.5 bg-[#ff00ea] rounded-t-full"></div>}
             </button>
             <button 
                onClick={() => setActiveTab('bulk')}
                className={`pb-2 text-sm font-medium transition-colors relative ${activeTab === 'bulk' ? 'text-[#ff00ea]' : 'text-white/50 hover:text-white'}`}
             >
                افزودن گروهی (متن)
                {activeTab === 'bulk' && <div className="absolute bottom-0 left-0 w-full h-0.5 bg-[#ff00ea] rounded-t-full"></div>}
             </button>
        </div>

        <div className="p-5 overflow-y-auto custom-scrollbar flex-1 bg-[#0a0e27]/30">
            
            {activeTab === 'list' && (
                <div className="space-y-4">
                    {/* Add New Input */}
                    <div className="flex gap-2">
                        <div className="flex-1 space-y-1">
                            <input 
                                value={newTerm}
                                onChange={(e) => setNewTerm(e.target.value)}
                                placeholder="واژه اصلی (انگلیسی)"
                                className="w-full bg-[#0a0e27] border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:border-[#ff00ea] focus:outline-none dir-ltr"
                            />
                        </div>
                        <div className="flex-1 space-y-1">
                             <input 
                                value={newTranslation}
                                onChange={(e) => setNewTranslation(e.target.value)}
                                placeholder="ترجمه دلخواه"
                                className="w-full bg-[#0a0e27] border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:border-[#ff00ea] focus:outline-none dir-rtl"
                            />
                        </div>
                        <button 
                            onClick={handleAdd}
                            disabled={!newTerm || !newTranslation}
                            className="bg-[#ff00ea]/20 hover:bg-[#ff00ea]/40 text-[#ff00ea] rounded-lg px-3 flex items-center justify-center transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                        >
                            <Plus className="w-5 h-5" />
                        </button>
                    </div>

                    {/* List */}
                    <div className="space-y-2 mt-4">
                        {items.length === 0 ? (
                            <div className="text-center py-8 text-white/30 text-sm border-2 border-dashed border-white/5 rounded-xl">
                                هنوز واژه‌ای اضافه نشده است.
                            </div>
                        ) : (
                            items.map((item, idx) => (
                                <div key={idx} className="flex items-center justify-between p-3 bg-[#0a0e27] rounded-lg border border-white/10 group hover:border-white/20 transition-all">
                                    <div className="flex items-center gap-3 w-full">
                                        <span className="text-white/90 text-sm font-medium w-1/2 dir-ltr truncate" title={item.term}>{item.term}</span>
                                        <span className="text-white/30">➜</span>
                                        <span className="text-[#ff00ea] text-sm font-medium w-1/2 dir-rtl truncate text-right" title={item.translation}>{item.translation}</span>
                                    </div>
                                    <button 
                                        onClick={() => handleRemove(item.term)}
                                        className="text-white/20 hover:text-red-400 transition-colors p-2"
                                    >
                                        <Trash2 className="w-4 h-4" />
                                    </button>
                                </div>
                            ))
                        )}
                    </div>
                </div>
            )}

            {activeTab === 'bulk' && (
                <div className="space-y-4 h-full flex flex-col">
                    <div className="bg-[#ff00ea]/5 border border-[#ff00ea]/20 rounded-lg p-3 text-xs text-white/70">
                        <p className="font-bold mb-1 text-[#ff00ea]">راهنما:</p>
                        هر خط باید شامل یک واژه و ترجمه آن باشد که با <b>:</b> یا <b>-&gt;</b> جدا شده‌اند.
                        <br/>
                        مثال: <code className="bg-black/30 px-1 rounded text-[#ff00ea]">Jon Snow: جان اسنو</code>
                    </div>
                    <textarea 
                        value={bulkInput}
                        onChange={(e) => setBulkInput(e.target.value)}
                        className="flex-1 w-full bg-[#0a0e27] border border-white/10 rounded-xl p-4 text-sm text-white focus:border-[#ff00ea] focus:outline-none resize-none font-mono min-h-[200px]"
                        placeholder={`Jon Snow: جان اسنو\nHigh Garden: های‌گاردن\n...`}
                    />
                    <button 
                        onClick={handleBulkImport}
                        disabled={!bulkInput.trim()}
                        className="w-full py-2 bg-[#ff00ea]/10 hover:bg-[#ff00ea]/20 text-[#ff00ea] border border-[#ff00ea]/20 rounded-lg flex items-center justify-center gap-2 transition-all"
                    >
                        <FileText className="w-4 h-4" />
                        پردازش و افزودن به لیست
                    </button>
                </div>
            )}
            
        </div>

        <div className="p-5 border-t border-white/10 bg-[#0a0e27]/50">
            <button 
                onClick={handleSave}
                className="w-full py-3 bg-gradient-to-r from-[#ff00ea] to-[#b000ff] text-white font-bold rounded-xl shadow-lg shadow-[#ff00ea]/20 hover:shadow-[#ff00ea]/40 transition-all flex items-center justify-center gap-2"
            >
                <Save className="w-5 h-5" />
                ذخیره واژه‌نامه ({items.length} کلمه)
            </button>
        </div>

      </div>
    </div>
  );
};