import { useState } from 'react';
import { useAuthStore } from '../store/useAuthStore';
import { useCharacterStore } from '../store/useCharacterStore';
import CharacterGraphic from '../components/CharacterGraphic';
import InputField from '../components/ui/InputField';
import Button from '../components/ui/Button';
import PageLayout from '../components/ui/PageLayout';
import { COPY } from '../constants/copy';
import { subjectParticle } from '../utils/koreanParticle';
import { versionedAsset } from '../utils/assetVersion';

interface CharacterCreationPageProps {
  onCancel: () => void;                      // 취소 또는 뒤로 가기 -> 홈 화면으로
  onComplete: (goToTest: boolean) => void;   // 캐릭터 생성 완료 (true: 검사로, false: 홈으로)
}

export default function CharacterCreationPage({ onCancel, onComplete }: CharacterCreationPageProps) {
  const { user } = useAuthStore();
  const { createCharacter, isLoading: isSaving, error: saveError } = useCharacterStore();

  const [gender, setGender] = useState<'male' | 'female'>('male');
  const [nickname, setNickname] = useState('');
  const [nicknameError, setNicknameError] = useState('');
  const [showSuccessModal, setShowSuccessModal] = useState(false);

  const handleNicknameChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    if (val.length <= 20) {
      setNickname(val);
      setNicknameError('');
    }
  };

  const handleCreate = async () => {
    if (!nickname.trim()) {
      setNicknameError(COPY.errors.nicknameRequired);
      return;
    }

    if (nickname.length > 20) {
      setNicknameError(COPY.errors.nicknameTooLong);
      return;
    }

    if (!user?.uid) {
      setNicknameError(COPY.errors.sessionExpired);
      return;
    }

    const success = await createCharacter(user.uid, nickname.trim(), gender);
    if (success) {
      setShowSuccessModal(true);
    }
  };

  // ── 헤더 (닫기 하나) + 단계 표시 ──
  // ←(arrow_back)와 ✕가 같은 onCancel을 공유해 완전히 중복이었다. 검사
  // 화면에서 확정한 패턴(2026-08-08)대로 ✕만 남기고 좌측은 폭만 맞춘
  // 스페이서를 둔다 — 화살표는 "한 단계 뒤로" 기호인데 실제 동작은
  // "캐릭터 생성 이탈"이라 의미도 어긋난다.
  //
  // 단계 표시줄을 헤더와 한 덩어리로 묶은 것은 2026-08-27이다. 전에는 이
  // 화면이 PageLayout을 쓰지 않고 header·main을 직접 쌓고 있었는데, 그러면
  // 고정 영역이 무엇인지가 파일마다 달라진다. 앱 규약대로 슬롯에 넣는다.
  const header = (
    <div className="w-full bg-surface/80 backdrop-blur-md">
      <header className="
        w-full flex justify-between items-center
        px-6 h-16 border-b border-outline-variant/30
      ">
        {/* ✕(우측)와 폭을 맞춘 스페이서 — ✕는 p-2 40px − mr-2 8px = 유효 32px */}
        <div className="w-8" aria-hidden="true" />
        <span className="text-[16px] font-bold text-on-surface font-headline">
          나의 캐릭터 만들기
        </span>
        <button
          onClick={onCancel}
          className="text-outline hover:text-primary transition-colors p-2 -mr-2 rounded-full"
          aria-label="닫기"
        >
          <span className="material-symbols-outlined">close</span>
        </button>
      </header>

      {/* ── 단계 및 프로그레스 바 ── */}
      <div className="px-6 pt-4 flex flex-col gap-2">
        <div className="flex justify-between items-center text-[12px] font-semibold text-outline font-headline">
          <span>Step 1. 기본 정보 입력</span>
          <span>1 / 1 단계</span>
        </div>
        <div className="h-1.5 w-full bg-disabled-bg rounded-full overflow-hidden">
          <div className="h-full w-full bg-primary" />
        </div>
      </div>
    </div>
  );

  // ── 생성 CTA는 하단 고정이다 (2026-08-27 UAT) ──
  // 375×667에서는 닉네임 입력까지 마쳐도 버튼이 접힌 자리 아래에 있어
  // 한 번 더 스크롤해야 보였다. 검사 실행 화면의 이전/다음도 같은 회차에
  // 고정으로 바뀌었으므로, 앱 전체에서 "행동 버튼은 항상 하단"으로 맞춘다.
  const footer = (
    <div className="w-full px-6 py-4 bg-surface border-t border-outline-variant/20">
      <Button
        type="button"
        onClick={handleCreate}
        loading={isSaving}
        icon="check"
      >
        캐릭터 만들기
      </Button>
    </div>
  );

  return (
    <div className="relative w-full h-full">
      <PageLayout header={header} footer={footer}>
        <div className="px-6 pt-6 pb-6 flex flex-col gap-8">

        {/* 캐릭터 프리뷰 영역 */}
        <div className="flex flex-col items-center gap-3">
          <div className="relative p-6 bg-surface-container/30 border border-card-border rounded-pane w-full flex items-center justify-center">
            <img
              src={gender === 'male'
                ? versionedAsset('/scenario/characters/baeksul_m_default.png')
                : versionedAsset('/scenario/characters/baeksul_f_default.png')
              }
              alt="내 캐릭터 미리보기"
              className="w-[150px] h-[150px] object-contain z-10 graphic-float"
            />
          </div>
          <p className="text-[12px] text-outline font-body">
            고른 대로 내 캐릭터 모습이 바로 바뀌어요.
          </p>
        </div>

        {/* 성별 선택 영역 */}
        <div className="space-y-3">
          <label className="text-[12px] font-semibold text-outline uppercase tracking-[0.05em] font-body ml-1">
            성별 선택
          </label>
          <div className="grid grid-cols-2 gap-4">
            {/* 남성형 */}
            <button
              type="button"
              onClick={() => setGender('male')}
              className={`
                flex flex-col items-center justify-center gap-3 p-4 rounded-pane border transition-all duration-300
                ${gender === 'male'
                  ? 'bg-secondary-container/10 border-secondary-container text-on-surface shadow-[0_0_15px_var(--color-secondary-glow-30)]'
                  : 'bg-card-bg border-card-border text-outline hover:border-outline-variant'
                }
              `}
            >
              <img
                src={versionedAsset('/scenario/characters/baeksul_m_default.png')}
                alt="남자 캐릭터"
                className="w-12 h-12 object-contain"
              />
              <span className="text-[14px] font-bold font-headline">남자</span>
            </button>

            {/* 여성형 */}
            <button
              type="button"
              onClick={() => setGender('female')}
              className={`
                flex flex-col items-center justify-center gap-3 p-4 rounded-pane border transition-all duration-300
                ${gender === 'female'
                  ? 'bg-primary-container/10 border-primary-container text-on-surface shadow-[0_0_15px_var(--color-primary-glow-30)]'
                  : 'bg-card-bg border-card-border text-outline hover:border-outline-variant'
                }
              `}
            >
              <img
                src={versionedAsset('/scenario/characters/baeksul_f_default.png')}
                alt="여자 캐릭터"
                className="w-12 h-12 object-contain"
              />
              <span className="text-[14px] font-bold font-headline">여자</span>
            </button>
          </div>
        </div>

        {/* 닉네임 입력 영역 */}
        <div className="space-y-2">
          <InputField
            id="nickname"
            type="text"
            label="캐릭터 닉네임"
            icon="label"
            placeholder="내 캐릭터의 이름을 지어주세요"
            value={nickname}
            onChange={handleNicknameChange}
            error={nicknameError || saveError || undefined}
            labelAction={
              <span className="text-[12px] text-outline-variant font-body">
                {nickname.length}/20자
              </span>
            }
          />
          <p className="text-[12px] text-outline font-body ml-1">
            ※ 닉네임은 나중에 마이페이지 프로필 설정에서 자유롭게 변경할 수 있어요.
          </p>
        </div>

        </div>
      </PageLayout>

      {/* ── 생성 완료 팝업 모달 (MODAL_goto_next_1) ── */}
      {showSuccessModal && (
        <div className="absolute inset-0 z-50 flex items-center justify-center px-6">
          {/* 어두운 반투명 백드롭 */}
          <div className="absolute inset-0 bg-scrim-bg-75 backdrop-blur-sm" />

          {/* 모달 박스 */}
          <div className="
            relative w-full max-w-[380px] bg-surface-container-high border border-card-border
            rounded-pane p-6 shadow-2xl flex flex-col items-center gap-6 z-10
            animate-scaleIn
          ">
            {/* 캐릭터 그래픽 — 링·배경 연출은 CharacterGraphic이 자체 소유.
                animated={false}로 부유(둥실 뜨는 floatAnim)를 끈다: 모달은
                버튼 두 개를 고르는 결정 화면인데 그림이 계속 오르내려
                "산만하다"는 UAT 지적을 받았다. 링과 원형 배경은 그대로
                그려진다(호흡 애니메이션만 함께 멎는다 — 부유와 링 호흡이
                CharacterGraphic에서 같은 스위치를 공유한다).
                본문 상단의 미리보기(150px)는 지적 대상이 아니므로 유지. */}
            <CharacterGraphic type={gender} size={130} animated={false} />

            {/* 타이틀 및 멘트 */}
            <div className="text-center space-y-2">
              <h3 className="text-[20px] font-bold text-on-surface font-headline">
                나의 캐릭터 완성!
              </h3>
              <p className="text-[14px] leading-[22px] text-on-surface-variant font-body whitespace-pre-line">
                <strong className="text-primary">{nickname}</strong>
                {subjectParticle(nickname)} 생성됐어요. 이제 마음 건강 여정을 시작해 볼까요?
              </p>
            </div>

            {/* 모달 제어 버튼 */}
            <div className="w-full flex flex-col gap-2.5">
              <Button
                variant="primary"
                onClick={() => {
                  setShowSuccessModal(false);
                  onComplete(true); // 검사 가이드 페이지로 직행
                }}
                icon="explore"
              >
                검사 시작하기
              </Button>
              <Button
                variant="outline"
                onClick={() => {
                  setShowSuccessModal(false);
                  onComplete(false); // 홈으로 돌아감
                }}
              >
                나중에 하기
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
