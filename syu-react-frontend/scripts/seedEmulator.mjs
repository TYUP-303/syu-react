// scripts/seedEmulator.mjs
// Firebase 에뮬레이터에 questions/scenarios 문서와 테스트 계정을 시드한다.
// 사용법: 에뮬레이터 기동 후 `node scripts/seedEmulator.mjs`
//
// Firestore 쓰기는 REST API(Authorization: Bearer owner)로 수행한다.
// firestore.rules가 questions/scenarios를 읽기 전용으로 막아 두었고
// firebase.json이 에뮬레이터에도 같은 rules를 적용하므로, 클라이언트 SDK의
// setDoc은 에뮬레이터에서도 PERMISSION_DENIED로 거부된다. "owner" 토큰은
// 에뮬레이터가 보안 규칙을 우회하도록 인식하는 특수 값이라 시드 용도로 쓴다.
// Auth 계정 생성은 규칙의 영향을 받지 않으므로 브리프대로 클라이언트 SDK를 쓴다.
import { readFileSync } from 'node:fs';
import { initializeApp } from 'firebase/app';
import {
  getAuth,
  connectAuthEmulator,
  createUserWithEmailAndPassword,
} from 'firebase/auth';

const PROJECT_ID = 'demo-syu';
const FIRESTORE_EMULATOR_HOST = '127.0.0.1:8080';

const app = initializeApp({ projectId: PROJECT_ID, apiKey: 'fake-api-key' });
const auth = getAuth(app);
connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true });

const csv = (p) => readFileSync(new URL(`../src/assets/data/${p}`, import.meta.url), 'utf8');

async function seedDoc(collection, docId, csvText) {
  const url = `http://${FIRESTORE_EMULATOR_HOST}/v1/projects/${PROJECT_ID}/databases/(default)/documents/${collection}/${docId}`;
  const res = await fetch(url, {
    method: 'PATCH',
    headers: {
      Authorization: 'Bearer owner',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ fields: { csvText: { stringValue: csvText } } }),
  });
  if (!res.ok) {
    throw new Error(`${collection}/${docId} 시드 실패: ${res.status} ${await res.text()}`);
  }
}

await seedDoc('questions', 'adhd', csv('adhd_questions.csv'));
await seedDoc('questions', 'stress', csv('stress_questions.csv'));
await seedDoc('scenarios', 'visual', csv('scenario_visual.csv'));
await seedDoc('scenarios', 'dialogue', csv('scenario_dialogues.csv'));

try {
  await createUserWithEmailAndPassword(auth, 'test@example.com', 'password123');
  console.log('시드 계정 생성: test@example.com');
} catch (e) {
  if (e.code === 'auth/email-already-in-use') console.log('시드 계정 이미 존재');
  else throw e;
}
console.log('시드 완료: questions 2건, scenarios 2건');
process.exit(0);
