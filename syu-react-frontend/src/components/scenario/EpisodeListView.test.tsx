// src/components/scenario/EpisodeListView.test.tsx
// @vitest-environment jsdom
//
// 에피소드 목록 상단의 **영역 완주율**과 11번째 카드(에필로그)의 상태를 고정한다.
//
// 완주율은 UAT 요청("10개의 시나리오 수행하는 빈도 퍼센트, 위치는 상단")으로
// 붙었고, 판정식은 utils/strategyStats.summarizeThemeProgress 하나다 — 화면이
// 자기만의 계산을 갖지 않는다는 것이 이 테스트가 지키려는 계약이다. 앨범
// 진행도(computeAlbumProgress)가 같은 함수를 쓰므로, 여기서 판정을 새로
// 만들면 "목록은 9/10인데 앨범은 완주"처럼 화면끼리 어긋난다.

import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';

// 이 뷰는 usePersonalizedText → useCharacterStore를 거쳐 api/firebase를 끌어온다.
// 실 SDK 초기화는 테스트 환경에서 자격증명이 없어 던지므로 다른 RTL 테스트와
// 같은 방식으로 막는다 (닉네임 치환 규칙 자체는 personalizeScenarioText가 고정한다).
vi.mock('../../api/env', () => ({ IS_MOCK_MODE: true }));
vi.mock('../../api/firebase', () => ({ db: {}, auth: {} }));

import EpisodeListView from './EpisodeListView';
import { COPY } from '../../constants/copy';
import type { EpisodeData, ThemeCategory } from '../../api/scenarioMockData';
import type { EpisodeProgress, ScenarioProgressMap } from '../../store/useScenarioStore';
import { themeColorsFor } from '../../constants/themeColors';

const angel = (name: string) => ({
  name,
  strategy: `${name} 전략`,
  detail: `${name} 상세`,
  feedback: `${name} 피드백`,
});

function makeEpisode(index: number): EpisodeData {
  const number = index + 1;
  return {
    id: `workplace-ep${number}`,
    episodeNumber: number,
    title: `직장 ${number}화`,
    summary: `요약 ${number}`,
    scenario: {
      no: String(number),
      domain: `직장${number}`,
      reactionType: '인지',
      title: `직장 ${number}화`,
      scenes: [{ type: '', text: '본문', bg: 'office.png', chars: ['baeksul_f_default.png'] }],
    },
    angels: { accept: angel('아코'), reappraisal: angel('포코'), refocus: angel('리프') },
    reasons: { helpful: ['도움'], unhelpful: ['모름'] },
  };
}

const THEME: ThemeCategory = {
  id: 'workplace',
  title: '직장',
  description: '직장 생활에서 겪는 어려움',
  icon: 'work',
  episodes: Array.from({ length: 10 }, (_, i) => makeEpisode(i)),
};

const cleared: EpisodeProgress = {
  cleared: true,
  selectedAngel: 'accept',
  wasHelpful: true,
  selectedReason: '감정을 편안하게 해줌',
  updatedAt: '2026-08-26T00:00:00.000Z',
};

/** 앞에서부터 n편을 완주한 진행도. */
function progressFor(count: number): ScenarioProgressMap {
  const map: ScenarioProgressMap = {};
  THEME.episodes.slice(0, count).forEach((ep) => {
    map[ep.id] = cleared;
  });
  return map;
}

function renderList(count: number, overrides: Partial<Parameters<typeof EpisodeListView>[0]> = {}) {
  return render(
    <EpisodeListView
      themes={[THEME]}
      themeId="workplace"
      progress={progressFor(count)}
      onBack={() => {}}
      onPlayEpisode={() => {}}
      {...overrides}
    />
  );
}

afterEach(cleanup);

describe('EpisodeListView — 영역 완주율 헤더', () => {
  it('완주 수와 분모를 상단에 적고 막대가 같은 비율을 가리킨다', () => {
    renderList(3);

    expect(screen.getByText(COPY.episodeList.progressLabel(3, 10))).toBeInTheDocument();

    const bar = screen.getByRole('progressbar', {
      name: COPY.episodeList.progressAriaLabel(30),
    });
    expect(bar).toHaveAttribute('aria-valuenow', '30');
  });

  it('한 편도 완주하지 않았으면 0/10 · 0%로 선다', () => {
    renderList(0);

    expect(screen.getByText(COPY.episodeList.progressLabel(0, 10))).toBeInTheDocument();
    expect(
      screen.getByRole('progressbar', { name: COPY.episodeList.progressAriaLabel(0) })
    ).toHaveAttribute('aria-valuenow', '0');
  });

  it('열 편을 모두 완주하면 10/10 · 100%가 된다', () => {
    renderList(10);

    expect(screen.getByText(COPY.episodeList.progressLabel(10, 10))).toBeInTheDocument();
    expect(
      screen.getByRole('progressbar', { name: COPY.episodeList.progressAriaLabel(100) })
    ).toHaveAttribute('aria-valuenow', '100');
  });
});

