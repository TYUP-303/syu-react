// src/components/home/MyPageView.test.tsx
// @vitest-environment jsdom
//
// 테스트(개발자) 계정 회원 탈퇴 가드.
//
// 이 계정은 UAT 내내 재로그인해 써야 하는 공용 계정이라 한 번 탈퇴하면
// Auth 계정이 사라져 검수가 멈춘다. 고정하는 계약은 두 가지다:
//   1) 개발자 계정은 탈퇴 확인 모달에 **진입조차 하지 못하고** 탈퇴 액션도
//      호출되지 않는다.
//   2) 데이터 초기화는 막지 않는다 — 상태를 되돌리는 정상 수단이다.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@testing-library/jest-dom/vitest';

// localStorage 스텁은 import보다 먼저 꽂혀야 한다 — useAuthStore의 persist
// 미들웨어가 모듈 초기화 시점에 붙잡기 때문이다. (jsdom 환경이어도 Node가
// globalThis.localStorage를 undefined로 선점해 vitest가 덮어쓰기를 건너뛴다.)
vi.hoisted(() => {
  const map = new Map<string, string>();
  vi.stubGlobal('localStorage', {
    getItem: (key: string) => map.get(key) ?? null,
    setItem: (key: string, value: string) => void map.set(key, value),
    removeItem: (key: string) => void map.delete(key),
    clear: () => map.clear(),
  });
});

vi.mock('../../api/env', () => ({ IS_MOCK_MODE: true }));
vi.mock('../../api/firebase', () => ({
  db: {},
  auth: { currentUser: null },
  signInWithGoogle: vi.fn(),
  signOutUser: vi.fn(),
  syncUserToFirestore: vi.fn(),
  deleteUserDoc: vi.fn(),
}));

import { auth, deleteUserDoc } from '../../api/firebase';
import { useAuthStore } from '../../store/useAuthStore';
import { useCharacterStore } from '../../store/useCharacterStore';
import { useTestStore } from '../../store/useTestStore';
import { useScenarioStore } from '../../store/useScenarioStore';
import { useConsentStore } from '../../store/useConsentStore';
import { COPY } from '../../constants/copy';
import { PRIVACY, CONTACT_EMAIL, INQUIRY_EMAIL } from '../../constants/legal';
import MyPageView from './MyPageView';

const DEV_EMAIL = 'dev-uat@react.test';

// getByText는 공백을 정규화해 비교한다 — 줄바꿈이 든 안내문은 같은 규칙으로
// 눌러 준 뒤 찾아야 한다(문구 자체는 COPY에서 그대로 가져온다).
const flat = (text: string) => text.replace(/\s+/g, ' ').trim();

const deleteAccount = vi.fn();

// ── 스토어 누수 차단 (간헐 실패의 원인이었다) ──
//
// 세 스토어는 파일 전역 싱글턴이고, MyPageView는 마운트 즉시 fetch 4종을
// 호출한다. Mock 모드 구현은 `await setTimeout(300~400ms)` 뒤에 깨어나
// `set(...)`으로 스토어를 덮어쓰는데, 이 타이머는 테스트가 끝나고 컴포넌트가
// 언마운트돼도 살아남아 **다음 테스트 도중** 착지한다.
// fetchCharacter는 `set({ character: localStorage 값 ?? null })`이라 스텁으로
// 심어 둔 character를 null로 지운다 → '닉네임 수정' 연필이 DOM에서 사라지고,
// 그 사이 진행 중이던 user.click은 문서에서 분리된 노드에 이벤트를 쏘게 되어
// React 핸들러에 닿지 못한 채 조용히 무시된다(편집 모드 진입 실패).
// 파일 전체가 400ms 남짓에 끝나므로 몇 번째 테스트가 맞을지는 머신 속도에
// 따라 갈렸고, 그래서 실패가 간헐적이었다.
// → 모든 테스트에서 fetch를 무력화해 타이머 자체를 만들지 않는다.
const pristineCharacterState = useCharacterStore.getState();
const pristineTestState = useTestStore.getState();
const pristineScenarioState = useScenarioStore.getState();
const pristineConsentState = useConsentStore.getState();

