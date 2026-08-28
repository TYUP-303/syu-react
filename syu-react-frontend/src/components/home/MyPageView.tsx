import { useState, useEffect } from 'react';
import Button from '../ui/Button';
import AlertDialog, { type AlertTone } from '../ui/AlertDialog';
import ConfirmDialog from '../ui/ConfirmDialog';
import UserAvatar from '../common/UserAvatar';
import AvatarPickerModal from './AvatarPickerModal';
import { useCharacterStore } from '../../store/useCharacterStore';
import { useTestStore } from '../../store/useTestStore';
import { useScenarioStore } from '../../store/useScenarioStore';
import { useAuthStore } from '../../store/useAuthStore';
import { useConsentStore, resolveMarketingSubscribed } from '../../store/useConsentStore';
import { COPY } from '../../constants/copy';
import { useSettingsStore } from '../../store/useSettingsStore';
import LegalDocumentSheet from '../ui/LegalDocumentSheet';
import { computeAlbumProgress, findLatestPlayedThemeId } from '../../utils/strategyStats';
import { buildMailtoHref } from '../../utils/mailto';

interface MyPageViewProps {
  user: any;
  logout: () => void;
  onClose: () => void;
  onGoEnding?: () => void;
  /** 회복일기 탭의 유형 보고서 뷰로 이동 (NRQ-0082) */
  onGoReport?: () => void;
}

