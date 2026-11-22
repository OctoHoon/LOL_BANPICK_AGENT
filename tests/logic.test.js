import { test } from 'node:test';
import assert from 'node:assert/strict';
import { BASE_CHAMPIONS } from '../data/champions.js';
import { SAMPLE_TEAM } from '../data/sample.js';
import {
  draftSequence, currentStep, recommendPicks, recommendBans, guessMember, matchChampion, teamProfile,
} from '../logic.js';

const champMap = new Map(BASE_CHAMPIONS.map((c) => [c.id, c]));
const team = structuredClone(SAMPLE_TEAM);

test('밴픽 순서 길이와 픽 순서', () => {
  const r = draftSequence('ranked');
  assert.equal(r.length, 20);
  assert.equal(r.filter((s) => s.type === 'ban').length, 10);
  const picks = r.filter((s) => s.type === 'pick').map((s) => s.side[0]).join('');
  assert.equal(picks, 'brrbbrrbbr');
  const t = draftSequence('tournament');
  assert.equal(t.length, 20);
  assert.equal(t.filter((s) => s.type === 'ban').length, 10);
});

test('예시 팀의 챔피언 id가 모두 표에 있다', () => {
  for (const m of team.members) {
    for (const p of m.pool) assert.ok(champMap.has(p.champ), p.champ);
    for (const h of m.hates) assert.ok(champMap.has(h), h);
  }
  for (const t of team.threats) assert.ok(champMap.has(t), t);
});

test('밴 추천은 우리 주력·가능 챔피언을 빼고, 이미 쓴 챔피언도 뺀다', () => {
  const seq = draftSequence('ranked');
  const actions = Array(seq.length).fill(null);
  actions[0] = 'Yone';
  const { list } = recommendBans({ team, actions, seq, assign: {} }, champMap);
  const ids = list.map((x) => x.champ);
  assert.ok(!ids.includes('Yone'));
  assert.ok(!ids.includes('Ahri'));
  assert.ok(ids.includes('Fiora'));
});

test('픽 추천은 이미 배정된 팀원을 건너뛴다', () => {
  const seq = draftSequence('ranked');
  const actions = Array(seq.length).fill(null);
  for (let i = 0; i < 10; i += 1) actions[i] = ['Zed', 'Yasuo', 'Teemo', 'Fiora', 'Draven', 'Blitzcrank', 'Khazix', 'Rell', 'Aurora', 'Skarner'][i];
  actions[10] = 'Ahri';
  const assign = { 10: 'm3' };
  const recs = recommendPicks({ team, actions, seq, assign }, champMap, 50);
  assert.ok(recs.length > 0);
  assert.ok(recs.every((r) => r.memberId !== 'm3'));
  assert.ok(recs.every((r) => r.champ !== 'Ahri'));
});

test('AP가 없으면 AP 챔피언 점수가 오른다', () => {
  const seq = draftSequence('ranked');
  const actions = Array(seq.length).fill(null);
  actions[10] = 'Jinx'; actions[13] = 'LeeSin';
  const assign = { 10: 'm4', 13: 'm2' };
  const recs = recommendPicks({ team, actions, seq, assign }, champMap, 50);
  const ori = recs.find((r) => r.champ === 'Orianna');
  assert.ok(ori.reasons.includes('AP 피해 보충'));
});

test('팀원 배정 추정, 초성 검색, 조합 성향', () => {
  assert.deepEqual(guessMember(team, 'Galio', new Set()), { id: 'm3', role: 'mid' });
  assert.deepEqual(guessMember(team, 'Galio', new Set(['m3'])), { id: 'm5', role: 'support' });
  assert.deepEqual(guessMember(team, 'Galio', new Set(), new Set(['mid'])), { id: 'm5', role: 'support' });
  assert.ok(matchChampion(champMap.get('Ahri'), 'ㅇㄹ'));
  assert.ok(matchChampion(champMap.get('LeeSin'), '리신'));
  assert.equal(currentStep([1, null]), 1);
  const p = teamProfile(['Ornn', 'Ahri', 'Jinx'], champMap);
  assert.equal(p.front, 1);
  assert.equal(p.ap, 1);
  assert.equal(p.ad, 1.5);
});

