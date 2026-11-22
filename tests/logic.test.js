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
  assert.equal(guessMember(team, 'Galio', new Set()), 'm3');
  assert.equal(guessMember(team, 'Galio', new Set(['m3'])), 'm5');
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
