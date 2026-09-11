// e2e/screenshots/05-ending.shots.ts
// 05 엔딩 시퀀스 + 오류·안내 화면.
//
// A. 엔딩 — 개발자 계정(VITE_DEV_LOGIN_EMAIL)만 마이페이지의 '다시보기'가 열린다
//    (MyPageView 의 isDevUser 우회 · App 의 '가드 4: 미해금 엔딩'도 같은 우회를 쓴다).
//    엔딩은 8챕터 자동 진행(useEndingSequence)이고, 상단 세그먼트 바의
//    `N번째 장면으로 이동` 버튼이 goTo 를 직접 부르므로 그걸로 장을 옮긴다.
//    타이머를 기다리면 자동 진행(챕터당 3.5~12초)과 경합해 어느 장을 찍었는지
//    확정할 수 없다 — 세그먼트를 눌러 aria-current='step' 로 확인한 뒤 찍는다.
//
// B. 오류·안내 — 아무것도 안 한 새 계정에서 잠긴 화면들을 모은다.
//
// ⚠️ 공지 배너(NoticeBanner)는 이 묶음에서 찍지 않는다. 뜨는 조건이
//    `settings/notice` 문서의 active:true + message 인데(useSettingsStore.
//    fetchSettings — 실 모드는 Firestore, Mock 모드만 localStorage),
//    이 환경은 실 모드라 켜려면 **에뮬레이터에 문서를 심어야** 한다.
//    그 문서는 계정별이 아니라 서비스 전역이라, 심어 두는 동안 같은
//    에뮬레이터로 캡처 중인 다른 묶음(01·03·04)의 모든 화면 상단에도 배너가
//    끼어든다. 캡처 세션 규약상 시드 금지이기도 하다.
//
// networkidle 은 쓰지 않는다 (Firestore 롱폴링).

import { test, expect, type Browser, type Page } from '@playwright/test';
import { shot, gotoHash, onboard, createVerifiedAccount, login } from './helpers';

/** playwright.config 의 use 옵션 — browser.newContext() 는 이것을 물려받지 않는다. */
const CONTEXT_OPTIONS = {
  baseURL: 'http://localhost:5199',
  viewport: { width: 402, height: 874 },
  deviceScaleFactor: 3,
  isMobile: true,
  hasTouch: true,
  locale: 'ko-KR',
  timezoneId: 'Asia/Seoul',
  colorScheme: 'light' as const,
};

/** 엔딩 챕터 수 — constants/endingScript 의 ENDING_CHAPTERS 길이와 같다. */
const CHAPTER_LABELS = [
  'welcome',
  'scenes',
  'fairies',
  'setbacks',
  'support',
  'practice',
  'imperfect',
  'credits',
] as const;

/** 페이드 아웃 400 + 인 600(useEndingSequence) 이 끝날 때까지의 여유. */
const FADE_SETTLE_MS = 750;

/**
 * 엔딩의 index 번째 장으로 옮긴다.
 * 전환 중(pending)이면 goTo 가 조용히 무시되므로 aria-current 를 보고 재시도한다.
 */
async function goChapter(page: Page, index: number): Promise<void> {
  const seg = page.getByRole('button', { name: `${index + 1}번째 장면으로 이동` });
  for (let attempt = 0; attempt < 4; attempt++) {
    await seg.click();
    try {
      await expect(seg).toHaveAttribute('aria-current', 'step', { timeout: 1_500 });
      await page.waitForTimeout(FADE_SETTLE_MS);
      return;
    } catch {
      // 전환 중이라 무시됐거나 자동 진행이 먼저 움직였다 — 한 번 더 누른다.
    }
  }
  throw new Error(`엔딩 ${index + 1}번째 장으로 이동하지 못했습니다`);
}

/**
 * 새 계정의 약관 동의를 **미리** 끝내 둔다.
 *
 * helpers.acceptConsent 는 모달을 3초만 기다린다. 워커 5개가 도는 캡처
 * 세션에서는 첫 진입이 그보다 느려 모달을 지나쳐 버리고, 그러면 onboard 가
 * 캐릭터 생성 화면으로 들어간 **뒤에** 약관 모달이 떠서 성별 버튼 클릭이
 * app-modal-root 에 가로막힌다(이번 회차 실측 — 앞선 에이전트가 보고한
 * "약관 모달이 클릭을 막는다"와 같은 현상이다).
 *
 * 동의 기록은 users/{uid}.termsConsent 라 컨텍스트를 버려도 남는다. 그래서
 * 별도 컨텍스트에서 동의만 받아 두면 뒤이은 onboard 는 모달 없이 지나간다.
 */