function silenceStoreFetches() {
  useCharacterStore.setState({ fetchCharacter: async () => {} });
  useTestStore.setState({ fetchTestResults: async () => {} });
  useScenarioStore.setState({ fetchThemes: async () => {}, fetchProgress: async () => {} });
  // 마케팅 토글은 이 스토어를 그린다. 앞 테스트의 값이 남으면 토글의 초기
  // 위치가 달라지므로 매번 "조회 전" 상태로 되돌린다.
  useConsentStore.setState({ consent: null, marketingConsent: null, status: 'unknown' });
}

function restoreStores() {
  useCharacterStore.setState(pristineCharacterState);
  useTestStore.setState(pristineTestState);
  useScenarioStore.setState(pristineScenarioState);
  useConsentStore.setState(pristineConsentState);
}

function renderMyPage(email: string, logout: () => void = () => {}) {
  return render(
    <MyPageView
      user={{ uid: 'uid-1', email, displayName: '테스터', photoURL: null }}
      logout={logout}
      onClose={() => {}}
    />,
  );
}

beforeEach(() => {
  vi.stubEnv('VITE_DEV_LOGIN_EMAIL', DEV_EMAIL);
  deleteAccount.mockClear();
  useAuthStore.setState({ deleteAccount, error: null });
  silenceStoreFetches();

  // AlertDialog는 Modal 포털을 쓴다 — 마운트 지점이 없으면 아무것도 안 뜬다.
  const root = document.createElement('div');
  root.id = 'app-modal-root';
  document.body.appendChild(root);
});

afterEach(() => {
  // 복구 순서가 중요하다: 먼저 언마운트(cleanup)해야 한다. 마운트된 상태에서
  // 스토어를 되돌리면 fetch 함수의 정체성이 바뀌어 MyPageView의 로드 useEffect가
  // 다시 돌고, 그 순간 진짜 fetch가 또 타이머를 걸어 누수가 되살아난다.
  cleanup();
  restoreStores();
  vi.unstubAllEnvs();
  document.getElementById('app-modal-root')?.remove();
});

describe('프로필 편집 진입', () => {
  it('프사를 누르면 아바타 선택 모달이 열린다', async () => {
    const user = userEvent.setup();
    renderMyPage('someone@example.com');

    await user.click(screen.getByRole('button', { name: COPY.myPage.avatarEdit }));

    expect(screen.getByText(COPY.myPage.avatarModalTitle)).toBeInTheDocument();
  });

  it('프사 쪽에는 연필 아이콘을 두지 않는다', () => {
    // 검수 피드백: 프사와 닉네임에 같은 연필이 두 번 붙어 번잡했다.
    // 프사 진입 단서는 카메라 배지 하나로 끝낸다.
    renderMyPage('someone@example.com');

    const avatarButton = screen.getByRole('button', { name: COPY.myPage.avatarEdit });
    expect(avatarButton.textContent).toContain('photo_camera');
    expect(avatarButton.textContent).not.toContain('edit');
  });
});

// 로그아웃은 되돌릴 수 있는 동작이지만, 예전에는 확인 없이 즉시 나가면서
// 버튼만 error 색으로 강조돼 있어 바로 아래의 초기화·탈퇴보다 위험해 보였다.
describe('로그아웃 확인', () => {
  it('버튼을 눌러도 곧바로 나가지 않고 확인 모달을 띄운다', async () => {
    const user = userEvent.setup();
    const logout = vi.fn();
    renderMyPage('someone@example.com', logout);

    // 접근성 이름에는 아이콘 리가처('logout')가 함께 들어가므로 부분 일치로 찾는다
    await user.click(screen.getByRole('button', { name: new RegExp(COPY.myPage.logout) }));

    expect(screen.getByText(COPY.myPage.logoutTitle)).toBeInTheDocument();
    expect(logout).not.toHaveBeenCalled();
  });

  it('확인하면 로그아웃하고, 취소하면 머문다', async () => {
    const user = userEvent.setup();
    const logout = vi.fn();
    renderMyPage('someone@example.com', logout);

    // 접근성 이름에는 아이콘 리가처('logout')가 함께 들어가므로 부분 일치로 찾는다
    await user.click(screen.getByRole('button', { name: new RegExp(COPY.myPage.logout) }));
    await user.click(screen.getByRole('button', { name: COPY.myPage.cancel }));
    expect(logout).not.toHaveBeenCalled();

    // 접근성 이름에는 아이콘 리가처('logout')가 함께 들어가므로 부분 일치로 찾는다
    await user.click(screen.getByRole('button', { name: new RegExp(COPY.myPage.logout) }));
    await user.click(screen.getByRole('button', { name: COPY.myPage.logoutConfirm }));
    expect(logout).toHaveBeenCalledTimes(1);
  });
});

