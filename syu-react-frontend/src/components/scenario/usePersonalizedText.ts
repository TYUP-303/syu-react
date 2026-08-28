// src/components/scenario/usePersonalizedText.ts
// 시나리오 원문(CSV)이 화면에 닿기 직전 주인공 이름을 갈아 끼우는 단일 관문.
//
// 치환 규칙 자체는 utils/personalizeScenarioText(순수 함수)가 갖고, 이 훅은
// **현재 닉네임을 어디서 읽을지**만 정한다. 닉네임을 프롭으로 흘리지 않는 것은
// 의도적이다 — CSV 텍스트를 그리는 컴포넌트가 늘어날 때마다 중간 컴포넌트에
// 프롭을 뚫어야 하면 언젠가 한 곳을 빠뜨린다.
//
// 스토어를 구독하므로 마이페이지에서 닉네임을 바꾸면 다음 렌더에 곧바로
// 반영된다. 치환 결과를 파서·스토어에 저장하지 않는 이유가 이것이다.
//
// 적용 지점 (CSV 유래 텍스트가 화면에 닿는 곳 전부):
//   - VisualNovelPlayer       … 상단 바의 에피소드 타이틀
//   - player/DialogueBox      … SITUATION 단계 상황 프로즈
//   - EpisodeListView         … 에피소드 타이틀 + 첫 장면에서 잘라낸 요약
//   - player/AngelDetailPanel … 요정 조언의 한 줄 요약 · 상세 본문
//   - player/StrategyApplyPanel … 전략 실행 후 반응 대사
//   - player/EvaluationPanel  … 도움/비도움 요인 선택지 (표시 문구만)
//
// 뒤의 세 곳은 2026-08-12(bf2e5b5)에 요정 조언·선택지가 scenario_angels.csv로
// 분리되면서 합류했다. 그 전에는 상수 한 벌을 120편이 공유해 '백설'이 나올 수
// 없었고, 이 주석도 "요정 조언은 상수라서 치환할 것이 없다"고 적혀 있었다 —
// 원고가 시트에서 들어오는 지금은 반대로 치환이 반드시 필요하다.
//
// 영역 이름(직장·취업준비…)과 UI 문구(constants/copy)는 여전히 상수다.
//
// ⚠️ 화면에 찍는 문자열에만 건다. 저장·집계에 쓰이는 값(평가 선택지 문구가
// 그렇다)은 원문 그대로 넘겨야 사용자마다 다른 항목으로 갈리지 않는다.

import { useCallback } from 'react';
import { useCharacterStore } from '../../store/useCharacterStore';
import { personalizeScenarioText } from '../../utils/personalizeScenarioText';

/** 시나리오 텍스트를 현재 닉네임 기준으로 치환하는 함수를 돌려준다. */
export function usePersonalizedText() {
  const nickname = useCharacterStore((state) => state.character?.nickname);

  return useCallback(
    (text: string) => personalizeScenarioText(text, nickname),
    [nickname]
  );
}