// ---------- 메타 통계 반영 ----------
import { recommendBans as rb, recommendPicks as rp, assignEnemyPositions, smoothWr, statReasons } from '../logic.js';

const META = {
  games: 1000,
  champs: {
    Ahri: { pos: { mid: [300, 165] }, bans: 50 },
    Zed: { pos: { mid: [200, 100] }, bans: 300 },
    Orianna: { pos: { mid: [150, 70] }, bans: 5 },
    Gnar: { pos: { top: [100, 50] }, bans: 0 },
    Yasuo: { pos: { mid: [120, 60], top: [80, 40] }, bans: 100 },
  },
  matchups: {
    mid: {
      Ahri: { Zed: [60, 24], Yasuo: [40, 26] },
      Orianna: { Yasuo: [40, 14] },
    },
  },
  duos: { 'Jinx|Nautilus': [50, 30] },
  vs: { Ahri: { MonkeyKing: [100, 40] }, Orianna: { MonkeyKing: [100, 60] } },
  with: { 'Ahri|Ornn': [80, 50] },
};

test('보정 승률은 표본이 적을수록 50%에 가깝다', () => {
  assert.ok(Math.abs(smoothWr(2, 2) - 0.5) < 0.05);
  assert.ok(smoothWr(1000, 600) > 0.59);
});

test('상대 포지션 추정: 겹치면 비중이 큰 쪽이 자리를 차지한다', () => {
  const pos = assignEnemyPositions(META, ['Yasuo', 'Ahri']);
  assert.equal(pos.Ahri, 'mid');
  assert.equal(pos.Yasuo, 'top');
});

test('상대 미드가 나오면 라인 상성이 픽 점수에 반영된다', () => {
  const seq = draftSequence('ranked');
  const actions = Array(seq.length).fill(null);
  actions[11] = 'Yasuo'; // 레드 1픽
  const recs = rp({ team, actions, seq, assign: {} }, champMap, 50, META);
  const ahri = recs.find((r) => r.champ === 'Ahri');
  const ori = recs.find((r) => r.champ === 'Orianna');
  assert.ok(ahri.reasons.some((x) => x.includes('야스오 상대 승률 65%')));
  assert.ok(ori.reasons.some((x) => x.includes('야스오 상대 승률 35%')));
  assert.ok(ahri.score > ori.score + 10);
});

test('밴 추천: 메타 밴픽률과 우리 주력 카운터', () => {
  const seq = draftSequence('ranked');
  const actions = Array(seq.length).fill(null);
  const { list } = rb({ team, actions, seq, assign: {} }, champMap, 20, META);
  const zed = list.find((x) => x.champ === 'Zed');
  assert.ok(zed);
  assert.ok(zed.reasons.some((r) => r.includes('밴픽률 50%')));
  assert.ok(zed.reasons.some((r) => r.includes('아리 상대로 강함')));
});

test('듀오 궁합', () => {
  const st = statReasons(META, champMap, 'adc', 'Jinx', {}, 0, { support: 'Nautilus' });
  assert.ok(st.reasons.some((r) => r.includes('노틸러스와 듀오 승률 60%')));
  assert.ok(st.score > 0);
});

// ---------- 라인 유동 · 전체 전적 ----------
import { summarizeGames, recencyWeight } from '../scripts/collect.mjs';
import { assignRoles, poolFromCollected } from '../team-data.js';

test('최근 가중치: 120일 전 경기는 절반', () => {
  const now = Date.UTC(2026, 10, 22);
  assert.equal(recencyWeight(now, now, 120), 1);
  assert.ok(Math.abs(recencyWeight(now - 120 * 86400000, now, 120) - 0.5) < 1e-9);
  const sum = summarizeGames([
    { champ: 'Ahri', pos: 'mid', win: true, at: now },
    { champ: 'Ahri', pos: 'mid', win: false, at: now - 240 * 86400000 },
    { champ: 'Ahri', pos: 'top', win: true, at: now },
  ], now, 120);
  assert.deepEqual(sum.champs[0].pos.mid, [2, 1, 1.25, 1]);
  assert.equal(sum.mainRole, 'mid');
});

