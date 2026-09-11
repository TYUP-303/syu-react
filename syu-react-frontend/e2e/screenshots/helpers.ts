// e2e/screenshots/helpers.ts
// 캡처 spec 들이 공유하는 도우미. 계정은 에뮬레이터 REST 로 만든다 — UI 회원가입은
// 그 자체가 촬영 대상이라 따로 찍고, 나머지 묶음은 이 지름길로 바로 로그인한다.
import { expect, type Page } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';

const AUTH = 'http://127.0.0.1:9099';
const PROJECT = 'demo-syu';
export const PASSWORD = 'password123';

export const OUT =
  process.env.SHOT_OUT ??
  path.join(process.env.HOME ?? '', 'DEV_Mac/SYU/syu-react-asset-drafts/2026-09-11-screenshots');

/**
 * 화면 저장. 파일명은 `<묶음>-<번호 2자리>-<화면>-<상태>.png`, 번호는 spec 안에서
 * 호출 순서. manifest.jsonl 에 한 줄씩 남겨 나중에 표로 만든다.
 */
export async function shot(page: Page, bundle: string, name: string, note = ''): Promise<string> {
  fs.mkdirSync(OUT, { recursive: true });
  // 번호는 폴더의 기존 파일 수로 매긴다 — test() 블록마다 워커 프로세스가 갈려
  // 메모리 카운터는 01로 되돌아가기 때문이다.
  const existing = fs.readdirSync(OUT).filter((f) => f.startsWith(`${bundle}-`) && f.endsWith('.png')).length;
  const n = Math.max(existing, counters.get(bundle) ?? 0) + 1;
  counters.set(bundle, n);
  const file = `${bundle}-${String(n).padStart(2, '0')}-${name}.png`;
  // 애니메이션(타이핑·페이드)이 멈출 틈을 준다.
  await page.waitForTimeout(400);
  await page.screenshot({ path: path.join(OUT, file), fullPage: false });
  fs.appendFileSync(
    path.join(OUT, 'manifest.jsonl'),
    JSON.stringify({ bundle, file, name, note, url: page.url(), at: new Date().toISOString() }) + '\n',
  );
  return file;
}
const counters = new Map<string, number>();

/** 에뮬레이터에 이메일 인증까지 끝난 계정을 만든다(이미 있으면 그대로 둔다). */
export async function createVerifiedAccount(email: string, password = PASSWORD): Promise<void> {
  const signUp = await fetch(`${AUTH}/identitytoolkit.googleapis.com/v1/accounts:signUp?key=fake-api-key`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password, returnSecureToken: true }),
  });
  const body = (await signUp.json()) as { localId?: string; error?: { message?: string } };
  let localId = body.localId;
  if (!localId) {
    if (body.error?.message !== 'EMAIL_EXISTS') throw new Error(`signUp 실패: ${JSON.stringify(body)}`);
    const q = await fetch(`${AUTH}/identitytoolkit.googleapis.com/v1/projects/${PROJECT}/accounts:query`, {
      method: 'POST',
      headers: { Authorization: 'Bearer owner', 'Content-Type': 'application/json' },
      // 에뮬레이터의 accounts:query 는 필터 표현식을 무시하므로 전부 받아 걸러낸다.
      body: JSON.stringify({}),
    });
    const users = ((await q.json()) as { userInfo?: { localId: string; email: string }[] }).userInfo ?? [];
    localId = users.find((u) => u.email === email)?.localId;
    if (!localId) throw new Error(`계정 조회 실패: ${email}`);
  }
  const upd = await fetch(`${AUTH}/identitytoolkit.googleapis.com/v1/projects/${PROJECT}/accounts:update`, {
    method: 'POST',
    headers: { Authorization: 'Bearer owner', 'Content-Type': 'application/json' },
    body: JSON.stringify({ localId, emailVerified: true }),
  });
  if (!upd.ok) throw new Error(`emailVerified 갱신 실패: ${await upd.text()}`);
}

