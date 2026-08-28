import React from 'react';

interface InputFieldProps extends React.InputHTMLAttributes<HTMLInputElement> {
  id: string;
  label?: string;
  icon?: string;
  labelAction?: React.ReactNode;
  error?: string;
  showToggle?: boolean;
  onToggleShow?: () => void;
  isPasswordShown?: boolean;
}

export default function InputField({
  id,
  label,
  icon,
  labelAction,
  error,
  showToggle,
  onToggleShow,
  isPasswordShown,
  className = '',
  type,
  ...props
}: InputFieldProps) {
  const currentType = type === 'password' ? (isPasswordShown ? 'text' : 'password') : type;

  return (
    <div className="flex flex-col gap-2">
      {/* 라벨 & 액션 영역 */}
      {(label || labelAction) && (
        <div className="flex justify-between items-center ml-1">
          {label && (
            <label
              className="text-[12px] font-semibold text-outline uppercase tracking-[0.05em] font-body"
              htmlFor={id}
            >
              {label}
            </label>
          )}
          {labelAction}
        </div>
      )}

      {/* 입력 필드 영역 */}
      <div className={`input-field relative flex items-center h-14 ${error ? 'border-error focus-within:border-error focus-within:shadow-[0_0_0_2px_var(--color-error-glow-20)]' : ''}`}>
        {icon && (
          <span
            className="material-symbols-outlined absolute left-3 text-outline-variant text-[20px] select-none"
            style={{ fontVariationSettings: "'FILL' 0" }}
          >
            {icon}
          </span>
        )}
        <input
          id={id}
          type={currentType}
          className={`
            w-full h-full bg-transparent border-none outline-none focus:ring-0
            text-on-surface text-[16px] font-body
            placeholder:text-outline-variant
            ${icon ? 'pl-10' : 'pl-4'}
            ${showToggle ? 'pr-10' : 'pr-4'}
            ${className}
          `}
          {...props}
        />
        {showToggle && (
          <button
            type="button"
            className="absolute right-3 text-outline-variant hover:text-on-surface transition-colors"
            onClick={onToggleShow}
            aria-label={isPasswordShown ? '비밀번호 숨기기' : '비밀번호 보기'}
          >
            <span
              className="material-symbols-outlined text-[20px]"
              style={{ fontVariationSettings: "'FILL' 0" }}
            >
              {isPasswordShown ? 'visibility_off' : 'visibility'}
            </span>
          </button>
        )}
      </div>

      {/* 에러 메시지 영역 */}
      {error && (
        <p className="text-[12px] text-error ml-1 font-body">
          {error}
        </p>
      )}
    </div>
  );
}