// 1:1 문의는 폼 제출이 아니라 메일 앱 링크다.
//
// 예전 구현은 textarea에 적고 '문의 등록'을 누르면 setTimeout(800) 뒤에
// "정상적으로 접수되었습니다"만 띄우고 내용을 **어디에도 보내지 않았다**.
// 사용자는 접수됐다고 믿고 답을 기다렸고, 운영팀은 문의가 온 줄도 몰랐다.
// 고정하는 계약은 셋이다:
//   1) CTA는 처리방침에 게시한 주소로 향하는 mailto 링크이며 제목·본문이
//      미리 채워진다.
//   2) 주소가 화면에 보인다 — mailto를 처리할 앱이 없어도 막다른 길이
//      되지 않아야 한다.
//   3) 전송을 흉내 내는 입력창과 접수 완료 안내가 없다.
describe('1:1 문의', () => {
  const openInquiry = async (user: ReturnType<typeof userEvent.setup>) => {
    await user.click(screen.getByRole('button', { name: new RegExp(COPY.myPage.menuInquiry) }));
  };

  /** 아이콘 리가처('mail')가 접근성 이름에 섞이므로 부분 일치로 찾는다 */
  const inquiryLink = () =>
    screen.getByRole('link', { name: new RegExp(COPY.myPage.inquiryCta) });

  it('CTA는 처리방침의 연락처로 향하는 mailto 링크다', async () => {
    const user = userEvent.setup();
    renderMyPage('someone@example.com');
    await openInquiry(user);

    const href = inquiryLink().getAttribute('href') ?? '';

    expect(href.startsWith(`mailto:${INQUIRY_EMAIL}?`)).toBe(true);
    expect(href).toContain(`subject=${encodeURIComponent(COPY.myPage.inquiryMailSubject)}`);
  });

  it('메일 본문에 문의자 계정과 앱 버전을 실어 보낸다', async () => {
    // 답신할 주소와 어느 빌드인지가 없으면 운영팀이 대응할 수 없다
    const user = userEvent.setup();
    renderMyPage('someone@example.com');
    await openInquiry(user);

    const href = inquiryLink().getAttribute('href') ?? '';
    const body = decodeURIComponent(href.split('&body=')[1] ?? '');

    expect(body).toBe(COPY.myPage.inquiryMailBody('someone@example.com'));
    expect(body).toContain('someone@example.com');
    expect(body).toContain(COPY.myPage.appVersion);
  });

  it('주소를 화면에도 노출해 메일 앱이 없어도 연락할 수 있다', async () => {
    // mailto를 처리할 앱이 없는 브라우저에서는 링크가 아무 반응도 하지
    // 않는다 — 읽고 복사할 주소가 화면에 남아 있어야 한다.
    const user = userEvent.setup();
    renderMyPage('someone@example.com');
    await openInquiry(user);

    expect(screen.getByText(INQUIRY_EMAIL)).toBeInTheDocument();
    expect(screen.getByText(COPY.myPage.inquiryFallback)).toBeInTheDocument();
  });

  it('처리방침의 보호책임자 조항은 CONTACT_EMAIL 상수를 노출한다', () => {
    // 2026-08-13에 두 창구를 분리했고(일반 문의 = INQUIRY_EMAIL, 처리방침
    // 제10조 = CONTACT_EMAIL), 2026-08-16 사용자 결정으로 **값은 같은 공유
    // 운영 계정**이 됐다 — 특정 개인 메일함을 법무 문서에 남기지 않기
    // 위해서다. 값이 같아도 상수는 역할별로 분리
    // 유지한다(legal.ts 주석 참조). 이 테스트가 막는 회귀는 처리방침
    // 조항이 상수를 거치지 않고 주소를 하드코딩하는 것이다.
    const contact = PRIVACY.sections.find((section) => section.heading.includes('보호책임자'));

    expect(contact?.body).toContain(CONTACT_EMAIL);
    // 보호책임자 성명은 팀 확정 사항(2026-08-16: 김영원) — 조용히 바뀌면 안 된다
    expect(contact?.body).toContain('김영원');
  });

  it('전송을 흉내 내는 입력창과 접수 완료 안내가 없다', async () => {
    const user = userEvent.setup();
    const { container } = renderMyPage('someone@example.com');
    await openInquiry(user);

    // 입력창이 있으면 "여기 적으면 전송된다"로 읽힌다 — 실제 전달은 메일 앱이 한다
    expect(container.querySelector('textarea')).toBeNull();
    // 회귀 방지: 예전에는 아무 데도 보내지 않고 이 문구만 띄웠다
    expect(screen.queryByText(/접수되었습니다/)).not.toBeInTheDocument();
  });
});

