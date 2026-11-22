// 수집기가 만든 data/team.json 을 앱의 팀 챔프폭 형식으로 바꾼다.
// 챔프폭 항목은 (챔피언, 라인) 단위다. 한 사람이 여러 라인을 가면 라인마다 따로 항목이 생긴다.
import { ROLES, inferPosition } from './logic.js';

// 숙련 점수 = 최근 가중 판수 + 전체 판수의 일부.
// 최근에 많이 한 챔피언이 가장 높고, 오래전에 많이 한 챔피언도 어느 정도 남는다.
export function comfort(games, weighted) {
  return weighted + 0.1 * games;
}
export function tierFromComfort(c) {
  if (c >= 8) return 1;
  if (c >= 3) return 2;
  return 3;
}

// 다섯 명의 주 라인을 정한다. (팀원, 라인, 최근 가중 판수)를 큰 순서로 보며 둘 다 비어 있을 때 배정한다.
export function assignRoles(members) {
  const pairs = [];
  members.forEach((m, i) => {
    for (const [role, v] of Object.entries(m.roles || {})) {
      pairs.push({ i, role, n: Array.isArray(v) ? v[1] ?? v[0] : v });
    }
  });
  pairs.sort((a, b) => b.n - a.n);
  const out = Array(members.length).fill(null);
  const taken = new Set();
  for (const { i, role } of pairs) {
    if (out[i] || taken.has(role)) continue;
    out[i] = role; taken.add(role);
  }
  for (let i = 0; i < out.length; i += 1) {
    if (!out[i]) { out[i] = ROLES.map((r) => r.id).find((r) => !taken.has(r)); taken.add(out[i]); }
  }
  return out;
}

const PER_ROLE = 10;

export function poolFromCollected(m, champMap, meta, mainRole) {
  const keyToId = new Map();
  for (const c of champMap.values()) if (c.key) keyToId.set(String(c.key), c.id);
  const byRole = {};
  for (const c of m.champs || []) {
    if (!champMap.has(c.champ)) continue;
    for (const [role, v] of Object.entries(c.pos || {})) {
      const [g, w, wg = g, ww = w] = v;
      const score = comfort(g, wg);
      if (score < 1) continue;
      (byRole[role] ||= []).push({ champ: c.champ, role, tier: tierFromComfort(score), games: g, wins: w, wg, ww, score });
    }
  }
  const pool = [];
  for (const list of Object.values(byRole)) {
    list.sort((a, b) => b.score - a.score);
    pool.push(...list.slice(0, PER_ROLE));
  }
  // 랭크 기록은 없지만 숙련도가 높은 챔피언(일반·칼바람 등). 상위권에서 주로 가는 라인에 연습 단계로 넣는다.
  const played = new Set((m.champs || []).map((c) => c.champ));
  for (const x of (m.mastery || []).slice().sort((a, b) => b.points - a.points)) {
    if (x.points < 50000) break;
    const id = keyToId.get(String(x.championId));
    if (!id || played.has(id)) continue;
    const role = inferPosition(meta, id)?.pos || mainRole;
    pool.push({ champ: id, role, tier: 3, mastery: x.points, score: 0 });
  }
  return pool.map(({ score, ...rest }) => rest);
}

// meta 가 있으면 숙련도로만 들어오는 챔피언의 라인을 상위권 통계로 정한다.
export function teamFromCollected(collected, champMap, base, meta = null) {
  const list = collected.members.slice(0, 5);
  const roles = assignRoles(list);
  const members = list.map((m, i) => {
    const prev = base?.members?.[i] || {};
    const role = roles[i];
    return {
      id: `m${i + 1}`,
      name: m.riotId?.split('#')[0] || prev.name || '',
      riotId: m.riotId || '',
      role,
      pool: poolFromCollected(m, champMap, meta, role),
      hates: base?.example ? [] : (prev.hates || []), // 예시 팀의 가짜 취향은 실제 멤버에게 넘기지 않는다
      collected: { games: m.games, total: m.totalMatches, complete: m.complete, withTeam: m.withTeam, roles: m.roles },
    };
  });
  return {
    side: base?.side || 'blue',
    format: base?.format || 'ranked',
    threats: base?.example ? [] : (base?.threats || []),
    members,
    collectedAt: collected.updatedAt,
  };
}
