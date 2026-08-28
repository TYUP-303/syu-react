// src/components/scenario/ThemeListView.test.tsx
// @vitest-environment jsdom
//
// 시나리오 1뎁스(영역 선택) 헤더의 **고정 계약**을 잡아 둔다 (2026-08-18 팀 회의:
// "시나리오 영역 선택 탭도 상단은 안 움직이게"). 2뎁스(EpisodeListView)는 이미
// 고정돼 있었으므로, 이 화면만 흐르면 뎁스를 오갈 때 제목이 튀어 보인다.
//
// jsdom은 레이아웃을 계산하지 않아 "실제로 붙어 있는가"는 여기서 볼 수 없다.
// 대신 그 결과를 만드는 **클래스 조합**을 고정한다 — 특히 음수 마진은 화면마다
// 값이 달라서(스크롤포트 상단까지의 누적 여백을 상쇄하는 값이다) 다른 뷰에서
// 복사해 오면 스크롤 0에서 틈이 남거나 카드와 겹친다.

import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@testing-library/jest-dom/vitest';

import ThemeListView from './ThemeListView';
import type { ThemeCategory } from '../../api/scenarioMockData';

// 이 뷰는 진행도 계산과 렌더만 하는 표시 전용 컴포넌트라 스토어를 타지 않는다.
// 에피소드가 비어 있어도 calculateProgress가 0을 돌려주므로 픽스처는 최소로 둔다.
const themes: ThemeCategory[] = [
  {
    id: 'workplace',
    title: '직장',
    description: '상사와 동료 사이에서 버티는 마음',
    icon: 'work',
    episodes: [],
  },
  {
    id: 'job-prep',
    title: '취업준비',
    description: '아직 오지 않은 결과를 기다리는 마음',
    icon: 'school',
    episodes: [],
  },
];

const onSelectTheme = vi.fn();

const renderView = () =>
  render(<ThemeListView themes={themes} progress={{}} onSelectTheme={onSelectTheme} />);

afterEach(() => {
  onSelectTheme.mockClear();
  cleanup();
});

describe('ThemeListView — 상단 헤더 고정 (2026-08-18 팀 회의)', () => {
  it('헤더 블록이 스크롤포트 상단에 플러시로 고정된다', () => {
    const { container } = renderView();

    const root = container.firstElementChild as HTMLElement;
    const header = root.firstElementChild as HTMLElement;

    // 제목을 품은 블록이 맞는지부터 확인한다 (구조가 바뀌면 여기서 먼저 걸린다).
    expect(header).toContainElement(screen.getByRole('heading', { name: '시나리오 영역 선택' }));

    expect(header.className).toMatch(/\bsticky\b/);
    expect(header.className).toMatch(/\btop-0\b/);

    // -mt-8 = HomePage 콘텐츠 래퍼의 py-6(24px) + 이 뷰 루트의 py-2(8px).
    // -mx-6 = 부모 main의 px-6. 안쪽 pt-8/px-6이 그 여백을 되돌려,
    // 스크롤 0에서의 제목 위치가 고정 전과 픽셀 단위로 같아진다.
    expect(header.className).toMatch(/-mt-8\b/);
    expect(header.className).toMatch(/-mx-6\b/);
    expect(header.className).toMatch(/\bpt-8\b/);
    expect(header.className).toMatch(/\bpx-6\b/);

    // 지나가는 카드를 가리려면 스크롤포트 바탕과 같은 불투명 배경이어야 한다.
    // (회복일기 계열의 bg-diary-surface가 아니다 — 이 화면은 일반 surface다.)
    expect(header.className).toMatch(/\bbg-surface\b(?!-)/);
    expect(header.className).toMatch(/\bz-20\b/);
  });

  it('고정 헤더 아래에 페이드 엣지가 있다', () => {
    const { container } = renderView();

    const header = (container.firstElementChild as HTMLElement).firstElementChild as HTMLElement;
    const fade = header.querySelector('[aria-hidden="true"]');

    // 카드가 헤더 아래로 지나갈 때 뚝 끊기지 않게 하는 스크롤 어포던스.
    // EpisodeListView·DiaryListView와 같은 관례라 셋을 함께 고쳐야 한다.
    expect(fade).not.toBeNull();
    expect(fade!.className).toMatch(/top-full/);
  });

  it('영역 카드 목록은 고정되지 않고 함께 흐른다', () => {
    const { container } = renderView();

    const root = container.firstElementChild as HTMLElement;
    const list = root.children[1] as HTMLElement;

    expect(list).toContainElement(screen.getByText('직장'));
    expect(list.className).not.toMatch(/\bsticky\b/);

    // 스크롤은 PageLayout의 콘텐츠 영역이 소유한다 — 이 뷰 어디에도 없어야 한다.
    expect(container.querySelectorAll('[class*="overflow-y-auto"]')).toHaveLength(0);
  });

  it('영역 카드를 누르면 그 영역 id가 올라간다', async () => {
    const user = userEvent.setup();
    renderView();

    await user.click(screen.getByText('취업준비'));

    expect(onSelectTheme).toHaveBeenCalledWith('job-prep');
  });
});
