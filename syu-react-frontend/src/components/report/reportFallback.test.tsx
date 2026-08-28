// src/components/report/reportFallback.test.tsx
// @vitest-environment jsdom
//
// 보고서·회복일기 화면의 **폴백 렌더** 테스트.
//
// 플랜 완료 기준 "기존 진행 데이터(레거시 포함)로 크래시 없음 —
// resultType 부재·빈 progress 폴백 확인"을 자동화한 것이다. 서비스가
// 미출시라 레거시 stressResult(resultType 없음)를 마이그레이션하지
// 않기로 했으므로(공유 계약 2번), 그 데이터로도 화면이 떠야 한다.
//
// 레이아웃이 아니라 "무엇을 감추는가"를 고정한다: 유형 라벨·설명문은
// resultType이 있을 때만 나오고, 기록이 0건이면 수치를 지어내지 않는다.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';

vi.mock('../../api/env', () => ({ IS_MOCK_MODE: true }));
vi.mock('../../api/firebase', () => ({ db: {} }));

import type { EpisodeData, ThemeCategory } from '../../api/scenarioMockData';
import type { EpisodeProgress } from '../../store/useScenarioStore';
import { useCharacterStore } from '../../store/useCharacterStore';
import { useScenarioStore } from '../../store/useScenarioStore';
import { useTestStore } from '../../store/useTestStore';
import { STRESS_RESULT_TYPE_LABEL } from '../../constants/reactionType';
import EmotionProfileReport from './EmotionProfileReport';
import ComprehensiveInsightReport from './ComprehensiveInsightReport';
import DiaryListView from '../home/DiaryListView';

function makeTheme(id: string, title: string, count = 10): ThemeCategory {
  return {
    id,
    title,
    description: `${title} 설명`,
    icon: 'work',
    episodes: Array.from({ length: count }, (_, i) => ({
      id: `${id}-ep${i + 1}`,
      episodeNumber: i + 1,
    })) as EpisodeData[],
  };
}

const THEMES = [makeTheme('workplace', '직장'), makeTheme('daily', '일상')];

function prog(
  selectedAngel: EpisodeProgress['selectedAngel'],
  wasHelpful: boolean,
): EpisodeProgress {
  return {
    cleared: true,
    selectedAngel,
    wasHelpful,
    selectedReason: '상황을 객관적으로 볼 수 있었어요',
    updatedAt: '2026-08-01T00:00:00.000Z',
  };
}

function setStores(opts: {
  progress?: Record<string, EpisodeProgress>;
  stressResult?: unknown;
  adhdResult?: unknown;
}) {
  useScenarioStore.setState({ themes: THEMES, progress: opts.progress ?? {} });
  useTestStore.setState({
    adhdResult: (opts.adhdResult ?? null) as never,
    stressResult: (opts.stressResult ?? null) as never,
  });
}

beforeEach(() => {
  setStores({});
  useCharacterStore.setState({ character: null });
});
afterEach(cleanup);

describe('EmotionProfileReport — 폴백', () => {
  it('검사·진행 기록이 하나도 없어도 크래시 없이 렌더된다', () => {
    render(<EmotionProfileReport themeId="workplace" onClose={() => {}} />);
    expect(screen.getByText('나의 정서 대응 프로필')).toBeInTheDocument();
  });

  it('resultType이 없는 레거시 stressResult로도 렌더되고, 유형 라벨을 숨긴다', () => {
    setStores({
      // 레거시 형태 — counts/resultType 없이 score만 있던 시절의 데이터
      stressResult: { testType: 'stress', answers: {}, score: 7, completedAt: '2026-07-01' },
      adhdResult: { testType: 'adhd', answers: {}, score: 58, completedAt: '2026-07-01' },
    });
    render(<EmotionProfileReport themeId="workplace" onClose={() => {}} />);

    expect(screen.getByText('나의 정서 대응 프로필')).toBeInTheDocument();
    // 8유형 라벨은 어느 것도 나오면 안 된다
    Object.values(STRESS_RESULT_TYPE_LABEL).forEach((label) => {
      expect(screen.queryByText(label)).not.toBeInTheDocument();
    });
  });

  it('resultType이 있으면 유형 라벨을 노출한다', () => {
    setStores({
      stressResult: {
        testType: 'stress',
        answers: {},
        score: 7,
        completedAt: '2026-07-01',
        counts: { cognitive: 3, emotional: 2, behavioral: 2 },
        resultType: 'cognitive',
      },
      adhdResult: { testType: 'adhd', answers: {}, score: 58, completedAt: '2026-07-01' },
    });
    render(<EmotionProfileReport themeId="workplace" onClose={() => {}} />);
    expect(screen.getAllByText('인지형').length).toBeGreaterThan(0);
  });

  it('없는 themeId여도 크래시 없이 렌더된다', () => {
    render(<EmotionProfileReport themeId="does-not-exist" onClose={() => {}} />);
    expect(screen.getByText('나의 정서 대응 프로필')).toBeInTheDocument();
  });

  it('진행 기록이 있으면 요정명 표기로 빈도를 보여준다', () => {
    setStores({
      progress: { 'workplace-ep1': prog('reappraisal', true), 'workplace-ep2': prog('reappraisal', false) },
    });
    render(<EmotionProfileReport themeId="workplace" onClose={() => {}} />);
    expect(screen.getAllByText(/포코\(재평가\)/).length).toBeGreaterThan(0);
  });
});