export default function MyPageView({
  user,
  logout,
  onClose,
  onGoEnding,
  onGoReport,
}: MyPageViewProps) {
  const { character, avatarId, updateNickname, updateAvatarId, deleteCharacter, fetchCharacter } =
    useCharacterStore();
  const { deleteTestResults, fetchTestResults } = useTestStore();
  const { resetProgress, progress, themes, fetchThemes, fetchProgress } = useScenarioStore();

  // 약관 전문·문의 주소는 DB(settings/legal)가 우선이고, 없으면 코드 상수로
  // 폴백한다. 스토어가 이미 해석을 끝낸 값을 주므로 여기서 폴백을 다시
  // 판단하지 않는다 — 조회 전에도 상수 값이 들어 있어 빈 모달이 뜨지 않는다.
  const legalSettings = useSettingsStore((state) => state.legal);

  // 닉네임 수정 상태
  const [isEditingNickname, setIsEditingNickname] = useState(false);
  const [newNickname, setNewNickname] = useState(character?.nickname || '');
  const [isNicknameSaving, setIsNicknameSaving] = useState(false);

  // 마케팅 수신 토글 — 마케팅 약관 제6조가 지목한 **수신 거부 창구**다.
  //
  // 예전에는 localStorage('react_noti_marketing')에만 적었다. 그러면 약관이
  // 약속한 철회가 실제로는 아무 데도 전달되지 않는다 — 어드민의 수신자 추출은
  // Firestore만 보므로, 토글을 꺼 둔 사람에게 그대로 광고가 나갔다. 게다가
  // uid 없는 키라 한 기기에서 두 계정을 쓰면 설정이 섞였다.
  // 이제 users/{uid}.marketingConsent를 쓰고, 판정은 스토어의 순수 함수
  // (resolveMarketingSubscribed)가 어드민과 같은 규약으로 한다.
  //
  // 앱 푸시 토글은 발송 기능이 없는 죽은 UI라 숨겼다 (2026-08-18 사용자 결정)
  // — 푸시 도입이 확정되면 이 자리에 되살린다.
  const termsConsent = useConsentStore((state) => state.consent);
  const marketingConsent = useConsentStore((state) => state.marketingConsent);
  const setMarketingConsent = useConsentStore((state) => state.setMarketingConsent);
  const isMarketingSubscribed = resolveMarketingSubscribed(termsConsent, marketingConsent);

  // 화면 사본을 따로 두는 이유는 **누른 즉시 움직여야 하기 때문**이다.
  // 스토어 값만 그리면 Firestore 왕복이 끝날 때까지 토글이 제자리에 있어
  // 눌리지 않은 것처럼 보인다. 저장이 실패하면 아래에서 되돌린다.
  const [marketingPush, setMarketingPush] = useState(isMarketingSubscribed);
  const [isMarketingSaving, setIsMarketingSaving] = useState(false);

  // 알림 다이얼로그 (네이티브 alert 대체). onConfirm으로 '확인 후 실행' 순서를 표현한다.
  const [notice, setNotice] = useState<{ message: string; tone: AlertTone; onConfirm?: () => void } | null>(null);

  // 모달 제어 상태
  const [activeModal, setActiveModal] = useState<
    'terms' | 'privacy' | 'inquiry' | 'logout' | 'reset' | 'withdraw' | null
  >(null);

  // 아바타 프리셋 선택 (ui/Modal 포털이라 위 activeModal과 스택이 겹치지 않는다)
  const [isAvatarPickerOpen, setIsAvatarPickerOpen] = useState(false);
  const [isAvatarSaving, setIsAvatarSaving] = useState(false);
  
  // 1:1 문의 메일 링크.
  //
  // 상태가 없다 — 문의는 폼 제출이 아니라 사용자의 메일 앱을 여는 것으로
  // 끝나기 때문이다. 링크 하나면 되므로 전송 중 상태도, 입력값 보관도
  // 필요 없다. 주소는 문의 전용 창구(inquiryEmail)다 — 처리방침의
  // 보호책임자 연락처와 다른 이유는 legal.ts의 상수 주석 참조.
  const inquiryMailtoHref = buildMailtoHref({
    to: legalSettings.inquiryEmail,
    subject: COPY.myPage.inquiryMailSubject,
    body: COPY.myPage.inquiryMailBody(user?.email),
  });

  // 스토어 데이터 로드.
  // 테마 목록도 함께 받아야 한다 — 보고서·엔딩 해금 조건이 "완주한 에피소드
  // 수"가 아니라 "영역별 완주 여부"라서 영역 구성을 알아야 판단할 수 있다.
  useEffect(() => {
    fetchThemes();
    if (user?.uid) {
      fetchCharacter(user.uid);
      fetchTestResults(user.uid);
      fetchProgress(user.uid);
    }
  }, [user, fetchCharacter, fetchTestResults, fetchProgress, fetchThemes]);

  // 캐릭터 변경 시 닉네임 기본값 업데이트
  useEffect(() => {
    if (character?.nickname) {
      setNewNickname(character.nickname);
    }
  }, [character]);

  // 스토어(= users/{uid})의 값이 확정되면 화면 사본을 그 값으로 맞춘다.
  // 조회는 App.tsx가 로그인 시점에 이미 한 번 했으므로 여기서 다시 읽지
  // 않는다 — 이 화면을 열 때마다 문서를 한 번 더 읽을 이유가 없다.
  useEffect(() => {
    setMarketingPush(isMarketingSubscribed);
  }, [isMarketingSubscribed]);

  // 수신 거부/재수신 저장.
  //
  // 실패하면 토글을 되돌린다. 되돌리지 않으면 "껐다"고 믿은 사용자에게 계속
  // 광고가 나가고, 그 사실을 알 방법이 화면 어디에도 없다.
  const handleMarketingPushToggle = async () => {
    if (!user?.uid || isMarketingSaving) return;
    const nextVal = !marketingPush;
    setMarketingPush(nextVal);
    setIsMarketingSaving(true);
    const success = await setMarketingConsent(user.uid, nextVal);
    setIsMarketingSaving(false);
    if (!success) {
      setMarketingPush(!nextVal);
      setNotice({ message: COPY.errors.consentSaveFailed, tone: 'error' });
      return;
    }
    // 마케팅 약관 제6조 3항 — 처리 결과를 알린다는 약속의 이행.
    setNotice({
      message: nextVal ? COPY.myPage.marketingOptInDone : COPY.myPage.marketingOptOutDone,
      tone: 'success',
    });
  };

  // 닉네임 저장
  const handleSaveNickname = async () => {
    if (!newNickname.trim()) return;
    if (newNickname.length > 20) return;
    setIsNicknameSaving(true);
    const success = await updateNickname(user.uid, newNickname.trim());
    setIsNicknameSaving(false);
    if (!success) {
      // 실패해도 편집 상태를 유지한다 — 입력을 다시 치게 만들지 않는다
      setNotice({ message: COPY.errors.nicknameUpdateFailed, tone: 'error' });
      return;
    }
    setIsEditingNickname(false);
  };

  // 아바타 프리셋 저장.
  // Auth의 photoURL은 건드리지 않는다 — users/{uid}.avatarId만 쓰고,
  // 표시 우선순위(업로드 → 프리셋 → photoURL → 기본)는 utils/avatar가 정한다.
  const handleSelectAvatar = async (nextAvatarId: string | null) => {
    if (!user?.uid) return;
    setIsAvatarSaving(true);
    const success = await updateAvatarId(user.uid, nextAvatarId);
    setIsAvatarSaving(false);
    setIsAvatarPickerOpen(false);
    setNotice(
      success
        ? { message: COPY.myPage.avatarSaved, tone: 'success' }
        : { message: COPY.errors.avatarUpdateFailed, tone: 'error' },
    );
  };

  // 데이터 전체 초기화.
  //
  // 세 스토어 액션은 모두 성공 여부를 boolean으로 돌려준다. 예전에는 반환값을
  // 버리고 무조건 "초기화되었습니다"를 띄웠는데, 한 건이라도 실패하면 사용자는
  // 지워졌다고 믿은 채 그대로 남은 데이터를 다시 보게 된다.
  // 중간에 끊지 않고 셋 다 시도하는 것은 의도다 — 부분 삭제 상태에서 재시도할 때
  // 앞 단계가 이미 지워졌더라도 나머지가 진행되어야 한다.
  const handleResetData = async () => {
    if (!user?.uid) return;
    setIsNicknameSaving(true);
    const characterCleared = await deleteCharacter(user.uid);
    const testsCleared = await deleteTestResults(user.uid);
    const progressCleared = await resetProgress(user.uid);
    setIsNicknameSaving(false);
    setActiveModal(null);

    if (!characterCleared || !testsCleared || !progressCleared) {
      setNotice({ message: COPY.myPage.dataResetFailed, tone: 'error' });
      return;
    }
    // 알림을 확인한 뒤 마이페이지를 닫는다 (alert가 블로킹으로 만들던 순서를 명시적으로 표현)
    setNotice({ message: COPY.myPage.dataResetDone, tone: 'success', onConfirm: onClose });
  };

  // 회원 탈퇴.
  //
  // 순서가 계약이다: **Firestore 데이터 파기 → Auth 계정 삭제.**
  // 반대로 하면(예전 구현) deleteUser가 세션을 끊는 순간 보안 규칙
  // (request.auth.uid == uid)이 이후의 삭제 4건을 전부 거부해, 사용자는
  // 잔여 안내를 보고 개인정보는 클라이언트로 지울 수단이 없는 채 영구히
  // 남는다(처리방침 제4조 위반). 데이터를 먼저 지우면 실패 시 계정이
  // 남아 재시도할 수 있다.
  const handleWithdraw = async () => {
    if (!user?.uid) return;
    setIsNicknameSaving(true);

    try {
      const { auth, deleteUserDoc } = await import('../../api/firebase');

      // 0. 세션 신선도 사전 점검. deleteUser는 최근 로그인(약 5분)을
      // 요구하는데, 데이터부터 지우는 순서라 마지막 단계에서 거부되면
      // "데이터만 사라지고 계정은 남는" 어중간한 상태가 된다. 오래된
      // 세션은 아무것도 지우기 전에 돌려보낸다. 서버 판정이 정본이므로
      // 이 점검은 그 창을 좁히는 가드일 뿐이다.
      const lastSignIn = auth.currentUser?.metadata?.lastSignInTime;
      if (lastSignIn) {
        const elapsedMs = Date.now() - new Date(lastSignIn).getTime();
        if (!Number.isNaN(elapsedMs) && elapsedMs > 5 * 60 * 1000) {
          setNotice({ message: COPY.errors.auth.requiresRecentLogin, tone: 'error' });
          return;
        }
      }

      // 1. Firestore 유저 데이터 파기. 초기화(handleResetData)와 같은
      // 원칙으로 네 건 모두 시도하되 반환값을 버리지 않는다 — 하나라도
      // 실패하면 계정을 남긴 채 중단해 재시도 가능하게 한다.
      const userDocCleared = await deleteUserDoc(user.uid);
      const characterCleared = await deleteCharacter(user.uid);
      const testsCleared = await deleteTestResults(user.uid);
      const progressCleared = await resetProgress(user.uid);
      const allCleared =
        userDocCleared && characterCleared && testsCleared && progressCleared;

      if (!allCleared) {
        setNotice({ message: COPY.myPage.withdrawDataFailed, tone: 'error' });
        return;
      }

      // 2. 데이터가 모두 지워졌을 때만 Auth 계정을 삭제한다.
      const isAuthDeleted = await useAuthStore.getState().deleteAccount();
      if (!isAuthDeleted) {
        // 사전 점검을 통과하고도 서버가 거부한 드문 경우. 데이터는 이미
        // 지워졌지만 계정이 남아 있으므로, 재로그인 후 다시 탈퇴하면 끝난다.
        const errorMsg = useAuthStore.getState().error;
        setNotice({ message: errorMsg ?? COPY.myPage.withdrawFailed, tone: 'error' });
        return;
      }

      // 성공 안내만 네이티브 alert를 유지한다. deleteAccount()가 user를
      // null로 만들면 App.tsx가 즉시 랜딩으로 라우팅해 이 컴포넌트가
      // 언마운트되므로, 모달로는 메시지가 표시되지 않는다. 실패 경로는
      // 전부 계정 삭제 전이라 컴포넌트가 살아 있고 setNotice로 충분하다.
      alert(COPY.myPage.withdrawDone);
    } catch (err) {
      console.error(err);
      setNotice({ message: COPY.myPage.withdrawFailed, tone: 'error' });
    } finally {
      setIsNicknameSaving(false);
      setActiveModal(null);
    }
  };

  // 서비스를 함께한 일수. Firebase Auth의 계정 생성 시각(metadata.creationTime)을
  // 쓴다 — users/{uid}.createdAt과 같은 시점이면서 추가 읽기가 필요 없다.
  // 값이 없거나(모의 사용자 등) 파싱에 실패하면 null을 돌려 행 자체를 숨긴다.
  const journeyDays = (() => {
    const created = user?.metadata?.creationTime;
    if (!created) return null;
    const createdMs = new Date(created).getTime();
    if (Number.isNaN(createdMs)) return null;
    const elapsedDays = Math.floor((Date.now() - createdMs) / 86_400_000);
    // 가입 당일이 1일째다.
    return Math.max(elapsedDays + 1, 1);
  })();

  // 회복일기·엔딩 해금 기준의 단일 출처.
  //
  // R2 이전에는 엔딩 게이트가 `clearedCount >= 30` 하드코딩이었다. 실제
  // 콘텐츠는 4영역 × 10편 = 40편이고 회복일기는 "4영역 완주"에 열리므로,
  // 30이라는 숫자는 어느 쪽과도 맞지 않았다(회복일기가 열린 뒤에도 엔딩은
  // 잠겨 있거나 그 반대인 구간이 생긴다). 회복일기 해금 기준으로 통일한다.
  const album = computeAlbumProgress(themes, progress);
  const isEndingUnlocked = album.isAllComplete;

  // "유형 보고서 다시보기" 활성 조건 (NRQ-0082).
  // adhdResult 유무로 판단하던 것을 **테마 완주 기록 유무**로 고쳤다.
  // 보고서가 보여 주는 것은 검사 결과가 아니라 훈련 기록 집계라,
  // 검사만 하고 시나리오를 한 번도 안 한 사용자에게는 빈 화면이 열렸다.
  const latestReportThemeId = findLatestPlayedThemeId(themes, progress);
  const hasReport = latestReportThemeId !== null;

  // NRQ-0082 실구현 — 회복일기 탭의 보고서 뷰로 라우팅한다.
  // 버튼은 hasReport일 때만 눌리지만, 라우팅 콜백이 없거나 기록이
  // 사라진 경우를 대비해 안내 모달로 떨어진다.
  const handleGoReport = () => {
    if (hasReport && onGoReport) {
      onGoReport();
      return;
    }
    setNotice({ message: COPY.myPage.reportUnavailable, tone: 'info' });
  };

  // 개발자 계정 여부 확인.
  // VITE_DEV_LOGIN_EMAIL이 없으면 개발자 계정은 존재하지 않는 것으로 본다 —
  // 예전 기본값 'test@example.com'은 누구나 만들 수 있는 주소라, 환경 변수를
  // 설정하지 않은 배포에서 그 계정으로 가입만 하면 엔딩이 해금됐다.
  const devEmail = import.meta.env.VITE_DEV_LOGIN_EMAIL;
  const isDevUser = !!devEmail && user?.email === devEmail;

  // 테스트(개발자) 계정 탈퇴 가드.
  //
  // 이 계정은 UAT 내내 재로그인해 써야 하는 공용 계정이라, 한 번 탈퇴하면
  // Auth 계정 자체가 사라져 검수가 멈춘다. 확인 모달까지 들여보낸 뒤 막으면
  // "되돌려졌다"는 인상을 주므로 **진입 시점**에 안내로 끊는다.
  // 데이터 초기화는 막지 않는다 — 상태를 되돌리는 정상 수단이다.
  const handleWithdrawEntry = () => {
    if (isDevUser) {
      setNotice({ message: COPY.myPage.withdrawDevBlocked, tone: 'info' });
      return;
    }
    setActiveModal('withdraw');
  };

  // 약관·개인정보 전문은 ui/LegalDocumentSheet로 나갔다 — 같은 마크업을
  // 동의 게이트도 쓰기 때문이다. 문의는 이 화면에만 있는 폼이라 그대로 두고,
  // 초기화·탈퇴는 표준 ConfirmDialog(포털)로 나간다.
  const legalDocument =
    activeModal === 'terms'
      ? legalSettings.terms
      : activeModal === 'privacy'
        ? legalSettings.privacy
        : null;

  return (
    <div className="absolute inset-0 z-40 flex flex-col bg-surface animate-slideUp">
      {/* ── 상단 헤더 (스크롤러 밖 고정) ── */}
      <header className="
        w-full shrink-0
        flex justify-between items-center
        px-6 h-16
        bg-surface/80 backdrop-blur-md
        border-b border-outline-variant/30
      ">
        <button
          onClick={onClose}
          className="text-on-surface-variant hover:text-primary transition-colors flex items-center p-1 cursor-pointer"
          aria-label="닫기"
        >
          <span className="material-symbols-outlined text-[24px]">close</span>
        </button>
        <h2 className="text-[17px] font-bold text-on-surface font-headline">{COPY.myPage.title}</h2>
        <div className="w-8 h-8" /> {/* 레이아웃 균형용 여백 */}
      </header>

      {/* ── 콘텐츠 메인 (스크롤 영역) ──
          스크롤러(블록)와 flex 컬럼을 분리해야 한다. flex 컬럼이 스크롤러를
          겸하면 overflow:hidden인 자식(bento-card)이 min-height 보호를 잃고
          스크롤 대신 짜부라진다. */}
      <div className="flex-1 min-h-0 overflow-y-auto overscroll-y-none relative z-10">
        <div className="px-6 pt-6 pb-10 flex flex-col gap-6 w-full">
        
        {/* 1. 프로필 카드 */}
        <div className="w-full bento-card p-5 bg-surface-container-low flex flex-col gap-4">
          <div className="flex items-center gap-4">
            {/* 아바타 편집 진입 — 이미지 자체가 버튼이다.
                구글 계정 사진이 없는 이메일 가입자에게도 바꿀 방법이 생긴다.
                어포던스는 카메라 미니 배지 **하나**로 끝낸다. 예전에는 연필
                배지를 달았는데, 바로 옆 닉네임에도 연필이 있어 같은 아이콘이
                두 번 나오니 무엇을 누르는 버튼인지가 오히려 흐려졌다
                (사용자 검수 피드백). 카메라는 "사진을 바꾼다"를 가리켜
                닉네임 연필과 역할이 겹치지 않는다.
                호버 효과를 겹쳐 쓰지 않는 것도 의도다 — 이 화면은 모바일
                프레임(max-w 430px)이 기본이라 호버가 없는 입력에서는
                아무 단서도 남지 않는다. */}
            <button
              type="button"
              onClick={() => setIsAvatarPickerOpen(true)}
              className="relative shrink-0 rounded-full cursor-pointer"
              aria-label={COPY.myPage.avatarEdit}
            >
              <UserAvatar
                avatarId={avatarId}
                photoURL={user?.photoURL}
                className="w-14 h-14 border border-outline-variant/50"
                fallbackClassName="bg-primary-container/20 text-primary"
                iconClassName="text-[32px]"
                alt="사용자 프로필"
              />
              <span
                aria-hidden
                className="absolute -bottom-0.5 -right-0.5 w-5 h-5 rounded-full bg-surface-container-high border border-outline-variant/40 flex items-center justify-center text-on-surface-variant"
              >
                <span className="material-symbols-outlined text-[12px]">photo_camera</span>
              </span>
            </button>
            <div className="flex-1 min-w-0">
              {isEditingNickname ? (
                <div className="flex gap-2 items-center w-full">
                  <div className="flex flex-col flex-1">
                    <input
                      type="text"
                      value={newNickname}
                      onChange={(e) => setNewNickname(e.target.value)}
                      maxLength={20}
                      className="
                        w-full py-1.5 px-3 bg-surface border border-outline-variant rounded-control 
                        text-on-surface text-[13px] outline-none focus:border-primary font-body
                      "
                      placeholder={COPY.myPage.nicknamePlaceholder}
                    />
                    <span className="text-[9px] text-outline self-end mt-0.5">
                      {COPY.myPage.nicknameCounter(newNickname.length)}
                    </span>
                  </div>
                  <button
                    onClick={handleSaveNickname}
                    disabled={isNicknameSaving || !newNickname.trim()}
                    className="py-1.5 px-3 bg-primary hover:bg-primary/90 text-on-surface rounded-control text-[12px] font-bold shrink-0 transition-colors cursor-pointer"
                  >
                    {COPY.myPage.save}
                  </button>
                  <button
                    onClick={() => {
                      setIsEditingNickname(false);
                      setNewNickname(character?.nickname || '');
                    }}
                    className="py-1.5 px-3 bg-surface-container-high hover:bg-surface-container text-on-surface-variant rounded-control text-[12px] shrink-0 transition-colors cursor-pointer"
                  >
                    {COPY.myPage.cancel}
                  </button>
                </div>
              ) : (
                <div className="flex flex-col">
                  <div className="flex items-center gap-1.5">
                    <h3 className="text-[16px] font-bold text-on-surface truncate font-headline">
                      {character?.nickname || user?.displayName || COPY.myPage.defaultUserName}
                    </h3>
                    {character && (
                      <button
                        onClick={() => setIsEditingNickname(true)}
                        className="text-outline hover:text-primary transition-colors flex items-center p-0.5 cursor-pointer"
                        aria-label="닉네임 수정"
                      >
                        <span className="material-symbols-outlined text-[16px]">edit</span>
                      </button>
                    )}
                  </div>
                  <p className="text-[11px] text-outline font-body mt-0.5 truncate">{user?.email}</p>
                </div>
              )}
            </div>
          </div>
          
          {character && (
            <div className="flex items-center justify-between text-[12px] pt-3.5 border-t border-outline-variant/20">
              <span className="text-outline font-body">{COPY.myPage.mateLabel}</span>
              <span className="text-primary font-bold font-headline flex items-center gap-1">
                <span className="material-symbols-outlined text-[16px]">
                  {character.gender === 'male' ? 'male' : 'female'}
                </span>
                {character.gender === 'male' ? COPY.myPage.genderMale : COPY.myPage.genderFemale}
              </span>
            </div>
          )}
        </div>

        {/* 2. 알림 설정 패널 */}
        <div className="w-full flex flex-col gap-3">
          <h4 className="text-[12px] font-bold text-primary tracking-wider uppercase pl-1">{COPY.myPage.sectionNotification}</h4>
          <div className="w-full bento-card p-2.5 bg-surface-container-low flex flex-col">
            <div className="flex items-center justify-between p-2.5">
              <div className="flex flex-col">
                <span className="text-[13px] font-semibold text-on-surface">{COPY.myPage.marketing}</span>
                <span className="text-[10px] text-outline mt-0.5 font-body">{COPY.myPage.marketingDesc}</span>
              </div>
              {/* role="switch"는 장식이 아니다 — 예전에는 라벨도 상태도 없는
                  빈 button이라 스크린 리더로는 무엇을 켜고 끄는 버튼인지
                  알 수 없었다. 수신 거부는 약관이 약속한 창구라 보조기기로도
                  도달할 수 있어야 한다. */}
              <button
                type="button"
                role="switch"
                aria-checked={marketingPush}
                aria-label={COPY.myPage.marketing}
                disabled={isMarketingSaving}
                onClick={handleMarketingPushToggle}
                className={`
                  relative w-11 h-6 rounded-full transition-colors focus:outline-none shrink-0 cursor-pointer
                  disabled:opacity-60 disabled:cursor-default
                  ${marketingPush ? 'bg-primary' : 'bg-outline-variant/40'}
                `}
              >
                <span
                  className={`
                    absolute top-0.5 left-0.5 bg-card-bg w-5 h-5 rounded-full shadow transition-transform duration-200
                    ${marketingPush ? 'translate-x-5' : 'translate-x-0'}
                  `}
                />
              </button>
            </div>
          </div>
        </div>

        {/* 3. 활동 내역 패널 */}
        <div className="w-full flex flex-col gap-3">
          <h4 className="text-[12px] font-bold text-primary tracking-wider uppercase pl-1">{COPY.myPage.sectionActivity}</h4>
          <div className="w-full bento-card bg-surface-container-low p-2">
            {journeyDays !== null && (
              <div className="flex items-center gap-3 p-3">
                <div className="w-9 h-9 bg-primary/10 border border-primary/20 rounded-control flex items-center justify-center text-primary shrink-0">
                  <span className="material-symbols-outlined text-[20px]">calendar_today</span>
                </div>
                <div className="flex-1">
                  <span className="text-[13px] font-semibold text-on-surface block">{COPY.myPage.visitLabel}</span>
                  <span className="text-[11px] text-outline font-body">{COPY.myPage.visitDesc(journeyDays)}</span>
                </div>
              </div>
            )}

            <div className={`flex items-center justify-between p-3 ${journeyDays !== null ? 'border-t border-outline-variant/20' : ''}`}>
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 bg-secondary/10 border border-secondary/20 rounded-control flex items-center justify-center text-secondary shrink-0">
                  <span className="material-symbols-outlined text-[20px]">bar_chart</span>
                </div>
                <div className="flex flex-col">
                  <span className="text-[13px] font-semibold text-on-surface">{COPY.myPage.reportReplay}</span>
                  <span className="text-[10px] text-outline font-body">
                    {hasReport ? COPY.myPage.reportReplayDone : COPY.myPage.reportReplayNone}
                  </span>
                </div>
              </div>
              <button
                disabled={!hasReport}
                onClick={handleGoReport}
                className="
                  py-1.5 px-3 bg-surface-container border border-outline-variant/30 text-on-surface text-[11px] rounded-control
                  hover:border-primary disabled:opacity-40 disabled:hover:border-outline-variant/30 cursor-pointer font-bold
                "
              >
                {COPY.myPage.reportReplayCta}
              </button>
            </div>

            <div className="flex items-center justify-between p-3 border-t border-outline-variant/20">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 bg-tertiary/10 border border-tertiary/20 rounded-control flex items-center justify-center text-tertiary shrink-0">
                  <span className="material-symbols-outlined text-[20px]">workspace_premium</span>
                </div>
                <div className="flex flex-col">
                  <span className="text-[13px] font-semibold text-on-surface">{COPY.myPage.endingReplay}</span>
                  <span className="text-[10px] text-outline font-body">
                    {isDevUser || isEndingUnlocked
                      ? COPY.myPage.endingUnlockedDesc
                      : COPY.myPage.endingLockedDesc(album.completedThemes, album.totalThemes)}
                  </span>
                </div>
              </div>
              <button
                disabled={!isDevUser && !isEndingUnlocked}
                onClick={onGoEnding}
                className="
                  py-1.5 px-3 bg-surface-container border border-outline-variant/30 text-on-surface text-[11px] rounded-control
                  hover:border-primary disabled:opacity-40 disabled:hover:border-outline-variant/30 cursor-pointer font-bold
                "
              >
                {COPY.myPage.endingReplayCta}
              </button>
            </div>
          </div>
        </div>

        {/* 4. 서비스 정보 패널 */}
        <div className="w-full flex flex-col gap-3">
          <h4 className="text-[12px] font-bold text-primary tracking-wider uppercase pl-1">{COPY.myPage.sectionService}</h4>
          <div className="w-full bento-card bg-surface-container-low p-1.5">
            {[
              { label: legalSettings.terms.title, action: () => setActiveModal('terms') },
              { label: legalSettings.privacy.title, action: () => setActiveModal('privacy') },
              { label: COPY.myPage.menuInquiry, action: () => setActiveModal('inquiry') },
            ].map((item, idx) => (
              <button
                key={item.label}
                onClick={item.action}
                className={`
                  w-full px-3.5 py-3 text-left text-[13px] font-semibold text-on-surface flex justify-between items-center cursor-pointer hover:bg-surface-container-high/25 rounded-control
                  ${idx > 0 ? 'border-t border-outline-variant/10' : ''}
                `}
              >
                <span>{item.label}</span>
                <span className="material-symbols-outlined text-[16px] text-outline">chevron_right</span>
              </button>
            ))}
          </div>
        </div>

        {/* 5. 계정 관리 및 리셋 */}
        <div className="w-full flex flex-col gap-3 mt-4">
          <div className="flex flex-col gap-2">
            {/* 로그아웃은 되돌릴 수 있는 동작이다. 예전에는 이 버튼만 error
                색을 입고 있어, 바로 아래의 초기화·탈퇴(진짜 파괴적 동작)보다
                오히려 위험해 보였다 — 중립 outline으로 낮춰 위계를 맞춘다.
                대신 확인 모달은 새로 건다(실수 클릭 방지). */}
            <Button
              id="btn-logout"
              variant="outline"
              onClick={() => setActiveModal('logout')}
              icon="logout"
              className="w-full py-3.5 rounded-control font-bold"
            >
              {COPY.myPage.logout}
            </Button>
            
            {/* 두 버튼은 **눌리는 버튼**으로 읽혀야 한다. 예전에는 글자가
                text-outline·text-error/60, 테두리가 outline-variant/30·error/10이라
                바로 위 로그아웃 버튼과 나란히 놓였을 때 비활성(disabled)처럼
                보였다 — UAT 검수에서 "눌러도 되는 건지 모르겠다"로 지적됐다.
                글자와 테두리를 불투명 토큰으로 올려 대비를 회복하되, 탈퇴는
                error 계열을 유지해 파괴적 동작이라는 신호를 남긴다. */}
            <div className="flex gap-2">
              <button
                onClick={() => setActiveModal('reset')}
                className="flex-1 py-3 text-[11px] text-on-surface-variant hover:text-on-surface bg-surface-container-low hover:bg-surface-container-high/50 border border-outline-variant hover:border-outline rounded-control transition-all cursor-pointer font-semibold"
              >
                {COPY.myPage.resetData}
              </button>
              <button
                onClick={handleWithdrawEntry}
                className="flex-1 py-3 text-[11px] text-error hover:bg-error/10 border border-error/40 hover:border-error rounded-control transition-all cursor-pointer font-semibold"
              >
                {COPY.myPage.withdraw}
              </button>
            </div>
          </div>
          
          <div className="flex items-center justify-center gap-1.5 text-outline text-[11px] font-body mt-2.5">
            <span>{COPY.myPage.appVersion}</span>
            <span>•</span>
            <a
              href="https://github.com/TYUP-303/syu-react"
              target="_blank"
              rel="noreferrer"
              className="text-primary hover:underline flex items-center gap-0.5 font-bold"
            >
              GitHub
              <span className="material-symbols-outlined text-[12px] font-normal">open_in_new</span>
            </a>
          </div>
        </div>

        </div>
      </div>

      {/* ── 오버레이 모달들 (비스크롤 루트 기준 absolute) ──
          초기화·탈퇴 확인은 여기 있지 않다. 두 모달은 ui/ConfirmDialog(포털)로
          옮겼다 — 같은 마크업을 복제해 두는 바람에 백드롭 농도(scrim 70)까지
          표준 모달(scrim 60)과 어긋나 있었다. */}

      {/* A·B. 이용약관 / 개인정보 처리방침 전문 (ui/LegalDocumentSheet 공용) */}
      {legalDocument && (
        <LegalDocumentSheet doc={legalDocument} onClose={() => setActiveModal(null)} />
      )}

      {/* C. 1:1 문의하기 모달.
          입력 폼이 아니라 메일 앱 링크다. 폼을 받아 줄 API 서버가 없어
          예전 구현은 setTimeout 뒤 "접수되었습니다"만 띄우고 문의 내용을
          그대로 버렸다 — 사용자가 답을 기다리게 만드는 거짓 안내였다.
          주소를 화면에 그대로 노출하는 것은 의도다: mailto를 처리할 메일
          앱이 없는 브라우저에서는 버튼이 아무 반응도 하지 않으므로,
          눈으로 읽고 복사할 수 있는 경로를 함께 남겨야 막다른 길이
          되지 않는다. */}
      {activeModal === 'inquiry' && (
        <div className="absolute inset-0 z-50 flex items-center justify-center px-5">
          <div className="absolute inset-0 bg-scrim-bg-70 backdrop-blur-sm" onClick={() => setActiveModal(null)} />

          <div className="relative w-full max-w-[350px] bento-card p-6 bg-surface-container space-y-4 animate-scaleIn z-20">
            <h4 className="text-[16px] font-bold text-on-surface font-headline">{COPY.myPage.inquiryTitle}</h4>

            <p className="text-[12px] text-outline leading-relaxed font-body">
              {COPY.myPage.inquiryGuide}
            </p>

            <div className="rounded-control bg-surface border border-outline-variant/30 px-3.5 py-2.5">
              <span className="block text-[10px] text-outline font-body">
                {COPY.myPage.inquiryAddressLabel}
              </span>
              {/* select-all: 길게 눌러 복사하는 모바일 사용을 돕는다 */}
              <span className="block text-[13px] font-bold text-on-surface break-all select-all mt-0.5">
                {legalSettings.inquiryEmail}
              </span>
            </div>

            <div className="flex flex-col gap-2">
              {/* button이 아니라 a인 것은 semantics 그대로다 — 이 요소는
                  앱 내 동작을 실행하지 않고 외부 메일 클라이언트로 나간다.
                  href를 DOM에 두면 링크 구성 자체를 테스트할 수도 있다. */}
              <a
                href={inquiryMailtoHref}
                className="
                  relative w-full flex items-center justify-center gap-2
                  rounded-control py-3 text-[16px] font-semibold font-headline
                  bg-primary hover:bg-primary-container text-on-primary
                  transition-all duration-200 active:scale-95
                "
              >
                {COPY.myPage.inquiryCta}
                <span className="material-symbols-outlined text-[20px]">mail</span>
              </a>
              <Button variant="outline" onClick={() => setActiveModal(null)} className="w-full">
                {COPY.myPage.inquiryClose}
              </Button>
            </div>

            <p className="text-[10px] text-outline font-body leading-relaxed">
              {COPY.myPage.inquiryFallback}
            </p>
          </div>
        </div>
      )}

      {/* ── 로그아웃 확인 (되돌릴 수 있는 동작이라 default tone) ── */}
      <ConfirmDialog
        open={activeModal === 'logout'}
        icon="logout"
        title={COPY.myPage.logoutTitle}
        message={COPY.myPage.logoutBody}
        cancelLabel={COPY.myPage.cancel}
        confirmLabel={COPY.myPage.logoutConfirm}
        onCancel={() => setActiveModal(null)}
        onConfirm={() => {
          setActiveModal(null);
          logout();
        }}
      />

      {/* ── 파괴적 확인 모달 (표준 ConfirmDialog · destructive) ── */}
      <ConfirmDialog
        open={activeModal === 'reset'}
        tone="destructive"
        icon="warning"
        title={COPY.myPage.resetTitle}
        message={COPY.myPage.resetBody}
        cancelLabel={COPY.myPage.cancel}
        confirmLabel={isNicknameSaving ? COPY.myPage.resetting : COPY.myPage.resetConfirm}
        busy={isNicknameSaving}
        onCancel={() => setActiveModal(null)}
        onConfirm={handleResetData}
      />

      <ConfirmDialog
        open={activeModal === 'withdraw'}
        tone="destructive"
        icon="dangerous"
        title={COPY.myPage.withdrawTitle}
        message={COPY.myPage.withdrawBody}
        cancelLabel={COPY.myPage.cancel}
        confirmLabel={isNicknameSaving ? COPY.myPage.withdrawing : COPY.myPage.withdrawConfirm}
        busy={isNicknameSaving}
        onCancel={() => setActiveModal(null)}
        onConfirm={handleWithdraw}
      />

      {/* ── 아바타 프리셋 선택 (ui/Modal 포털) ── */}
      {isAvatarPickerOpen && (
        <AvatarPickerModal
          currentAvatarId={avatarId}
          photoURL={user?.photoURL}
          isSaving={isAvatarSaving}
          onCancel={() => setIsAvatarPickerOpen(false)}
          onSelect={handleSelectAvatar}
        />
      )}

      <AlertDialog
        message={notice?.message ?? null}
        tone={notice?.tone}
        onClose={() => setNotice(null)}
        onConfirm={notice?.onConfirm}
      />
    </div>
  );
}
