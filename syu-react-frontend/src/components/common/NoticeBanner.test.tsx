// src/components/common/NoticeBanner.test.tsx
// @vitest-environment jsdom
//
// 공지 배너의 **표시 조건**을 고정한다.
//
// 배너는 앱 전역 최상단에 뜨는 유일한 요소라 잘못 뜨면 모든 화면이 함께
// 망가진다. 그래서 여기서 지키는 것은 모양이 아니라 세 가지 사실이다:
//   - 꺼져 있으면 자리를 아예 차지하지 않는다 (null 반환 — 빈 행도 남기지 않는다)
//   - 닫으면 사라지고, 그 뒤에 올라온 **다른** 공지는 다시 뜬다
//   - 본문이 비면 켜져 있어도 뜨지 않는다 (빈 배너 방지)

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent, act } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';

vi.mock('../../api/env', () => ({ IS_MOCK_MODE: true }));
vi.mock('../../api/firebase', () => ({ db: {} }));

import { useSettingsStore, resolveLegalSettings, resolveNotice } from '../../store/useSettingsStore';
import { COPY } from '../../constants/copy';
import NoticeBanner from './NoticeBanner';

const MESSAGE = '9월 1일 오전 2시에 점검이 있습니다.';

beforeEach(() => {
  useSettingsStore.setState({
    legal: resolveLegalSettings(null),
    notice: resolveNotice(null),
    isLoaded: true,
    dismissedNoticeMessage: null,
  });
});

afterEach(cleanup);

describe('NoticeBanner', () => {
  it('공지가 꺼져 있으면 아무것도 그리지 않는다', () => {
    const { container } = render(<NoticeBanner />);

    // 빈 래퍼조차 남기지 않아야 한다 — 남으면 모든 화면이 그 높이만큼 밀린다
    expect(container).toBeEmptyDOMElement();
  });

  it('공지가 켜져 있으면 본문과 말머리를 보여 준다', () => {
    useSettingsStore.setState({ notice: { active: true, message: MESSAGE } });

    render(<NoticeBanner />);

    expect(screen.getByText(MESSAGE)).toBeInTheDocument();
    expect(screen.getByText(COPY.notice.label)).toBeInTheDocument();
  });

  it('본문이 비면 켜져 있어도 뜨지 않는다', () => {
    // resolveNotice가 이미 걸러 내지만, 스토어를 직접 세팅하는 경로도 막는다
    useSettingsStore.setState({ notice: { active: true, message: '' } });

    const { container } = render(<NoticeBanner />);

    expect(container).toBeEmptyDOMElement();
  });

  it('닫기를 누르면 사라진다', () => {
    useSettingsStore.setState({ notice: { active: true, message: MESSAGE } });
    render(<NoticeBanner />);

    fireEvent.click(screen.getByRole('button', { name: COPY.notice.dismiss }));

    expect(screen.queryByText(MESSAGE)).not.toBeInTheDocument();
  });

  it('닫은 뒤 새 공지가 올라오면 다시 뜬다', () => {
    // 닫음 판정이 불리언이면 한 번 닫은 사용자는 이후 어떤 공지도 못 본다.
    useSettingsStore.setState({ notice: { active: true, message: MESSAGE } });
    render(<NoticeBanner />);
    fireEvent.click(screen.getByRole('button', { name: COPY.notice.dismiss }));

    // 렌더 후의 스토어 변경은 act로 감싸야 React가 리렌더를 흘려보낸다
    act(() => {
      useSettingsStore.setState({ notice: { active: true, message: '새 공지입니다.' } });
    });

    expect(screen.getByText('새 공지입니다.')).toBeInTheDocument();
  });

  it('스크린리더의 현재 작업을 끊지 않는 status 역할을 쓴다', () => {
    // alert로 두면 곁들이는 안내가 사용자의 작업을 가로챈다.
    useSettingsStore.setState({ notice: { active: true, message: MESSAGE } });

    render(<NoticeBanner />);

    expect(screen.getByRole('status')).toBeInTheDocument();
  });
});