/** 랜딩 → 로그인 화면 → 이메일 로그인. 성공하면 온보딩 또는 홈으로 넘어간다. */
export async function login(page: Page, email: string, password = PASSWORD): Promise<void> {
  await page.goto('/#login');
  await page.getByPlaceholder('이메일 주소를 입력하세요').fill(email);
  await page.getByPlaceholder('••••••••').first().fill(password);
  await page.locator('button[type="submit"]').click();
  await expect(page).not.toHaveURL(/#login/, { timeout: 15_000 });
}

/**
 * 캐릭터 생성 화면 채우기(여성·닉네임). 로그인 직후 캐릭터가 없으면 이 화면이 뜬다.
 * 선택자는 src/pages/CharacterCreationPage.tsx 기준 — 성별 버튼 2개 중 두 번째가 여성.
 */
export async function createCharacter(page: Page, nickname = '백설이'): Promise<void> {
  await expect(page).toHaveURL(/#character-creation/, { timeout: 15_000 });
  await page.getByRole('button', { name: /여자/ }).click();
  await page.locator('#nickname').fill(nickname);
  await page.getByRole('button', { name: '캐릭터 만들기' }).click();
  // 완료 모달: '검사 시작하기' / '나중에 하기'
  await expect(page.getByRole('button', { name: '검사 시작하기' })).toBeVisible({ timeout: 10_000 });
}

/** 약관 동의 게이트(REST 로 만든 계정은 첫 진입에 뜬다). 안 떠 있으면 그냥 지나간다. */
export async function acceptConsent(page: Page): Promise<void> {
  const agree = page.locator('#btn-consent-agree');
  // 병렬 부하에서는 게이트가 10초 넘게 걸려 뜨기도 한다 — 짧게 잡으면 건너뛰고,
  // 뒤늦게 뜬 모달이 이후 모든 클릭을 가로채 타임아웃까지 매달린다(9/11 실측).
  if (await agree.isVisible({ timeout: 30_000 }).catch(() => false)) {
    // 필수 2건을 직접 켠다 ('모두 동의' 글자 클릭은 체크박스에 닿지 않았다).
    for (const id of ['#consent-terms', '#consent-privacy']) {
      const box = page.locator(id);
      if (!(await box.isChecked().catch(() => false))) await box.click({ force: true });
    }
    await expect(agree).toBeEnabled({ timeout: 5_000 });
    await agree.click();
    await expect(agree).toBeHidden({ timeout: 10_000 });
  }
}

/**
 * 검사 한 벌을 끝까지 진행한다. 준비 화면('검사 시작하기')에서 시작해 문항마다
 * `pick` 번째 선택지를 고르고, 마지막에 제출해 결과 화면까지 간다.
 * 선택지 버튼은 "이전·다음·제출·닫기" 를 뺀 나머지 버튼이다
 * (ScaleSelector·YesNoSelector·MultipleChoiceSelector 전부 <button>).
 */
export async function completeTest(
  page: Page,
  pick: number | ((question: number, optionCount: number) => number) = 2,
): Promise<void> {
  const start = page.getByRole('button', { name: '검사 시작하기' });
  if (await start.isVisible({ timeout: 5_000 }).catch(() => false)) await start.click();
  const next = page.getByRole('button', { name: '다음 문항으로' });
  const submit = page.getByRole('button', { name: '검사 결과 제출하기' });
  const answers = page
    .locator('button:not([aria-label="검사 닫기"])')
    .filter({ hasNotText: /^이전$|다음 문항으로|검사 결과 제출하기|제출 중/ });
  for (let i = 0; i < 60; i++) {
    await expect(answers.first()).toBeVisible({ timeout: 10_000 });
    const n = await answers.count();
    const idx = typeof pick === 'function' ? pick(i, n) : pick;
    await answers.nth(Math.max(0, Math.min(idx, n - 1))).click();
    if (await submit.isVisible().catch(() => false)) {
      await submit.click();
      break;
    }
    await next.click();
  }
  await expect(
    page.getByRole('button', { name: /홈 화면으로 돌아가기|다음 검사 진행|나중에 하기/ }).first(),
  ).toBeVisible({ timeout: 15_000 });
}

/** 스트레스 검사 답안: 인지형. 정서형은 4~7번, 행동형은 8~11번만 '예'로 바꾸면 된다. */
export const STRESS_COGNITIVE = (q: number): number => (q < 4 ? 0 : 1);
export const STRESS_EMOTIONAL = (q: number): number => (q >= 4 && q < 8 ? 0 : 1);
export const STRESS_BEHAVIORAL = (q: number): number => (q >= 8 ? 0 : 1);
/** 전부 '예' → 판별 불가 화면. */
export const STRESS_UNDETERMINED = (): number => 0;

/**
 * 계정 생성 → 로그인 → 약관 → 캐릭터(여성·백설이) → ADHD·스트레스 검사까지 끝내고
 * 홈에 선다. 시나리오·일기·마이페이지 묶음이 출발점으로 쓴다.
 */
export async function onboard(page: Page, email: string, nickname = '백설이'): Promise<void> {
  await createVerifiedAccount(email);
  await login(page, email);
  await acceptConsent(page);
  // 약관 뒤에는 홈(캐릭터 없음 상태)에 선다 — 캐릭터 생성은 홈 CTA 가 여는 화면이라
  // 해시로 바로 들어간다.
  await gotoHash(page, 'character-creation');
  await page.waitForTimeout(800);
  if (/#character-creation/.test(page.url())) {
    await createCharacter(page, nickname);
    // 캐릭터 완료 모달의 '검사 시작하기' → #test-adhd (준비 화면의 같은 문구 버튼은
    // completeTest 가 누른다).
    await page.getByRole('button', { name: '검사 시작하기' }).click();
  } else {
    // 이미 캐릭터가 있으면 App 의 가드가 홈으로 돌려보낸다 — 검사로 바로 간다.
    await gotoHash(page, 'test-adhd');
  }
  await expect(page).toHaveURL(/#test-adhd/, { timeout: 10_000 });
  await completeTest(page);
  await page.getByRole('button', { name: /다음 검사 진행/ }).click();
  // 스트레스 검사는 예/아니요 12문항(인지·정서·행동 4문항씩). 전부 같은 답이면
  // '판별 불가'라 앞 4문항(인지)만 '예' → 인지형으로 판정된다.
  await completeTest(page, STRESS_COGNITIVE);
  await page.getByRole('button', { name: /홈 화면으로 돌아가기/ }).click();
  await expect(page).toHaveURL(/#home/, { timeout: 15_000 });
}

/** 해시 라우트로 바로 이동한다 (예: 'mypage', 'scenario/workplace/1'). */
export async function gotoHash(page: Page, hash: string): Promise<void> {
  await page.goto(`/#${hash}`);
  // 'networkidle' 은 쓰지 않는다 — Firestore 리스너의 롱폴링이 끝나지 않아 타임아웃까지 매달린다.
  await page.waitForLoadState('load');
  await page.waitForTimeout(600);
}