// ── 11번째 카드(에필로그) ────────────────────────────────────────
//
// 카드는 잠금 / 해금 / 봤어요 세 상태로만 선다. 해금 조건은 **그 영역 10편
// 완주**이며(영역별 해금), 완주 판정은 위 완주율과 같은 집계를 쓴다.
//
// 카드의 낭독기 이름을 aria-label로 못 박은 것은 하단 CTA('에필로그 보러가기')와
// 이름이 겹치지 않게 하기 위한 것이기도 하다 — 겹치면 테스트가 어느 버튼을
// 눌렀는지 모르게 되고, 실사용자의 낭독기도 같은 혼동을 겪는다.

const EPILOGUE = {
  domain: '직장',
  title: '회의실이 조금 편해졌어요',
  scenes: [1, 2, 3, 4].map((n) => ({
    sceneNumber: n,
    bg: 'office.png',
    chars: ['baeksul_f_default.png'],
    text: `장면 ${n}`,
    kind: 'scene' as const,
  })),
};

const THEME_WITH_EPILOGUE: ThemeCategory = { ...THEME, epilogue: EPILOGUE };

function renderWithEpilogue(
  count: number,
  overrides: Partial<Parameters<typeof EpisodeListView>[0]> = {}
) {
  return render(
    <EpisodeListView
      themes={[THEME_WITH_EPILOGUE]}
      themeId="workplace"
      progress={progressFor(count)}
      onBack={() => {}}
      onPlayEpisode={() => {}}
      onPlayEpilogue={() => {}}
      {...overrides}
    />
  );
}

describe('EpisodeListView — 에필로그 카드', () => {
  it('원고가 없는 영역에는 카드를 그리지 않는다', () => {
    renderList(10);
    expect(
      screen.queryByRole('button', { name: COPY.epilogue.cardOpenLabel })
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: COPY.epilogue.cardLockedLabel })
    ).not.toBeInTheDocument();
  });

  it('9편까지는 잠겨 있고 제목 대신 잠금 안내가 뜬다', () => {
    renderWithEpilogue(9);

    const card = screen.getByRole('button', { name: COPY.epilogue.cardLockedLabel });
    expect(card).toBeDisabled();
    expect(screen.getByText(COPY.epilogue.lockedHint)).toBeInTheDocument();
    // 아직 보지 않은 마무리 장면의 제목은 스포일러라 목록에 뜨지 않는다.
    expect(screen.queryByText(EPILOGUE.title)).not.toBeInTheDocument();
  });

  it('잠긴 카드를 눌러도 에필로그로 넘어가지 않는다', () => {
    let played = 0;
    renderWithEpilogue(9, { onPlayEpilogue: () => (played += 1) });

    fireEvent.click(screen.getByRole('button', { name: COPY.epilogue.cardLockedLabel }));
    // 선택되지 않았으므로 하단 CTA도 잠긴 채다.
    expect(screen.getByRole('button', { name: '플레이할 에피소드를 선택해 주세요' })).toBeDisabled();
    expect(played).toBe(0);
  });

  it('10편을 모두 완주하면 열리고, 고른 뒤 CTA를 누르면 에필로그로 넘긴다', () => {
    let played = 0;
    renderWithEpilogue(10, { onPlayEpilogue: () => (played += 1) });

    const card = screen.getByRole('button', { name: COPY.epilogue.cardOpenLabel });
    expect(card).toBeEnabled();
    expect(screen.getByText(EPILOGUE.title)).toBeInTheDocument();

    fireEvent.click(card);
    fireEvent.click(screen.getByRole('button', { name: COPY.epilogue.listCta }));
    expect(played).toBe(1);
  });

  it('에필로그를 골라도 에피소드 플레이 콜백은 부르지 않는다', () => {
    let episodePlayed = 0;
    renderWithEpilogue(10, { onPlayEpisode: () => (episodePlayed += 1) });

    fireEvent.click(screen.getByRole('button', { name: COPY.epilogue.cardOpenLabel }));
    fireEvent.click(screen.getByRole('button', { name: COPY.epilogue.listCta }));
    expect(episodePlayed).toBe(0);
  });

  it('이미 본 에필로그에는 완료 아이콘(봤어요)이 붙고, 보기 전에는 없다', () => {
    renderWithEpilogue(10, { epilogueSeen: true });
    expect(screen.getByRole('img', { name: COPY.epilogue.seenBadge })).toBeInTheDocument();

    cleanup();
    renderWithEpilogue(10);
    expect(screen.queryByRole('img', { name: COPY.epilogue.seenBadge })).not.toBeInTheDocument();
  });

  it('에필로그 카드는 영역 완주율의 분모에 들어가지 않는다', () => {
    renderWithEpilogue(10);
    // 카드가 11장이어도 완주율은 10/10이다 — 에필로그는 episodes 밖에 있다.
    expect(screen.getByText(COPY.episodeList.progressLabel(10, 10))).toBeInTheDocument();
  });
});