test('주 라인 배정은 겹치지 않고 많이 간 쪽 우선', () => {
  const roles = assignRoles([
    { roles: { jungle: [18, 6], top: [11, 4], adc: [15, 5] } },
    { roles: { jungle: [54, 30] } },
    { roles: { mid: [52, 20] } },
    { roles: { adc: [32, 9], top: [27, 12] } },
    { roles: { support: [56, 25] } },
  ]);
  assert.deepEqual(roles, ['adc', 'jungle', 'mid', 'top', 'support']);
});

test('수집 챔프폭은 라인별 항목으로 만들어진다', () => {
  const pool = poolFromCollected({
    champs: [{ champ: 'Ahri', pos: { mid: [40, 22, 9, 5], top: [2, 1, 0.5, 0.2] } }, { champ: 'Gnar', pos: { top: [30, 15, 1, 0.5] } }],
    mastery: [],
  }, champMap, null, 'mid');
  const ahriMid = pool.find((p) => p.champ === 'Ahri' && p.role === 'mid');
  const gnarTop = pool.find((p) => p.champ === 'Gnar' && p.role === 'top');
  assert.equal(ahriMid.tier, 1); // 9 + 4
  assert.equal(gnarTop.tier, 2); // 1 + 3: 오래전에 많이 한 챔피언은 한 단계 낮게
  assert.ok(!pool.some((p) => p.champ === 'Ahri' && p.role === 'top')); // 0.5 + 0.2 < 1
});

test('미드가 이미 찼으면 같은 팀원의 다른 라인 챔프폭으로 추천', () => {
  const t = structuredClone(team);
  t.members[2].pool.push({ champ: 'Gnar', role: 'top', tier: 1 });
  const seq = draftSequence('ranked');
  const actions = Array(seq.length).fill(null);
  actions[10] = 'Ornn';
  const recs = rp({ team: t, actions, seq, assign: { 10: 'm1' }, assignRole: { 10: 'mid' } }, champMap, 50);
  assert.ok(recs.every((r) => r.role !== 'mid'));
  const gnar = recs.find((r) => r.champ === 'Gnar' && r.memberId === 'm3');
  assert.equal(gnar.role, 'top');
  assert.ok(gnar.reasons.some((x) => x.startsWith('부 라인')));
});

test('상대 조합 전체와 우리 조합 궁합', () => {
  const st = statReasons(META, champMap, 'mid', 'Ahri', { Yasuo: 'top' }, 3, { top: 'Ornn' }, new Set(), ['Yasuo', 'MonkeyKing']);
  assert.ok(st.reasons.some((r) => r.startsWith('상대 조합 불리: 오공 상대 40%')));
  assert.ok(st.reasons.some((r) => r.startsWith('우리 조합 궁합 좋음: 오른와 62.5%')));
  const st2 = statReasons(META, champMap, 'mid', 'Orianna', {}, 3, {}, new Set(), ['MonkeyKing']);
  assert.ok(st2.reasons.some((r) => r.startsWith('상대 조합 유리')));
});

// ---------- 조합 규칙 ----------
import { compReasons } from '../logic.js';

test('상대 돌진 챔피언이 많으면 돌진 대응 챔피언 점수가 오른다', () => {
  const r = compReasons('Taliyah', ['Zed', 'Khazix', 'Vi'], [], champMap);
  assert.equal(r.score, 8);
  assert.ok(r.reasons[0].startsWith('상대 돌진 챔피언 3명'));
  assert.equal(compReasons('Taliyah', ['Zed'], [], champMap).score, 0);
  assert.ok(!compReasons('Ahri', ['Zed', 'Khazix', 'Vi'], [], champMap).reasons.some((x) => x.includes('돌진 대응')));
});

test('우리 조합에 이니시가 없으면 이니시 챔피언 가산', () => {
  const r = compReasons('Leona', [], ['Jinx', 'Ahri'], champMap);
  assert.ok(r.reasons.includes('우리 조합에 이니시 부족'));
  assert.equal(compReasons('Leona', [], ['Jinx', 'Nautilus'], champMap).score, 0);
});

test('조합 특성 표의 id가 모두 챔피언 표에 있다', async () => {
  const { TRAITS } = await import('../data/traits.js');
  for (const ids of Object.values(TRAITS)) for (const id of ids) assert.ok(champMap.has(id), id);
});
