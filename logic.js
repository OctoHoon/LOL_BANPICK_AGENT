// 밴픽 순서와 추천 계산. 화면 코드와 분리해 node 로도 시험할 수 있게 했다.

export const ROLES = [
  { id: 'top', label: '탑' },
  { id: 'jungle', label: '정글' },
  { id: 'mid', label: '미드' },
  { id: 'adc', label: '원딜' },
  { id: 'support', label: '서폿' },
];

export const TIERS = {
  1: { label: '주력', score: 60 },
  2: { label: '가능', score: 40 },
  3: { label: '연습', score: 20 },
};

// ranked: 솔로·자유 랭크 방식(양 팀 5밴 후 1-2-2-2-2-1 픽)
// tournament: 대회 방식(3밴, 3픽, 2밴, 2픽)
export function draftSequence(format) {
  const B = 'blue', R = 'red';
  const ban = (side) => ({ type: 'ban', side });
  const pick = (side) => ({ type: 'pick', side });
  if (format === 'tournament') {
    return [
      ban(B), ban(R), ban(B), ban(R), ban(B), ban(R),
      pick(B), pick(R), pick(R), pick(B), pick(B), pick(R),
      ban(R), ban(B), ban(R), ban(B),
      pick(R), pick(B), pick(B), pick(R),
    ];
  }
  return [
    ban(B), ban(R), ban(B), ban(R), ban(B), ban(R), ban(B), ban(R), ban(B), ban(R),
    pick(B), pick(R), pick(R), pick(B), pick(B), pick(R), pick(R), pick(B), pick(B), pick(R),
  ];
}

export function currentStep(actions) {
  const i = actions.findIndex((a) => a == null);
  return i === -1 ? null : i;
}

export function usedChampions(actions) {
  return new Set(actions.filter(Boolean));
}

export function sideChampions(actions, seq, side, type) {
  return seq
    .map((s, i) => ({ ...s, i, champ: actions[i] }))
    .filter((s) => s.side === side && s.type === type);
}

// 조합 성향. 탱커·서포터는 딜 비중이 작다고 보고 피해 유형에 절반만 반영한다(추정).
export function teamProfile(champIds, champMap) {
  let ad = 0, ap = 0, front = 0;
  for (const id of champIds) {
    const c = champMap.get(id);
    if (!c) continue;
    const w = c.tags[0] === 'Tank' || c.tags[0] === 'Support' ? 0.5 : 1;
    if (c.dmg === 'AP') ap += w; else ad += w;
    if (c.front) front += 1;
  }
  return { ad, ap, front, count: champIds.length };
}

function wrBonus(entry) {
  if (!entry.games || entry.games < 5) return 0;
  const wr = (entry.wins / entry.games) * 100;
  return Math.max(-10, Math.min(10, (wr - 50) * 0.4));
}

