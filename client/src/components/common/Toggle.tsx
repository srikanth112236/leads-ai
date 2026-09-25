import React from 'react';

interface ToggleProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label?: string;
  description?: string;
  disabled?: boolean;
  size?: 'sm' | 'md';
}

/**
 * App-wide replacement for raw checkboxes (boolean intent).
 * For multi-option checkboxes inside permission grids, keep the input but
 * restyle via this component per row.
 */
const Toggle: React.FC<ToggleProps> = ({
  checked,
  onChange,
  label,
  description,
  disabled = false,
  size = 'md',
}) => {
  const dims = size === 'sm' ? 'w-8 h-[18px]' : 'w-10 h-[22px]';
  const knob = size === 'sm' ? 'w-3.5 h-3.5' : 'w-4 h-4';
  const offset = size === 'sm' ? 'translate-x-[14px]' : 'translate-x-[18px]';

  return (
    <label
      className={`inline-flex items-start gap-2.5 ${disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
    >
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        disabled={disabled}
        onClick={(e) => {
          e.preventDefault();
          onChange(!checked);
        }}
        className={`relative shrink-0 ${dims} rounded-full transition-colors duration-150 focus:outline-none focus:ring-2 focus:ring-indigo-500/40 ${
          checked ? 'bg-indigo-600' : 'bg-slate-300'
        }`}
      >
        <span
          className={`absolute top-[2px] left-[2px] ${knob} rounded-full bg-white shadow transition-transform duration-150 ${
            checked ? offset : 'translate-x-0'
          }`}
        />
      </button>
      {(label || description) && (
        <span className="min-w-0">
          {label && <span className="block text-xs font-semibold text-slate-700 leading-tight">{label}</span>}
          {description && <span className="block text-[11px] text-slate-400 leading-snug mt-0.5">{description}</span>}
        </span>
      )}
    </label>
  );
};

export default Toggle;
