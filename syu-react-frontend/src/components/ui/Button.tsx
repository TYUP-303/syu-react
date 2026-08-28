import React from 'react';
import { Loader2 } from 'lucide-react';

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'outline' | 'ghost' | 'danger';
  loading?: boolean;
  icon?: string; // Material symbol icon name
  children: React.ReactNode;
}

export default function Button({
  variant = 'primary',
  loading = false,
  icon,
  children,
  className = '',
  disabled,
  ...props
}: ButtonProps) {
  const baseStyle = "relative flex items-center justify-center gap-2 rounded-control font-semibold transition-all duration-200 active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed disabled:active:scale-100 font-headline";
  
  const variants = {
    // Stitch 스펙: "Primary buttons use a solid Vibrant Azure fill with white text"
    primary: "w-full bg-primary hover:bg-primary-container text-on-primary py-3 text-[18px]",
    outline: "w-full border border-card-border hover:border-primary/50 bg-card-bg text-on-surface py-3 text-[16px]",
    ghost: "text-primary hover:text-primary-container transition-colors text-[16px] font-bold font-body active:scale-100",
    // 되돌릴 수 없는 동작 전용. 호출부에서 `variant="primary" className="bg-error …"`로
    // 덮어쓰지 말 것 — 같은 속성(background-color)의 유틸리티끼리는 클래스 나열
    // 순서가 아니라 스타일시트 순서로 승자가 갈려 결과가 불안정하다.
    danger: "w-full bg-error hover:bg-error/90 text-on-error py-3 text-[18px]"
  };

  return (
    <button
      className={`${baseStyle} ${variants[variant]} ${className}`}
      disabled={disabled || loading}
      {...props}
    >
      {loading ? (
        <Loader2 size={20} className="animate-spin" />
      ) : (
        <>
          {children}
          {icon && (
            <span className="material-symbols-outlined text-[20px]">{icon}</span>
          )}
        </>
      )}
    </button>
  );
}
