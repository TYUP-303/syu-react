// src/api/scenarioMockData.ts

// 4영역 기반 시나리오 구조를 위한 타입 정의

// 에필로그 타입은 파서(utils/scenarioEpilogueCsvParser)가 소유한다 — 파싱
// 결과가 그대로 화면에 흐르므로 두 곳에 같은 모양을 적어 두면 어느 한쪽만
// 고쳐질 때 조용히 어긋난다. 타입 전용 import라 빌드 결과에는 남지 않는다.
import type { EpilogueEpisode } from '../utils/scenarioEpilogueCsvParser';

export type { EpilogueEpisode, EpilogueScene } from '../utils/scenarioEpilogueCsvParser';

export interface SceneData {
  type: string;
  text: string;
  bg: string;
  chars: string[];
}

export interface ScenarioEntry {
  no: string;
  domain: string;
  reactionType: string;
  title: string;
  scenes: SceneData[];
}

export interface AngelStrategy {
  name: string;      // 요정 이름
  strategy: string;  // 한 줄 전략 문구
  detail: string;    // 요법 상세 설명
  feedback: string;  // 선택 후 실행 반응 대사
}

export interface EpisodeData {
  id: string;            // 예: workplace-ep1
  episodeNumber: number; // 1 ~ 10
  title: string;
  /**
   * 첫 장면 내레이션 **전문**. 이름이 요약이지만 잘려 있지 않다 (2026-08-27).
   *
   * 자르는 자리를 화면으로 옮긴 결과다 — 목록 카드는 접혀 있을 때 첫 문장만,
   * 선택해 펼치면 전문을 보여준다(utils/episodeSummary). 스토어가 미리
   * 잘라 두면 펼칠 원문이 남지 않는다.
   */
  summary: string;
  scenario: ScenarioEntry;
  angels: {
    accept: AngelStrategy;
    reappraisal: AngelStrategy;
    refocus: AngelStrategy;
  };
  reasons: {
    helpful: string[];
    unhelpful: string[];
  };
}

export interface ThemeCategory {
  id: string; // workplace, job-prep, relationship, daily
  title: string;
  description: string;
  icon: string;
  episodes: EpisodeData[];
  /**
   * 이 영역의 **11번째 카드**로 서는 마무리 장면 (2026-08-26).
   *
   * episodes에 넣지 않은 이유가 이 필드의 존재 이유다. 에필로그는 요정·전략·
   * 평가가 없고 진행 기록도 `scenarios` 맵이 아니라 `users/{uid}.epilogues`에
   * 따로 남는다. episodes에 섞으면 영역 완주 판정(summarizeThemeProgress)의
   * 분모가 10에서 11로 늘어 "10편을 다 했는데 완주가 아닌" 상태가 생기고,
   * 엔딩 해금·앨범 진행도·핵심 요인 Top3까지 한꺼번에 어긋난다.
   *
   * 원고가 없는 영역에서는 undefined다 — 카드 자체를 그리지 않는다.
   */
  epilogue?: EpilogueEpisode;
}
