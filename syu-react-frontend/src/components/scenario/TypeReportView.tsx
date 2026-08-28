// src/components/scenario/TypeReportView.tsx
// 테마 완주 시 열리는 최초 1회 보고서의 진입점.
//
// R2에서 화면 내용은 components/report/EmotionProfileReport로 옮겼다.
// 이 파일은 ScenarioTab의 기존 진입 분기(activeView === 'TYPE_REPORT')를
// 그대로 두기 위한 얇은 위임층이다 — 진입 로직(최초 완주 1회)은 유지한다.
//
// 이전 구현이 쓰던 constants/typeReport.ts(최빈 전략별 진단 3종)는
// 함께 폐기했다. 유형 진단은 이제 스트레스 검사 8유형(축 A)이 담당하고
// (STRESS_RESULT_TYPE_DESCRIPTION, 심리학부 검수문), 전략(축 B)은
// 빈도·체감률이라는 사실 위주로만 보여준다.

import type { ScenarioProgressMap } from '../../store/useScenarioStore';
import EmotionProfileReport from '../report/EmotionProfileReport';

interface TypeReportViewProps {
  themeId: string;
  /** 표시용 진행도. 생략하면 보고서가 스토어의 실 진행도를 읽는다 */
  progress?: ScenarioProgressMap;
  onClose: () => void;
}

export default function TypeReportView({ themeId, progress, onClose }: TypeReportViewProps) {
  return (
    <EmotionProfileReport
      themeId={themeId}
      progress={progress}
      onClose={onClose}
      closeLabel="보고서 닫기"
    />
  );
}
