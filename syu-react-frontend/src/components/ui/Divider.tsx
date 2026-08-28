

interface DividerProps {
  text?: string;
  className?: string;
}

export default function Divider({ text, className = '' }: DividerProps) {
  if (!text) {
    return (
      <div className={`h-px bg-card-border w-full ${className}`} />
    );
  }

  return (
    <div className={`flex items-center gap-4 shrink-0 ${className}`}>
      <div className="h-px bg-card-border flex-1" />
      <span className="text-[12px] font-semibold text-outline-variant uppercase tracking-[0.05em] font-body">
        {text}
      </span>
      <div className="h-px bg-card-border flex-1" />
    </div>
  );
}
