// src/components/diary/DiaryLockedView.test.tsx
// @vitest-environment jsdom
//
// 회복일기 잠금 화면의 CTA 상태 분기 (2026-08-08 확정).
//
// 기록이 0건인 이유는 셋 중 하나이고, 이유마다 풀어야 할 곳이 다르다.
// 예전에는 어느 경우든 "시나리오 시작하기"만 보여줘서, 캐릭터가 없거나
// 검사를 안 마친 사용자는 버튼을 눌러도 시나리오 탭 게이트에 다시 막혔다.
//
// UAT 2026-08-18에 두 가지가 더 붙었다:
//   1. 화면 껍데기를 시나리오 탭 게이트와 공유한다(common/GateNoticeCard).
//   2. 본문은 **회복일기 탭의 말**이어야 한다 — 검사 미완 화면이
//      gateLockedBody(시나리오 훈련 설명)를 빌려 쓰고 있었다.

import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup, getDefaultNormalizer } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@testing-library/jest-dom/vitest';

import DiaryLockedView from './DiaryLockedView';
import { COPY } from '../../constants/copy';

afterEach(cleanup);

// 안내문의 \n은 화면에 줄바꿈으로 나간다(GateNoticeCard의 whitespace-pre-line).
// RTL 기본 정규화는 개행을 공백으로 접으므로, COPY 상수를 그대로 매처로 쓰려면
// 접기를 꺼야 한다 — 덤으로 줄바꿈 위치까지 계약으로 고정된다.
const exact = { normalizer: getDefaultNormalizer({ collapseWhitespace: false }) };

describe('DiaryLockedView — CTA 상태 분기', () => {
  it('캐릭터가 없으면 캐릭터 생성으로 보낸다', async () => {
    const user = userEvent.setup();
    const onGoCreateCharacter = vi.fn();
    const onGoScenario = vi.fn();
    render(
      <DiaryLockedView
        gate="no-character"
        onGoScenario={onGoScenario}
        onGoCreateCharacter={onGoCreateCharacter}
        onGoHome={vi.fn()}
      />,
    );

    expect(screen.getByText(COPY.scenario.gateNoCharTitle)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: new RegExp(COPY.scenario.gateNoCharCta) }));

    expect(onGoCreateCharacter).toHaveBeenCalledTimes(1);
    expect(onGoScenario).not.toHaveBeenCalled();
  });

  it('검사를 안 마쳤으면 홈(검사 동선)으로 보낸다', async () => {
    const user = userEvent.setup();
    const onGoHome = vi.fn();
    const onGoScenario = vi.fn();
    render(
      <DiaryLockedView
        gate="test-incomplete"
        onGoScenario={onGoScenario}
        onGoCreateCharacter={vi.fn()}
        onGoHome={onGoHome}
      />,
    );

    expect(screen.getByText(COPY.scenario.gateTestTitle)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: new RegExp(COPY.scenario.gateTestCta) }));

    expect(onGoHome).toHaveBeenCalledTimes(1);
    expect(onGoScenario).not.toHaveBeenCalled();
  });

  it('준비가 끝났으면 기존대로 시나리오로 보낸다', async () => {
    const user = userEvent.setup();
    const onGoScenario = vi.fn();
    render(<DiaryLockedView gate="ready" onGoScenario={onGoScenario} />);

    expect(screen.getByText(COPY.scenario.gateNoRecordTitle)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: new RegExp(COPY.scenario.gateNoRecordCta) }));

    expect(onGoScenario).toHaveBeenCalledTimes(1);
  });

  it('라우팅 콜백이 없으면 기존 동선(시나리오)으로 떨어진다', async () => {
    const user = userEvent.setup();
    const onGoScenario = vi.fn();
    // gate는 알지만 목적지 콜백이 없는 호출부 — 버튼이 죽지 않아야 한다
    render(<DiaryLockedView gate="no-character" onGoScenario={onGoScenario} />);

    await user.click(screen.getByRole('button', { name: new RegExp(COPY.scenario.gateNoRecordCta) }));

    expect(onGoScenario).toHaveBeenCalledTimes(1);
  });
});

// ── 본문은 회복일기 탭의 말이어야 한다 (UAT 2026-08-18) ──
//
// 회귀 그 자체: 검사 미완 화면이 COPY.scenario.gateLockedBody("전략 요정과
// 함께하는 … 훈련 시나리오는 …")를 그대로 빌려 써서, 회복일기를 열려던
// 사용자가 남의 화면 설명을 읽었다. 캐릭터 미생성 화면도 같은 이유로
// "시나리오 훈련을 시작하려면"이라고 말하고 있었다.
describe('DiaryLockedView — 탭별 안내문', () => {
  it('캐릭터 미생성 안내가 회복일기를 주어로 말한다', () => {
    render(
      <DiaryLockedView
        gate="no-character"
        onGoScenario={vi.fn()}
        onGoCreateCharacter={vi.fn()}
        onGoHome={vi.fn()}
      />,
    );

    expect(screen.getByText(COPY.scenario.gateNoCharBodyDiary, exact)).toBeInTheDocument();
    expect(screen.queryByText(COPY.scenario.gateNoCharBody, exact)).not.toBeInTheDocument();
  });

  it('검사 미완 안내에 시나리오 탭 설명이 나오지 않는다', () => {
    render(
      <DiaryLockedView
        gate="test-incomplete"
        onGoScenario={vi.fn()}
        onGoCreateCharacter={vi.fn()}
        onGoHome={vi.fn()}
      />,
    );

    expect(screen.getByText(COPY.scenario.gateTestBody, exact)).toBeInTheDocument();
    expect(screen.queryByText(COPY.scenario.gateLockedBody, exact)).not.toBeInTheDocument();
  });
});