// 마케팅 수신 토글 = 마케팅 약관 제6조가 지목한 수신 거부 창구.
//
// 예전에는 localStorage('react_noti_marketing')에만 적었다. 약관은
// "마이페이지에서 철회할 수 있다"고 약속했는데 그 철회가 브라우저 밖으로
// 나가지 않았으므로, 어드민의 수신자 추출(Firestore만 본다)은 토글을 꺼 둔
// 사람을 그대로 목록에 담았다 — 거부 의사를 받고도 광고를 보내는 상태다.
// 고정하는 계약은 넷이다:
//   1) 토글의 위치는 users/{uid}의 수신 상태에서 온다 (localStorage 아님).
//   2) 끄면 스토어를 통해 그 사실이 저장된다.
//   3) 저장이 실패하면 토글을 되돌리고 실패를 알린다 — 껐다고 믿게 두면 안 된다.
//   4) 기기 공용 키에 다시 쓰지 않는다.
describe('마케팅 수신 토글', () => {
  /** 가입 시 마케팅까지 동의한 계정의 증빙 (termsConsent 원형) */
  const AGREED = {
    termsAgreedAt: 'now',
    privacyAgreedAt: 'now',
    marketingAgreed: true,
    marketingAgreedAt: 'now',
    version: '1.0.0',
  };

  /** 아이콘도 텍스트도 없는 스위치라 role로 찾는다 (aria-label은 COPY.myPage.marketing) */
  const toggle = () => screen.getByRole('switch', { name: COPY.myPage.marketing });

  it('가입 시 동의한 사용자는 켜진 상태로 보인다', () => {
    useConsentStore.setState({ consent: AGREED, marketingConsent: null, status: 'granted' });
    renderMyPage('someone@example.com');

    expect(toggle()).toBeChecked();
  });

  it('철회 기록이 있으면 가입 시 동의했더라도 꺼진 상태로 보인다', () => {
    // 판정은 현재 상태(marketingConsent)가 이긴다 — 증빙인 termsConsent는
    // 그대로 남아 있으므로 이 둘이 어긋나는 것이 정상이다.
    useConsentStore.setState({
      consent: AGREED,
      marketingConsent: { agreed: false, updatedAt: 'now', version: '1.0.0' },
      status: 'granted',
    });
    renderMyPage('someone@example.com');

    expect(toggle()).not.toBeChecked();
  });

  it('끄면 수신 거부가 저장되고 토글이 꺼진 채 남는다', async () => {
    const user = userEvent.setup();
    const setMarketingConsent = vi.fn(async () => true);
    useConsentStore.setState({ consent: AGREED, marketingConsent: null, setMarketingConsent });
    renderMyPage('someone@example.com');

    await user.click(toggle());

    expect(setMarketingConsent).toHaveBeenCalledWith('uid-1', false);
    await waitFor(() => expect(toggle()).not.toBeChecked());
  });

  it('가입 때 거부한 사용자도 다시 켤 수 있다', async () => {
    // 한 방향으로만 동작하면 거부했던 사용자에게는 켜지지 않는 죽은 스위치가 된다.
    const user = userEvent.setup();
    const setMarketingConsent = vi.fn(async () => true);
    useConsentStore.setState({
      consent: { ...AGREED, marketingAgreed: false, marketingAgreedAt: null },
      marketingConsent: null,
      setMarketingConsent,
    });
    renderMyPage('someone@example.com');
    expect(toggle()).not.toBeChecked();

    await user.click(toggle());

    expect(setMarketingConsent).toHaveBeenCalledWith('uid-1', true);
  });

  it('저장이 실패하면 토글을 되돌리고 실패를 알린다', async () => {
    // 되돌리지 않으면 "껐다"고 믿은 사용자에게 광고가 계속 나가고, 그 사실을
    // 알 방법이 화면 어디에도 없다.
    const user = userEvent.setup();
    useConsentStore.setState({
      consent: AGREED,
      marketingConsent: null,
      setMarketingConsent: async () => false,
    });
    renderMyPage('someone@example.com');

    await user.click(toggle());

    expect(await screen.findByText(flat(COPY.errors.consentSaveFailed))).toBeInTheDocument();
    expect(toggle()).toBeChecked();
  });

  it('기기 공용 localStorage 키에 다시 쓰지 않는다', async () => {
    // 'react_noti_marketing'은 uid가 없어 한 기기의 두 계정이 설정을 공유했다.
    const user = userEvent.setup();
    localStorage.removeItem('react_noti_marketing');
    useConsentStore.setState({
      consent: AGREED,
      marketingConsent: null,
      setMarketingConsent: async () => true,
    });
    renderMyPage('someone@example.com');

    await user.click(toggle());

    expect(localStorage.getItem('react_noti_marketing')).toBeNull();
  });
});

