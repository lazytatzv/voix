import React, { useState, useRef, useEffect } from 'react';
import { ChevronDown, Check } from 'lucide-react';
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
}

export const CustomSelect: React.FC<CustomSelectProps> = ({
  options,
  value,
  onChange,
  className = '',
  size = 'md',
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement | null>(null);

  const selectedOption = options.find((o) => String(o.value) === String(value)) || options[0];

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

  const paddingCls = size === 'sm' ? 'px-2 py-0.5 text-[11px]' : 'px-3 py-1.5 text-xs';

  return (
    <div ref={dropdownRef} className={`relative inline-block ${className}`}>
      {/* トリガーボタン (100%ダークワークステーション仕様) */}
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className={`flex items-center gap-1.5 bg-[#18191b] hover:bg-[#222427] text-[#e3e3e3] border border-[#2e3135] hover:border-[#3c4043] rounded-lg ${paddingCls} font-medium transition active:scale-95 shadow-xs`}
      >
        {selectedOption?.icon && (
          <div className="w-3.5 h-3.5 rounded-full overflow-hidden bg-black/40 flex-shrink-0">
            <SafeAvatarImg src={selectedOption.icon} alt="" className="w-full h-full object-cover" />
          </div>
        )}
        <span className="truncate max-w-[120px]">{selectedOption?.label}</span>
        <ChevronDown
          className={`w-3 h-3 text-[#8e918f] transition-transform duration-150 ${
            isOpen ? 'rotate-180' : ''
          }`}
        />
      </button>

      {/* ドロップダウンメニュー (絶対に白くならない高コントラストダーク設計) */}
      {isOpen && (
        <div className="absolute left-0 mt-1 w-48 bg-[#18191b] border border-[#2e3135] rounded-xl shadow-2xl py-1 z-50 animate-in fade-in duration-100 max-h-60 overflow-y-auto">
          {options.map((opt) => {
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
        </div>
      )}
    </div>
  );
};
