// 수집기가 만든 data/team.json 을 앱의 팀 챔프폭 형식으로 바꾼다.
import { ROLES, inferPosition } from './logic.js';

// 숙련도 단계는 그 라인 최근 랭크 판수로 임시 판정한다. 써 보면서 고치는 값이다.
export function tierFromGames(games, rank) {
  if (games >= 8 || (rank < 2 && games >= 4)) return 1;
  if (games >= 3) return 2;
  return 3;
}

// 다섯 명의 라인을 정한다. (팀원, 라인, 판수)를 판수가 많은 순서로 보며 둘 다 비어 있을 때 배정한다.
export function assignRoles(members) {
  const pairs = [];
  members.forEach((m, i) => {
    for (const [role, n] of Object.entries(m.roles || {})) pairs.push({ i, role, n });
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

// meta 가 있으면 숙련도로만 들어오는 챔피언은 상위권에서 주로 그 라인에 가는 경우에만 넣는다.
export function teamFromCollected(collected, champMap, base, meta = null) {
  const keyToId = new Map();
  for (const c of champMap.values()) if (c.key) keyToId.set(String(c.key), c.id);
  const list = collected.members.slice(0, 5);
  const roles = assignRoles(list);

  const members = list.map((m, i) => {
    const prev = base?.members?.[i] || {};
    const role = roles[i];
    // 배정된 라인에서 한 판이라도 한 챔피언을 그 라인 판수 순으로. 라인 기록이 없는 옛 형식은 전체 판수로.
    const champs = (m.champs || [])
      .filter((c) => champMap.has(c.champ))
      .map((c) => {
        const v = c.pos ? c.pos[role] : [c.games, c.wins];
        return v ? { champ: c.champ, games: v[0], wins: v[1] } : null;
      })
      .filter(Boolean)
      .sort((a, b) => b.games - a.games);
    const pool = champs.slice(0, 8).map((c, rank) => ({ champ: c.champ, tier: tierFromGames(c.games, rank), games: c.games, wins: c.wins }));
    for (const x of m.mastery || []) {
      if (pool.length >= 8) break;
      const id = keyToId.get(String(x.championId));
      const inRole = !meta || inferPosition(meta, id)?.pos === role;
      if (id && inRole && !pool.some((p) => p.champ === id) && !(m.champs || []).some((c) => c.champ === id)) {
        pool.push({ champ: id, tier: 3, mastery: x.points });
      }
    }
    return {
      id: `m${i + 1}`,
      name: m.riotId?.split('#')[0] || prev.name || '',
      riotId: m.riotId || '',
      role,
      pool,
      hates: base?.example ? [] : (prev.hates || []), // 예시 팀의 가짜 취향은 실제 멤버에게 넘기지 않는다
      collected: { games: m.games, withTeam: m.withTeam, roles: m.roles },
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
