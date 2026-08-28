// src/pages/TestPrepSubPage.tsx
// 검사 준비 및 주의사항 안내 서브 페이지

import Button from '../components/ui/Button';
import PageLayout from '../components/ui/PageLayout';
import TestTypeBadge from '../components/test/TestTypeBadge';
import { COPY } from '../constants/copy';
import { TEST_THEME, type TestType } from '../constants/testTheme';

interface TestPrepSubPageProps {
  testType: TestType;
  onStart: () => void;
  onBack: () => void;
}

export default function TestPrepSubPage({
  testType,
  onStart,
  onBack,
}: TestPrepSubPageProps) {
  const isAdhd = testType === 'adhd';
  const t = COPY.test.byType[testType];
  // 검사별 색 축. 원색 토큰(text-primary 등)을 직접 쓰지 말 것 — constants/testTheme.ts 참고
  const theme = TEST_THEME[testType];

  // ── 헤더 (닫기 하나) ──
  // ←(arrow_back)와 ✕가 같은 onBack을 공유해 완전히 중복이었다. 검사 진행
  // 화면에서 확정한 패턴(2026-08-08)대로 ✕만 남기고 좌측은 폭만 맞춘
  // 스페이서를 둔다 — 화살표는 "한 단계 뒤로" 기호인데 실제 동작은
  // "검사 플로우 이탈"이라 의미도 어긋난다.
  //
  // PageLayout의 header 슬롯에 넣는다(shrink-0·z-20은 슬롯이 붙여 준다).
  // 공용 PageHeader 대신 이 마크업을 그대로 쓰는 이유는 닫기 버튼의 레이블이
  // '검사 닫기'(COPY.test.exitCloseLabel)로 진행 화면과 짝을 이루기
  // 때문이다 — PageHeader의 기본값은 '닫기'다.
  const header = (
    <header className="
      w-full flex justify-between items-center
      px-6 h-16 border-b border-outline-variant/30
      bg-surface/80 backdrop-blur-md
    ">
      {/* ✕(우측)와 폭을 맞춘 스페이서 — ✕는 p-2 40px − mr-2 8px = 유효 32px */}
      <div className="w-8" aria-hidden="true" />
      <span className="text-[16px] font-bold text-on-surface font-headline">
        {t.navTitle}
      </span>
      <button
        onClick={onBack}
        className="text-outline hover:text-primary transition-colors p-2 -mr-2 rounded-full"
        aria-label={COPY.test.exitCloseLabel}
      >
        <span className="material-symbols-outlined">close</span>
      </button>
    </header>
  );

  // ── 검사 시작 CTA (하단 고정) ── 2026-08-27 UAT R1-07
  // 375×667에서는 안내 카드만으로 화면이 차서, 예전처럼 콘텐츠 끝에 두면
  // 스크롤을 내려야 CTA가 나타났다. 첫 화면에서 "다음에 뭘 눌러야 하는지"가
  // 보이지 않는 것은 스크롤 암시로 얻는 것보다 잃는 게 크다는 판단이다.
  // 진행 화면의 [이전/다음]도 같은 회차에 하단 고정했으므로(R1-08), 검사
  // 플로우 전체가 "행동 버튼은 항상 하단"으로 통일된다.
  const footer = (
    <div className="px-6 pt-4 pb-6 bg-surface border-t border-outline-variant/20">
      <Button type="button" onClick={onStart} icon="play_arrow">
        {COPY.test.prepCta}
      </Button>
    </div>
  );

  return (
    <PageLayout className="animate-fadeIn" header={header} footer={footer}>
      {/* PageLayout이 시맨틱 <main>을 렌더링하므로 여기는 div여야 한다 (main 중첩 금지) */}
      <div className="px-6 pt-6 pb-8 flex flex-col gap-6">

        {/* 히어로 비주얼 영역 — 상단 액센트 바 + 검사명 배지로 두 검사를 구분한다
            (.bento-card가 position:relative + overflow:hidden이라 바를 얹을 수 있다) */}
        <div className="w-full bento-card p-6 flex flex-col items-center gap-4 text-center">
          <div
            className={`absolute top-0 inset-x-0 h-1 ${theme.accentBg}`}
            aria-hidden="true"
          />
          <TestTypeBadge testType={testType} />
          <div className="relative">
            <div className={`absolute inset-0 blur-[30px] rounded-full ${theme.containerGlow}`} />
            <span
              className={`material-symbols-outlined text-[54px] relative z-10 ${theme.accentText}`}
              style={{ fontVariationSettings: "'FILL' 1" }}
            >
              {isAdhd ? 'neurology' : 'psychology'}
            </span>
          </div>
          <div className="space-y-1">
            <h2 className="text-[20px] font-bold text-on-surface font-headline">
              {t.prepHeadline}
            </h2>
            <p className="text-[13px] text-on-surface-variant font-body">
              {t.prepDesc}
            </p>
          </div>
        </div>

        {/* 검사 세부 사항 (Bento Layout) */}
        <div className="grid grid-cols-2 gap-3">
          <div className="bento-card p-4 flex flex-col gap-2 bg-surface-container/40">
            <span className={`material-symbols-outlined text-[20px] ${theme.accentText}`}>format_list_numbered</span>
            <div className="space-y-0.5">
              <p className="text-[11px] text-outline font-body">{COPY.test.prepCountLabel}</p>
              <p className="text-[15px] font-bold text-on-surface font-headline">
                {t.prepCount}
              </p>
            </div>
          </div>
          <div className="bento-card p-4 flex flex-col gap-2 bg-surface-container/40">
            <span className={`material-symbols-outlined text-[20px] ${theme.accentText}`}>schedule</span>
            <div className="space-y-0.5">
              <p className="text-[11px] text-outline font-body">{COPY.test.prepDurationLabel}</p>
              <p className="text-[15px] font-bold text-on-surface font-headline">{COPY.test.prepDuration}</p>
            </div>
          </div>
          <div className="bento-card p-4 flex flex-col gap-2 col-span-2 bg-surface-container/40">
            <span className={`material-symbols-outlined text-[20px] ${theme.accentText}`}>verified</span>
            <div className="space-y-0.5">
              <p className="text-[11px] text-outline font-body">{COPY.test.prepStandardLabel}</p>
              <p className="text-[14px] font-bold text-on-surface font-headline">
                {t.prepStandard}
              </p>
            </div>
          </div>

          {/* ADHD 응답 기준 (UAT 2026-08-11 조세현).
              검사 중에도 같은 문구를 문항 카드에 띄우지만, 답하기 전에 한 번
              읽고 들어가도록 준비 화면에도 둔다.
              ⚠️ '최근 6개월'은 ASRS 고유 프레이밍이라 ADHD에서만 그린다. */}
          {isAdhd && (
            <div className="bento-card p-4 flex flex-col gap-2 col-span-2 bg-surface-container/40">
              <span className={`material-symbols-outlined text-[20px] ${theme.accentText}`}>history</span>
              <div className="space-y-0.5">
                <p className="text-[11px] text-outline font-body">{COPY.test.adhdTimeframeLabel}</p>
                <p className="text-[14px] font-bold text-on-surface font-headline">
                  {COPY.test.adhdTimeframeNotice}
                </p>
              </div>
            </div>
          )}
        </div>

        {/* 임상 면책 주의사항 안내 (Alert) */}
        <div className="p-4 rounded-pane bg-error-container/10 border border-error-container/30 text-on-error-container flex gap-3">
          <span className="material-symbols-outlined text-[20px] text-error flex-shrink-0">warning</span>
          <div className="space-y-1">
            <h4 className="text-[13px] font-bold font-headline">{COPY.test.prepDisclaimerTitle}</h4>
            <p className="text-[12px] leading-[18px] text-on-surface-variant font-body">
              {COPY.test.prepDisclaimerBody}
            </p>
          </div>
        </div>

        {/* 검사 시작 CTA는 이 자리가 아니라 PageLayout의 footer 슬롯에 있다
            (2026-08-27 UAT R1-07). 위 footer 상수 참고. */}
      </div>
    </PageLayout>
  );
}
