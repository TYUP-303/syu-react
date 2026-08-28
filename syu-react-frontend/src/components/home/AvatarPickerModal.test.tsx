// src/components/home/AvatarPickerModal.test.tsx
// @vitest-environment jsdom
//
// 프리셋 선택 모달의 계약:
//   1) 프리셋 전부 + "기본 이미지" 타일을 보여 준다.
//   2) 고른 즉시 저장하지 않는다 — "적용하기"를 눌러야 onSelect가 호출된다.
//   3) 기본 이미지를 고르면 null이 올라간다(프리셋 해제 경로가 있어야
//      한 번 고른 사용자가 구글 사진으로 돌아갈 수 있다).

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@testing-library/jest-dom/vitest';

import AvatarPickerModal from './AvatarPickerModal';
import { AVATAR_PRESETS } from '../../constants/avatarPresets';
import { COPY } from '../../constants/copy';

const onSelect = vi.fn();
const onCancel = vi.fn();

function renderPicker(currentAvatarId: string | null = null) {
  return render(
    <AvatarPickerModal
      currentAvatarId={currentAvatarId}
      photoURL={null}
      onCancel={onCancel}
      onSelect={onSelect}
    />,
  );
}

beforeEach(() => {
  onSelect.mockClear();
  onCancel.mockClear();
  const root = document.createElement('div');
  root.id = 'app-modal-root';
  document.body.appendChild(root);
});

afterEach(() => {
  cleanup();
  document.getElementById('app-modal-root')?.remove();
});

describe('아바타 프리셋 선택 모달', () => {
  it('프리셋 전부와 기본 이미지 타일을 보여 준다', () => {
    renderPicker();

    for (const preset of AVATAR_PRESETS) {
      expect(screen.getByRole('button', { name: preset.label })).toBeInTheDocument();
    }
    expect(
      screen.getByRole('button', { name: COPY.myPage.avatarDefaultLabel }),
    ).toBeInTheDocument();
  });

  it('타일을 고르기만 해서는 저장되지 않는다', async () => {
    const user = userEvent.setup();
    renderPicker();

    await user.click(screen.getByRole('button', { name: AVATAR_PRESETS[1].label }));

    expect(onSelect).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: AVATAR_PRESETS[1].label })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
  });

  it('프리셋을 고르고 적용하면 그 id가 올라간다', async () => {
    const user = userEvent.setup();
    renderPicker();

    await user.click(screen.getByRole('button', { name: AVATAR_PRESETS[2].label }));
    await user.click(screen.getByRole('button', { name: COPY.myPage.avatarSave }));

    expect(onSelect).toHaveBeenCalledExactlyOnceWith(AVATAR_PRESETS[2].id);
  });

  it('기본 이미지를 고르고 적용하면 null이 올라간다 (프리셋 해제)', async () => {
    const user = userEvent.setup();
    renderPicker(AVATAR_PRESETS[0].id);

    await user.click(screen.getByRole('button', { name: COPY.myPage.avatarDefaultLabel }));
    await user.click(screen.getByRole('button', { name: COPY.myPage.avatarSave }));

    expect(onSelect).toHaveBeenCalledExactlyOnceWith(null);
  });

  it('현재 선택된 프리셋이 처음부터 눌린 상태로 열린다', () => {
    renderPicker(AVATAR_PRESETS[0].id);

    expect(screen.getByRole('button', { name: AVATAR_PRESETS[0].label })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    expect(
      screen.getByRole('button', { name: COPY.myPage.avatarDefaultLabel }),
    ).toHaveAttribute('aria-pressed', 'false');
  });

  it('취소는 저장 없이 닫는다', async () => {
    const user = userEvent.setup();
    renderPicker();

    await user.click(screen.getByRole('button', { name: COPY.myPage.cancel }));

    expect(onCancel).toHaveBeenCalled();
    expect(onSelect).not.toHaveBeenCalled();
  });
});
