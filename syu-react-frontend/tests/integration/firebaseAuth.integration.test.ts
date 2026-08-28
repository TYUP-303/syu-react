// tests/integration/firebaseAuth.integration.test.ts
// Auth 에뮬레이터 대상 통합 테스트. `npm run test:integration`으로만 실행된다.
import { describe, it, expect, afterEach } from 'vitest';
import { signInWithEmailAndPassword, signOut } from 'firebase/auth';
import { doc, getDoc, setDoc, deleteDoc } from 'firebase/firestore';
import { auth, db, syncUserToFirestore, deleteUserDoc } from '../../src/api/firebase';

afterEach(async () => {
  if (auth.currentUser) await signOut(auth);
});

describe('Auth 에뮬레이터 연결', () => {
  it('시드 계정으로 이메일/비밀번호 로그인이 된다', async () => {
    const cred = await signInWithEmailAndPassword(auth, 'test@example.com', 'password123');
    expect(cred.user.uid).toBeTruthy();
    expect(cred.user.email).toBe('test@example.com');
  });

  it('틀린 비밀번호는 auth/invalid-credential 계열 에러를 던진다', async () => {
    await expect(
      signInWithEmailAndPassword(auth, 'test@example.com', 'wrong-password'),
    ).rejects.toMatchObject({ code: expect.stringContaining('auth/') });
  });
});

describe('syncUserToFirestore / deleteUserDoc', () => {
  it('최초 로그인 시 users/{uid} 문서를 만들고, 재호출해도 덮어쓰지 않는다', async () => {
    const cred = await signInWithEmailAndPassword(auth, 'test@example.com', 'password123');
    const uid = cred.user.uid;
    await deleteDoc(doc(db, 'users', uid)); // 이전 실행 잔재 제거

    await syncUserToFirestore(cred.user);
    // 문서에 임의 필드를 심은 뒤 재동기화 — 최초 1회 생성 로직이면 필드가 살아남아야 한다
    await setDoc(doc(db, 'users', uid), { marker: 'keep' }, { merge: true });
    await syncUserToFirestore(cred.user);

    const snap = await getDoc(doc(db, 'users', uid));
    expect(snap.exists()).toBe(true);
    expect(snap.data()?.marker).toBe('keep');

    await deleteUserDoc(uid);
    const gone = await getDoc(doc(db, 'users', uid));
    expect(gone.exists()).toBe(false);
  });
});
