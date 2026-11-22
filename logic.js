// 밴픽 순서와 추천 계산. 화면 코드와 분리해 node 로도 시험할 수 있게 했다.
import { TRAIT_SETS, IDENTITIES } from './data/traits.js';
import { DUO_MAP, MIDJG_MAP } from './data/botlane.js';

export const ROLES = [
  { id: 'top', label: '탑' },
  { id: 'jungle', label: '정글' },
  { id: 'mid', label: '미드' },
  { id: 'adc', label: '원딜' },
  { id: 'support', label: '서폿' },
];

export const TIERS = {
  1: { label: '주력', score: 60 },
  2: { label: '가능', score: 48 },
  3: { label: '연습', score: 34 },
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

// 전적 보정. 수집 데이터에는 최근 가중 판수(wg)·승수(ww)가 있어 그것을 쓰고, 직접 입력한 전적은 그대로 쓴다.
function wrBonus(entry) {
  const g = entry.wg ?? entry.games, w = entry.ww ?? entry.wins;
  if (!g || g < (entry.wg != null ? 3 : 5)) return 0;
  const wr = smoothWr(g, w, 10) * 100;
  return clamp((wr - 50) * 0.4, -10, 10);
}

// 우리 픽 슬롯마다 (챔피언, 팀원, 라인). 라인은 슬롯에서 바꿀 수 있고, 안 바꾸면 그 팀원의 주 라인.
export function ourAssignments(state) {
  const { team, actions, seq, assign = {}, assignRole = {} } = state;
  return seq.map((s, i) => ({ ...s, i }))
    .filter((s) => s.side === team.side && s.type === 'pick' && actions[s.i])
    .map((s) => {
      const memberId = assign[s.i] || null;
      const m = team.members.find((x) => x.id === memberId);
      return { i: s.i, champ: actions[s.i], memberId, role: assignRole[s.i] || m?.role || null };
    });
}

// 팀원의 라인별 비중(챔프폭 판수 기준). 기록이 없으면 주 라인만 1.
export function roleShare(m) {
  const by = {};
  let total = 0;
  for (const p of m.pool) {
    const g = p.wg ?? p.games ?? 0;
    by[p.role || m.role] = (by[p.role || m.role] || 0) + g; total += g;
  }
  if (!total) return { [m.role]: 1 };
  for (const k of Object.keys(by)) by[k] /= total;
  return by;
}

// 우리 팀 픽 추천.
// state: { team, actions, seq, assign }  assign: { stepIndex: memberId }
export function recommendPicks(state, champMap, limit = 8, meta = null, opts = {}) {
  const { team, actions, seq, assign, lineup = {}, allowSwap = true } = state;
  const ours = team.side;
  const used = usedChampions(actions);
  const ourPicks = sideChampions(actions, seq, ours, 'pick').filter((s) => s.champ);
  const ours_ = ourAssignments(state);
  const filledMembers = new Set(ours_.map((a) => a.memberId).filter(Boolean));
  const takenRoles = new Set(ours_.map((a) => a.role).filter(Boolean));
  const openMembers = team.members.filter((m) => !filledMembers.has(m.id));
  const prof = teamProfile(ourPicks.map((s) => s.champ), champMap);
  const threats = new Set(team.threats || []);
  const enemySide = ours === 'blue' ? 'red' : 'blue';
  const enemyPicks = sideChampions(actions, seq, enemySide, 'pick').filter((s) => s.champ).map((s) => s.champ);
  const enemyLeft = sideChampions(actions, seq, enemySide, 'pick').filter((s) => !s.champ).length;
  const enemyPos = assignEnemyPositions(meta, enemyPicks);
  const ourByRole = {};
  for (const a of ours_) if (a.role) ourByRole[a.role] = a.champ;

  // 같은 챔피언을 몇 명이 다룰 수 있는지(플렉스 판단용)
  const owners = new Map();
  for (const m of team.members) for (const p of new Set(m.pool.map((x) => x.champ))) {
    owners.set(p, (owners.get(p) || 0) + 1);
  }

  const out = [];
  for (const m of openMembers) {
    const share = roleShare(m);
    const planned = lineup[m.id] && !takenRoles.has(lineup[m.id]) ? lineup[m.id] : null;
    let available = m.pool.filter((p) => !used.has(p.champ) && champMap.has(p.champ) && !takenRoles.has(p.role || m.role));
    if (opts.offPool) {
      // 챔프폭 밖 후보: 이 팀원이 이번 판에 설 라인에서 상위권이 많이 쓰는 챔피언
      const r = planned || m.role;
      if (!meta || takenRoles.has(r)) continue;
      const mine = new Set(m.pool.filter((p) => (p.role || m.role) === r).map((p) => p.champ));
      available = Object.entries(meta.champs || {})
        .filter(([id, c]) => (c.pos?.[r]?.[0] || 0) >= 30 && !mine.has(id) && !used.has(id) && champMap.has(id))
        .sort((a, b) => b[1].pos[r][0] - a[1].pos[r][0])
        .slice(0, 30)
        .map(([id, c]) => ({ champ: id, role: r, offPool: c.pos[r][0] }));
    }
    for (const p of available) {
      const role = p.role || m.role;
      const roleName = ROLES.find((r) => r.id === role)?.label ?? role;
      let swapNote = null;
      if (planned && role !== planned) {
        // 미리 정한 라인이 있으면 그 라인만. 스왑을 허용하면, 그 라인에 정해진 팀원이 아직 안 골랐고
        // 그 팀원이 우리 라인 챔프폭을 갖고 있을 때만 맞바꾸기를 제안한다.
        if (!allowSwap) continue;
        const partner = openMembers.find((x) => x.id !== m.id && lineup[x.id] === role);
        if (!partner || !partner.pool.some((x) => (x.role || partner.role) === planned && !used.has(x.champ))) continue;
        swapNote = `라인 스왑: ${m.name || '팀원'} ${roleName} ↔ ${partner.name || '팀원'} ${ROLES.find((r) => r.id === planned)?.label ?? planned}`;
      }
      const mainsLeft = available.filter((x) => x.tier === 1 && (x.role || m.role) === role).length;
      const c = champMap.get(p.champ);
      const reasons = [];
      let score = p.offPool ? 0 : TIERS[p.tier]?.score ?? 20;
      reasons.push(p.offPool
        ? `${m.name || '팀원'}의 챔프폭 밖 (상위권 ${roleName} ${p.offPool}판)`
        : `${m.name || '팀원'}의 ${roleName} ${TIERS[p.tier]?.label ?? '연습'} 챔피언`);
      if (swapNote) {
        score -= 8;
        reasons.push(swapNote);
      } else if (role !== (planned || m.role)) {
        const sh = share[role] || 0;
        score -= Math.round((1 - sh) * 8);
        reasons.push(`부 라인 (${roleName} 비중 ${Math.round(sh * 100)}%)`);
      }

      const wb = wrBonus(p);
      if (wb) {
        score += wb;
        reasons.push(p.wg != null
          ? `${roleName} ${p.games}판 승률 ${Math.round((p.wins / p.games) * 100)}%, 최근 가중 ${Math.round(smoothWr(p.wg, p.ww, 0) * 100)}%`
          : `최근 ${p.games}판 승률 ${Math.round((p.wins / p.games) * 100)}%`);
      }

      const n = prof.count;
      if (n >= 2 && prof.ap < 1 && c.dmg === 'AP') { score += 10; reasons.push('AP 피해 보충'); }
      if (n >= 2 && prof.ad < 1 && c.dmg === 'AD') { score += 10; reasons.push('AD 피해 보충'); }
      if (n >= 3 && (c.dmg === 'AD' ? prof.ad : prof.ap) >= 3) { score -= 10; reasons.push(`${c.dmg} 쏠림 주의`); }
      if (prof.front === 0 && c.front) { score += 4 + n * 3; reasons.push('앞라인 보충'); }

      if (threats.has(p.champ)) { score += 6; reasons.push('경계 목록 챔피언이라 먼저 가져가면 상대 선택지가 줄어듦'); }
      if (n <= 1 && (owners.get(p.champ) || 0) >= 2) { score += 5; reasons.push('여러 팀원이 다뤄 라인을 숨기기 좋음'); }
      if (p.tier === 1 && mainsLeft === 1) { score += 4; reasons.push('남은 주력이 이것뿐이라 밴 전에 확보 권장'); }

      // 널리 알려진 바텀 듀오
      const mate = role === 'adc' ? ourByRole.support : role === 'support' ? ourByRole.adc : null;
      const duoWhy = mate && DUO_MAP.get(role === 'adc' ? `${p.champ}|${mate}` : `${mate}|${p.champ}`);
      if (duoWhy) { score += 5; reasons.push(`유명 바텀 조합: ${champMap.get(mate)?.name ?? mate}와 (${duoWhy})`); }
      // 널리 알려진 미드·정글
      const mj = role === 'mid' ? ourByRole.jungle : role === 'jungle' ? ourByRole.mid : null;
      const mjWhy = mj && MIDJG_MAP.get(role === 'mid' ? `${p.champ}|${mj}` : `${mj}|${p.champ}`);
      if (mjWhy) { score += 5; reasons.push(`유명 미드·정글 조합: ${champMap.get(mj)?.name ?? mj}와 (${mjWhy})`); }

      const cr = compReasons(p.champ, enemyPicks, ourPicks.map((x) => x.champ), champMap, { role, enemyPos });
      score += cr.score;
      reasons.push(...cr.reasons);

      if (meta) {
        const st = statReasons(meta, champMap, role, p.champ, enemyPos, enemyLeft, ourByRole, used, enemyPicks);
        score += st.score;
        reasons.push(...st.reasons);
      }

      out.push({ champ: p.champ, memberId: m.id, role, score: Math.round(score), reasons, offPool: !!p.offPool });
    }
  }
  out.sort((a, b) => b.score - a.score);
  return out.slice(0, limit);
}

// 챔프폭에 없지만 이번 판 상황(상성·조합)만으로 점수가 높은 챔피언. 숙련도 점수 없이 OFF_POOL_MIN 이상만.
export const OFF_POOL_MIN = 15;
export function recommendOffPool(state, champMap, limit = 4, meta = null) {
  if (!meta) return [];
  const list = recommendPicks(state, champMap, 200, meta, { offPool: true }).filter((r) => r.score >= OFF_POOL_MIN);
  const seen = new Set();
  return list.filter((r) => !seen.has(r.champ) && seen.add(r.champ)).slice(0, limit);
}

// ---------- 조합 규칙(data/traits.js) ----------
// 통계와 별개로, 조합 색깔(이니시·돌진·포킹·보호·스플릿·끊어먹기)과 CC를 보고 가감점을 준다.
// 대응 관계는 해설·분석가들이 흔히 말하는 통념을 따른다. 절대 규칙이 아니라 기울기만 준다.
const hasTrait = (t, id) => TRAIT_SETS[t].has(id);
// 받침 유무에 따라 은/는
const eunNeun = (w) => { const c = w.charCodeAt(w.length - 1) - 0xac00; return c >= 0 && c <= 11171 && c % 28 ? '은' : '는'; };
// Riot 클라이언트의 CC 등급(1~3)이 있으면 3을 하드 CC로 보고, 없으면 수동 목록을 쓴다.
export const isCC = (id, champMap) => {
  const cc = champMap.get(id)?.cc;
  return cc != null ? cc >= 3 : hasTrait('cc', id);
};

export function compIdentity(champIds) {
  const scores = {};
  for (const [k, v] of Object.entries(IDENTITIES)) {
    scores[k] = champIds.filter((id) => v.traits.some((t) => hasTrait(t, id))).length;
  }
  const sorted = Object.entries(scores).sort((a, b) => b[1] - a[1]);
  const n = sorted[0]?.[1] ?? 0;
  if (n < 2) return { scores, main: null, all: [], label: null };
  // 동점이면 두 색깔을 함께 본다(예: 돌진형·캐리 보호형)
  const all = sorted.filter(([, v]) => v === n).map(([k]) => k).slice(0, 2);
  return { scores, main: all[0], all, label: all.map((k) => IDENTITIES[k].label).join('·') };
}

export function compSummary(champIds, champMap) {
  const has = (t) => champIds.filter((id) => hasTrait(t, id));
  const prof = teamProfile(champIds, champMap);
  const id = compIdentity(champIds);
  return {
    dive: has('dive'), poke: has('poke'), engage: has('engage'), pick: has('pick'), split: has('split'),
    protect: has('protect'), hypercarry: has('hypercarry'), aoe: has('aoe'),
    cc: champIds.filter((x) => isCC(x, champMap)),
    front: prof.front, ad: prof.ad, ap: prof.ap, count: champIds.length,
    identity: id.main, identities: id.all, identityLabel: id.label,
  };
}

// 조합·상성 규칙 합계 상한과, 라인전 상식 규칙에 곱하는 가중치
const COMP_CAP = 30;
export const LANE_RULE_WEIGHT = 1.5;

// 상대 라이너 찾기: 상위권 통계로 추정한 포지션이 있으면 그것, 없으면 역할 태그로 대략.
function enemyAt(role, enemyPicks, champMap, enemyPos) {
  const byPos = Object.entries(enemyPos || {}).find(([, r]) => r === role)?.[0];
  if (byPos) return byPos;
  const tag = { adc: 'Marksman', support: 'Support' }[role];
  if (!tag) return null;
  const free = enemyPicks.filter((id) => !enemyPos?.[id]);
  return free.find((id) => champMap.get(id)?.tags?.[0] === tag)
    || (role === 'support' ? free.find((id) => supKind(id) >= 0 && champMap.get(id)?.tags?.includes('Support')) : null)
    || null;
}

const SUP_KIND = [['supEngage', '이니시형'], ['supEnchanter', '보호형'], ['supMage', '마법사형']];
const supKind = (id) => SUP_KIND.findIndex(([t]) => hasTrait(t, id));

export function compReasons(champ, enemyPicks, ourPicks, champMap, ctx = {}) {
  const { role = null, enemyPos = {} } = ctx;
  const reasons = [];
  let score = 0;
  const nm = (id) => champMap.get(id)?.name || id;
  const names = (a) => a.map(nm).join(', ');
  const is = (t) => hasTrait(t, champ);
  const add = (d, r) => { score += d; reasons.push(r); };

  // 상대 조합에 대한 대응
  const e = compSummary(enemyPicks, champMap);
  if (e.dive.length >= 2 && (is('antidive') || is('protect'))) {
    add(Math.min(10, 4 * (e.dive.length - 1)), `상대 돌진 챔피언 ${e.dive.length}명(${names(e.dive)})이라 돌진 대응에 좋음`);
  }
  if (e.front >= 2 && is('tankshred')) add(Math.min(8, 4 * (e.front - 1)), `상대 앞라인 ${e.front}명이라 탱커 녹이기에 좋음`);
  if (e.poke.length >= 2 && (is('engage') || is('dive'))) add(6, `상대 포킹 조합(${names(e.poke)})은 거리를 좁혀 붙는 쪽이 유리`);
  if (e.count >= 3 && e.front === 0 && is('dive')) add(5, '상대 앞라인이 없어 후방 진입이 쉬움');
  if (e.identities.includes('engage') && is('antidive')) add(5, '상대 한타 이니시를 받아치기(디스인게이지) 좋음');
  if (e.identities.includes('protect') && is('poke')) add(5, '상대 캐리 보호 조합은 멀리서 깎아 내는 포킹에 약함');
  if (e.hypercarry.length && (is('dive') || is('pick'))) add(4, `상대 후반 캐리(${names(e.hypercarry)})를 노리기 좋음`);
  if (e.identities.includes('split') && (is('engage') || is('aoe'))) add(3, '상대가 스플릿하는 동안 4대5 한타 강제');
  // ----- 라인전 기본 상성(롤 상식) -----
  const eAdc = enemyAt('adc', enemyPicks, champMap, enemyPos);
  const eSup = enemyAt('support', enemyPicks, champMap, enemyPos);
  const eTop = enemyAt('top', enemyPicks, champMap, enemyPos);
  const roleKnown = role != null;
  const addL = (d, r) => add(Math.round(d * LANE_RULE_WEIGHT), r);
  // 그랩·단일 CC 서포터는 상대 바텀의 기동성과 주문 방어막에 따라 효율이 크게 갈린다
  if (is('hook') && (!roleKnown || role === 'support')) {
    const bot = [eAdc, eSup].filter(Boolean);
    const slip = bot.filter((id) => hasTrait('slippery', id));
    const stuck = bot.filter((id) => hasTrait('immobile', id));
    const shield = bot.filter((id) => hasTrait('spellshield', id));
    if (slip.length) addL(-8, `상대 ${names(slip)}${eunNeun(names(slip))} 이동기·방어막으로 그랩을 피하기 쉬움`);
    else if (stuck.length) addL(5, `상대 ${names(stuck)}${eunNeun(names(stuck))} 이동기가 없어 그랩에 잘 걸림`);
    if (shield.length && !slip.some((x) => shield.includes(x))) addL(-4, `상대 ${names(shield)}의 주문 방어막이 그랩을 막음`);
  }
  // 서포터 상성 통념: 이니시형은 보호형을, 보호형은 마법사형을, 마법사형은 이니시형을 라인전에서 이기기 쉽다
  if (role === 'support' && eSup) {
    const mine = supKind(champ), theirs = supKind(eSup);
    if (mine >= 0 && theirs >= 0 && mine !== theirs) {
      const win = (mine + 1) % 3 === theirs;
      const txt = `${SUP_KIND[mine][1]} 서포터는 ${SUP_KIND[theirs][1]}(${nm(eSup)})에 ${win ? '라인전이 강한 편' : '라인전이 약한 편'}`;
      addL(win ? 5 : -5, txt);
    }
  }
  // 원거리 탑에게 이동기 없는 근접 탑은 라인전 내내 견제당한다
  if (role === 'top' && eTop && hasTrait('rangedTop', eTop) && is('immobileTop')) addL(-5, `상대 탑 ${nm(eTop)}${eunNeun(nm(eTop))} 원거리라 이동기 없는 근접 탑이 견제당하기 쉬움`);
  // 원딜: 상대 돌진이 많으면 자체 생존기가 있는 원딜이 낫다
  if (role === 'adc' && e.dive.length >= 2) {
    if (is('slippery')) addL(3, '상대 돌진이 많아 이동기 있는 원딜이 살아남기 쉬움');
    else if (is('immobile')) addL(-3, '상대 돌진이 많은데 이동기가 없어 노려지기 쉬움');
  }
  // 말파이트·람머스류는 평타 위주 AD를 크게 약하게 만든다
  const anti = enemyPicks.filter((id) => hasTrait('antiAA', id));
  if (anti.length && is('aaReliant')) addL(-4, `상대 ${names(anti)}${eunNeun(names(anti))} 평타 위주 AD를 크게 약하게 만듦`);
  // 투사체 위주 상대에는 바람 장막류
  const proj = enemyPicks.filter((id) => hasTrait('projectile', id));
  if (proj.length >= 2 && is('windwall')) addL(4, `상대 주요 피해가 투사체(${names(proj)})라 막는 기술 효율이 큼`);
  // 상대 CC가 많으면 CC 면역·해제 기술 가치가 커진다
  if (e.cc.length >= 4 && is('ccImmune')) addL(3, `상대 CC ${e.cc.length}명이라 CC 면역·해제 기술 가치가 큼`);
  if (e.count >= 3 && e.ap < 1 && champMap.get(champ)?.front) add(3, `상대가 AD 위주(AD ${e.ad}, AP ${e.ap})라 방어력 아이템만으로 버티기 좋음`);
  if (e.count >= 3 && e.ad < 1 && champMap.get(champ)?.front) add(3, `상대가 AP 위주(AD ${e.ad}, AP ${e.ap})라 마법 저항 아이템만으로 버티기 좋음`);

  // 우리 조합과의 궁합
  const o = compSummary(ourPicks, champMap);
  if (o.count >= 2 && o.engage.length === 0 && is('engage')) add(5, '우리 조합에 이니시 부족');
  if (o.identity) {
    const fits = o.identities.some((k) => IDENTITIES[k].traits.some((t) => is(t)));
    if (fits) add(5, `우리 조합 색깔(${o.identityLabel})에 맞음`);
  }
  if (o.hypercarry.length && is('protect')) add(6, `우리 캐리(${names(o.hypercarry)}) 보호`);
  if (o.protect.length && is('hypercarry')) add(5, `보호형 서포터(${names(o.protect)})와 궁합`);
  if (o.engage.length && is('aoe') && !is('engage')) add(4, `이니시(${names(o.engage)}) 뒤 광역 피해 연계`);
  if (o.split.length && is('split')) add(-4, '스플릿 챔피언이 둘이면 한타 인원이 모자라기 쉬움');
  if (o.count >= 3 && o.cc.length <= 1 && isCC(champ, champMap)) add(4, `우리 조합 CC 부족(${o.cc.length}명)`);

  return { score: Math.max(-COMP_CAP, Math.min(COMP_CAP, score)), reasons };
}

// 메타 통계로 매기는 가감점: 포지션 승률, 상대 라이너 상성, 바텀 듀오 궁합, 블라인드 픽 위험
export function statReasons(meta, champMap, role, champ, enemyPos, enemyLeft, ourByRole, used = new Set(), enemyAll = null) {
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
    if (v && v.games >= 3) {
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

  // 상대 조합 전체: 라인 상대를 뺀 나머지 상대 챔피언 각각과의 승률(같은 경기에 있었을 때)
  const vsRow = meta.vs?.[champ] || {};
  const vsHits = (enemyAll || Object.keys(enemyPos))
    .filter((e) => e !== enemyHere && vsRow[e])
    .map((e) => ({ e, g: vsRow[e][0], w: vsRow[e][1], d: smoothWr(vsRow[e][0], vsRow[e][1], 40) - 0.5 }));
  if (vsHits.length) {
    const d = clamp(vsHits.reduce((a, x) => a + x.d, 0) * 120, -10, 10);
    score += d;
    if (Math.abs(d) >= 1) {
      const top = vsHits.sort((a, b) => Math.abs(b.d) - Math.abs(a.d)).slice(0, 2);
      reasons.push(`상대 조합 ${d > 0 ? '유리' : '불리'}: ${top.map((x) => `${nm(x.e)} 상대 ${pct(x.w / x.g)}(${x.g}판)`).join(', ')}`);
    }
  }

  // 우리 조합과의 궁합(같은 팀일 때 승률). 원딜·서폿은 아래 듀오에서 따로 본다.
  const bot = role === 'adc' ? 'support' : role === 'support' ? 'adc' : null;
  const synHits = Object.entries(ourByRole)
    .filter(([r]) => r !== bot)
    .map(([, a]) => {
      const v = meta.with?.[[a, champ].sort().join('|')];
      return v ? { a, g: v[0], w: v[1], d: smoothWr(v[0], v[1], 40) - 0.5 } : null;
    })
    .filter(Boolean);
  if (synHits.length) {
    const d = clamp(synHits.reduce((a, x) => a + x.d, 0) * 100, -6, 6);
    score += d;
    if (Math.abs(d) >= 1) {
      const top = synHits.sort((a, b) => Math.abs(b.d) - Math.abs(a.d)).slice(0, 2);
      reasons.push(`우리 조합 궁합 ${d > 0 ? '좋음' : '나쁨'}: ${top.map((x) => `${nm(x.a)}와 ${pct(x.w / x.g)}(${x.g}판)`).join(', ')}`);
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
    // 2차 밴: 상대 조합 색깔을 완성해 줄 인기 챔피언을 막는다
    const ourSide = team.side;
    const enemyPicks = sideChampions(actions, seq, ourSide === 'blue' ? 'red' : 'blue', 'pick').filter((s) => s.champ).map((s) => s.champ);
    const eid = compIdentity(enemyPicks);
    if (enemyPicks.length && eid.main) {
      const traits = IDENTITIES[eid.main].traits;
      for (const [id, c] of Object.entries(meta.champs || {})) {
        const g = Object.values(c.pos).reduce((a, [x]) => a + x, 0);
        if ((g + (c.bans || 0)) / meta.games < 0.05) continue;
        if (traits.some((t) => TRAIT_SETS[t].has(id))) add(id, 8, `상대 조합 색깔(${eid.label}) 완성 저지`);
      }
    }
    // 아직 픽하지 않은 팀원의 주력 챔피언을 라인전에서 이기는 챔피언
    const filled = new Set(ourAssignments(state).map((a) => a.memberId));
    for (const m of team.members) {
      if (filled.has(m.id)) continue;
      for (const p of m.pool.filter((x) => x.tier === 1 && !used.has(x.champ))) {
        const vs = meta.matchups?.[p.role || m.role]?.[p.champ] || {};
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

// 우리 픽을 어느 팀원·라인에 배정할지 정한다. 비어 있는 라인 중 그 챔피언을 가장 잘 다루는 팀원.
export function guessMember(team, champ, filled, takenRoles = new Set(), lineup = {}) {
  let best = null;
  for (const m of team.members) {
    if (filled.has(m.id)) continue;
    const planned = lineup[m.id];
    for (const p of m.pool.filter((x) => x.champ === champ)) {
      const role = p.role || m.role;
      if (takenRoles.has(role)) continue;
      // 라인을 미리 정했으면 그 라인 항목을 먼저 본다(스왑은 뒤로)
      const rank = (planned && planned !== role ? 1000 : 0) + p.tier * 100 - (p.wg ?? p.games ?? 0);
      if (!best || rank < best.rank) best = { id: m.id, role, rank };
    }
  }
  if (!best) {
    const roleOf = (x) => lineup[x.id] || x.role;
    const m = team.members.find((x) => !filled.has(x.id) && !takenRoles.has(roleOf(x))) || team.members.find((x) => !filled.has(x.id));
    const role = m && takenRoles.has(roleOf(m)) ? ROLES.map((r) => r.id).find((r) => !takenRoles.has(r)) : m && roleOf(m);
    return m ? { id: m.id, role } : null;
  }
  // 그 챔피언의 라인을 맡기로 정해 둔 팀원이 따로 있으면, 챔프폭에 없더라도 그 팀원 몫으로 본다
  const owner = team.members.find((x) => !filled.has(x.id) && lineup[x.id] === best.role);
  if (owner && owner.id !== best.id && lineup[best.id] !== best.role) return { id: owner.id, role: best.role };
  return { id: best.id, role: best.role };
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

// ---------- 밴픽 뒤 운영 가이드 ----------
// 조합 색깔·초후반 강세·피해 유형·라인 상성에서 뽑은 일반 원칙. 경기마다 맞는 정답이 아니라 출발점이다.
const PLAN_OURS = {
  engage: '앞라인과 이니시 궁이 준비됐을 때 드래곤·바론 앞에서 한타를 여세요. 이니시 궁이 빠졌으면 싸움을 미루는 편이 낫습니다.',
  dive: '상대 후방 딜러를 노리세요. 시야가 없는 쪽에서 측면으로 들어가고, 상대 점멸이나 보호 스킬이 빠졌을 때가 기회입니다.',
  poke: '오브젝트 앞에 먼저 시야를 잡고 체력을 깎은 뒤 싸우세요. 정면 대치는 강하지만 기습에 약하니 측면 와드를 챙기세요.',
  protect: '캐리를 가운데 두고 진형을 지키세요. 먼저 들어가기보다 들어오는 상대를 받아치는 쪽이 강하고, 후반을 보고 초반 무리를 줄이세요.',
  split: '스플릿 담당은 사이드를 밀고, 나머지 넷은 한타를 피하며 반대편 오브젝트를 압박하세요. 텔레포트나 합류 타이밍을 맞추세요.',
  pick: '시야를 넓게 잡고 혼자 다니는 상대를 끊은 뒤 곧바로 오브젝트로 연결하세요.',
};
const PLAN_VS = {
  engage: (n) => `상대 이니시(${n}) 위치를 확인하기 전에는 오브젝트에 들어가지 말고, 좁은 곳에서 뭉치지 마세요.`,
  dive: (n) => `상대 돌진(${n})이 노리는 건 우리 후방 딜러입니다. 딜러는 앞에 서지 말고 보호 스킬은 진입 뒤에 쓰세요.`,
  poke: (n) => `상대 포킹(${n})과 길게 대치하지 마세요. 체력이 깎이기 전에 빠르게 붙거나 물러서세요.`,
  protect: (n) => `상대가 캐리 보호형(${n})입니다. 보호 스킬을 먼저 빼게 만들거나 멀리서 깎은 뒤 싸우세요.`,
  split: (n) => `상대 스플릿(${n})과 1대1은 피하고, 그 사이 4대5로 오브젝트를 강제하세요.`,
  pick: (n) => `상대가 끊어먹기형(${n})입니다. 시야 밖으로 혼자 다니지 말고 함께 움직이세요.`,
};

export function gamePlan(state, champMap, meta = null) {
  const { team, actions, seq } = state;
  const enemySide = team.side === 'blue' ? 'red' : 'blue';
  const ourAsg = ourAssignments(state);
  const ours = ourAsg.map((a) => a.champ);
  const enemy = sideChampions(actions, seq, enemySide, 'pick').filter((s) => s.champ).map((s) => s.champ);
  const nm = (id) => champMap.get(id)?.name ?? id;
  const names = (a) => a.map(nm).join(', ');
  const o = compSummary(ours, champMap), e = compSummary(enemy, champMap);
  const out = [];

  const plan = [];
  if (o.identity) {
    plan.push(`우리 조합은 ${o.identityLabel}입니다.`);
    for (const k of o.identities) plan.push(PLAN_OURS[k]);
  } else plan.push('우리 조합은 뚜렷한 색깔이 없습니다. 라인전이 유리한 쪽을 중심으로 운영하세요.');
  for (const k of e.identities) {
    const members = enemy.filter((id) => IDENTITIES[k].traits.some((t) => TRAIT_SETS[t].has(id)));
    plan.push(PLAN_VS[k](names(members)));
  }
  out.push({ title: '조합 운영', items: plan });

  // 초반·후반 강세
  const tempo = (ids) => ids.filter((id) => TRAIT_SETS.early.has(id)).length - ids.filter((id) => TRAIT_SETS.late.has(id) || TRAIT_SETS.hypercarry.has(id)).length;
  const to = tempo(ours), te = tempo(enemy);
  const t = [];
  if (to - te >= 2) t.push('우리가 초반에 강합니다. 15분 전에 전령·드래곤과 포탑 골드로 차이를 벌리고, 상대 정글 동선을 압박하세요.');
  else if (te - to >= 2) t.push('상대가 초반에 강합니다. 초반 교전은 피하고 시야 안에서 성장하며, 상대 정글 반대쪽 오브젝트를 챙기세요.');
  else t.push('초반 힘은 비슷합니다. 라인 상성이 좋은 쪽에서 주도권을 잡으세요.');
  const lo = ours.filter((id) => TRAIT_SETS.late.has(id) || TRAIT_SETS.hypercarry.has(id));
  const le = enemy.filter((id) => TRAIT_SETS.late.has(id) || TRAIT_SETS.hypercarry.has(id));
  if (lo.length > le.length) t.push(`후반은 우리 쪽(${names(lo)})이 유리합니다. 무리한 싸움보다 시간을 버는 편이 낫습니다.`);
  else if (le.length > lo.length) t.push(`후반은 상대 쪽(${names(le)})이 유리합니다. 그 전에 끝낼 수 있게 오브젝트를 서두르세요.`);
  out.push({ title: '초반·후반', items: t });

  // 피해 유형
  const d = [];
  const dmgLine = (p) => `AD ${p.ad} · AP ${p.ap}`;
  if (o.count >= 4 && (o.ap < 1 || o.ad < 1)) d.push(`우리 피해가 한쪽으로 쏠려 있습니다(${dmgLine(o)}). 상대가 방어 아이템 하나로 버틸 수 있으니 관통 아이템을 일찍 챙기세요.`);
  if (e.count >= 4 && e.ap < 1) d.push(`상대가 거의 AD입니다(${dmgLine(e)}). 앞라인은 방어력 아이템 효율이 좋습니다.`);
  if (e.count >= 4 && e.ad < 1) d.push(`상대가 거의 AP입니다(${dmgLine(e)}). 앞라인은 마법 저항력 아이템 효율이 좋습니다.`);
  // 상대 성향별 대비(아이템·시야)
  const heal = enemy.filter((id) => TRAIT_SETS.heal.has(id));
  if (heal.length >= 2) d.push(`상대 회복이 큽니다(${names(heal)}). 딜러 한두 명은 치유 감소 아이템을 일찍 사세요.`);
  const stealth = enemy.filter((id) => TRAIT_SETS.stealth.has(id));
  if (stealth.length) d.push(`상대 은신 챔피언(${names(stealth)})이 있습니다. 제어 와드와 탐지 장신구로 길목을 밝히세요.`);
  if (e.cc.length >= 4) d.push(`상대 하드 CC가 많습니다(${e.cc.length}명). 강인함 신발이나 CC 해제 아이템을 고려하세요.`);
  if (e.poke.length >= 2) d.push(`상대 포킹(${names(e.poke)})이 강합니다. 오브젝트 전에 체력을 지키고, 회복 수단을 챙기세요.`);
  if (d.length) out.push({ title: '피해 유형·대비', items: d });

  // 라인별 상성(상위권 통계)
  if (meta) {
    const ePos = assignEnemyPositions(meta, enemy);
    const lanes = [];
    for (const a of ourAsg) {
      if (!a.role) continue;
      const foe = Object.entries(ePos).find(([, r]) => r === a.role)?.[0];
      const v = foe && laneStat(meta, a.role, a.champ, foe);
      if (!v || v.games < 5) continue;
      const wr = smoothWr(v.games, v.wins, 30);
      const label = ROLES.find((r) => r.id === a.role)?.label;
      if (wr >= 0.53) lanes.push(`${label}: ${nm(a.champ)}가 ${nm(foe)} 상대로 유리(${pct(v.wins / v.games)}, ${v.games}판). 이 라인에서 주도권을 잡고 정글이 이쪽을 도와주세요.`);
      else if (wr <= 0.47) lanes.push(`${label}: ${nm(a.champ)}가 ${nm(foe)} 상대로 불리(${pct(v.wins / v.games)}, ${v.games}판). 무리하지 말고 파밍 위주로, 정글이 갱킹을 받쳐 주세요.`);
    }
    if (lanes.length) out.push({ title: '라인전', items: lanes });
  }
  return out;
}
