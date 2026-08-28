import { create } from 'zustand';
import { db } from '../api/firebase';
import { IS_MOCK_MODE } from '../api/env';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { COLLECTIONS } from '../api/firestoreKeys';
import { COPY } from '../constants/copy';

export interface CharacterInfo {
  nickname: string;
  gender: 'male' | 'female';
  createdAt: string;
}

interface CharacterState {
  character: CharacterInfo | null;
  /**
   * users/{uid}.avatarId — 선택한 프리셋 아바타 id.
   *
   * 캐릭터(character) 안이 아니라 문서 최상위 필드다. 아바타는 내
   * 캐릭터를 만들기 전에도 고를 수 있어야 하고, "데이터 초기화"의 의미도
   * 다르기 때문이다. 그래도 소유는 이 스토어다 — users/{uid} 문서를
   * 읽고 쓰는 계약(merge:true + Mock 시 localStorage)이 여기 있으므로,
   * useAuthStore(항상 실 Firebase Auth, 문서가 아니라 세션을 다룸)에
   * 두면 두 규약이 다 깨진다.
   */
  avatarId: string | null;
  isLoading: boolean;
  error: string | null;
  fetchCharacter: (uid: string) => Promise<void>;
  createCharacter: (uid: string, nickname: string, gender: 'male' | 'female') => Promise<boolean>;
  updateNickname: (uid: string, newNickname: string) => Promise<boolean>;
  /** null을 주면 프리셋을 해제한다 (구글 사진 → 기본 아이콘 순으로 폴백). */
  updateAvatarId: (uid: string, avatarId: string | null) => Promise<boolean>;
  deleteCharacter: (uid: string) => Promise<boolean>;
  resetCharacter: () => void;
}

/** Mock 모드 전용 키. 실 모드에서는 users/{uid}.avatarId 필드가 대신한다. */
const avatarKey = (uid: string) => `react_avatar_${uid}`;