// 우리 팀 픽 추천.
// state: { team, actions, seq, assign }  assign: { stepIndex: memberId }
export function recommendPicks(state, champMap, limit = 8) {
  const { team, actions, seq, assign } = state;
  const ours = team.side;
  const used = usedChampions(actions);
  const ourPicks = sideChampions(actions, seq, ours, 'pick').filter((s) => s.champ);
  const filledMembers = new Set(ourPicks.map((s) => assign[s.i]).filter(Boolean));
  const openMembers = team.members.filter((m) => !filledMembers.has(m.id));
  const prof = teamProfile(ourPicks.map((s) => s.champ), champMap);
  const threats = new Set(team.threats || []);

  // 같은 챔피언을 몇 명이 다룰 수 있는지(플렉스 판단용)
  const owners = new Map();
  for (const m of team.members) for (const p of m.pool) {
    owners.set(p.champ, (owners.get(p.champ) || 0) + 1);
  }

  const out = [];
  for (const m of openMembers) {
    const available = m.pool.filter((p) => !used.has(p.champ) && champMap.has(p.champ));
    const mainsLeft = available.filter((p) => p.tier === 1).length;
    for (const p of available) {
      const c = champMap.get(p.champ);
      const reasons = [];
      let score = TIERS[p.tier]?.score ?? 20;
      reasons.push(`${m.name || '팀원'}의 ${TIERS[p.tier]?.label ?? '연습'} 챔피언`);

      const wb = wrBonus(p);
      if (wb) {
        score += wb;
        reasons.push(`최근 ${p.games}판 승률 ${Math.round((p.wins / p.games) * 100)}%`);
      }

      const n = prof.count;
      if (n >= 2 && prof.ap < 1 && c.dmg === 'AP') { score += 10; reasons.push('AP 피해 보충'); }
      if (n >= 2 && prof.ad < 1 && c.dmg === 'AD') { score += 10; reasons.push('AD 피해 보충'); }
      if (n >= 3 && (c.dmg === 'AD' ? prof.ad : prof.ap) >= 3) { score -= 10; reasons.push(`${c.dmg} 쏠림 주의`); }
      if (prof.front === 0 && c.front) { score += 4 + n * 3; reasons.push('앞라인 보충'); }

      if (threats.has(p.champ)) { score += 6; reasons.push('경계 목록 챔피언이라 먼저 가져가면 상대 선택지가 줄어듦'); }
      if (n <= 1 && (owners.get(p.champ) || 0) >= 2) { score += 5; reasons.push('여러 팀원이 다뤄 라인을 숨기기 좋음'); }
      if (p.tier === 1 && mainsLeft === 1) { score += 4; reasons.push('남은 주력이 이것뿐이라 밴 전에 확보 권장'); }

      out.push({ champ: p.champ, memberId: m.id, role: m.role, score: Math.round(score), reasons });
    }
  }
  out.sort((a, b) => b.score - a.score);
  return out.slice(0, limit);
}

// 밴 추천: 팀원이 상대하기 싫다고 적은 챔피언과 경계 목록을 합산한다.
// 우리 팀 주력 챔피언은 밴하지 않는다.
export function recommendBans(state, champMap, limit = 8) {
  const { team, actions } = state;
  const used = usedChampions(actions);
  const ourMains = new Set();
  for (const m of team.members) for (const p of m.pool) if (p.tier <= 2) ourMains.add(p.champ);

  const score = new Map();
  const reasons = new Map();
  const add = (id, s, r) => {
    if (used.has(id) || !champMap.has(id) || ourMains.has(id)) return;
    score.set(id, (score.get(id) || 0) + s);
    if (!reasons.has(id)) reasons.set(id, []);
    reasons.get(id).push(r);
  };
  for (const m of team.members) {
    for (const id of m.hates || []) add(id, 30, `${m.name || '팀원'}이(가) 상대하기 싫은 챔피언`);
  }
  (team.threats || []).forEach((id, i) => add(id, 25 - Math.min(i, 10), '경계 목록'));

  const skipped = [...new Set([
    ...(team.threats || []),
    ...team.members.flatMap((m) => m.hates || []),
  ])].filter((id) => ourMains.has(id) && !used.has(id));

  const list = [...score.entries()]
    .map(([champ, s]) => ({ champ, score: s, reasons: reasons.get(champ) }))
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
  return { list, skipped };
}

// 우리 픽을 어느 팀원에게 배정할지 정한다. 풀에 있는 팀원 중 숙련도가 높은 쪽을 고른다.
export function guessMember(team, champ, filled) {
  let best = null;
  for (const m of team.members) {
    if (filled.has(m.id)) continue;
    const p = m.pool.find((x) => x.champ === champ);
    const rank = p ? p.tier : 9;
    if (!best || rank < best.rank) best = { id: m.id, rank };
  }
  return best?.id ?? null;
}

// 한글 초성 검색 ("ㅇㄹ" → 아리)
const CHO = 'ㄱㄲㄴㄷㄸㄹㅁㅂㅃㅅㅆㅇㅈㅉㅊㅋㅌㅍㅎ';
export function chosung(s) {
  return [...s].map((ch) => {
    const code = ch.charCodeAt(0) - 0xac00;
    return code >= 0 && code < 11172 ? CHO[Math.floor(code / 588)] : ch;
  }).join('');
}
export function matchChampion(c, q) {
  if (!q) return true;
  const query = q.trim().toLowerCase().replace(/\s/g, '');
  if (!query) return true;
  const name = c.name.replace(/\s/g, '');
  return name.includes(query) || c.id.toLowerCase().includes(query) || chosung(name).includes(query);
}
