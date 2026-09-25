import React, { useState, useRef, useEffect, useMemo } from 'react';
import type { SelectOption } from './CustomSelect';

interface MultiSelectProps {
  label?: string;
  options: SelectOption[];
  value: string[];
  onChange: (value: string[]) => void;
  placeholder?: string;
  disabled?: boolean;
  error?: string;
  className?: string;
  searchable?: boolean;
}

/**
 * Searchable multi-select with chips + select-all/clear.
 * Visual twin of CustomSelect (single) – same trigger, menu and radius.
 */
const MultiSelect: React.FC<MultiSelectProps> = ({
  label,
  options,
  value,
  onChange,
  placeholder = 'Select options…',
  disabled = false,
  error,
  className = '',
  searchable = true,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [search, setSearch] = useState('');
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const selectedSet = useMemo(() => new Set((value || []).map(String)), [value]);
  const selectedOptions = useMemo(
    () => options.filter((o) => selectedSet.has(String(o.value))),
    [options, selectedSet],
  );

  const filteredOptions = useMemo(() => {
    if (!search.trim()) return options;
    const lower = search.toLowerCase();
    return options.filter(
      (opt) =>
        opt.label.toLowerCase().includes(lower) ||
        (opt.subLabel && opt.subLabel.toLowerCase().includes(lower)) ||
        opt.value.toLowerCase().includes(lower),
    );
  }, [options, search]);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
        setSearch('');
      }
    };
    if (isOpen) document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isOpen]);

  useEffect(() => {
    if (isOpen && searchable && inputRef.current) inputRef.current.focus();
  }, [isOpen, searchable]);

  const toggle = (val: string) => {
    const v = String(val);
    onChange(selectedSet.has(v) ? (value || []).filter((x) => String(x) !== v) : [...(value || []), v]);
  };

  const selectAll = () => onChange(filteredOptions.map((o) => String(o.value)));

  return (
    <div className={`relative mb-3 ${className}`} ref={containerRef}>
      {label && (
        <label className="block text-xs font-semibold text-slate-700 mb-1">
          {label}
          {selectedOptions.length > 0 && (
            <span className="ml-1.5 text-[10px] font-bold text-indigo-700 bg-indigo-50 border border-indigo-200 rounded-full px-1.5 py-px">
              {selectedOptions.length}
            </span>
          )}
        </label>
      )}

      <button
        type="button"
        disabled={disabled}
        onClick={() => setIsOpen(!isOpen)}
        className={`w-full text-left flex items-center justify-between rounded-lg border transition-all duration-150 select-none px-3 py-2 text-sm ${
          disabled
            ? 'bg-slate-100 text-slate-400 border-slate-200 cursor-not-allowed'
            : error
            ? 'border-rose-400 bg-rose-50/20 text-slate-800'
            : isOpen
            ? 'border-indigo-500 ring-2 ring-indigo-500/20 bg-white text-slate-900 shadow-sm'
            : 'border-slate-300 bg-white hover:border-slate-400 text-slate-800'
        }`}
      >
        <span className="flex items-center gap-1.5 truncate flex-1 min-w-0">
          {selectedOptions.length === 0 ? (
            <span className="text-slate-400 truncate">{placeholder}</span>
          ) : (
            <>
              <span className="truncate font-medium">
                {selectedOptions.slice(0, 2).map((o) => o.label).join(', ')}
                {selectedOptions.length > 2 ? ` +${selectedOptions.length - 2} more` : ''}
              </span>
              {selectedOptions.length > 0 && (
                <span
                  role="button"
                  tabIndex={0}
                  onClick={(e) => { e.stopPropagation(); onChange([]); }}
                  onKeyDown={(e) => { if (e.key === 'Enter') { e.stopPropagation(); onChange([]); } }}
                  className="shrink-0 text-slate-400 hover:text-rose-600 font-bold px-1"
                  title="Clear all"
                >
                  ×
                </span>
              )}
            </>
          )}
        </span>
        <svg
          className={`w-4 h-4 text-slate-400 shrink-0 ml-2 transition-transform duration-200 ${isOpen ? 'rotate-180 text-indigo-600' : ''}`}
          fill="none" viewBox="0 0 24 24" stroke="currentColor"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {isOpen && (
        <div className="absolute z-50 mt-1 w-full min-w-[200px] bg-white rounded-lg shadow-xl border border-slate-200 overflow-hidden">
          {searchable && (
            <div className="p-2 border-b border-slate-100 bg-slate-50/50">
              <div className="relative">
                <input
                  ref={inputRef}
                  type="text"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search options..."
                  className="w-full text-xs px-2.5 py-1.5 pl-8 border border-slate-200 rounded-md bg-white focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
                />
                <svg className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-2.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
              </div>
            </div>
          )}

          <div className="flex items-center justify-between px-3 py-1.5 border-b border-slate-100 bg-slate-50/50">
            <button type="button" onClick={selectAll} className="text-[11px] font-semibold text-indigo-600 hover:text-indigo-800">
              Select all
            </button>
            <button type="button" onClick={() => onChange([])} className="text-[11px] font-semibold text-slate-500 hover:text-slate-700">
              Clear
            </button>
          </div>

          <div className="max-h-56 overflow-y-auto py-1 divide-y divide-slate-50">
            {filteredOptions.length === 0 ? (
              <div className="px-3 py-3 text-xs text-slate-400 text-center">No options found</div>
            ) : (
              filteredOptions.map((opt) => {
                const checked = selectedSet.has(String(opt.value));
                return (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => toggle(opt.value)}
                    className={`w-full text-left px-3 py-2 flex items-center gap-2.5 text-xs transition-colors ${
                      checked ? 'bg-indigo-50/60 text-indigo-900 font-semibold' : 'text-slate-700 hover:bg-slate-50'
                    }`}
                  >
                    <span className={`w-4 h-4 rounded border flex items-center justify-center shrink-0 transition-colors ${checked ? 'bg-indigo-600 border-indigo-600' : 'bg-white border-slate-300'}`}>
                      {checked && (
                        <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                        </svg>
                      )}
                    </span>
                    <span className="truncate flex-1">
                      <span className="block truncate leading-snug">{opt.label}</span>
                      {opt.subLabel && <span className="block text-[11px] text-slate-400 font-normal truncate">{opt.subLabel}</span>}
                    </span>
                    {opt.badge && (
                      <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium shrink-0 ${opt.badgeColor || 'bg-slate-100 text-slate-600'}`}>
                        {opt.badge}
                      </span>
                    )}
                  </button>
                );
              })
            )}
          </div>
        </div>
      )}

      {error && <p className="text-rose-500 text-xs mt-1">{error}</p>}
    </div>
  );
};

export default MultiSelect;
