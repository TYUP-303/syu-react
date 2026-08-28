import { useEffect, useState, useRef } from 'react';

interface TypingTextProps {
  text: string;
  speed?: number;
  isSkipped: boolean;
  onComplete: () => void;
}

export default function TypingText({
  text,
  speed = 30,
  isSkipped,
  onComplete,
}: TypingTextProps) {
  const [displayedText, setDisplayedText] = useState('');
  
  // onComplete 레퍼런스 변화로 인한 타이머 재시작을 방지하기 위해 useRef 사용
  const onCompleteRef = useRef(onComplete);
  useEffect(() => {
    onCompleteRef.current = onComplete;
  }, [onComplete]);

  useEffect(() => {
    // 텍스트가 바뀔 때 표시 상태 초기화
    setDisplayedText('');
    
    if (isSkipped) {
      setDisplayedText(text);
      onCompleteRef.current();
      return;
    }

    if (!text) {
      onCompleteRef.current();
      return;
    }

    let index = 0;
    const timer = setInterval(() => {
      // prev에 덧붙이지 않고 정확한 slice 길이로 덮어씌워 중복 및 꼬임 전면 차단
      setDisplayedText(text.slice(0, index + 1));
      index++;

      if (index >= text.length) {
        clearInterval(timer);
        onCompleteRef.current();
      }
    }, speed);

    return () => clearInterval(timer);
  }, [text, speed, isSkipped]); // onComplete는 의존성에서 안전하게 제외

  return (
    <p className="block w-full font-body text-[15px] leading-relaxed text-on-surface whitespace-pre-wrap break-words">
      {displayedText}
    </p>
  );
}