export const useCharacterStore = create<CharacterState>((set, get) => ({
  character: null,
  avatarId: null,
  isLoading: false,
  error: null,

  fetchCharacter: async (uid: string) => {
    set({ isLoading: true, error: null });

    if (IS_MOCK_MODE) {
      // 로컬 스토리지에서 모의 캐릭터 조회
      await new Promise((resolve) => setTimeout(resolve, 400));
      const localData = localStorage.getItem(`react_char_${uid}`);
      set({
        character: localData ? (JSON.parse(localData) as CharacterInfo) : null,
        avatarId: localStorage.getItem(avatarKey(uid)),
        isLoading: false,
      });
      return;
    }

    try {
      const docRef = doc(db, COLLECTIONS.USERS, uid);
      const docSnap = await getDoc(docRef);
      if (docSnap.exists()) {
        // 아바타는 같은 문서에 있으므로 읽기를 따로 한 번 더 하지 않는다.
        const data = docSnap.data();
        set({
          character: (data.character as CharacterInfo | undefined) ?? null,
          avatarId: (data.avatarId as string | undefined) ?? null,
          isLoading: false,
        });
        return;
      }
      set({ character: null, avatarId: null, isLoading: false });
    } catch (err) {
      console.error('Error fetching character:', err);
      set({
        error: err instanceof Error ? err.message : COPY.errors.characterLoadFailed,
        isLoading: false,
      });
    }
  },

  createCharacter: async (uid: string, nickname: string, gender: 'male' | 'female') => {
    set({ isLoading: true, error: null });
    const characterData: CharacterInfo = {
      nickname,
      gender,
      createdAt: new Date().toISOString(),
    };

    if (IS_MOCK_MODE) {
      // 로컬 스토리지에 모의 캐릭터 정보 저장
      await new Promise((resolve) => setTimeout(resolve, 600));
      localStorage.setItem(`react_char_${uid}`, JSON.stringify(characterData));
      set({ character: characterData, isLoading: false });
      return true;
    }

    try {
      const docRef = doc(db, COLLECTIONS.USERS, uid);
      // Merge: true preserves other user fields (like email or name) if they exist
      await setDoc(docRef, { character: characterData }, { merge: true });
      
      set({ character: characterData, isLoading: false });
      return true;
    } catch (err) {
      console.error('Error creating character:', err);
      set({
        error: err instanceof Error ? err.message : COPY.errors.characterCreateFailed,
        isLoading: false,
      });
      return false;
    }
  },

  updateNickname: async (uid: string, newNickname: string) => {
    set({ isLoading: true, error: null });
    const current = get().character;
    if (!current) {
      set({ error: COPY.errors.characterMissing, isLoading: false });
      return false;
    }

    const updatedData: CharacterInfo = {
      ...current,
      nickname: newNickname,
    };

    if (IS_MOCK_MODE) {
      await new Promise((resolve) => setTimeout(resolve, 300));
      localStorage.setItem(`react_char_${uid}`, JSON.stringify(updatedData));
      set({ character: updatedData, isLoading: false });
      return true;
    }

    try {
      const docRef = doc(db, COLLECTIONS.USERS, uid);
      await setDoc(docRef, { character: updatedData }, { merge: true });
      set({ character: updatedData, isLoading: false });
      return true;
    } catch (err) {
      console.error('Error updating character nickname:', err);
      set({
        error: err instanceof Error ? err.message : COPY.errors.nicknameUpdateFailed,
        isLoading: false,
      });
      return false;
    }
  },

  updateAvatarId: async (uid: string, avatarId: string | null) => {
    set({ isLoading: true, error: null });

    if (IS_MOCK_MODE) {
      await new Promise((resolve) => setTimeout(resolve, 300));
      if (avatarId) {
        localStorage.setItem(avatarKey(uid), avatarId);
      } else {
        localStorage.removeItem(avatarKey(uid));
      }
      set({ avatarId, isLoading: false });
      return true;
    }

    try {
      const docRef = doc(db, COLLECTIONS.USERS, uid);
      // Auth의 photoURL은 건드리지 않는다 — 구글 재로그인이 그 값을 다시
      // 덮어써서 사용자가 고른 프리셋이 조용히 사라지기 때문이다.
      await setDoc(docRef, { avatarId }, { merge: true });
      set({ avatarId, isLoading: false });
      return true;
    } catch (err) {
      console.error('Error updating avatar:', err);
      set({
        error: err instanceof Error ? err.message : COPY.errors.avatarUpdateFailed,
        isLoading: false,
      });
      return false;
    }
  },

  deleteCharacter: async (uid: string) => {
    set({ isLoading: true, error: null });

    if (IS_MOCK_MODE) {
      await new Promise((resolve) => setTimeout(resolve, 300));
      localStorage.removeItem(`react_char_${uid}`);
      localStorage.removeItem(avatarKey(uid));
      set({ character: null, avatarId: null, isLoading: false });
      return true;
    }

    try {
      const docRef = doc(db, COLLECTIONS.USERS, uid);
      // character 필드를 제거하기 위해 Firestore update로 undefined 혹은 특정 구조 저장 가능하지만,
      // 여기서는 setDoc merge 형식으로 character: null 혹은 빈 객체를 설정하거나 updateDoc 사용 가능
      // project spec 규칙 준수하여 merge를 활용해 null로 설정
      //
      // 아바타도 함께 지운다 — "모든 데이터 초기화"에서 프로필 사진만
      // 남으면 초기화가 안 된 것처럼 보인다.
      await setDoc(docRef, { character: null, avatarId: null }, { merge: true });
      set({ character: null, avatarId: null, isLoading: false });
      return true;
    } catch (err) {
      console.error('Error deleting character:', err);
      set({
        error: err instanceof Error ? err.message : COPY.errors.characterDeleteFailed,
        isLoading: false,
      });
      return false;
    }
  },

  // 로그아웃 시 App.tsx가 호출한다. 아바타도 함께 비우지 않으면 다음
  // 사용자가 로그인할 때 앞 사람의 아바타가 잠깐 보인다.
  resetCharacter: () => set({ character: null, avatarId: null, error: null }),
}));
