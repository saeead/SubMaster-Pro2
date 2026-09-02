import React, { useEffect, useId, useRef, useState } from 'react';
import { Check, ChevronDown } from 'lucide-react';

export interface ComboboxOption<T extends string> {
  value: T;
  label: string;
  description?: string;
}

interface SettingsComboboxProps<T extends string> {
  label: string;
  value: T;
  options: ComboboxOption<T>[];
  onChange: (value: T) => void;
  description?: string;
}

/** A dependency-free, accessible listbox styled after Tailwind application forms. */
export const SettingsCombobox = <T extends string>({ label, value, options, onChange, description }: SettingsComboboxProps<T>) => {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const listId = useId();
  const selected = options.find(option => option.value === value) ?? options[0];

  useEffect(() => {
    const closeOnOutsideClick = (event: MouseEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', closeOnOutsideClick);
    return () => document.removeEventListener('mousedown', closeOnOutsideClick);
  }, []);

  return <div ref={containerRef} className="space-y-2">
    <label className="block text-sm font-semibold text-text">{label}</label>
    <div className="relative">
      <button
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={listId}
        onClick={() => setOpen(current => !current)}
        className="flex min-h-11 w-full items-center justify-between rounded-lg border border-border bg-surface px-3 py-2 text-right text-sm text-text shadow-sm transition hover:border-primary/60 focus:outline-none focus:ring-2 focus:ring-primary/40"
      >
        <span className="min-w-0">
          <span className="block truncate font-medium">{selected.label}</span>
          {selected.description && <span className="mt-0.5 block truncate text-xs font-normal text-text-muted">{selected.description}</span>}
        </span>
        <ChevronDown className={`mr-3 h-4 w-4 shrink-0 text-text-muted transition-transform ${open ? 'rotate-180' : ''}`} aria-hidden="true" />
      </button>
      {open && <ul id={listId} role="listbox" aria-label={label} className="absolute z-50 mt-2 max-h-64 w-full overflow-auto rounded-lg border border-border bg-[var(--bg-elevated)] p-1 shadow-xl ring-1 ring-black/5">
        {options.map(option => <li key={option.value} role="option" aria-selected={option.value === value}>
          <button
            type="button"
            onClick={() => { onChange(option.value); setOpen(false); }}
            className={`flex w-full items-center justify-between rounded-md px-3 py-2.5 text-right text-sm transition ${option.value === value ? 'bg-primary/15 text-text' : 'text-text-muted hover:bg-surfaceHighlight hover:text-text'}`}
          >
            <span><span className="block font-medium">{option.label}</span>{option.description && <span className="mt-0.5 block text-xs opacity-75">{option.description}</span>}</span>
            {option.value === value && <Check className="h-4 w-4 text-primary" aria-hidden="true" />}
          </button>
        </li>)}
      </ul>}
    </div>
    {description && <p className="text-xs leading-5 text-text-muted">{description}</p>}
  </div>;
};
