import React, { useEffect, useId, useRef, useState } from 'react';
import { Check, ChevronDown } from 'lucide-react';

export interface ComboboxOption<T extends string> {
  value: T;
  label: string;
  description?: string;
  badge?: string;
}

interface SettingsComboboxProps<T extends string> {
  label: string;
  value: T;
  options: ComboboxOption<T>[];
  onChange: (value: T) => void;
  description?: string;
  icon?: React.ReactNode;
}

/** An ultra-professional, accessible listbox styled for modern AI studio applications. */
export const SettingsCombobox = <T extends string>({
  label,
  value,
  options,
  onChange,
  description,
  icon
}: SettingsComboboxProps<T>) => {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const listId = useId();
  const selected = options.find(option => option.value === value) ?? options[0];

  useEffect(() => {
    const closeOnOutsideClick = (event: MouseEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', closeOnOutsideClick);
    return () => document.removeEventListener('mousedown', closeOnOutsideClick);
  }, []);

  return (
    <div ref={containerRef} className="space-y-1.5">
      <div className="flex items-center justify-between px-0.5">
        <label className="flex items-center gap-1.5 text-xs font-bold tracking-wide text-text">
          {icon && <span className="text-primary">{icon}</span>}
          <span>{label}</span>
        </label>
        {selected?.badge && (
          <span className="rounded-md border border-primary/25 bg-primary/10 px-1.5 py-0.5 font-mono text-[10px] font-semibold text-primary">
            {selected.badge}
          </span>
        )}
      </div>

      <div className="relative">
        <button
          type="button"
          aria-haspopup="listbox"
          aria-expanded={open}
          aria-controls={listId}
          onClick={() => setOpen(current => !current)}
          className={`group flex min-h-[46px] w-full items-center justify-between gap-2 rounded-xl border bg-surface/60 px-3.5 py-2 text-right text-sm text-text shadow-sm backdrop-blur-md transition-all duration-200 hover:border-primary/50 hover:bg-surface/90 hover:shadow focus:outline-none focus:ring-2 focus:ring-primary/30 active:scale-[0.995] ${
            open ? 'border-primary ring-2 ring-primary/20 bg-surface' : 'border-[#1e2a5e]'
          }`}
        >
          <div className="min-w-0 flex-1">
            <span className="block truncate text-sm font-semibold text-text">
              {selected?.label}
            </span>
            {selected?.description && (
              <span className="mt-0.5 block truncate text-[11px] text-text-muted">
                {selected.description}
              </span>
            )}
          </div>
          <ChevronDown
            className={`mr-2 h-4 w-4 shrink-0 text-text-muted transition-transform duration-200 group-hover:text-primary ${
              open ? 'rotate-180 text-primary' : ''
            }`}
            aria-hidden="true"
          />
        </button>

        {open && (
          <ul
            id={listId}
            role="listbox"
            aria-label={label}
            className="absolute z-50 mt-1.5 max-h-64 w-full overflow-y-auto rounded-xl border border-[#1e2a5e] bg-[var(--bg-elevated)] p-1.5 shadow-2xl ring-1 ring-black/10 backdrop-blur-xl transition-all animate-in fade-in zoom-in-95 duration-150"
          >
            {options.map(option => {
              const isSelected = option.value === value;
              return (
                <li key={option.value} role="option" aria-selected={isSelected}>
                  <button
                    type="button"
                    onClick={() => {
                      onChange(option.value);
                      setOpen(false);
                    }}
                    className={`group/opt flex w-full items-center justify-between gap-2.5 rounded-lg px-3 py-2.5 text-right text-sm transition-all duration-150 ${
                      isSelected
                        ? 'border border-primary/30 bg-primary/15 font-semibold text-text shadow-xs'
                        : 'text-text-muted hover:bg-surfaceHighlight hover:text-text'
                    }`}
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className={`block truncate ${isSelected ? 'text-text font-bold' : ''}`}>
                          {option.label}
                        </span>
                        {option.badge && (
                          <span
                            className={`rounded px-1.5 py-0.2 font-mono text-[10px] ${
                              isSelected
                                ? 'bg-primary/25 text-primary font-bold'
                                : 'bg-surfaceHighlight text-text-muted group-hover/opt:text-text'
                            }`}
                          >
                            {option.badge}
                          </span>
                        )}
                      </div>
                      {option.description && (
                        <span className="mt-0.5 block text-[11px] leading-tight text-text-muted/80">
                          {option.description}
                        </span>
                      )}
                    </div>
                    {isSelected && (
                      <Check className="h-4 w-4 shrink-0 text-primary stroke-[2.5]" aria-hidden="true" />
                    )}
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {description && (
        <p className="px-1 text-[11px] leading-relaxed text-text-muted">
          {description}
        </p>
      )}
    </div>
  );
};
