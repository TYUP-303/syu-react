// tests/integration/testStore.integration.test.ts
// useTestStore의 Firestore 실경로를 에뮬레이터로 검증한다 (모킹 없음).
//
// uid 격리: firestore.rules가 users/{uid}를 본인 한정으로 막으므로 uid를 마음대로
// 정할 수 없고, 반드시 "로그인한 계정의 uid"를 써야 한다. 그렇다고 시드 계정
// (test@example.com)을 쓰면 같은 계정을 쓰는 firebaseAuth.integration.test.ts와
// 같은 users 문서를 놓고 부딪힌다 — vitest는 테스트 파일을 병렬 실행하는데
// 에뮬레이터의 Firestore 상태는 파일 간 공유되기 때문이다. (실제로 이 파일의
// beforeEach deleteDoc이 상대 파일의 검증 중간에 문서를 지워 양쪽이 깨졌다.)
// 그래서 이 파일은 자기 전용 계정을 만들어 자기 uid만 건드린다.
import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
} from 'firebase/auth';
import { doc, getDoc, setDoc, deleteDoc } from 'firebase/firestore';
import { auth, db } from '../../src/api/firebase';
import { useTestStore } from '../../src/store/useTestStore';

const OWN_EMAIL = 'integration-teststore@example.com';
const OWN_PASSWORD = 'password123';

let UID: string;

beforeAll(async () => {
  // 이 파일 전용 계정. 에뮬레이터 상태가 남아 있으면 이미 존재하므로 로그인으로 폴백한다.
  let cred;
  try {
    cred = await createUserWithEmailAndPassword(auth, OWN_EMAIL, OWN_PASSWORD);
  } catch (err) {
    if ((err as { code?: string }).code !== 'auth/email-already-in-use') throw err;
    cred = await signInWithEmailAndPassword(auth, OWN_EMAIL, OWN_PASSWORD);
  }
  UID = cred.user.uid;
});

beforeEach(async () => {
  await deleteDoc(doc(db, 'users', UID));
  useTestStore.setState({
    activeTest: null, questions: [], currentIndex: 0, answers: {},
    isLoading: false, isSubmitting: false, error: null,
    adhdResult: null, stressResult: null,
  });
});

describe('submitTest → fetchTestResults 왕복 (실 Firestore 경로)', () => {
  it('adhdResult 필드가 users/{uid} 단일 문서에 저장되고 다시 읽힌다', async () => {
    useTestStore.setState({ activeTest: 'adhd', answers: { 1: 3, 2: 1 } });

    const ok = await useTestStore.getState().submitTest(UID);
    expect(ok).toBe(true);

    useTestStore.setState({ adhdResult: null });
    await useTestStore.getState().fetchTestResults(UID);
    expect(useTestStore.getState().adhdResult?.score).toBe(4);
  });

  it('setDoc merge라서 기존 필드(character)를 보존한다', async () => {
    await setDoc(doc(db, 'users', UID), {
      character: { nickname: '수야', gender: 'female', createdAt: 'x' },
    });
    useTestStore.setState({ activeTest: 'stress', answers: { 1: 2 } });

    await useTestStore.getState().submitTest(UID);

    const snap = await getDoc(doc(db, 'users', UID));
    expect(snap.data()?.character?.nickname).toBe('수야'); // merge 의미론 고정
    expect(snap.data()?.stressResult?.score).toBe(2);
  });

  it('deleteTestResults는 두 결과 필드를 null로 만든다 (문서 삭제 아님)', async () => {
    useTestStore.setState({ activeTest: 'adhd', answers: { 1: 1 } });
    await useTestStore.getState().submitTest(UID);

    const ok = await useTestStore.getState().deleteTestResults(UID);

    expect(ok).toBe(true);
    const snap = await getDoc(doc(db, 'users', UID));
    expect(snap.exists()).toBe(true);
    expect(snap.data()?.adhdResult).toBeNull();
  });
});
