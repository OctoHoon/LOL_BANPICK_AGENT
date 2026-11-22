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

// ---------- 통계(meta.json) 도우미 ----------
// 표본이 적을 때 50%로 끌어당기는 보정 승률. k판만큼 50% 경기가 더 있다고 본다.
export function smoothWr(games, wins, k = 30) {
  return (wins + 0.5 * k) / (games + k);
}
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const pct = (v) => `${Math.round(v * 1000) / 10}%`;

// 챔피언이 가장 많이 가는 포지션과 그 비중
export function inferPosition(meta, champ) {
  const pos = meta?.champs?.[champ]?.pos;
  if (!pos) return null;
  const total = Object.values(pos).reduce((a, [g]) => a + g, 0);
  const [best, [g]] = Object.entries(pos).sort((a, b) => b[1][0] - a[1][0])[0] || [null, [0]];
  return best ? { pos: best, share: g / total, total } : null;
}

// 상대 픽마다 포지션을 정한다. 같은 포지션이 겹치면 비중이 큰 쪽을 그 자리에 둔다.
export function assignEnemyPositions(meta, champs) {
  const out = {};
  const taken = new Set();
  const cand = champs.map((c) => {
    const pos = meta?.champs?.[c]?.pos || {};
    const total = Object.values(pos).reduce((a, [g]) => a + g, 0) || 1;
    return { c, opts: Object.entries(pos).map(([p, [g]]) => ({ p, share: g / total })).sort((a, b) => b.share - a.share) };
  });
  const flat = cand.flatMap(({ c, opts }) => opts.map((o) => ({ c, ...o }))).sort((a, b) => b.share - a.share);
  for (const { c, p } of flat) {
    if (out[c] || taken.has(p)) continue;
    out[c] = p; taken.add(p);
  }
  return out;
}

function laneStat(meta, role, a, b) {
  const v = meta?.matchups?.[role]?.[a]?.[b];
  return v ? { games: v[0], wins: v[1] } : null;
}

function wrBonus(entry) {
  if (!entry.games || entry.games < 5) return 0;
  const wr = (entry.wins / entry.games) * 100;
  return Math.max(-10, Math.min(10, (wr - 50) * 0.4));
}

// 우리 팀 픽 추천.
// state: { team, actions, seq, assign }  assign: { stepIndex: memberId }
export function recommendPicks(state, champMap, limit = 8, meta = null) {
  const { team, actions, seq, assign } = state;
  const ours = team.side;
  const used = usedChampions(actions);
  const ourPicks = sideChampions(actions, seq, ours, 'pick').filter((s) => s.champ);
  const filledMembers = new Set(ourPicks.map((s) => assign[s.i]).filter(Boolean));
  const openMembers = team.members.filter((m) => !filledMembers.has(m.id));
  const prof = teamProfile(ourPicks.map((s) => s.champ), champMap);
  const threats = new Set(team.threats || []);
  const enemySide = ours === 'blue' ? 'red' : 'blue';
  const enemyPicks = sideChampions(actions, seq, enemySide, 'pick').filter((s) => s.champ).map((s) => s.champ);
  const enemyLeft = sideChampions(actions, seq, enemySide, 'pick').filter((s) => !s.champ).length;
  const enemyPos = assignEnemyPositions(meta, enemyPicks);
  const ourByRole = {};
  for (const s of ourPicks) {
    const mem = team.members.find((x) => x.id === assign[s.i]);
    if (mem) ourByRole[mem.role] = s.champ;
  }

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

      if (meta) {
        const st = statReasons(meta, champMap, m.role, p.champ, enemyPos, enemyLeft, ourByRole, used);
        score += st.score;
        reasons.push(...st.reasons);
      }

      out.push({ champ: p.champ, memberId: m.id, role: m.role, score: Math.round(score), reasons });
    }
  }
  out.sort((a, b) => b.score - a.score);
  return out.slice(0, limit);
}

