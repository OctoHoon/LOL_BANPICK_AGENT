// 수집기가 만든 data/team.json 을 앱의 팀 챔프폭 형식으로 바꾼다.
import { ROLES } from './logic.js';

// 숙련도 단계는 최근 랭크 판수로 임시 판정한다. 써 보면서 고치는 값이다.
export function tierFromGames(games, rank) {
  if (games >= 8 || (rank < 2 && games >= 4)) return 1;
  if (games >= 3) return 2;
  return 3;
}

export function teamFromCollected(collected, champMap, base) {
  const keyToId = new Map();
  for (const c of champMap.values()) if (c.key) keyToId.set(String(c.key), c.id);

  const used = new Set();
  const members = collected.members.slice(0, 5).map((m, i) => {
    const prev = base?.members?.[i] || {};
    let role = m.mainRole && !used.has(m.mainRole) ? m.mainRole : null;
    if (!role) {
      // 주 포지션이 겹치면 두 번째로 많이 간 포지션, 그래도 없으면 빈 자리
      role = Object.entries(m.roles || {}).sort((a, b) => b[1] - a[1]).map(([r]) => r).find((r) => !used.has(r))
        || ROLES.map((r) => r.id).find((r) => !used.has(r));
    }
    used.add(role);

    const pool = (m.champs || [])
      .filter((c) => champMap.has(c.champ))
      .slice(0, 8)
      .map((c, rank) => ({ champ: c.champ, tier: tierFromGames(c.games, rank), games: c.games, wins: c.wins }));
    for (const x of m.mastery || []) {
      if (pool.length >= 10) break;
      const id = keyToId.get(String(x.championId));
      if (id && !pool.some((p) => p.champ === id)) pool.push({ champ: id, tier: 3, mastery: x.points });
    }
    return {
      id: `m${i + 1}`,
      name: m.riotId?.split('#')[0] || prev.name || '',
      riotId: m.riotId || '',
      role,
      pool,
      hates: prev.hates || [],
      collected: { games: m.games, withTeam: m.withTeam, roles: m.roles },
    };
  });
  return {
    side: base?.side || 'blue',
    format: base?.format || 'ranked',
    threats: base?.threats || [],
    members,
    collectedAt: collected.updatedAt,
  };
}
