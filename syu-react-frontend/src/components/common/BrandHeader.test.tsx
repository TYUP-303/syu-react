// src/components/common/BrandHeader.test.tsx
// @vitest-environment jsdom
//
// 헤더 로고 마크가 **장식으로만** 존재한다는 계약을 고정한다.
//
// 마크 바로 옆의 'REACT' 텍스트가 이미 서비스 이름을 말하므로 이미지가
// 이름을 한 번 더 말하면 스크린리더에서 브랜드가 두 번 읽힌다. 그래서
// alt는 빈 문자열이고 aria-hidden이다.
//
// 더 중요한 이유는 셀렉터다. 전에 Button.tsx의 아이콘 텍스트 노드가
// 접근 가능한 이름에 섞여 들어가 E2E 셀렉터가 깨진 적이 있다. 이 헤더도
// 같은 모양의 함정을 갖고 있다 — material-symbols 스팬의 리가처 원문
// ('psychology', 'account_circle')이 버튼 안의 텍스트 노드다. 두 버튼의
// 이름은 aria-label이 소유하며, 마크를 추가해도 그대로여야 한다.

import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, cleanup, within } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';

import BrandHeader from './BrandHeader';

afterEach(cleanup);

const MARK = 'img[src="/brand/logo-mark.webp"]';

describe('BrandHeader 로고 마크', () => {
  it('마크는 alt=""·aria-hidden이라 접근성 트리에 올라오지 않는다', () => {
    const { container } = render(<BrandHeader onProfileClick={() => {}} />);

    const mark = container.querySelector(MARK);
    expect(mark).toBeInTheDocument();
    expect(mark).toHaveAttribute('alt', '');
    expect(mark).toHaveAttribute('aria-hidden');

    // alt=""는 role을 지우므로 이미지로 조회되지 않는다. 여기 걸리는
    // role="img"는 아바타 폴백 아이콘 하나뿐이어야 한다.
    expect(screen.queryAllByRole('img').map((el) => el.getAttribute('aria-label'))).toEqual([
      '프로필',
    ]);
  });

  it('마크를 넣어도 로고 버튼의 접근 가능한 이름은 aria-label 그대로다', () => {
    render(<BrandHeader onLogoClick={() => {}} onProfileClick={() => {}} />);

    // 이름이 정확히 이것이어야 한다. 마크의 alt나 'psychology' 리가처가
    // 섞이면 이 단언이 깨진다.
    const logo = screen.getByRole('button', { name: '서비스 소개' });
    expect(within(logo).queryByRole('img')).toBeNull();
    expect(logo.querySelector(MARK)).toBeInTheDocument();

    // 텍스트 브랜드는 그대로 남아 있다 — 마크는 더한 것이지 바꾼 것이 아니다.
    expect(within(logo).getByText('REACT')).toBeInTheDocument();
  });

  it('로고 클릭 핸들러가 없으면 버튼이 아니라 정적 마크로 그린다', () => {
    const { container } = render(
      <BrandHeader onProfileClick={() => {}} profileLabel="마이페이지" />,
    );

    expect(screen.queryByRole('button', { name: '서비스 소개' })).toBeNull();
    expect(container.querySelector(MARK)).toBeInTheDocument();
    // 프로필 버튼의 이름도 'account_circle' 리가처에 오염되지 않는다.
    expect(screen.getByRole('button', { name: '마이페이지' })).toBeInTheDocument();
  });
});