// ── 카드의 자리 (2026-08-26) ──────────────────────────────────────
//
// 잠겨 있는 동안은 맨 아래, 열리면 맨 위다. 이유는 EpisodeListView의
// epilogueCard 주석에 있고, 여기서는 **두 자리 중 하나에만 선다**는 것까지
// 함께 고정한다 — 조건을 잘못 쓰면 같은 목록에 두 장이 서는데, 위치만 보는
// 단언으로는 그 사고가 잡히지 않는다.
describe('EpisodeListView — 에필로그 카드의 자리', () => {
  /** a가 b보다 DOM에서 앞서는가. */
  function precedes(a: Element, b: Element): boolean {
    return Boolean(a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING);
  }

  const episodeCard = (title: string) => screen.getByText(title).closest('button')!;

  it('잠겨 있으면 목록 맨 아래 — 10화 카드보다 뒤에 선다', () => {
    renderWithEpilogue(9);

    const card = screen.getByRole('button', { name: COPY.epilogue.cardLockedLabel });
    expect(precedes(episodeCard('직장 10화'), card)).toBe(true);
    // 잠금 카드는 한 장뿐이다.
    expect(screen.getAllByRole('button', { name: COPY.epilogue.cardLockedLabel })).toHaveLength(1);
  });

  it('해금되면 목록 맨 위 — 1화 카드보다 앞에 선다', () => {
    renderWithEpilogue(10);

    const card = screen.getByRole('button', { name: COPY.epilogue.cardOpenLabel });
    expect(precedes(card, episodeCard('직장 1화'))).toBe(true);
    expect(precedes(card, episodeCard('직장 10화'))).toBe(true);
    // 아래쪽에 남아 있으면 안 된다 — 한 장뿐이어야 한다.
    expect(screen.getAllByRole('button', { name: COPY.epilogue.cardOpenLabel })).toHaveLength(1);
  });

  it('해금된 카드는 강조 톤(secondary)으로 서고 부제가 붙는다', () => {
    renderWithEpilogue(10);

    const card = screen.getByRole('button', { name: COPY.epilogue.cardOpenLabel });
    expect(card.className).toContain('bg-secondary/10');
    expect(card.className).toContain('border-secondary/30');
    expect(screen.getByText(COPY.epilogue.topSubtitle)).toBeInTheDocument();
  });

  it('잠긴 카드에는 강조 톤도 부제도 붙지 않는다', () => {
    renderWithEpilogue(9);

    const card = screen.getByRole('button', { name: COPY.epilogue.cardLockedLabel });
    expect(card.className).not.toContain('bg-secondary/10');
    expect(screen.queryByText(COPY.epilogue.topSubtitle)).not.toBeInTheDocument();
    expect(screen.getByText(COPY.epilogue.lockedHint)).toBeInTheDocument();
  });

  it('골라 두면 선택 표시(영역색 테두리)가 강조 톤을 이긴다', () => {
    renderWithEpilogue(10);

    const card = screen.getByRole('button', { name: COPY.epilogue.cardOpenLabel });
    fireEvent.click(card);
    // 강조는 자리 설명이고 선택은 조작 상태다 — 둘이 겹치면 무엇을 고른 건지 사라진다.
    // 선택 표시는 2026-08-27(R2-10)에 primary에서 **영역 고유색**으로 옮겼다.
    expect(card.className).toContain(themeColorsFor('workplace').selected);
    expect(card.className).not.toContain('bg-secondary/10');
  });

  it('맨 위로 올라가도 봤어요 아이콘은 그대로 붙는다', () => {
    renderWithEpilogue(10, { epilogueSeen: true });

    const card = screen.getByRole('button', { name: COPY.epilogue.cardOpenLabel });
    expect(precedes(card, episodeCard('직장 1화'))).toBe(true);
    expect(screen.getByRole('img', { name: COPY.epilogue.seenBadge })).toBeInTheDocument();
  });
});

