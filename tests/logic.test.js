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
