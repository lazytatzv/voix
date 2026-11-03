import React, { useState, useRef, useEffect } from 'react';
import { ChevronDown, Check } from 'lucide-react';

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
}

export const CustomSelect: React.FC<CustomSelectProps> = ({
  options,
  value,
  onChange,
  className = '',
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

  return (
    <div ref={dropdownRef} className={`relative inline-block ${className}`}>
      {/* トリガーボタン (見やすく洗練されたピルボタン) */}
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-2 bg-[#282a2c] hover:bg-[#333538] text-[#e3e3e3] border border-[#3c4043] rounded-full px-3 py-1 text-xs font-medium transition active:scale-95 shadow-sm"
      >
        {selectedOption?.icon && (
          <div className="w-4 h-4 rounded-full overflow-hidden bg-black/40 flex-shrink-0">
            <img src={selectedOption.icon} alt="" className="w-full h-full object-cover" />
          </div>
        )}
        <span className="truncate max-w-[120px]">{selectedOption?.label}</span>
        <ChevronDown className={`w-3 h-3 text-[#8e918f] transition-transform duration-150 ${isOpen ? 'rotate-180' : ''}`} />
      </button>

      {/* ドロップダウンメニュー (絶対に文字が見える高コントラスト設計) */}
      {isOpen && (
        <div className="absolute left-0 mt-1.5 w-48 bg-[#1e1f20] border border-[#3c4043] rounded-2xl shadow-2xl py-1.5 z-50 overflow-hidden backdrop-blur-xl animate-in fade-in duration-100">
          <div className="max-h-56 overflow-y-auto space-y-0.5 px-1">
            {options.map((option) => {
              const isSelected = String(option.value) === String(value);
              return (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => {
                    onChange(String(option.value));
                    setIsOpen(false);
                  }}
                  className={`w-full flex items-center justify-between px-3 py-2 rounded-xl text-xs font-medium text-left transition ${
                    isSelected
                      ? 'bg-[#004a77] text-[#c2e7ff]'
                      : 'text-[#e3e3e3] hover:bg-[#282a2c] hover:text-white'
                  }`}
                >
                  <div className="flex items-center gap-2 truncate">
                    {option.icon && (
                      <div className="w-5 h-5 rounded-full overflow-hidden bg-black/40 flex-shrink-0 border border-white/10">
                        <img src={option.icon} alt="" className="w-full h-full object-cover" />
                      </div>
                    )}
                    <span className="truncate">{option.label}</span>
                  </div>

                  {isSelected && <Check className="w-3.5 h-3.5 text-[#8ab4f8] flex-shrink-0" />}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};
