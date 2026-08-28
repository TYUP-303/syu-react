// tests/integration/initTestFallback.integration.test.ts
// initTest의 DB 우선/로컬 폴백 분기를 에뮬레이터로 고정한다.
// questions/*는 클라이언트 쓰기 금지(firestore.rules)라서 문서 조작은
// 시드 스크립트와 같은 에뮬레이터 REST + Bearer owner로 한다 (2026-08-06 조정).
// 읽기(getDoc, initTest)는 규칙상 공개라 클라이언트 SDK 그대로.
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '../../src/api/firebase';
import { useTestStore } from '../../src/store/useTestStore';

const DOC_URL =
  'http://127.0.0.1:8080/v1/projects/demo-syu/databases/(default)/documents/questions/adhd';
const OWNER = { Authorization: 'Bearer owner' };

async function ownerSetCsvText(csvText: string) {
  const res = await fetch(DOC_URL, {
    method: 'PATCH',
    headers: { ...OWNER, 'Content-Type': 'application/json' },
    body: JSON.stringify({ fields: { csvText: { stringValue: csvText } } }),
  });
  if (!res.ok) throw new Error(`questions/adhd PATCH 실패: ${res.status}`);
}

async function ownerDeleteDoc() {
  const res = await fetch(DOC_URL, { method: 'DELETE', headers: OWNER });
  if (!res.ok && res.status !== 404) throw new Error(`questions/adhd DELETE 실패: ${res.status}`);
}

const TINY_CSV = 'id,part,question,type,options\n1,테스트,DB 우선 확인용 문항,scale,"아니다,그렇다"';
let originalCsvText: string | undefined;

beforeAll(async () => {
  const snap = await getDoc(doc(db, 'questions', 'adhd'));
  originalCsvText = snap.exists() ? snap.data().csvText : undefined;
});

afterAll(async () => {
  // 시드 상태 복구 — 다른 통합 테스트가 시드 데이터를 전제로 하기 때문
  if (originalCsvText !== undefined) {
    await ownerSetCsvText(originalCsvText);
  } else {
    await ownerDeleteDoc();
  }
});

describe('initTest 분기 (조용한 폴백 특성화)', () => {
  it('questions/adhd에 csvText가 있으면 DB 내용이 우선한다', async () => {
    await ownerSetCsvText(TINY_CSV);

    await useTestStore.getState().initTest('adhd');

    const questions = useTestStore.getState().questions;
    expect(questions).toHaveLength(1);
    expect(questions[0].question).toBe('DB 우선 확인용 문항');
  });

  it('문서가 없으면 로컬 CSV로 조용히 폴백한다 (화면상 구분 불가 동작)', async () => {
    await ownerDeleteDoc();

    await useTestStore.getState().initTest('adhd');

    // 로컬 adhd_questions.csv는 1문항짜리 TINY_CSV보다 훨씬 많다
    expect(useTestStore.getState().questions.length).toBeGreaterThan(1);
  });
});