// 메타 통계로 매기는 가감점: 포지션 승률, 상대 라이너 상성, 바텀 듀오 궁합, 블라인드 픽 위험
export function statReasons(meta, champMap, role, champ, enemyPos, enemyLeft, ourByRole, used = new Set()) {
  let score = 0;
  const reasons = [];
  const nm = (id) => champMap.get(id)?.name ?? id;
  const roleName = ROLES.find((r) => r.id === role)?.label ?? role;

  const pr = meta.champs?.[champ]?.pos?.[role];
  const total = Object.values(meta.champs?.[champ]?.pos || {}).reduce((a, [g]) => a + g, 0);
  if (pr && pr[0] >= 20) {
    const wr = smoothWr(pr[0], pr[1], 50);
    const d = clamp((wr - 0.5) * 150, -8, 8);
    score += d;
    if (Math.abs(d) >= 1.5) reasons.push(`상위권 ${roleName} 승률 ${pct(pr[1] / pr[0])} (${pr[0]}판)`);
  }
  if (total >= 50 && (pr?.[0] || 0) / total < 0.05) { score -= 5; reasons.push(`상위권에서 ${roleName}로는 드문 픽`); }

  const enemyHere = Object.entries(enemyPos).find(([, p]) => p === role)?.[0];
  if (enemyHere) {
    const v = laneStat(meta, role, champ, enemyHere);
    if (v && v.games >= 5) {
      const wr = smoothWr(v.games, v.wins, 30);
      const d = clamp((wr - 0.5) * 150, -12, 12);
      score += d;
      reasons.push(`상대 ${roleName} ${nm(enemyHere)} 상대 승률 ${pct(v.wins / v.games)} (${v.games}판)`);
    }
  } else if (enemyLeft > 0) {
    // 상대 라이너가 아직 안 나왔을 때: 표본이 충분하고 크게 불리한 상대가 몇이나 되는지
    const vs = meta.matchups?.[role]?.[champ] || {};
    const bad = Object.entries(vs)
      .filter(([e, [g, w]]) => g >= 10 && smoothWr(g, w, 30) < 0.46 && champMap.has(e) && !used.has(e))
      .sort((a, b) => smoothWr(a[1][0], a[1][1]) - smoothWr(b[1][0], b[1][1]))
      .slice(0, 3);
    if (bad.length >= 2) {
      score -= bad.length;
      reasons.push(`카운터 주의: ${bad.map(([e]) => nm(e)).join(', ')}`);
    }
  }

  const mate = role === 'adc' ? ourByRole.support : role === 'support' ? ourByRole.adc : null;
  if (mate) {
    const key = role === 'adc' ? `${champ}|${mate}` : `${mate}|${champ}`;
    const v = meta.duos?.[key];
    if (v && v[0] >= 5) {
      const d = clamp((smoothWr(v[0], v[1], 30) - 0.5) * 120, -6, 6);
      score += d;
      reasons.push(`${nm(mate)}와 듀오 승률 ${pct(v[1] / v[0])} (${v[0]}판)`);
    }
  }
  return { score, reasons };
}

// 밴 추천: 팀원이 상대하기 싫다고 적은 챔피언과 경계 목록을 합산한다.
// 우리 팀 주력 챔피언은 밴하지 않는다.
export function recommendBans(state, champMap, limit = 8, meta = null) {
  const { team, actions, seq = [], assign = {} } = state;
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

  if (meta?.games) {
    // 상위권 밴픽률과 승률
    for (const [id, c] of Object.entries(meta.champs || {})) {
      const g = Object.values(c.pos).reduce((a, [x]) => a + x, 0);
      const w = Object.values(c.pos).reduce((a, [, x]) => a + x, 0);
      const presence = (g + (c.bans || 0)) / meta.games;
      const wr = smoothWr(g, w, 50);
      const s = presence * 40 + clamp((wr - 0.5) * 150, -6, 6);
      if (s >= 8) add(id, Math.round(s), `상위권 밴픽률 ${pct(presence)}, 승률 ${pct(g ? w / g : 0.5)}`);
    }
    // 아직 픽하지 않은 팀원의 주력 챔피언을 라인전에서 이기는 챔피언
    const ourPicks = seq.map((s, i) => ({ ...s, i })).filter((s) => s.side === team.side && s.type === 'pick' && actions[s.i]);
    const filled = new Set(ourPicks.map((s) => assign[s.i]));
    for (const m of team.members) {
      if (filled.has(m.id)) continue;
      for (const p of m.pool.filter((x) => x.tier === 1 && !used.has(x.champ))) {
        const vs = meta.matchups?.[m.role]?.[p.champ] || {};
        for (const [e, [g, w]] of Object.entries(vs)) {
          if (g < 8) continue;
          const wr = smoothWr(g, w, 30);
          if (wr < 0.47) add(e, Math.round((0.5 - wr) * 200), `${m.name || '팀원'}의 ${champMap.get(p.champ)?.name ?? p.champ} 상대로 강함 (우리 승률 ${pct(w / g)}, ${g}판)`);
        }
      }
    }
  }

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
