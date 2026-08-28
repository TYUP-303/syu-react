// src/store/useCharacterStore.test.ts
// 캐릭터 스토어의 "현재 동작"을 고정하는 특성화 테스트.
// 모킹 패턴은 useTestStore.test.ts와 동일 — Mock 모드 강제 + localStorage 스텁.

import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../api/env', () => ({ IS_MOCK_MODE: true }));
vi.mock('../api/firebase', () => ({ db: {} }));

import { useCharacterStore } from './useCharacterStore';

const storage = new Map<string, string>();
vi.stubGlobal('localStorage', {
  getItem: (key: string) => storage.get(key) ?? null,
  setItem: (key: string, value: string) => void storage.set(key, value),
  removeItem: (key: string) => void storage.delete(key),
  clear: () => storage.clear(),
});

beforeEach(() => {
  storage.clear();
  useCharacterStore.setState({ character: null, avatarId: null, isLoading: false, error: null });
});

describe('createCharacter (Mock 모드)', () => {
  it('캐릭터를 생성해 상태와 react_char_{uid} 키에 저장한다', async () => {
    const ok = await useCharacterStore.getState().createCharacter('uid-1', '수야', 'female');

    expect(ok).toBe(true);
    const char = useCharacterStore.getState().character;
    expect(char?.nickname).toBe('수야');
    expect(char?.gender).toBe('female');
    const saved = JSON.parse(localStorage.getItem('react_char_uid-1') ?? 'null');
    expect(saved?.nickname).toBe('수야');
  });
});

describe('fetchCharacter (Mock 모드)', () => {
  it('저장된 캐릭터를 같은 키에서 읽어온다', async () => {
    await useCharacterStore.getState().createCharacter('uid-1', '수야', 'male');
    useCharacterStore.setState({ character: null });

    await useCharacterStore.getState().fetchCharacter('uid-1');

    expect(useCharacterStore.getState().character?.nickname).toBe('수야');
  });

  it('저장된 캐릭터가 없으면 character는 null이다', async () => {
    await useCharacterStore.getState().fetchCharacter('uid-없음');
    expect(useCharacterStore.getState().character).toBeNull();
  });
});

describe('updateNickname (Mock 모드)', () => {
  it('닉네임만 바꾸고 성별과 생성일은 유지한다', async () => {
    await useCharacterStore.getState().createCharacter('uid-1', '수야', 'female');
    const before = useCharacterStore.getState().character;

    const ok = await useCharacterStore.getState().updateNickname('uid-1', '새이름');

    expect(ok).toBe(true);
    const after = useCharacterStore.getState().character;
    expect(after?.nickname).toBe('새이름');
    expect(after?.gender).toBe(before?.gender);
    expect(after?.createdAt).toBe(before?.createdAt);
  });
});

describe('updateAvatarId (Mock 모드)', () => {
  it('프리셋 id를 상태와 react_avatar_{uid} 키에 저장한다', async () => {
    const ok = await useCharacterStore.getState().updateAvatarId('uid-1', 'fairy-ako');

    expect(ok).toBe(true);
    expect(useCharacterStore.getState().avatarId).toBe('fairy-ako');
    expect(localStorage.getItem('react_avatar_uid-1')).toBe('fairy-ako');
  });

  it('null을 주면 프리셋을 해제하고 키까지 지운다', async () => {
    await useCharacterStore.getState().updateAvatarId('uid-1', 'fairy-ako');

    const ok = await useCharacterStore.getState().updateAvatarId('uid-1', null);

    expect(ok).toBe(true);
    expect(useCharacterStore.getState().avatarId).toBeNull();
    expect(localStorage.getItem('react_avatar_uid-1')).toBeNull();
  });

  it('캐릭터가 없어도 아바타는 고를 수 있다 (캐릭터 생성 전 진입)', async () => {
    expect(useCharacterStore.getState().character).toBeNull();

    const ok = await useCharacterStore.getState().updateAvatarId('uid-1', 'mate-female');

    expect(ok).toBe(true);
    expect(useCharacterStore.getState().avatarId).toBe('mate-female');
  });

  it('fetchCharacter가 캐릭터와 아바타를 함께 복원한다', async () => {
    await useCharacterStore.getState().createCharacter('uid-1', '수야', 'female');
    await useCharacterStore.getState().updateAvatarId('uid-1', 'fairy-leaf');
    useCharacterStore.setState({ character: null, avatarId: null });

    await useCharacterStore.getState().fetchCharacter('uid-1');

    expect(useCharacterStore.getState().character?.nickname).toBe('수야');
    expect(useCharacterStore.getState().avatarId).toBe('fairy-leaf');
  });

  it('닉네임 변경은 아바타를 건드리지 않는다', async () => {
    await useCharacterStore.getState().createCharacter('uid-1', '수야', 'female');
    await useCharacterStore.getState().updateAvatarId('uid-1', 'fairy-poko');

    await useCharacterStore.getState().updateNickname('uid-1', '새이름');

    expect(useCharacterStore.getState().avatarId).toBe('fairy-poko');
  });
});

describe('deleteCharacter / resetCharacter', () => {
  it('deleteCharacter는 상태와 localStorage를 모두 비운다', async () => {
    await useCharacterStore.getState().createCharacter('uid-1', '수야', 'male');

    const ok = await useCharacterStore.getState().deleteCharacter('uid-1');

    expect(ok).toBe(true);
    expect(useCharacterStore.getState().character).toBeNull();
    expect(localStorage.getItem('react_char_uid-1')).toBeNull();
  });

  it('데이터 초기화(deleteCharacter)는 아바타도 함께 지운다', async () => {
    await useCharacterStore.getState().createCharacter('uid-1', '수야', 'male');
    await useCharacterStore.getState().updateAvatarId('uid-1', 'fairy-ako');

    await useCharacterStore.getState().deleteCharacter('uid-1');

    expect(useCharacterStore.getState().avatarId).toBeNull();
    expect(localStorage.getItem('react_avatar_uid-1')).toBeNull();
  });

  it('resetCharacter는 메모리 상태만 비우고 localStorage는 남긴다', async () => {
    await useCharacterStore.getState().createCharacter('uid-1', '수야', 'male');

    useCharacterStore.getState().resetCharacter();

    expect(useCharacterStore.getState().character).toBeNull();
    expect(localStorage.getItem('react_char_uid-1')).not.toBeNull();
  });

  it('로그아웃(resetCharacter)은 앞 사용자의 아바타를 메모리에서 지운다', async () => {
    await useCharacterStore.getState().updateAvatarId('uid-1', 'fairy-ako');

    useCharacterStore.getState().resetCharacter();

    expect(useCharacterStore.getState().avatarId).toBeNull();
    // 같은 계정으로 다시 로그인하면 fetchCharacter가 복원한다
    expect(localStorage.getItem('react_avatar_uid-1')).toBe('fairy-ako');
  });
});