// 계정 관리 버튼의 대비 (UAT 2026-08-16 지적).
//
// 두 버튼은 글자가 text-outline·text-error/60, 테두리가 outline-variant/30·
// error/10이라 로그아웃 버튼 바로 아래에서 **비활성처럼** 보였다. 순전히
// 시각적인 회귀라 클래스 이름 말고는 고정할 수단이 없어, 여기서는 "반투명
// 저대비 토큰으로 되돌아가지 않는다"만 계약으로 잡는다.
describe('계정 관리 버튼 대비', () => {
  it('데이터 초기화 버튼이 불투명한 글자·테두리를 쓴다', () => {
    renderMyPage('someone@example.com');

    const reset = screen.getByRole('button', { name: COPY.myPage.resetData });

    expect(reset.className).toContain('text-on-surface-variant');
    expect(reset.className).toContain('border-outline-variant');
    // 반투명 테두리로 되돌아가면(border-outline-variant/30) 다시 비활성처럼 보인다
    expect(reset.className).not.toContain('border-outline-variant/');
  });

  it('회원 탈퇴 버튼이 불투명한 위험색 글자를 쓰되 error 계열은 유지한다', () => {
    renderMyPage('someone@example.com');

    const withdraw = screen.getByRole('button', { name: COPY.myPage.withdraw });

    expect(withdraw.className).toContain('text-error');
    expect(withdraw.className).not.toContain('text-error/');
    // 파괴적 동작의 위험색 신호는 남긴다
    expect(withdraw.className).toContain('border-error/40');
  });
});

describe('회원 탈퇴 가드', () => {
  it('개발자 계정은 탈퇴 진입 시 안내만 뜨고 탈퇴가 실행되지 않는다', async () => {
    const user = userEvent.setup();
    renderMyPage(DEV_EMAIL);

    await user.click(screen.getByRole('button', { name: COPY.myPage.withdraw }));

    expect(screen.getByText(flat(COPY.myPage.withdrawDevBlocked))).toBeInTheDocument();
    // 확인 모달(본문 문구)에는 들어가지 못한다
    expect(screen.queryByText(COPY.myPage.withdrawBody)).not.toBeInTheDocument();
    expect(deleteAccount).not.toHaveBeenCalled();
  });

  it('일반 계정은 탈퇴 확인 모달로 들어간다', async () => {
    const user = userEvent.setup();
    renderMyPage('someone@example.com');

    await user.click(screen.getByRole('button', { name: COPY.myPage.withdraw }));

    expect(screen.getByText(COPY.myPage.withdrawBody)).toBeInTheDocument();
    expect(screen.queryByText(flat(COPY.myPage.withdrawDevBlocked))).not.toBeInTheDocument();
  });

  it('개발자 계정이어도 데이터 초기화는 막지 않는다', async () => {
    const user = userEvent.setup();
    renderMyPage(DEV_EMAIL);

    await user.click(screen.getByRole('button', { name: COPY.myPage.resetData }));

    expect(screen.getByText(COPY.myPage.resetBody)).toBeInTheDocument();
  });
});

