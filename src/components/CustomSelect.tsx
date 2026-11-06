import React, { useState, useRef, useEffect } from 'react';
import { ChevronDown, Check, Search } from 'lucide-react';
import { SafeAvatarImg } from './SafeAvatarImg';

export interface SelectOption {
  value: string | number;
  label: string;
  icon?: string;
  badge?: string;
}

interface CustomSelectProps {
  options: SelectOption[];
  value: string | number;
  onChange: (value: string) => void;
  className?: string;
  size?: 'sm' | 'md';
  /** Show a filter box when the list is long (e.g. voice styles). */
  searchable?: boolean;
  /** Tailwind width class for the dropdown panel. */
  menuWidthClass?: string;
  placeholder?: string;
  /** Stretch the trigger to the wrapper width. */
  fullWidth?: boolean;
}

export const CustomSelect: React.FC<CustomSelectProps> = ({
  options,
  value,
  onChange,
  className = '',
  size = 'md',
  searchable = false,
  menuWidthClass = 'w-48',
  placeholder = 'No matches',
  fullWidth = false,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState('');
  const dropdownRef = useRef<HTMLDivElement | null>(null);
  const searchRef = useRef<HTMLInputElement | null>(null);

  const selectedOption = options.find((o) => String(o.value) === String(value)) || options[0];
  const normalizedQuery = query.trim().toLowerCase();
  const visibleOptions = normalizedQuery
    ? options.filter((option) => option.label.toLowerCase().includes(normalizedQuery))
    : options;

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen]);

  useEffect(() => {
    if (isOpen && searchable) {
      setQuery('');
      // Let the dropdown mount before focusing the filter field.
      window.setTimeout(() => searchRef.current?.focus(), 0);
    }
  }, [isOpen, searchable]);

  const paddingCls = size === 'sm' ? 'px-2 py-0.5 text-[11px]' : 'px-3 py-1.5 text-xs';

  return (
    <div ref={dropdownRef} className={`relative inline-block ${className}`}>
      {/* Trigger button */}
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className={`flex items-center gap-1.5 bg-[#18191b] hover:bg-[#222427] text-[#e3e3e3] border border-[#2e3135] hover:border-[#3c4043] rounded-lg ${paddingCls} font-medium transition active:scale-95 shadow-xs ${
          fullWidth ? 'w-full justify-between' : ''
        }`}
      >
        {selectedOption?.icon && (
          <div className="w-3.5 h-3.5 rounded-full overflow-hidden bg-black/40 flex-shrink-0">
            <SafeAvatarImg src={selectedOption.icon} alt="" className="w-full h-full object-cover" />
          </div>
        )}
        <span className={`truncate ${fullWidth ? 'flex-1 min-w-0 text-left' : 'max-w-[120px]'}`}>
          {selectedOption?.label}
        </span>
        <ChevronDown
          className={`w-3 h-3 text-[#8e918f] transition-transform duration-150 ${
            isOpen ? 'rotate-180' : ''
          }`}
        />
      </button>

      {/* Dropdown Menu */}
      {isOpen && (
        <div
          className={`absolute left-0 mt-1 ${menuWidthClass} bg-[#18191b] border border-[#2e3135] rounded-xl shadow-2xl py-1 z-50 animate-in fade-in duration-100 max-h-72 overflow-y-auto`}
        >
          {searchable && (
            <div className="sticky top-0 z-10 px-2 pb-1.5 pt-1 bg-[#18191b]">
              <div className="flex items-center gap-1.5 px-2 py-1 rounded-md bg-[#101113] border border-[#2e3135]">
                <Search className="w-3 h-3 text-[#8e918f] flex-shrink-0" />
                <input
                  ref={searchRef}
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' && visibleOptions.length > 0) {
                      onChange(String(visibleOptions[0].value));
                      setIsOpen(false);
                    }
                    if (event.key === 'Escape') setIsOpen(false);
                  }}
                  placeholder="Search voices..."
                  className="w-full bg-transparent text-xs text-[#e3e3e3] placeholder:text-[#6f7377] outline-none"
                />
              </div>
            </div>
          )}
          {visibleOptions.map((opt) => {
            const isSelected = String(opt.value) === String(value);
            return (
              <button
                key={String(opt.value)}
                type="button"
                onClick={() => {
                  onChange(String(opt.value));
                  setIsOpen(false);
                }}
                className={`w-full flex items-center justify-between px-3 py-1.5 text-xs text-left transition ${
                  isSelected
                    ? 'bg-[#22252a] text-[#8ab4f8] font-semibold'
                    : 'text-[#c4c7c5] hover:bg-[#202124] hover:text-white'
                }`}
              >
                <div className="flex items-center gap-2 truncate">
                  {opt.icon && (
                    <div className="w-4 h-4 rounded-full overflow-hidden bg-black/30 flex-shrink-0">
                      <SafeAvatarImg src={opt.icon} alt="" className="w-full h-full object-cover" />
                    </div>
                  )}
                  <span className="truncate">{opt.label}</span>
                </div>
                {isSelected && <Check className="w-3.5 h-3.5 text-[#8ab4f8] flex-shrink-0" />}
              </button>
            );
          })}
          {visibleOptions.length === 0 && (
            <div className="px-3 py-2 text-xs text-[#8e918f]">{placeholder}</div>
          )}
        </div>
      )}
    </div>
  );
};