describe('ComprehensiveInsightReport — 폴백', () => {
  it('빈 progress로도 크래시 없이 렌더된다', () => {
    render(<ComprehensiveInsightReport onBack={() => {}} onGoEnding={() => {}} />);
    expect(screen.getByText('나의 종합 인사이트')).toBeInTheDocument();
  });

  it('엔딩 연결(NRQ-0073)이 유지된다', () => {
    render(<ComprehensiveInsightReport onBack={() => {}} onGoEnding={() => {}} />);
    expect(screen.getByText('최종 엔딩 보러가기')).toBeInTheDocument();
  });
});

describe('DiaryListView — 폴백과 앨범 분모', () => {
  const noop = () => {};

  it('완주 기록이 0건이면 잠금 화면을 보여준다', () => {
    render(
      <DiaryListView
        themes={THEMES}
        progress={{}}
        onSelectDiary={noop}
        onGoRecentSession={noop}
        onGoScenario={noop}
      />,
    );
    expect(screen.getByText('아직 첫 기록이 열리지 않았어요')).toBeInTheDocument();
  });

  it('테마 목록이 비어 있어도 크래시하지 않는다', () => {
    useScenarioStore.setState({ themes: [], progress: {} });
    render(
      <DiaryListView
        themes={[]}
        progress={{}}
        onSelectDiary={noop}
        onGoRecentSession={noop}
        onGoScenario={noop}
      />,
    );
    expect(screen.getByText('아직 첫 기록이 열리지 않았어요')).toBeInTheDocument();
  });

  it('앨범 게이지 분모는 영역 수다 — 종합 인사이트를 넣지 않는다 (교정 3번)', () => {
    const progress: Record<string, EpisodeProgress> = {};
    for (let i = 1; i <= 10; i += 1) progress[`workplace-ep${i}`] = prog('accept', true);
    render(
      <DiaryListView
        themes={THEMES}
        progress={progress}
        onSelectDiary={noop}
        onGoRecentSession={noop}
        onGoScenario={noop}
      />,
    );
    // 영역 2개 중 1개 완주 → "회복 앨범 1/2" (1/3이 되면 종합을 분모에 넣은 것)
    expect(screen.getByText(/회복 앨범 1\/2/)).toBeInTheDocument();
  });

  it('잠금 상태의 종합 인사이트는 실명을 노출하지 않는다 (마스킹 유지)', () => {
    const progress: Record<string, EpisodeProgress> = {};
    for (let i = 1; i <= 10; i += 1) progress[`workplace-ep${i}`] = prog('accept', true);
    render(
      <DiaryListView
        themes={THEMES}
        progress={progress}
        onSelectDiary={noop}
        onGoRecentSession={noop}
        onGoScenario={noop}
      />,
    );
    expect(screen.queryByText('종합 인사이트')).not.toBeInTheDocument();
    // 마스킹 문자는 ●다. '??'는 인코딩 깨짐으로 오인되고 글자 수도 실명과
    // 맞지 않아 마스킹으로 읽히지 않았다.
    expect(screen.getByText('●● ●●●●')).toBeInTheDocument();
  });

  // 헤더 개인화 (2026-08-08). 닉네임이 없으면 기존 문구로 떨어진다 —
  // 자리를 채우려고 '사용자' 같은 가짜 이름을 만들지 않는다.
  it('닉네임이 있으면 헤더에 붙이고, 없으면 기존 문구를 쓴다', () => {
    const progress: Record<string, EpisodeProgress> = {
      'workplace-ep1': prog('accept', true),
    };
    const view = () => (
      <DiaryListView
        themes={THEMES}
        progress={progress}
        onSelectDiary={noop}
        onGoRecentSession={noop}
        onGoScenario={noop}
      />
    );

    const { unmount } = render(view());
    expect(screen.getByText('회복일기')).toBeInTheDocument();
    unmount();

    useCharacterStore.setState({
      character: { nickname: '지수', gender: 'female', createdAt: '2026-08-01' },
    });
    render(view());
    expect(screen.getByText('지수의 회복일기')).toBeInTheDocument();
  });

  it('전 영역 완주 축하 헤드라인도 닉네임을 부른다', () => {
    const progress: Record<string, EpisodeProgress> = {};
    THEMES.forEach((theme) =>
      theme.episodes.forEach((ep) => {
        progress[ep.id] = prog('accept', true);
      }),
    );
    useCharacterStore.setState({
      character: { nickname: '민준', gender: 'male', createdAt: '2026-08-01' },
    });

    render(
      <DiaryListView
        themes={THEMES}
        progress={progress}
        onSelectDiary={noop}
        onGoRecentSession={noop}
        onGoScenario={noop}
      />,
    );

    expect(screen.getByText('축하해요, 민준님!')).toBeInTheDocument();
  });

  it('에피소드 분모는 실제 값(10)을 쓴다 — 시안의 더미 숫자가 아니다 (교정 4번)', () => {
    render(
      <DiaryListView
        themes={THEMES}
        progress={{ 'workplace-ep1': prog('accept', true) }}
        onSelectDiary={noop}
        onGoRecentSession={noop}
        onGoScenario={noop}
      />,
    );
    expect(screen.getByText('1/10 · 이어하기')).toBeInTheDocument();
  });
});