// 스토어 액션은 모두 성공 여부를 boolean으로 돌려준다. 예전에는 반환값을 버리고
// 무조건 성공 알림을 띄워서, 실패했는데도 "초기화되었습니다"를 본 사용자가
// 그대로 남은 데이터를 다시 마주쳤다.
describe('액션 실패 노출', () => {
  // 스토어 복구는 파일 전역 afterEach(restoreStores)가 맡는다 — 여기서 따로
  // 되돌리면 cleanup()보다 먼저 실행돼(중첩 suite의 afterEach가 앞선다) 마운트된
  // 컴포넌트에 진짜 fetch를 다시 붙이게 된다.

  /** 초기화 3종 중 원하는 것만 실패시킨다 (fetch류는 렌더 중 상태를 덮지 않게 무력화) */
  function stubStores({
    deleteCharacter = true,
    deleteTestResults = true,
    resetProgress = true,
    updateNickname = true,
  }: Partial<Record<string, boolean>> = {}) {
    useCharacterStore.setState({
      character: { nickname: '테스터', gender: 'male', createdAt: '2026-01-01' },
      fetchCharacter: async () => {},
      deleteCharacter: async () => deleteCharacter,
      updateNickname: async () => updateNickname,
    });
    useTestStore.setState({
      fetchTestResults: async () => {},
      deleteTestResults: async () => deleteTestResults,
    });
    useScenarioStore.setState({
      fetchThemes: async () => {},
      fetchProgress: async () => {},
      resetProgress: async () => resetProgress,
    });
  }

  const confirmReset = async (user: ReturnType<typeof userEvent.setup>) => {
    await user.click(screen.getByRole('button', { name: COPY.myPage.resetData }));
    await user.click(screen.getByRole('button', { name: COPY.myPage.resetConfirm }));
  };

  it('초기화가 한 건이라도 실패하면 성공 알림 대신 실패 안내를 띄운다', async () => {
    const user = userEvent.setup();
    stubStores({ resetProgress: false });
    renderMyPage('someone@example.com');

    await confirmReset(user);

    expect(screen.getByText(flat(COPY.myPage.dataResetFailed))).toBeInTheDocument();
    expect(screen.queryByText(COPY.myPage.dataResetDone)).not.toBeInTheDocument();
  });

  it('초기화가 모두 성공하면 성공 알림을 띄운다', async () => {
    const user = userEvent.setup();
    stubStores();
    renderMyPage('someone@example.com');

    await confirmReset(user);

    expect(screen.getByText(COPY.myPage.dataResetDone)).toBeInTheDocument();
  });

  it('닉네임 저장이 실패하면 편집 상태를 유지한 채 실패 안내를 띄운다', async () => {
    const user = userEvent.setup();
    stubStores({ updateNickname: false });
    renderMyPage('someone@example.com');

    await user.click(screen.getByRole('button', { name: '닉네임 수정' }));
    await user.click(screen.getByRole('button', { name: COPY.myPage.save }));

    expect(screen.getByText(COPY.errors.nicknameUpdateFailed)).toBeInTheDocument();
    // 입력창이 살아 있어야 사용자가 다시 치지 않고 재시도할 수 있다
    expect(screen.getByPlaceholderText(COPY.myPage.nicknamePlaceholder)).toBeInTheDocument();
  });
});