// ── 줄거리 줄: 접힘(첫 문장) ↔ 펼침(전문) ─────────────────────────
//
// 2026-08-27 UAT R2-08·R2-09. 예전에는 스토어가 40자에서 자르며 ' ...'를
// 붙이고 카드가 CSS truncate로 다시 잘라 **한 문장이 두 번 잘렸다**. 이제
// 접힌 카드는 첫 문장 한 줄이고, 카드를 고르면 그 자리에서 첫 장면 내레이션
// 전문이 펼쳐진다. 다시 누르면 접힌다.

const NARRATION =
  '백설은 팀 프로젝트 회의에서 자신이 정리한 자료를 발표하고 있다. ' +
  '발표가 끝나자 아무도 입을 열지 않는다. 침묵이 길어질수록 손끝이 차가워진다.';
const FIRST_SENTENCE = '백설은 팀 프로젝트 회의에서 자신이 정리한 자료를 발표하고 있다.';

describe('EpisodeListView — 카드 줄거리 펼침', () => {
  function renderWithNarration(clearedCount = 1) {
    const theme: ThemeCategory = {
      ...THEME,
      episodes: THEME.episodes.map((ep, i) => ({
        ...ep,
        summary: i === 0 ? NARRATION : ep.summary,
      })),
    };
    const progress: ScenarioProgressMap = {};
    theme.episodes.slice(0, clearedCount).forEach((ep) => {
      progress[ep.id] = cleared;
    });
    return render(
      <EpisodeListView
        themes={[theme]}
        themeId="workplace"
        progress={progress}
        onBack={() => {}}
        onPlayEpisode={() => {}}
      />
    );
  }

  const card = () => screen.getByText('직장 1화').closest('button')!;

  it('접힌 카드는 첫 문장만 보여주고 말줄임을 붙이지 않는다', () => {
    renderWithNarration(0);

    // 데이터 슬라이스(' ...')와 CSS truncate가 겹쳐 두 번 잘리던 자리다.
    expect(screen.getByText(FIRST_SENTENCE)).toBeInTheDocument();
    expect(screen.queryByText(/\.\.\.$/)).not.toBeInTheDocument();
    expect(card()).toHaveAttribute('aria-expanded', 'false');
  });

  it('카드를 고르면 첫 장면 내레이션 전문이 펼쳐진다', () => {
    renderWithNarration(0);

    fireEvent.click(card());

    expect(card()).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByText(NARRATION)).toBeInTheDocument();
    // 첫 문장만 담던 줄은 사라진다 — 같은 문장이 두 줄로 겹치지 않는다.
    expect(screen.queryByText(FIRST_SENTENCE)).not.toBeInTheDocument();
  });

  it('고른 카드를 다시 누르면 선택이 풀리며 접힌다', () => {
    renderWithNarration(0);

    fireEvent.click(card());
    fireEvent.click(card());

    expect(card()).toHaveAttribute('aria-expanded', 'false');
    expect(screen.getByText(FIRST_SENTENCE)).toBeInTheDocument();
    // 선택이 풀렸으므로 하단 CTA도 다시 안내 문구로 돌아간다.
    expect(
      screen.getByRole('button', { name: '플레이할 에피소드를 선택해 주세요' })
    ).toBeDisabled();
  });

  it('잠긴 카드는 눌러도 펼쳐지지 않는다', () => {
    renderWithNarration(0);

    const locked = screen.getByText('직장 3화').closest('button')!;
    fireEvent.click(locked);

    // 펼칠 것이 없으므로 펼침 상태 자체를 갖지 않는다.
    expect(locked).not.toHaveAttribute('aria-expanded');
    expect(locked).toBeDisabled();
  });
});
