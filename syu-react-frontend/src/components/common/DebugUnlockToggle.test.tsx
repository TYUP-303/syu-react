// src/components/common/DebugUnlockToggle.test.tsx
// @vitest-environment jsdom
//
// 디버그 해금 토글의 **회귀 테스트**.
//
// 2026-08-07 검수에서 시나리오 탭의 토글이 "누르면 버튼 자체가 사라지는"
// 문제로 보고됐다. 원인은 토글을 `debugForceUnlock === true`일 때만
// 렌더한 조건부였다 — 락으로 되돌리는 순간 자기 자신이 사라져 다시 켤
// 방법이 없었다. 그래서 여기서 고정하는 것은 라벨 문구가 아니라
// **"어떤 모드에서도, 어떤 분기 화면에서도 토글이 있다"** 는 사실이다.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';

vi.mock('../../api/env', () => ({ IS_MOCK_MODE: true }));
vi.mock('../../api/firebase', () => ({ db: {} }));

import type { EpisodeData, ThemeCategory } from '../../api/scenarioMockData';
import { useCharacterStore } from '../../store/useCharacterStore';
import { useScenarioStore } from '../../store/useScenarioStore';
import { useTestStore } from '../../store/useTestStore';
import { DEBUG_UNLOCK_MODES, buildDebugProgress } from '../../utils/debugProgress';
import DebugUnlockToggle from './DebugUnlockToggle';
import DiaryListView from '../home/DiaryListView';
import ScenarioTab from '../home/ScenarioTab';

function makeTheme(id: string, title: string, count = 10): ThemeCategory {
  return {
    id,
    title,
    description: `${title} 설명`,
    icon: 'work',
    episodes: Array.from({ length: count }, (_, i) => ({
      id: `${id}-ep${i + 1}`,
      episodeNumber: i + 1,
      title: `${title} ${i + 1}화`,
      summary: '요약',
      reasons: { helpful: ['도움이 됨'], unhelpful: ['맞지 않음'] },
    })) as EpisodeData[],
  };
}

const THEMES = [
  makeTheme('workplace', '직장'),
  makeTheme('job-prep', '취업준비'),
  makeTheme('relationship', '연인'),
  makeTheme('daily', '일상'),
];

const noop = () => {};

beforeEach(() => {
  // fetchThemes가 같은 배치로 재로드하지 않도록 cycleKey를 맞춰 둔다
  // (stressResult 없음 → 인지 폴백 → 'cognitive').
  useScenarioStore.setState({
    themes: THEMES,
    progress: {},
    themesCycleKey: 'cognitive',
    isLoading: false,
    isThemesLoading: false,
  });
  // user는 건드리지 않는다 — uid가 없으면 fetchProgress를 타지 않아 렌더가
  // 결정론적이고, useAuthStore는 persist 미들웨어라 테스트에서 쓰기 어렵다.
  // 토글 노출 여부는 onCycleDebugMode 주입으로 결정되므로 계정과 무관하다.
  useCharacterStore.setState({ character: { nickname: '테스터', gender: 'female' } as never });
  useTestStore.setState({ adhdResult: null as never, stressResult: null as never });
});
afterEach(cleanup);

describe('DebugUnlockToggle — 라벨', () => {
  it('현재 모드와 다음 모드를 함께 보여준다', () => {
    render(<DebugUnlockToggle mode="locked" onCycle={noop} />);
    expect(screen.getByRole('button', { name: /디버그 해금 모드: 락/ })).toHaveTextContent(
      '[디버그: 락 → 부분]',
    );
  });

  it('부분·전체 모드에서도 다음 목적지를 드러낸다', () => {
    const { rerender } = render(<DebugUnlockToggle mode="partial" onCycle={noop} />);
    expect(screen.getByRole('button')).toHaveTextContent('[디버그: 부분 → 전체]');
    rerender(<DebugUnlockToggle mode="full" onCycle={noop} />);
    expect(screen.getByRole('button')).toHaveTextContent('[디버그: 전체 → 락]');
  });

  it('클릭하면 순환 콜백을 부른다', () => {
    const onCycle = vi.fn();
    render(<DebugUnlockToggle mode="locked" onCycle={onCycle} />);
    fireEvent.click(screen.getByRole('button'));
    expect(onCycle).toHaveBeenCalledTimes(1);
  });
});

describe('ScenarioTab — 토글은 어떤 모드·분기에서도 사라지지 않는다', () => {
  it.each(DEBUG_UNLOCK_MODES)('%s 모드에서 토글이 보인다', (mode) => {
    render(
      <ScenarioTab onGoHome={noop} debugMode={mode} onCycleDebugMode={noop} />,
    );
    expect(screen.getByRole('button', { name: /디버그 해금 모드/ })).toBeInTheDocument();
  });

  it('검사 미완료 게이트 화면에서도 토글이 남아 있다 (락으로 되돌린 직후 상황)', () => {
    render(<ScenarioTab onGoHome={noop} debugMode="locked" onCycleDebugMode={noop} />);
    // 검사 결과가 없으므로 잠금 안내가 뜬 상태여야 한다
    expect(screen.getByRole('button', { name: /디버그 해금 모드: 락/ })).toBeInTheDocument();
  });

  it('개발자 계정이 아니면(콜백 미주입) 토글을 그리지 않는다', () => {
    render(<ScenarioTab onGoHome={noop} debugMode="locked" />);
    expect(screen.queryByRole('button', { name: /디버그 해금 모드/ })).not.toBeInTheDocument();
  });
});

describe('ScenarioTab — 합성 진행도가 영역 카드에 반영된다', () => {
  it('부분 해제는 영역 카드에 0 / 20 / 60 / 100 %를 늘어놓는다', () => {
    useTestStore.setState({
      adhdResult: { score: 10 } as never,
      stressResult: { resultType: 'cognitive' } as never,
    });
    render(<ScenarioTab onGoHome={noop} debugMode="partial" onCycleDebugMode={noop} />);
    ['0% 완료', '20% 완료', '60% 완료', '100% 완료'].forEach((label) => {
      expect(screen.getByText(label)).toBeInTheDocument();
    });
  });
});

describe('DiaryListView — 잠금 화면에서도 토글이 남는다', () => {
  it('기록이 0건인 잠금 화면에 토글이 함께 있다', () => {
    render(
      <DiaryListView
        themes={THEMES}
        progress={{}}
        onSelectDiary={noop}
        onGoRecentSession={noop}
        onGoScenario={noop}
        debugMode="locked"
        onCycleDebugMode={noop}
      />,
    );
    expect(screen.getByText('아직 첫 기록이 열리지 않았어요')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /디버그 해금 모드: 락/ })).toBeInTheDocument();
  });

  it('전체 해제 합성 진행도를 받으면 앨범이 4/4로 차고 종합 인사이트가 열린다', () => {
    render(
      <DiaryListView
        themes={THEMES}
        progress={buildDebugProgress(THEMES, 'full')}
        onSelectDiary={noop}
        onGoRecentSession={noop}
        onGoScenario={noop}
        debugMode="full"
        onCycleDebugMode={noop}
      />,
    );
    expect(screen.getByText(/회복 앨범 4\/4/)).toBeInTheDocument();
    expect(screen.getByText('종합 인사이트')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /디버그 해금 모드: 전체/ })).toBeInTheDocument();
  });
});
