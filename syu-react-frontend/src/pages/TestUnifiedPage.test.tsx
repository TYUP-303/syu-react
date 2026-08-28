// src/pages/TestUnifiedPage.test.tsx
// @vitest-environment jsdom
//
// 검사 이탈의 **도착지** 계약 (2026-08-08 확정).
//
// 진행 화면 ✕ → 확인 모달 → [나가기]는 준비 화면이 아니라 **홈**으로 나간다.
// 예전에는 준비 화면으로 되돌아가서, "나가기"라고 답한 사용자가 같은 검사
// 화면을 다시 마주했다(라벨과 도착지 불일치). 답안을 버리는 동작은 그대로다.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@testing-library/jest-dom/vitest';

// localStorage 스텁은 import보다 먼저 꽂혀야 한다 — useAuthStore의 persist
// 미들웨어가 모듈 초기화 시점에 붙잡기 때문이다.
vi.hoisted(() => {
  const map = new Map<string, string>();
  vi.stubGlobal('localStorage', {
    getItem: (key: string) => map.get(key) ?? null,
    setItem: (key: string, value: string) => void map.set(key, value),
    removeItem: (key: string) => void map.delete(key),
    clear: () => map.clear(),
  });
});

vi.mock('../api/env', () => ({ IS_MOCK_MODE: true }));
vi.mock('../api/firebase', () => ({
  db: {},
  auth: { currentUser: null },
  signInWithGoogle: vi.fn(),
  signOutUser: vi.fn(),
  syncUserToFirestore: vi.fn(),
  deleteUserDoc: vi.fn(),
}));

import TestUnifiedPage from './TestUnifiedPage';
import { useTestStore } from '../store/useTestStore';
import { useAuthStore } from '../store/useAuthStore';
import { COPY } from '../constants/copy';

const onGoHome = vi.fn();

beforeEach(() => {
  onGoHome.mockClear();
  useAuthStore.setState({ user: { uid: 'uid-1' } as never });
  const root = document.createElement('div');
  root.id = 'app-modal-root';
  document.body.appendChild(root);
});

afterEach(() => {
  cleanup();
  document.getElementById('app-modal-root')?.remove();
});

/** 준비 화면 → 진행 화면까지 진입시킨다 */
async function startTest(user: ReturnType<typeof userEvent.setup>) {
  render(<TestUnifiedPage testType="adhd" onGoHome={onGoHome} />);
  await waitFor(() => expect(screen.getByText(COPY.test.prepCta)).toBeInTheDocument());
  await user.click(screen.getByRole('button', { name: new RegExp(COPY.test.prepCta) }));
}

describe('TestUnifiedPage — 진행 화면 이탈', () => {
  it('[나가기]를 확인하면 홈으로 나가고 답안을 버린다', async () => {
    const user = userEvent.setup();
    await startTest(user);

    // 1번 문항에 답을 하나 남겨 둔다 (초기화 여부를 보기 위해)
    const questionId = useTestStore.getState().questions[0].id;
    useTestStore.getState().selectAnswer(questionId, 3);
    expect(useTestStore.getState().answers).toEqual({ [questionId]: 3 });

    await user.click(screen.getByRole('button', { name: COPY.test.exitCloseLabel }));
    await user.click(screen.getByRole('button', { name: COPY.test.exitConfirmExit }));

    expect(onGoHome).toHaveBeenCalledTimes(1);
    expect(useTestStore.getState().answers).toEqual({});
  });

  it('[계속 검사하기]를 고르면 홈으로 나가지 않는다', async () => {
    const user = userEvent.setup();
    await startTest(user);

    await user.click(screen.getByRole('button', { name: COPY.test.exitCloseLabel }));
    await user.click(screen.getByRole('button', { name: COPY.test.exitConfirmCancel }));

    expect(onGoHome).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: COPY.test.exitCloseLabel })).toBeInTheDocument();
  });
});
