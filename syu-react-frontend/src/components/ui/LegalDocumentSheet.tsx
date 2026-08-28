// src/components/ui/LegalDocumentSheet.tsx
// 법무 문서(이용약관 · 개인정보 처리방침) 전문 열람 시트.
//
// 원래 MyPageView 안에 같은 마크업이 두 벌 복제돼 있었다. 동의 게이트가
// 세 번째 사본을 만들 참이라 여기로 뽑았다 — 조항이 길어 스크롤 컨테이너와
// 최대 높이가 얽혀 있는 마크업이고, 사본이 늘수록 백드롭 농도나 카드 폭이
// 조용히 어긋난다(초기화·탈퇴 모달에서 실제로 그랬다).
//
// ui/Modal(포털)을 쓰지 않고 absolute 레이어를 직접 그리는 이유는
// **호출부 기준으로 겹쳐야 하기 때문**이다. 동의 게이트는 그 자체가 포털로
// 띄운 전체 화면 레이어라, 안에서 여는 전문 시트가 다시 포털로 빠져나가면
// 게이트 위에 뜨는 순서를 DOM 순서로 보장할 수 없다.

import Button from './Button';
import { COPY } from '../../constants/copy';
import type { LegalDocument } from '../../constants/legal';

interface LegalDocumentSheetProps {
  /** constants/legal.ts의 TERMS 또는 PRIVACY */
  doc: LegalDocument;
  /** 확인 버튼 · 백드롭 클릭 */
  onClose: () => void;
}

export default function LegalDocumentSheet({ doc, onClose }: LegalDocumentSheetProps) {
  return (
    <div className="absolute inset-0 z-50 flex items-center justify-center px-5">
      <div className="absolute inset-0 bg-scrim-bg-70 backdrop-blur-sm" onClick={onClose} />

      <div className="relative w-full max-w-[350px] bento-card p-6 bg-surface-container space-y-4 animate-scaleIn max-h-[70vh] flex flex-col z-20">
        <h4 className="text-[16px] font-bold text-on-surface shrink-0 font-headline">{doc.title}</h4>
        <div className="text-[11px] text-outline leading-relaxed font-body overflow-y-auto pr-1 flex-1 space-y-3">
          {doc.sections.map((section) => (
            <p key={section.heading} className="whitespace-pre-line">
              {section.heading}
              <br />
              {section.body}
            </p>
          ))}
        </div>
        <Button variant="primary" onClick={onClose} className="w-full shrink-0">
          {COPY.common.confirm}
        </Button>
      </div>
    </div>
  );
}
