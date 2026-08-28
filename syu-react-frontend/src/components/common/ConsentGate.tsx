// src/components/common/ConsentGate.tsx
// 약관 동의 게이트 — 로그인은 됐지만 동의 기록이 없는 계정 위에 덮이는
// 전체 차단 화면 (기능 요구사항 NRQ-0006 / NRQ-0023 / NRQ-0024).
//
// 왜 페이지가 아니라 오버레이인가 —
//   App.tsx의 라우팅은 Page 유니온 + validPages + JSX 분기 세 곳을 함께
//   고쳐야 하는 수동 상태 머신이고, 로그인 시 자동 라우팅 useEffect까지
//   얽혀 있다. 게이트는 "어느 화면에 있든 덮는다"가 요구사항이라 라우팅에
//   자리를 만들 이유가 없다. 오버레이로 두면 App.tsx의 변경이 렌더 한 줄과
//   조회 useEffect 하나로 끝난다.
//
//   같은 이유로 주소창에 #home을 직접 쳐도 게이트를 우회할 수 없다 —
//   해시가 무엇이든 게이트는 user와 동의 상태만 보고 덮이기 때문이다.
//
// 포털을 쓰는 이유는 MobileWrapper 프레임(430px) 안쪽 최상단에 떠야 하기
// 때문이다. 페이지 컴포넌트 안에서 그리면 PageLayout의 z-20 헤더에 가린다.

import { useState } from 'react';
import { createPortal } from 'react-dom';
import Button from '../ui/Button';
import ConfirmDialog from '../ui/ConfirmDialog';
import AlertDialog from '../ui/AlertDialog';
import PageLayout from '../ui/PageLayout';
import LegalDocumentSheet from '../ui/LegalDocumentSheet';
import { useAuthStore } from '../../store/useAuthStore';
import { useConsentStore } from '../../store/useConsentStore';
import { COPY } from '../../constants/copy';
import { useSettingsStore } from '../../store/useSettingsStore';
import { type LegalDocument } from '../../constants/legal';

/** 체크박스 한 줄. 게이트 안에서만 네 번 반복되므로 파일 안에 둔다. */
function ConsentRow({
  id,
  label,
  badge,
  badgeClassName,
  checked,
  onChange,
  onViewDocument,
  viewDocumentLabel,
}: {
  id: string;
  label: string;
  badge?: string;
  badgeClassName?: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
  onViewDocument?: () => void;
  viewDocumentLabel?: string;
}) {
  return (
    <div className="flex items-center gap-4 py-2 px-2 group">
      {/* label로 감싸지 않는다 — 전문 열람 버튼이 라벨 안에 있으면 그 클릭이
          체크박스 토글로도 전파되어 "전문을 열면 체크도 된다"가 된다. */}
      <input
        id={id}
        className="signup-checkbox"
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
      />
      <div className="flex-grow flex items-center justify-between">
        <label
          htmlFor={id}
          className="text-[16px] text-on-surface-variant group-hover:text-on-surface transition-colors font-body cursor-pointer"
        >
          {label}
          {badge && <span className={`ml-1 text-[12px] font-semibold ${badgeClassName}`}>{badge}</span>}
        </label>
        {onViewDocument && (
          <button
            type="button"
            onClick={onViewDocument}
            aria-label={viewDocumentLabel}
            className="text-outline hover:text-primary transition-colors ml-2"
          >
            <span className="material-symbols-outlined text-[18px]">chevron_right</span>
          </button>
        )}
      </div>
    </div>
  );
}