// 회원 탈퇴 순서.
//
// 파트 E 자체 검수(2026-08-13)에서 확정한 배포 차단 버그의 회귀 방지다.
// Auth 계정을 먼저 지우면 세션이 끊겨 보안 규칙(request.auth.uid == uid)이
// 이후의 Firestore 삭제 4건을 전부 거부한다 — 개인정보가 클라이언트로는
// 지울 수단이 없는 채 영구 잔존한다. 고정하는 계약은 셋이다:
//   1) 데이터 파기 4건이 모두 성공한 뒤에만 deleteAccount가 호출된다.
//   2) 파기가 하나라도 실패하면 계정을 삭제하지 않는다 (재시도 가능하게).
//   3) 세션이 오래됐으면(약 5분) 아무것도 지우기 전에 재로그인을 안내한다.
describe('회원 탈퇴 순서', () => {
  const callOrder: string[] = [];

  /** 파기 4건을 호출 순서 기록용으로 스텁한다 (fetch류는 타이머 누수 방지로 무력화) */
  function stubWithdrawStores({ testsCleared = true }: { testsCleared?: boolean } = {}) {
    callOrder.length = 0;
    vi.mocked(deleteUserDoc).mockImplementation(async () => {
      callOrder.push('deleteUserDoc');
      return true;
    });
    useCharacterStore.setState({
      fetchCharacter: async () => {},
      deleteCharacter: async () => {
        callOrder.push('deleteCharacter');
        return true;
      },
    });
    useTestStore.setState({
      fetchTestResults: async () => {},
      deleteTestResults: async () => {
        callOrder.push('deleteTestResults');
        return testsCleared;
      },
    });
    useScenarioStore.setState({
      fetchThemes: async () => {},
      fetchProgress: async () => {},
      resetProgress: async () => {
        callOrder.push('resetProgress');
        return true;
      },
    });
  }

  const confirmWithdraw = async (user: ReturnType<typeof userEvent.setup>) => {
    await user.click(screen.getByRole('button', { name: COPY.myPage.withdraw }));
    await user.click(screen.getByRole('button', { name: COPY.myPage.withdrawConfirm }));
  };

  afterEach(() => {
    // 모킹한 firebase 모듈은 파일 싱글턴이다 — 되돌리지 않으면 다른 테스트로 샌다
    (auth as unknown as { currentUser: unknown }).currentUser = null;
    deleteAccount.mockReset();
  });

  it('데이터 파기 4건이 모두 성공한 뒤에만 Auth 계정을 삭제한다', async () => {
    // jsdom의 alert는 미구현이다 — 성공 안내는 호출 여부만 관찰한다
    const alertSpy = vi.spyOn(window, 'alert').mockImplementation(() => {});
    const user = userEvent.setup();
    stubWithdrawStores();
    deleteAccount.mockImplementation(async () => {
      callOrder.push('deleteAccount');
      return true;
    });
    renderMyPage('someone@example.com');

    await confirmWithdraw(user);

    await waitFor(() => expect(alertSpy).toHaveBeenCalledWith(COPY.myPage.withdrawDone));
    expect(callOrder).toEqual([
      'deleteUserDoc',
      'deleteCharacter',
      'deleteTestResults',
      'resetProgress',
      'deleteAccount',
    ]);
    alertSpy.mockRestore();
  });

  it('데이터 파기가 하나라도 실패하면 계정을 삭제하지 않는다', async () => {
    const user = userEvent.setup();
    stubWithdrawStores({ testsCleared: false });
    renderMyPage('someone@example.com');

    await confirmWithdraw(user);

    expect(await screen.findByText(flat(COPY.myPage.withdrawDataFailed))).toBeInTheDocument();
    expect(deleteAccount).not.toHaveBeenCalled();
  });

  it('세션이 오래됐으면 아무것도 지우기 전에 재로그인을 안내한다', async () => {
    const user = userEvent.setup();
    stubWithdrawStores();
    (auth as unknown as { currentUser: unknown }).currentUser = {
      metadata: { lastSignInTime: new Date(Date.now() - 10 * 60 * 1000).toUTCString() },
    };
    renderMyPage('someone@example.com');

    await confirmWithdraw(user);

    expect(await screen.findByText(flat(COPY.errors.auth.requiresRecentLogin))).toBeInTheDocument();
    expect(callOrder).toEqual([]);
    expect(deleteAccount).not.toHaveBeenCalled();
  });
});
