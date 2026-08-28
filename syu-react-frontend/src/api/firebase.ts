// src/api/firebase.ts
// Firebase SDK 초기화 파일
// 환경 변수는 프로젝트 루트의 .env.local 파일에 설정합니다.
//
// .env.local 예시:
//   VITE_FIREBASE_API_KEY=your_api_key
//   VITE_FIREBASE_AUTH_DOMAIN=your_project.firebaseapp.com
//   VITE_FIREBASE_PROJECT_ID=your_project_id
//   VITE_FIREBASE_STORAGE_BUCKET=your_project.appspot.com
//   VITE_FIREBASE_MESSAGING_SENDER_ID=your_sender_id
//   VITE_FIREBASE_APP_ID=your_app_id

import { initializeApp } from 'firebase/app';
import { getAnalytics } from 'firebase/analytics';
import {
  getAuth,
  GoogleAuthProvider,
  signInWithPopup,
  signOut,
  type UserCredential,
  connectAuthEmulator,
} from 'firebase/auth';
import {
  getFirestore,
  doc,
  getDoc,
  setDoc,
  serverTimestamp,
  connectFirestoreEmulator,
} from 'firebase/firestore';
import { COLLECTIONS } from './firestoreKeys';
import { IS_MOCK_MODE } from './env';

// ─── Firebase 설정 (환경 변수에서 로드) ───────────────
// apiKey 가 아예 비어 있으면(.env.local 이 없는 빈 클론) getAuth() 가 임포트
// 시점에 auth/invalid-api-key 를 던져 앱과 테스트가 통째로 죽는다. 자리표시자를
// 넣어 부팅은 되게 하고, 'your_api_key' 를 포함하므로 env.ts 의 Mock 판정은 그대로다.
const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY || 'your_api_key_missing',
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
  measurementId: import.meta.env.VITE_FIREBASE_MEASUREMENT_ID,
};

// ─── SDK 인스턴스 초기화 ───────────────────────────────
const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);

// 에뮬레이터 연결 (VITE_USE_EMULATOR=true일 때만, 테스트/로컬 전용)
const IS_EMULATOR = import.meta.env.VITE_USE_EMULATOR === 'true';
if (IS_EMULATOR) {
  connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true });
  connectFirestoreEmulator(db, '127.0.0.1', 8080);
}

// 애널리틱스는 실 브라우저 환경에서만 (에뮬레이터/jsdom 환경 제외)
// Mock 모드(키 없음)에서는 Analytics 도 건너뛴다 — projectId/appId 가 비면
// Installations 가 초기화 시점에 던지고(jsdom 도 window 가 있어 테스트까지 죽는다),
// 애초에 보낼 곳도 없다.
export const analytics =
  typeof window !== 'undefined' && !IS_EMULATOR && !IS_MOCK_MODE ? getAnalytics(app) : null;

// ─── Google Auth Provider ─────────────────────────────
const googleProvider = new GoogleAuthProvider();
// 로그인 시 계정 선택 팝업이 항상 표시되도록 설정
googleProvider.setCustomParameters({ prompt: 'select_account' });

// ─── Auth 유틸리티 함수 ────────────────────────────────

/**
 * 구글 네이티브 로그인 팝업을 실행합니다.
 * 로그인 성공 시 UserCredential을 반환합니다.
 */
export const signInWithGoogle = async (): Promise<UserCredential> => {
  return signInWithPopup(auth, googleProvider);
};

/**
 * 현재 로그인된 유저를 로그아웃합니다.
 */
export const signOutUser = async (): Promise<void> => {
  return signOut(auth);
};

/**
 * 사용자 정보를 Firestore에 동기화합니다 (가입 시 최초 1회 생성).
 */
export const syncUserToFirestore = async (user: import('firebase/auth').User) => {
  if (!user) return;
  const userRef = doc(db, COLLECTIONS.USERS, user.uid);
  try {
    const snap = await getDoc(userRef);
    if (!snap.exists()) {
      await setDoc(userRef, {
        email: user.email || '',
        displayName: user.displayName || '',
        photoURL: user.photoURL || '',
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    }
  } catch (error) {
    console.error('Failed to sync user to Firestore:', error);
  }
};

/**
 * Firestore에서 해당 사용자의 프로필 문서를 완전히 삭제합니다.
 *
 * 성공 여부를 boolean으로 돌려준다 — 탈퇴 흐름이 "지웠다"고 알리기 전에
 * 실제로 지워졌는지 확인해야 하기 때문이다. 스토어의 delete* 액션들과 같은 계약.
 */
export const deleteUserDoc = async (uid: string): Promise<boolean> => {
  if (!uid) return false;
  const userRef = doc(db, COLLECTIONS.USERS, uid);
  try {
    await import('firebase/firestore').then(({ deleteDoc }) => deleteDoc(userRef));
    return true;
  } catch (error) {
    console.error('Failed to delete user from Firestore:', error);
    return false;
  }
};