export default function ConsentGate() {
  const user = useAuthStore((state) => state.user);
  const logout = useAuthStore((state) => state.logout);
  const saveConsent = useConsentStore((state) => state.saveConsent);
  const isSaving = useConsentStore((state) => state.isSaving);

  // 전문은 DB(settings/legal) 우선, 없으면 코드 상수. 스토어가 해석을 끝낸
  // 값을 주므로 조회 전에도 상수 전문이 들어 있다 — 동의 화면에서 전문이
  // 비는 일은 없어야 한다.
  //
  // marketingConsentEnabled는 마케팅 항목을 **화면에서 뺄지**의 스위치다.
  // 서비스에 마케팅 동의가 필요한지가 미정이라, 운영팀이 어드민에서 끄고 켠다.
  const { terms, privacy, marketing, marketingConsentEnabled } = useSettingsStore(
    (state) => state.legal
  );

  const [agreedTerms, setAgreedTerms] = useState(false);
  const [agreedPrivacy, setAgreedPrivacy] = useState(false);
  const [agreedMarketing, setAgreedMarketing] = useState(false);
  const [openDocument, setOpenDocument] = useState<LegalDocument | null>(null);
  const [showDeclineConfirm, setShowDeclineConfirm] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  const requiredChecked = agreedTerms && agreedPrivacy;
  // 숨겨 둔 항목은 "모두 동의"의 대상이 아니다. 빼지 않으면 화면의 체크를
  // 전부 켜도 '모두 동의'가 꺼진 채로 남아, 사용자가 못 찾을 항목을 찾게 된다.
  const allChecked = requiredChecked && (!marketingConsentEnabled || agreedMarketing);

  const handleCheckAll = (checked: boolean) => {
    setAgreedTerms(checked);
    setAgreedPrivacy(checked);
    if (marketingConsentEnabled) setAgreedMarketing(checked);
  };

  const handleAgree = async () => {
    if (!requiredChecked || !user?.uid) return;
    // 항목을 숨긴 상태에서는 무조건 false로 기록한다 — 묻지 않은 동의를
    // 받았다고 남기면 그 기록 자체가 근거 없는 것이 된다. (설정이 켜져 있던
    // 동안 체크했다가 그 사이 꺼진 경우까지 여기서 걸러진다.)
    const marketingAgreed = marketingConsentEnabled && agreedMarketing;
    const ok = await saveConsent(user.uid, { marketingAgreed });
    // 저장에 실패하면 게이트를 열지 않는다 — 기록 없이 통과시키면 애초에
    // 이 화면을 만든 이유(동의 근거를 남긴다)가 사라진다.
    if (!ok) setNotice(COPY.errors.consentSaveFailed);
  };

  const root = document.getElementById('app-modal-root');
  if (!root) return null;

  // ── 제목 블록은 스크롤러 밖에 둔다 (2026-08-27 UAT) ──
  // 375×667에서 이 화면은 스크롤이 생기는데, 그때 "약관 동의"라는 제목까지
  // 함께 밀려 올라가면 무엇에 체크하고 있는지가 화면에서 사라진다. 동의는
  // 법적 근거를 남기는 행위라 대상의 이름이 항상 보여야 한다.
  // 앱 전체 규약대로 sticky를 직접 만들지 않고 PageLayout의 header 슬롯을 쓴다.
  const header = (
    <div className="w-full px-6 pt-8 pb-4 bg-surface">
      <h1 className="text-[32px] font-bold leading-[40px] tracking-tight text-on-surface font-headline mb-2">
        {COPY.consent.title}
      </h1>
      {/* whitespace-pre-line — 문구의 \n(절 경계)을 그대로 살린다 */}
      <p className="text-[16px] leading-[24px] text-on-surface-variant font-body whitespace-pre-line">
        {COPY.consent.subtitle}
      </p>
    </div>
  );

  const footer = (
    <div className="w-full px-6 py-4 bg-surface border-t border-outline-variant/20 space-y-2">
      <Button
        id="btn-consent-agree"
        onClick={handleAgree}
        disabled={!requiredChecked || isSaving}
        variant="primary"
        className="w-full h-14 rounded-full"
      >
        {isSaving ? COPY.consent.submitting : COPY.consent.submit}
      </Button>
      <Button
        id="btn-consent-decline"
        onClick={() => setShowDeclineConfirm(true)}
        disabled={isSaving}
        variant="ghost"
        className="w-full py-2"
      >
        {COPY.consent.decline}
      </Button>
    </div>
  );

  return createPortal(
    <div className="absolute inset-0 z-50 bg-surface" role="dialog" aria-modal="true" aria-label={COPY.consent.title}>
      <PageLayout header={header} footer={footer}>
        <div className="min-h-full flex flex-col px-6 pb-4">
          {/* 아이콘 비주얼 — 가입 Step 1과 같은 조형을 쓴다.
              세로 치수는 375×667에서 목록까지 한 화면에 들어오도록 줄였다
              (2026-08-27 UAT: 원 96 → 80px, py-6 → py-1, mb-8 → mb-4).
              제목이 헤더로 빠져 고정 자리를 가져간 만큼, 스크롤러 안에서
              아낄 수 있는 곳은 이 장식뿐이다 — 체크박스 줄의 터치 높이와
              글자 크기는 건드리지 않았다. */}
          <div className="flex justify-center mb-4 relative py-1">
            <div className="absolute inset-0 bg-primary-container/5 blur-[40px] rounded-full" />
            {/* 라이트 서피스 위에 얹히는 원이므로 스크림(rgba 0,0,0,.4) 토큰을
                쓰면 시커먼 원판이 된다. 밝은 컨테이너 + 아웃라인으로 둘러
                아이콘의 primary 글로우만 살린다. */}
            <div className="w-20 h-20 rounded-full bg-surface-container border border-outline-variant flex items-center justify-center z-10">
              <span
                className="material-symbols-outlined text-[40px] text-primary"
                style={{
                  fontVariationSettings: "'FILL' 0",
                  filter: 'drop-shadow(0 0 8px var(--color-primary-fixed-glow-60))',
                }}
              >
                fact_check
              </span>
            </div>
          </div>

          <div className="flex-grow flex flex-col gap-3">
            <label className="flex items-center gap-4 p-3 rounded-pane bg-card-bg border border-card-border cursor-pointer hover:border-primary-container/50 transition-colors">
              <input
                className="signup-checkbox"
                type="checkbox"
                checked={allChecked}
                onChange={(e) => handleCheckAll(e.target.checked)}
              />
              <span className="text-[18px] font-semibold text-on-surface font-body flex-grow">
                {COPY.consent.agreeAll}
              </span>
            </label>

            <div className="h-px w-full bg-outline-variant/30 my-1" />

            <ConsentRow
              id="consent-terms"
              label={COPY.consent.termsLabel}
              badge={COPY.consent.required}
              badgeClassName="text-tertiary"
              checked={agreedTerms}
              onChange={setAgreedTerms}
              onViewDocument={() => setOpenDocument(terms)}
              viewDocumentLabel={COPY.consent.viewDocumentLabel(terms.title)}
            />

            <ConsentRow
              id="consent-privacy"
              label={COPY.consent.privacyLabel}
              badge={COPY.consent.required}
              badgeClassName="text-tertiary"
              checked={agreedPrivacy}
              onChange={setAgreedPrivacy}
              onViewDocument={() => setOpenDocument(privacy)}
              viewDocumentLabel={COPY.consent.viewDocumentLabel(privacy.title)}
            />

            {/* 선택 항목이라 아예 빼도 필수 동의 판정에 영향이 없다 —
                requiredChecked가 필수 2종만 보기 때문이다. */}
            {marketingConsentEnabled && (
              <ConsentRow
                id="consent-marketing"
                label={COPY.consent.marketingLabel}
                badge={COPY.consent.optional}
                badgeClassName="text-outline-variant"
                checked={agreedMarketing}
                onChange={setAgreedMarketing}
                onViewDocument={() => setOpenDocument(marketing)}
                viewDocumentLabel={COPY.consent.viewDocumentLabel(marketing.title)}
              />
            )}
          </div>
        </div>
      </PageLayout>

      {openDocument && (
        <LegalDocumentSheet doc={openDocument} onClose={() => setOpenDocument(null)} />
      )}

      {/* 파괴적 확인이 아니다 — 계정은 그대로 남고 세션만 끊는다 */}
      <ConfirmDialog
        open={showDeclineConfirm}
        icon="logout"
        title={COPY.consent.declineTitle}
        message={COPY.consent.declineBody}
        cancelLabel={COPY.consent.declineCancel}
        confirmLabel={COPY.consent.declineExit}
        onCancel={() => setShowDeclineConfirm(false)}
        onConfirm={() => {
          setShowDeclineConfirm(false);
          void logout();
        }}
      />

      <AlertDialog message={notice} tone="error" onClose={() => setNotice(null)} />
    </div>,
    root
  );
}