async function preAcceptConsent(browser: Browser, email: string): Promise<void> {
  await createVerifiedAccount(email);
  const ctx = await browser.newContext(CONTEXT_OPTIONS);
  const p = await ctx.newPage();
  await login(p, email);
  const agree = p.locator('#btn-consent-agree');
  if (await agree.isVisible({ timeout: 60_000 }).catch(() => false)) {
    for (const id of ['#consent-terms', '#consent-privacy']) {
      const box = p.locator(id);
      if (!(await box.isChecked().catch(() => false))) await box.click({ force: true });
    }
    await expect(agree).toBeEnabled({ timeout: 10_000 });
    await agree.click();
    await expect(agree).toBeHidden({ timeout: 20_000 });
    // setDoc 이 끝날 틈 — 여기서 컨텍스트를 닫으면 기록이 남지 않는다.
    await p.waitForTimeout(2_000);
  }
  await ctx.close();
}

test.describe('05-ending', () => {
  test('A 엔딩 시퀀스', async ({ page }) => {
    // 개발자 계정. 마이페이지 '엔딩 다시보기'와 #ending 가드가 이 이메일을 통과시킨다.
    await onboard(page, 'test@example.com');

    // ① 마이페이지 — 엔딩 다시보기가 열려 있는 상태
    await gotoHash(page, 'mypage');
    const endingCta = page.getByRole('button', { name: '다시보기' });
    await endingCta.scrollIntoViewIfNeeded();
    await expect(endingCta).toBeEnabled({ timeout: 15_000 });
    await shot(page, '05', 'mypage-ending-unlocked', '마이페이지 — 엔딩 다시보기 활성(개발자 계정)');

    // ② 엔딩 진입 — 첫 장
    await endingCta.click();
    await expect(page).toHaveURL(/#ending/, { timeout: 15_000 });
    await expect(page.getByRole('button', { name: '1번째 장면으로 이동' })).toBeVisible({
      timeout: 15_000,
    });
    await page.waitForTimeout(FADE_SETTLE_MS);
    await shot(page, '05', 'ending-ch1-welcome', '엔딩 1장 — 여기까지 온 당신에게(시작 화면)');

    // ③ 2~7장 — 세그먼트로 옮겨 가며 한 장씩
    for (let i = 1; i < CHAPTER_LABELS.length - 1; i++) {
      await goChapter(page, i);
      await shot(page, '05', `ending-ch${i + 1}-${CHAPTER_LABELS[i]}`, `엔딩 ${i + 1}장`);
    }

    // ④ 크레딧(마지막 장) — 자동 진행이 없어 머무른다.
    //
    // 402×874 에서는 크레딧 전체(만든 사람들 → 감사 인사 → 맺음말 → 돌아가기)가
    // 한 화면에 들어간다. 챕터 컨테이너를 끝까지 밀어 봐도 이동량이 0px 이라
    // (2026-09-11 실측) '상단'과 '하단'을 나눠 찍을 것이 없어 한 장만 남긴다.
    await goChapter(page, CHAPTER_LABELS.length - 1);
    await expect(page.getByRole('button', { name: '돌아가기' })).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText('REACT가 함께 응원하겠습니다.')).toBeVisible({ timeout: 10_000 });
    await shot(page, '05', 'ending-ch8-credits', '엔딩 8장 — 크레딧과 맺음말, 돌아가기(끝 화면)');

    // ⑤ 돌아가기 → 마이페이지로 복귀 (엔딩 종료)
    await page.getByRole('button', { name: '돌아가기' }).click();
    await expect(page).not.toHaveURL(/#ending/, { timeout: 10_000 });
    await page.waitForTimeout(600);
    await shot(page, '05', 'ending-closed-return', '엔딩 닫은 뒤 돌아온 화면');
  });

  test('B 오류·안내 화면', async ({ page, browser }) => {
    const EMAIL = '05-err@example.com';
    await preAcceptConsent(browser, EMAIL);
    await onboard(page, EMAIL);

    // ① 마이페이지 — 엔딩 잠김 (0/4 영역 완주)
    await gotoHash(page, 'mypage');
    const lockedEndingCta = page.getByRole('button', { name: '다시보기' });
    await lockedEndingCta.scrollIntoViewIfNeeded();
    await expect(lockedEndingCta).toBeDisabled({ timeout: 15_000 });
    await shot(page, '05', 'mypage-ending-locked', '마이페이지 — 엔딩 잠김(0/4 영역 완주)');

    // ② 시나리오 탭 — 잠긴 에피소드 목록
    await gotoHash(page, 'scenario');
    // 영역 카드(ThemeListView)는 '% 완료' 배지를 달고 있다.
    const themeCard = page.getByRole('button').filter({ hasText: '% 완료' }).first();
    await expect(themeCard).toBeVisible({ timeout: 20_000 });
    await themeCard.click();
    // 에피소드 목록 진입 — 1화만 열려 있고 2화부터 disabled 다(잠긴 에필로그
    // 카드는 목록 맨 아래라 DOM 상 첫 disabled 버튼이 2화다).
    const lockedEpisode = page.locator('button:disabled').first();
    await expect(lockedEpisode).toBeVisible({ timeout: 20_000 });
    await page.waitForTimeout(1_200);
    await shot(page, '05', 'scenario-episodes-locked', '에피소드 목록 — 1화만 열림, 2화 이후 자물쇠');

    // 잠긴 카드를 눌러 본다. 카드가 disabled 라 아무 일도 일어나지 않는 것이
    // 이 화면의 실제 동작이다(EpisodeListView.handleEpisodeClick 이 즉시 return).
    await lockedEpisode.click({ force: true, timeout: 5_000 }).catch(() => undefined);
    await page.waitForTimeout(800);
    await shot(page, '05', 'scenario-locked-episode-tap', '잠긴 에피소드를 눌렀을 때 — 반응 없음(모달 없음)');

    // 목록 맨 아래의 잠긴 에필로그 카드 (COPY.epilogue.lockedTitle)
    const lockedEpilogue = page.getByText('아직 잠겨 있어요');
    await lockedEpilogue.scrollIntoViewIfNeeded();
    await expect(lockedEpilogue).toBeVisible({ timeout: 10_000 });
    await page.waitForTimeout(600);
    await shot(page, '05', 'scenario-epilogue-locked', '목록 하단 — 잠긴 에필로그 카드(10편을 모두 마치면 열려요)');

    // ③ 회복일기 탭 — 잠금 화면
    await gotoHash(page, 'diary');
    await expect(page.getByText('아직 첫 기록이 열리지 않았어요')).toBeVisible({ timeout: 20_000 });
    await shot(page, '05', 'diary-locked', '회복일기 잠금 — 첫 기록이 없을 때의 안내 카드');

    // ④ 검사 이탈 확인 모달
    await gotoHash(page, 'test-adhd');
    const startBtn = page.getByRole('button', { name: '검사 시작하기' });
    await expect(startBtn).toBeVisible({ timeout: 20_000 });
    await shot(page, '05', 'test-prep', '검사 준비 화면 — 우상단 검사 닫기');
    await startBtn.click();
    const close = page.getByRole('button', { name: '검사 닫기' });
    await expect(close).toBeVisible({ timeout: 15_000 });
    await close.click();
    await expect(page.getByText('정말 검사를 나가시겠어요?')).toBeVisible({ timeout: 10_000 });
    await shot(page, '05', 'test-exit-confirm', '검사 도중 닫기 — 이탈 확인 모달');
    await page.getByRole('button', { name: '계속 검사하기' }).click();

    // ⑤ 비로그인 직접 접근 — 새 컨텍스트(세션 없음)
    //
    // 세 주소 모두 결과 화면은 같다: App 이 주소를 #landing 으로 바꿔 랜딩을
    // 세운다(보호 주소는 '세션이 필요하다', 모르는 주소는 '유효하지 않다'는
    // 같은 처리를 받는다). 전용 404 화면도, "로그인이 필요합니다" 안내도 없다.
    // 그래서 세 장이 사실상 같은 그림이지만, 어느 주소로 들어가도 그렇게
    // 된다는 것이 이 묶음이 남겨야 할 사실이라 셋을 각각 남긴다.
    const guest = await browser.newContext(CONTEXT_OPTIONS);
    const g = await guest.newPage();
    for (const [hash, name, note] of [
      ['mypage', 'guest-mypage', '비로그인 #mypage 직접 접근 → 랜딩으로 되돌림'],
      ['scenario', 'guest-scenario', '비로그인 #scenario 직접 접근 → 랜딩으로 되돌림'],
      ['nowhere', 'guest-unknown-hash', '없는 주소(#nowhere) → 랜딩으로 되돌림'],
    ] as const) {
      await gotoHash(g, hash);
      await expect(g).toHaveURL(/#landing/, { timeout: 10_000 });
      await g.waitForTimeout(1_000);
      await shot(g, '05', name, note);
    }
    await guest.close();
  });
});
