// src/components/home/AvatarPickerModal.tsx
// 프로필 아바타 프리셋 선택 모달 (마이페이지 프로필 카드에서 진입).
//
// 그리드 첫 칸은 "기본 이미지"(프리셋 해제)다. 골랐던 것을 되돌릴 수단이
// 없으면 한 번 선택한 사용자는 구글 사진으로 돌아갈 수 없다.
//
// 2차에 붙을 "사진 업로드"도 그리드의 한 칸으로 들어온다 — 타일 배열만
// 늘리면 되도록 타일 렌더링을 한 곳(AvatarTile)에 모아 두었다.

import { useState } from 'react';
import Modal from '../ui/Modal';
import Button from '../ui/Button';
import UserAvatar from '../common/UserAvatar';
import { AVATAR_PRESETS } from '../../constants/avatarPresets';
import { COPY } from '../../constants/copy';

interface AvatarPickerModalProps {
  /** 현재 선택된 프리셋 id (없으면 기본 이미지) */
  currentAvatarId: string | null;
  /** 프리셋 해제 시 무엇으로 돌아가는지 미리보기용 (구글 사진 등) */
  photoURL?: string | null;
  isSaving?: boolean;
  onCancel: () => void;
  /** null이면 프리셋 해제 */
  onSelect: (avatarId: string | null) => void;
}

interface AvatarTileProps {
  label: string;
  isSelected: boolean;
  onClick: () => void;
  children: React.ReactNode;
}

function AvatarTile({ label, isSelected, onClick, children }: AvatarTileProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={isSelected}
      aria-label={label}
      className={`
        flex flex-col items-center gap-1.5 p-2 rounded-control border transition-all cursor-pointer
        ${isSelected
          ? 'border-primary bg-primary/10'
          : 'border-outline-variant/30 hover:border-primary/50 bg-surface-container-low'}
      `}
    >
      {children}
      <span className="text-[10px] text-outline font-body leading-tight text-center line-clamp-2">
        {label}
      </span>
    </button>
  );
}

export default function AvatarPickerModal({
  currentAvatarId,
  photoURL,
  isSaving = false,
  onCancel,
  onSelect,
}: AvatarPickerModalProps) {
  const [draftId, setDraftId] = useState<string | null>(currentAvatarId);

  return (
    <Modal onBackdropClick={isSaving ? undefined : onCancel} cardClassName="space-y-4 text-left">
      <div className="space-y-1">
        <h4 className="text-[16px] font-bold text-on-surface font-headline">
          {COPY.myPage.avatarModalTitle}
        </h4>
        <p className="text-[11px] text-outline leading-relaxed font-body">
          {COPY.myPage.avatarModalDesc}
        </p>
      </div>

      <div className="grid grid-cols-3 gap-2 max-h-[46vh] overflow-y-auto pr-0.5">
        {/* 기본 이미지 — 프리셋 해제. 해제하면 구글 사진(있으면)으로 돌아가므로
            타일 미리보기도 그 결과를 그대로 보여 준다. */}
        <AvatarTile
          label={COPY.myPage.avatarDefaultLabel}
          isSelected={draftId === null}
          onClick={() => setDraftId(null)}
        >
          <UserAvatar
            photoURL={photoURL}
            className="w-14 h-14"
            fallbackClassName="bg-primary-container/20 text-primary border border-outline-variant/10"
            iconClassName="text-[30px]"
            alt={COPY.myPage.avatarDefaultLabel}
          />
        </AvatarTile>

        {AVATAR_PRESETS.map((preset) => (
          <AvatarTile
            key={preset.id}
            label={preset.label}
            isSelected={draftId === preset.id}
            onClick={() => setDraftId(preset.id)}
          >
            <UserAvatar avatarId={preset.id} className="w-14 h-14" alt={preset.label} />
          </AvatarTile>
        ))}
      </div>

      <div className="flex gap-2">
        <Button variant="outline" onClick={onCancel} disabled={isSaving} className="flex-1">
          {COPY.myPage.cancel}
        </Button>
        <Button
          variant="primary"
          onClick={() => onSelect(draftId)}
          disabled={isSaving}
          className="flex-1"
        >
          {isSaving ? COPY.myPage.avatarSaving : COPY.myPage.avatarSave}
        </Button>
      </div>
    </Modal>
  );
}
