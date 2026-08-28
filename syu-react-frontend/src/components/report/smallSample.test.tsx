// src/components/report/smallSample.test.tsx
// @vitest-environment jsdom
//
// 보고서 수치 표시의 두 계약 (2026-08-08 확정).
//
//  1) 소표본(3회 미만)에서는 %를 접고 횟수로 말한다. "1회 중 1회 도움됨
//     (100%)"의 100%는 아무것도 더 말해 주지 않으면서, 다음 훈련 한 번에
//     50%로 반토막 나 사용자에게는 "내가 나빠졌다"로 읽힌다.
//  2) ADHD 점수 설명문은 검사 결과 화면과 **같은 검수 템플릿**을 쓴다.
//     자작 점수대 밴드(경계 24/49/74)는 폐기했다.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';

vi.mock('../../api/env', () => ({ IS_MOCK_MODE: true }));
vi.mock('../../api/firebase', () => ({ db: {} }));

import type { EpisodeData, ThemeCategory } from '../../api/scenarioMockData';
import type { EpisodeProgress } from '../../store/useScenarioStore';
import { useScenarioStore } from '../../store/useScenarioStore';
import { useTestStore } from '../../store/useTestStore';
import HelpfulnessCard from './HelpfulnessCard';
import DomainComparisonCard from './DomainComparisonCard';
import AxisAProfileCard from './AxisAProfileCard';
import EmotionProfileReport from './EmotionProfileReport';
import { computeStrategyStats } from '../../utils/strategyStats';

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

beforeEach(() => {
  useScenarioStore.setState({ themes: THEMES, progress: {} });
  useTestStore.setState({ adhdResult: null, stressResult: null });
});
afterEach(cleanup);

describe('HelpfulnessCard — 소표본 표기', () => {
  it('1회 기록이면 %를 붙이지 않고 횟수만 말한다', () => {
    render(<HelpfulnessCard stats={computeStrategyStats([prog('accept', true)])} />);

    expect(screen.getByText('1회 중 1회 도움됨')).toBeInTheDocument();
    expect(screen.queryByText(/100%/)).not.toBeInTheDocument();
  });

  it('전체 요약도 소표본이면 횟수로 말한다', () => {
    render(
      <HelpfulnessCard
        stats={computeStrategyStats([prog('accept', true), prog('refocus', false)])}
      />,
    );

    // 전체 요약은 stat tile의 큰 숫자 자리다 (UAT 1-8) — 위계만 바뀌고
    // "%를 접는다"는 규칙은 그대로다.
    expect(screen.getByText('2회 중 1회')).toBeInTheDocument();
    expect(screen.queryByText('50%')).not.toBeInTheDocument();
  });

  it('3회부터는 %를 병기한다', () => {
    render(
      <HelpfulnessCard
        stats={computeStrategyStats([
          prog('accept', true),
          prog('accept', true),
          prog('accept', false),
        ])}
      />,
    );

    expect(screen.getByText('3회 중 2회 도움됨 (67%)')).toBeInTheDocument();
    expect(screen.getByText('67%')).toBeInTheDocument();
  });

  it('쓴 적 없는 전략은 0%가 아니라 "기록 없음"이다', () => {
    render(<HelpfulnessCard stats={computeStrategyStats([prog('accept', true)])} />);
    expect(screen.getAllByText('아직 기록 없음')).toHaveLength(2);
  });
});

describe('DomainComparisonCard — 소표본 표기', () => {
  it('영역 기록이 3회 미만이면 비중 % 대신 횟수를 적는다', () => {
    render(
      <DomainComparisonCard
        themes={THEMES}
        progress={{ 'workplace-ep1': prog('accept', true) }}
      />,
    );

    expect(screen.getByText(/아코\(수용\) 위주 · 1회 기록/)).toBeInTheDocument();
    expect(screen.queryByText(/위주 · 100%/)).not.toBeInTheDocument();
    // 기록이 없는 영역은 줄만 남긴다 (무엇을 안 했는지 보여야 한다)
    expect(screen.getByText('기록 없음')).toBeInTheDocument();
  });

  it('3회부터는 비중 %를 적는다', () => {
    render(
      <DomainComparisonCard
        themes={THEMES}
        progress={{
          'workplace-ep1': prog('accept', true),
          'workplace-ep2': prog('accept', true),
          'workplace-ep3': prog('refocus', false),
        }}
      />,
    );

    expect(screen.getByText(/아코\(수용\) 위주 · 67%/)).toBeInTheDocument();
  });
});

describe('AxisAProfileCard — 점수 눈금 게이지', () => {
  it('점수가 있으면 0~100 눈금과 현재 위치 마커를 그린다', () => {
    render(<AxisAProfileCard adhdScore={62} counts={null} resultTypeLabel={null} />);

    expect(screen.getByRole('img', { name: '62점 (100점 만점)' })).toBeInTheDocument();
    expect(screen.getByText('0')).toBeInTheDocument();
    expect(screen.getByText('100')).toBeInTheDocument();
  });

  it('점수가 없으면 게이지를 그리지 않는다 (0으로 지어내지 않는다)', () => {
    render(
      <AxisAProfileCard
        adhdScore={null}
        counts={{ cognitive: 2, emotional: 1, behavioral: 1 }}
        resultTypeLabel={null}
      />,
    );

    expect(screen.queryByRole('img', { name: /100점 만점/ })).not.toBeInTheDocument();
    expect(screen.queryByText('100')).not.toBeInTheDocument();
  });
});

describe('ADHD 점수 설명문 — 검수 템플릿 재사용', () => {
  it('보고서가 검사 결과 화면과 같은 확정 템플릿 문장을 쓴다', () => {
    useTestStore.setState({
      adhdResult: {
        testType: 'adhd',
        answers: { 1: 2, 2: 2, 3: 2, 4: 2, 5: 2, 6: 2 },
        score: 50,
        rawScore: 12,
        completedAt: '2026-08-01T00:00:00.000Z',
      } as never,
    });

    render(<EmotionProfileReport themeId="workplace" onClose={() => {}} />);

    expect(
      screen.getByText(/현재 ADHD 관련 경험 지표는 50점\(100점 만점\)입니다/),
    ).toBeInTheDocument();
    // 폐기한 자작 밴드 문구가 되살아나면 안 된다
    expect(screen.queryByText(/주의가 흩어지거나/)).not.toBeInTheDocument();
  });

  it('검사 기록이 없으면 설명문을 지어내지 않는다', () => {
    render(<EmotionProfileReport themeId="workplace" onClose={() => {}} />);
    expect(screen.queryByText(/ADHD 관련 경험 지표는/)).not.toBeInTheDocument();
  });
});
