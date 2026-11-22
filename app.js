import { loadChampions } from './champions-loader.js';
import { teamFromCollected } from './team-data.js';
import { SAMPLE_TEAM } from './data/sample.js';
import {
  assignEnemyPositions, ourAssignments, roleShare, ROLES, TIERS, draftSequence, currentStep, sideChampions, teamProfile,
  recommendPicks, recommendBans, recommendOffPool, guessMember, matchChampion, compSummary, gamePlan,
} from './logic.js';

const STORE = 'banpick.state.v1';
const $ = (sel, el = document) => el.querySelector(sel);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const clone = (o) => JSON.parse(JSON.stringify(o));
const roleLabel = (id) => ROLES.find((r) => r.id === id)?.label ?? '';

const S = {
  champs: [], champMap: new Map(), source: '', meta: null, collected: null, fresh: false,
  team: null, actions: [], assign: {}, assignRole: {}, lineup: {}, allowSwap: true,
  tab: 'draft', search: '', tag: '', poolOnly: false, toast: '',
};

// ---------- 저장 ----------
function seq() { return draftSequence(S.team.format); }
function save() {
  try { localStorage.setItem(STORE, JSON.stringify({ team: S.team, actions: S.actions, assign: S.assign, assignRole: S.assignRole, lineup: S.lineup, allowSwap: S.allowSwap, tab: S.tab })); } catch { /* 무시 */ }
}
function b64encode(obj) {
  const bytes = new TextEncoder().encode(JSON.stringify(obj));
  let bin = ''; bytes.forEach((b) => { bin += String.fromCharCode(b); });
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
function b64decode(str) {
  const bin = atob(str.replace(/-/g, '+').replace(/_/g, '/'));
  return JSON.parse(new TextDecoder().decode(Uint8Array.from(bin, (c) => c.charCodeAt(0))));
}
function restore() {
  const m = location.hash.match(/#t=([\w-]+)/);
  if (m) {
    try {
      S.team = normalizeTeam(b64decode(m[1]));
      S.actions = Array(seq().length).fill(null);
      history.replaceState(null, '', location.pathname);
      S.toast = '공유 링크의 팀 챔프폭을 불러왔습니다.';
      save();
      return;
    } catch { S.toast = '공유 링크를 읽지 못해 저장된 팀을 엽니다.'; }
  }
  try {
    const saved = JSON.parse(localStorage.getItem(STORE) || 'null');
    if (saved?.team) {
      S.team = normalizeTeam(saved.team);
      S.actions = saved.actions?.length === seq().length ? saved.actions : Array(seq().length).fill(null);
      S.assign = saved.assign || {};
      S.assignRole = saved.assignRole || {};
      S.lineup = saved.lineup || {};
      S.allowSwap = saved.allowSwap ?? true;
      S.tab = saved.tab || 'draft';
      return;
    }
  } catch { /* 무시 */ }
  S.fresh = true;
  S.team = clone(SAMPLE_TEAM);
  S.actions = Array(seq().length).fill(null);
}
function normalizeTeam(t) {
  const team = { side: t.side === 'red' ? 'red' : 'blue', format: t.format === 'tournament' ? 'tournament' : 'ranked', threats: t.threats || [], members: [] };
  if (t.example) team.example = true;
  if (t.collectedAt) team.collectedAt = t.collectedAt;
  for (let i = 0; i < 5; i += 1) {
    const m = t.members?.[i] || {};
    team.members.push({
      id: m.id || `m${i + 1}`, name: m.name || '', riotId: m.riotId || '',
      role: m.role || ROLES[i].id, pool: m.pool || [], hates: m.hates || [],
      ...(m.collected ? { collected: m.collected } : {}),
    });
    const mm = team.members[i];
    for (const p of mm.pool) if (!p.role) p.role = mm.role; // 예전 형식: 라인 없는 항목은 주 라인으로
  }
  return team;
}

// ---------- 공통 조각 ----------
function portrait(id, cls = '') {
  const c = S.champMap.get(id);
  if (!c) return `<span class="pt ${cls} empty"></span>`;
  const img = c.img ? `<img src="${esc(c.img)}" alt="" loading="lazy" onerror="this.remove()">` : '';
  return `<span class="pt ${cls}" title="${esc(c.name)}"><span class="pt-txt">${esc(c.name.slice(0, 2))}</span>${img}</span>`;
}
function champName(id) { return S.champMap.get(id)?.name ?? id; }
function nameToId(name) {
  const n = name.trim().replace(/\s/g, '');
  if (!n) return null;
  const hit = S.champs.find((c) => c.name.replace(/\s/g, '') === n || c.id.toLowerCase() === n.toLowerCase());
  if (hit) return hit.id;
  const partial = S.champs.filter((c) => matchChampion(c, n));
  return partial.length === 1 ? partial[0].id : null;
}
function toast(msg) {
  S.toast = msg;
  const el = $('#toast');
  el.textContent = msg; el.classList.add('show');
  clearTimeout(toast.t); toast.t = setTimeout(() => el.classList.remove('show'), 3200);
}

// ---------- 머리글 ----------
function renderHeader() {
  const t = S.team;
  $('#header').innerHTML = `
    <div class="brand">밴픽 도우미 <small>팀 챔프폭 기반</small></div>
    <nav class="tabs" role="tablist">
      <button role="tab" data-tab="draft" aria-selected="${S.tab === 'draft'}">밴픽</button>
      <button role="tab" data-tab="team" aria-selected="${S.tab === 'team'}">팀 챔프폭</button>
    </nav>
    <div class="opts">
      <label>우리 진영
        <select id="side">
          <option value="blue" ${t.side === 'blue' ? 'selected' : ''}>블루</option>
          <option value="red" ${t.side === 'red' ? 'selected' : ''}>레드</option>
        </select>
      </label>
      <label>방식
        <select id="format">
          <option value="ranked" ${t.format === 'ranked' ? 'selected' : ''}>랭크(5밴 후 픽)</option>
          <option value="tournament" ${t.format === 'tournament' ? 'selected' : ''}>대회(3밴·2밴)</option>
        </select>
      </label>
      <button id="share" class="ghost">팀 공유 링크</button>
    </div>`;
}

// ---------- 밴픽 화면 ----------
function stepLabel(i) {
  const s = seq()[i];
  const n = seq().slice(0, i + 1).filter((x) => x.side === s.side && x.type === s.type).length;
  return `${s.side === 'blue' ? '블루' : '레드'} ${n}${s.type === 'ban' ? '밴' : '픽'}`;
}

function renderSide(side) {
  const ours = side === S.team.side;
  const bans = sideChampions(S.actions, seq(), side, 'ban');
  const picks = sideChampions(S.actions, seq(), side, 'pick');
  const cur = currentStep(S.actions);
  const asg = ours ? ourAssignments({ team: S.team, actions: S.actions, seq: seq(), assign: S.assign, assignRole: S.assignRole }) : [];
  const filled = new Set(asg.map((a) => a.memberId));
  const takenRoles = new Set(asg.map((a) => a.role));
  const prof = teamProfile(picks.filter((p) => p.champ).map((p) => p.champ), S.champMap);
  const total = prof.ad + prof.ap || 1;
  const cs = compSummary(picks.filter((p) => p.champ).map((p) => p.champ), S.champMap);
  const enemyPos = !ours && S.meta ? assignEnemyPositions(S.meta, picks.filter((p) => p.champ).map((p) => p.champ)) : {};

  return `
  <section class="side ${side} ${ours ? 'ours' : ''}">
    <h2>${side === 'blue' ? '블루' : '레드'} <span>${ours ? '우리 팀' : '상대 팀'}</span></h2>
    <div class="bans">${bans.map((b) => `
      <button class="slot ban ${b.i === cur ? 'now' : ''}" data-slot="${b.i}" title="${b.champ ? `${esc(champName(b.champ))} (눌러서 비우기)` : stepLabel(b.i)}">
        ${b.champ ? portrait(b.champ, 'sm') : '<span class="pt sm empty"></span>'}
      </button>`).join('')}
    </div>
    <ol class="picks">${picks.map((p) => {
      const mid = S.assign[p.i];
      const member = S.team.members.find((m) => m.id === mid);
      const role = asg.find((a) => a.i === p.i)?.role;
      return `
      <li class="slot pick ${p.i === cur ? 'now' : ''}">
        <button class="pickbtn" data-slot="${p.i}" title="${p.champ ? '눌러서 비우기' : stepLabel(p.i)}">
          ${p.champ ? portrait(p.champ) : '<span class="pt empty"></span>'}
          <span class="pick-name">${p.champ ? esc(champName(p.champ)) : `<em>${stepLabel(p.i)}</em>`}${enemyPos[p.champ] ? `<small class="guess" title="상위권 통계로 추정한 포지션">${esc(roleLabel(enemyPos[p.champ]))}?</small>` : ''}</span>
        </button>
        ${ours && p.champ ? `
        <div class="assign-row">
          <select class="assign" data-assign="${p.i}" aria-label="담당 팀원">
            ${S.team.members.map((m) => `<option value="${m.id}" ${m.id === mid ? 'selected' : ''} ${filled.has(m.id) && m.id !== mid ? 'disabled' : ''}>${esc(m.name || '이름 없음')}</option>`).join('')}
          </select>
          <select class="assign role" data-assign-role="${p.i}" aria-label="라인">
            ${ROLES.map((r) => `<option value="${r.id}" ${r.id === role ? 'selected' : ''} ${takenRoles.has(r.id) && r.id !== role ? 'disabled' : ''}>${r.label}</option>`).join('')}
          </select>
        </div>` : ''}
        ${ours && p.champ && member && !member.pool.some((x) => x.champ === p.champ && x.role === role) ? `<span class="warn">${member.pool.some((x) => x.champ === p.champ) ? '다른 라인 챔프폭' : '챔프폭 밖'}</span>` : ''}
      </li>`;
    }).join('')}</ol>
    <div class="profile" title="Data Dragon 태그와 수동 분류 기반 추정">
      <div class="dmgbar"><span class="ad" style="width:${(prof.ad / total) * 100}%"></span><span class="ap" style="width:${(prof.ap / total) * 100}%"></span></div>
      <div class="profile-txt">AD ${prof.ad} · AP ${prof.ap} · 앞라인 ${prof.front}</div>
      ${cs.count ? `<div class="profile-txt">${cs.identityLabel ? `<span class="ident">${cs.identityLabel}</span> · ` : ''}CC ${cs.cc.length} · 돌진 ${cs.dive.length} · 이니시 ${cs.engage.length} · 포킹 ${cs.poke.length}</div>` : ''}
    </div>
  </section>`;
}

function recoItem(r, kind) {
  const m = S.team.members.find((x) => x.id === r.memberId);
  return `
  <li>
    <button class="reco" data-reco="${esc(r.champ)}" ${r.memberId ? `data-member="${r.memberId}" data-role="${r.role}"` : ''}>
      ${portrait(r.champ)}
      <span class="reco-body">
        <span class="reco-head"><b>${esc(champName(r.champ))}</b>
          ${kind === 'pick' && m ? `<span class="tag">${esc(roleLabel(r.role))} · ${esc(m.name || '팀원')}</span>` : ''}
          <span class="score">${r.score}점</span></span>
        <span class="reasons">${r.reasons.map(esc).join(' · ')}</span>
      </span>
    </button>
  </li>`;
}

function renderReco() {
  const cur = currentStep(S.actions);
  if (cur == null) {
    const st = { team: S.team, actions: S.actions, seq: seq(), assign: S.assign, assignRole: S.assignRole };
    const plan = gamePlan(st, S.champMap, S.meta);
    return `<div class="banner done">밴픽이 끝났습니다. 슬롯을 눌러 수정하거나 새로 시작하세요.</div>
      <div class="reco-box plan"><h3>운영 가이드 <small>조합 성향과 상위권 통계로 뽑은 일반 원칙입니다</small></h3>
      ${plan.map((sec) => `<h4>${esc(sec.title)}</h4><ul>${sec.items.map((x) => `<li>${esc(x)}</li>`).join('')}</ul>`).join('')}</div>`;
  }
  const s = seq()[cur];
  const ours = s.side === S.team.side;
  const st = { team: S.team, actions: S.actions, seq: seq(), assign: S.assign, assignRole: S.assignRole, lineup: S.lineup, allowSwap: S.allowSwap };
  let body = '';
  if (s.type === 'ban') {
    const { list, skipped } = recommendBans(st, S.champMap, 8, S.meta);
    body = list.length
      ? `<ol class="recos">${list.map((r) => recoItem(r, 'ban')).join('')}</ol>`
      : '<p class="muted">밴 후보가 없습니다. 팀 챔프폭 화면에서 팀원별 상대하기 싫은 챔피언이나 경계 목록을 채워 주세요.</p>';
    if (skipped.length) body += `<p class="muted small">우리 팀이 쓰는 챔피언이라 밴 후보에서 뺀 것: ${skipped.map(champName).map(esc).join(', ')}</p>`;
  } else {
    const list = recommendPicks(st, S.champMap, 8, S.meta);
    body = list.length
      ? `<ol class="recos">${list.map((r) => recoItem(r, 'pick')).join('')}</ol>`
      : '<p class="muted">남은 팀원 챔프폭에서 고를 수 있는 챔피언이 없습니다. 아래 목록에서 직접 고르세요.</p>';
    const extra = recommendOffPool(st, S.champMap, 4, S.meta);
    if (extra.length) {
      body += `<h3 class="sub">챔프폭 밖이지만 이번 판 상황이 좋은 픽 <small>숙련도 점수 없이 상성·조합만으로 ${'15'}점 이상</small></h3>
        <ol class="recos">${extra.map((r) => recoItem(r, 'pick')).join('')}</ol>`;
    }
  }
  const who = ours ? '우리 팀' : '상대 팀';
  const hint = ours
    ? (s.type === 'ban' ? '밴 추천' : '픽 추천')
    : `상대가 고른 챔피언을 아래에서 누르세요. 참고로 우리 다음 ${s.type === 'ban' ? '밴' : '픽'} 후보입니다.`;
  return `
    <div class="banner ${s.side} ${ours ? 'ours' : ''}"><b>${stepLabel(cur)}</b> · ${who} 차례</div>
    <div class="reco-box"><h3>${hint}</h3>${body}</div>`;
}

function renderGrid() {
  const used = new Set(S.actions.filter(Boolean));
  const poolSet = new Set(S.team.members.flatMap((m) => m.pool.map((p) => p.champ)));
  const list = S.champs.filter((c) =>
    matchChampion(c, S.search) && (!S.tag || c.tags.includes(S.tag)) && (!S.poolOnly || poolSet.has(c.id)));
  $('#grid').innerHTML = list.length
    ? list.map((c) => `
      <button class="cell ${used.has(c.id) ? 'used' : ''} ${poolSet.has(c.id) ? 'inpool' : ''}" data-champ="${esc(c.id)}" ${used.has(c.id) ? 'disabled' : ''}>
        ${portrait(c.id)}<span>${esc(c.name)}</span>
      </button>`).join('')
    : '<p class="muted">검색 결과가 없습니다.</p>';
}

const TAGS = [['', '전체'], ['Fighter', '전사'], ['Tank', '탱커'], ['Mage', '마법사'], ['Assassin', '암살자'], ['Marksman', '원거리'], ['Support', '서포터']];

// 이번 판에 누가 어느 라인을 설지. 비워 두면 주 라인 기준으로 자동 추천한다.
function renderLineup() {
  const set = Object.values(S.lineup).filter(Boolean).length;
  return `
  <section class="lineup" aria-label="이번 판 라인">
    <span class="lineup-title">이번 판 라인</span>
    ${S.team.members.map((m) => `
      <label class="lineup-item"><span>${esc(m.name || '이름 없음')}</span>
        <select data-lineup="${m.id}">
          <option value="">자동 (${esc(roleLabel(m.role))})</option>
          ${ROLES.map((r) => `<option value="${r.id}" ${S.lineup[m.id] === r.id ? 'selected' : ''}>${r.label}</option>`).join('')}
        </select>
      </label>`).join('')}
    <label class="chk" title="상대 픽에 따라 아직 안 고른 두 팀원이 라인을 맞바꾸는 추천도 보여 줍니다"><input id="allowSwap" type="checkbox" ${S.allowSwap ? 'checked' : ''} ${set ? '' : 'disabled'}> 라인 스왑 제안</label>
  </section>`;
}

function renderDraft() {
  $('#main').innerHTML = `
  ${renderLineup()}
  <div class="draft">
    ${renderSide('blue')}
    <section class="center">
      <div id="reco">${renderReco()}</div>
      <div class="toolbar">
        <input id="search" type="search" placeholder="챔피언 검색 (초성 가능: ㅇㄹ)" value="${esc(S.search)}" autocomplete="off">
        <select id="tag" aria-label="역할군">${TAGS.map(([v, l]) => `<option value="${v}" ${S.tag === v ? 'selected' : ''}>${l}</option>`).join('')}</select>
        <label class="chk"><input id="poolOnly" type="checkbox" ${S.poolOnly ? 'checked' : ''}> 우리 챔프폭만</label>
        <button id="undo" class="ghost">한 단계 취소</button>
        <button id="resetDraft" class="ghost">새 밴픽</button>
      </div>
      <div id="grid" class="grid"></div>
    </section>
    ${renderSide('red')}
  </div>`;
  renderGrid();
}

function fillSlot(champ, memberId, role) {
  const cur = currentStep(S.actions);
  if (cur == null || S.actions.includes(champ)) return;
  const s = seq()[cur];
  S.actions[cur] = champ;
  if (s.type === 'pick' && s.side === S.team.side) {
    const asg = ourAssignments({ team: S.team, actions: S.actions, seq: seq(), assign: S.assign, assignRole: S.assignRole }).filter((a) => a.i !== cur);
    const filled = new Set(asg.map((a) => a.memberId));
    const taken = new Set(asg.map((a) => a.role));
    if (memberId && role && !filled.has(memberId) && !taken.has(role)) {
      S.assign[cur] = memberId; S.assignRole[cur] = role;
    } else {
      const g = guessMember(S.team, champ, filled, taken, S.lineup);
      if (g) { S.assign[cur] = g.id; S.assignRole[cur] = g.role; }
    }
  }
  save(); renderDraft();
}

// ---------- 팀 챔프폭 화면 ----------
function datalist() {
  return `<datalist id="champ-names">${S.champs.map((c) => `<option value="${esc(c.name)}"></option>`).join('')}</datalist>`;
}

function poolRow(p, pi) {
  const rec = p.games ? `${p.wins ?? 0}/${p.games}` : '';
  const title = p.wg != null
    ? `전체 ${p.games}판 ${p.wins}승, 최근 가중 ${p.wg}판 ${p.ww}승 (예: 14/24 형식으로 고칠 수 있음)`
    : p.mastery ? `랭크 기록 없음, 숙련도 ${p.mastery.toLocaleString('ko-KR')}점` : '전적, 예: 14/24 (5판 이상부터 반영)';
  return `
      <li>
        ${portrait(p.champ, 'sm')}
        <span class="pname">${esc(champName(p.champ))}</span>
        <select data-pool="${pi}" data-pf="tier" aria-label="숙련도">${[1, 2, 3].map((t) => `<option value="${t}" ${p.tier === t ? 'selected' : ''}>${TIERS[t].label}</option>`).join('')}</select>
        <input class="num" data-pool="${pi}" data-pf="record" value="${rec}" placeholder="승/판" inputmode="numeric" aria-label="전적 (승/판)" title="${esc(title)}">
        <button class="x" data-del-pool="${pi}" aria-label="삭제">×</button>
      </li>`;
}

// 주 라인을 먼저, 나머지 라인은 비중 순으로 접어서 보여 준다
function poolGroups(m) {
  if (!m.pool.length) return '<p class="muted small">아직 없습니다.</p>';
  const share = roleShare(m);
  const roles = [...new Set(m.pool.map((p) => p.role))].sort((a, b) => (a === m.role ? -1 : b === m.role ? 1 : (share[b] || 0) - (share[a] || 0)));
  return roles.map((role) => {
    const rows = m.pool.map((p, pi) => ({ p, pi })).filter(({ p }) => p.role === role);
    const head = `${esc(roleLabel(role))} <small>${rows.length}개${share[role] ? ` · 비중 ${Math.round(share[role] * 100)}%` : ''}${role === m.role ? ' · 주 라인' : ''}</small>`;
    const list = `<ul class="pool">${rows.map(({ p, pi }) => poolRow(p, pi)).join('')}</ul>`;
    return role === m.role
      ? `<div class="pool-group"><div class="pool-head">${head}</div>${list}</div>`
      : `<details class="pool-group"><summary class="pool-head">${head}</summary>${list}</details>`;
  }).join('');
}

function collectedLine(m) {
  const c = m.collected;
  if (!c) return '';
  const part = c.complete === false ? ` (전체 ${c.total}판 중 ${c.games}판까지 분석, 나머지는 이어서 수집)` : '';
  return `<p class="muted small">랭크 ${c.games}판 분석${part} · 팀원과 함께 ${c.withTeam}판</p>`;
}

function renderMember(m, idx) {
  return `
  <article class="member" data-m="${idx}">
    <div class="member-head">
      <select data-f="role" aria-label="주 라인" title="주 라인">${ROLES.map((r) => `<option value="${r.id}" ${m.role === r.id ? 'selected' : ''}>${r.label}</option>`).join('')}</select>
      <input data-f="name" value="${esc(m.name)}" placeholder="팀원 이름" aria-label="팀원 이름">
    </div>
    <div class="riot">
      <input data-f="riotId" value="${esc(m.riotId)}" placeholder="이름#태그" aria-label="Riot ID">
      <button class="ghost" data-act="import">숙련도 가져오기</button>
    </div>
    ${collectedLine(m)}
    <h4>챔프폭 <small>라인별</small></h4>
    ${poolGroups(m)}
    <div class="add-row">
      <select data-addrole aria-label="추가할 라인">${ROLES.map((r) => `<option value="${r.id}" ${m.role === r.id ? 'selected' : ''}>${r.label}</option>`).join('')}</select>
      <input class="add" data-add="pool" list="champ-names" placeholder="+ 챔피언 추가">
    </div>
    <h4>상대하기 싫은 챔피언 <small>밴 추천에 반영</small></h4>
    <div class="chips">${(m.hates || []).map((h, hi) => `<span class="chip">${esc(champName(h))}<button class="x" data-del-hate="${hi}" aria-label="삭제">×</button></span>`).join('')}</div>
    <input class="add" data-add="hate" list="champ-names" placeholder="+ 챔피언 추가">
  </article>`;
}

function teamNotice() {
  if (S.team.collectedAt) {
    return `<p class="notice ok">챔프폭은 ${esc(new Date(S.team.collectedAt).toLocaleString('ko-KR'))}에 수집한 랭크 전체 전적에서 라인별로 채웠습니다. 최근 경기일수록 크게 반영하고(120일마다 절반), 주력·가능·연습은 그 점수로 임시 판정한 것이니 고쳐 쓰세요.</p>`;
  }
  if (S.team.example) {
    return '<p class="notice">아직 Riot API로 전적을 수집하지 않아 멤버 Riot ID만 실제이고, 라인과 챔프폭은 임시 예시입니다. 수집기를 한 번 돌리면 실제 전적으로 바뀝니다.</p>';
  }
  return '';
}

function renderTeam() {
  const t = S.team;
  $('#main').innerHTML = `
  ${datalist()}
  ${teamNotice()}
  <p class="lead">팀원마다 라인과 챔프폭을 적어 두면 밴픽 화면에서 누구에게 무엇을 쥐여 줄지 추천합니다. 전적은 승/판 형식(예: 14/24)으로 적고, 5판 이상일 때만 점수에 반영합니다.</p>
  <div class="members">${t.members.map(renderMember).join('')}</div>
  <article class="member threats">
    <h4>경계 챔피언 목록 <small>밴 추천과 선픽 판단에 반영</small></h4>
    <p class="muted small">요즘 자주 보이거나 팀이 껄끄러워하는 챔피언을 적으세요. 처음 들어 있는 것은 예시일 뿐 통계가 아닙니다.</p>
    <div class="chips">${t.threats.map((h, hi) => `<span class="chip">${esc(champName(h))}<button class="x" data-del-threat="${hi}" aria-label="삭제">×</button></span>`).join('')}</div>
    <input class="add" data-add="threat" list="champ-names" placeholder="+ 챔피언 추가">
    <div class="row">
      ${S.collected ? '<button id="loadCollected" class="ghost">수집한 전적으로 다시 채우기</button>' : ''}
      <button id="loadSample" class="ghost">예시 팀으로 되돌리기</button>
      <button id="clearTeam" class="ghost danger">모두 비우기</button>
    </div>
  </article>`;
}

async function importMastery(idx, btn) {
  const m = S.team.members[idx];
  if (!/^.+#.+$/.test(m.riotId)) { toast('Riot ID를 이름#태그 형식으로 적어 주세요.'); return; }
  btn.disabled = true; btn.textContent = '불러오는 중…';
  try {
    const res = await fetch(`/api/riot?riotId=${encodeURIComponent(m.riotId)}`);
    if (res.status === 404 && !res.headers.get('content-type')?.includes('json')) {
      throw new Error('Riot API 연동은 배포 후 서버에 API 키를 넣어야 켜집니다. 지금은 직접 입력해 주세요.');
    }
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || '불러오기에 실패했습니다.');
    const byKey = new Map(S.champs.filter((c) => c.key).map((c) => [String(c.key), c.id]));
    let added = 0;
    data.champions.forEach((x, rank) => {
      const id = byKey.get(String(x.championId));
      if (!id || m.pool.some((p) => p.champ === id)) return;
      m.pool.push({ champ: id, tier: rank < 3 ? 1 : rank < 7 ? 2 : 3, mastery: x.points });
      added += 1;
    });
    save(); renderTeam();
    toast(`숙련도 상위 챔피언 ${added}개를 추가했습니다. 숙련도 점수 순으로 주력·가능·연습을 임시로 나눴으니 확인해 주세요.`);
  } catch (e) {
    toast(e.message || String(e));
    btn.disabled = false; btn.textContent = '숙련도 가져오기';
  }
}

// ---------- 이벤트 ----------
function render() {
  renderHeader();
  if (S.tab === 'team') renderTeam(); else renderDraft();
  const metaTxt = S.meta
    ? `메타 통계: ${S.meta.source}, 패치 ${S.meta.patches.join('·')}, ${S.meta.games.toLocaleString('ko-KR')}판 (${new Date(S.meta.updatedAt).toLocaleDateString('ko-KR')} 수집)`
    : '메타 통계: 아직 없음 (수집기 실행 전)';
  $('#source').textContent = `챔피언 데이터: ${S.source} · ${metaTxt}`;
}

function bind() {
  document.addEventListener('click', (e) => {
    const t = e.target.closest('button');
    if (!t) return;
    if (t.dataset.tab) { S.tab = t.dataset.tab; save(); render(); return; }
    if (t.id === 'share') {
      const url = `${location.origin}${location.pathname}#t=${b64encode(S.team)}`;
      navigator.clipboard?.writeText(url).then(
        () => toast('팀 챔프폭 링크를 복사했습니다. 팀원에게 보내면 같은 설정으로 열립니다.'),
        () => prompt('이 링크를 복사하세요', url),
      );
      return;
    }
    if (t.dataset.champ) { fillSlot(t.dataset.champ); return; }
    if (t.dataset.reco) {
      const cur = currentStep(S.actions);
      const ourTurn = cur != null && seq()[cur].side === S.team.side;
      fillSlot(t.dataset.reco, ourTurn ? t.dataset.member : null, ourTurn ? t.dataset.role : null);
      return;
    }
    if (t.dataset.slot != null && S.actions[t.dataset.slot]) {
      S.actions[t.dataset.slot] = null; delete S.assign[t.dataset.slot]; delete S.assignRole[t.dataset.slot]; save(); renderDraft(); return;
    }
    if (t.id === 'undo') {
      const last = S.actions.map((a, i) => (a ? i : -1)).filter((i) => i >= 0).pop();
      if (last != null) { S.actions[last] = null; delete S.assign[last]; delete S.assignRole[last]; save(); renderDraft(); }
      return;
    }
    if (t.id === 'resetDraft') { S.actions = Array(seq().length).fill(null); S.assign = {}; S.assignRole = {}; save(); renderDraft(); return; }

    // 팀 화면
    const card = t.closest('[data-m]');
    const m = card ? S.team.members[card.dataset.m] : null;
    if (m && t.dataset.act === 'import') { importMastery(Number(card.dataset.m), t); return; }
    if (m && t.dataset.delPool != null) { m.pool.splice(Number(t.dataset.delPool), 1); save(); renderTeam(); return; }
    if (m && t.dataset.delHate != null) { m.hates.splice(Number(t.dataset.delHate), 1); save(); renderTeam(); return; }
    if (t.dataset.delThreat != null) { S.team.threats.splice(Number(t.dataset.delThreat), 1); save(); renderTeam(); return; }
    if (t.id === 'loadCollected' && S.collected) {
      S.team = teamFromCollected(S.collected, S.champMap, S.team, S.meta); save(); render();
      toast('수집한 최근 랭크 전적으로 챔프폭을 채웠습니다. 주력·가능·연습은 판수로 임시 판정했습니다.');
      return;
    }
    if (t.id === 'loadSample') { S.team = clone(SAMPLE_TEAM); S.actions = Array(seq().length).fill(null); S.assign = {}; S.assignRole = {}; save(); render(); return; }
    if (t.id === 'clearTeam') {
      S.team = normalizeTeam({ side: S.team.side, format: S.team.format, threats: [] });
      S.actions = Array(seq().length).fill(null); S.assign = {}; S.assignRole = {}; save(); render();
    }
  });

  document.addEventListener('change', (e) => {
    const t = e.target;
    if (t.id === 'side' || t.id === 'format') {
      S.team[t.id] = t.value;
      S.actions = Array(seq().length).fill(null); S.assign = {}; S.assignRole = {};
      save(); render(); return;
    }
    if (t.id === 'tag') { S.tag = t.value; renderGrid(); return; }
    if (t.dataset.lineup) {
      // 같은 라인을 다른 팀원이 이미 맡고 있으면 서로 맞바꾼다
      const id = t.dataset.lineup, prev = S.lineup[id] || '';
      const other = t.value && Object.keys(S.lineup).find((k) => k !== id && S.lineup[k] === t.value);
      if (other) { if (prev) S.lineup[other] = prev; else delete S.lineup[other]; }
      if (t.value) S.lineup[id] = t.value; else delete S.lineup[id];
      save(); renderDraft(); return;
    }
    if (t.id === 'allowSwap') { S.allowSwap = t.checked; save(); renderDraft(); return; }
    if (t.id === 'poolOnly') { S.poolOnly = t.checked; renderGrid(); return; }
    if (t.dataset.assign != null) { S.assign[t.dataset.assign] = t.value; save(); renderDraft(); return; }
    if (t.dataset.assignRole != null) { S.assignRole[t.dataset.assignRole] = t.value; save(); renderDraft(); return; }
    const card = t.closest('[data-m]');
    const m = card ? S.team.members[card.dataset.m] : null;
    if (!m) return;
    if (t.dataset.f) { m[t.dataset.f] = t.value.trim(); save(); return; }
    if (t.dataset.pool != null) {
      const p = m.pool[t.dataset.pool];
      const r = t.value.match(/^\s*(\d+)\s*\/\s*(\d+)\s*$/);
      if (r && Number(r[1]) <= Number(r[2])) { p.wins = Number(r[1]); p.games = Number(r[2]); delete p.wg; delete p.ww; }
      else {
        delete p.wins; delete p.games;
        if (t.value.trim()) toast('전적은 승/판 형식으로 적어 주세요. 예: 14/24');
        t.value = '';
      }
      save(); return;
    }
  });

  document.addEventListener('input', (e) => {
    if (e.target.id === 'search') { S.search = e.target.value; renderGrid(); return; }
    // 자동완성 목록에서 고르면 Enter 없이 바로 추가
    if (e.target.dataset.add && (!e.inputType || e.inputType === 'insertReplacementText')) {
      const v = e.target.value.trim();
      if (S.champs.some((c) => c.name === v)) addFromInput(e.target);
    }
  });

  document.addEventListener('keydown', (e) => {
    const t = e.target;
    if (e.key === 'Enter' && t.id === 'search') {
      const first = $('#grid .cell:not(.used)');
      if (first) { fillSlot(first.dataset.champ); S.search = ''; $('#search').value = ''; renderGrid(); $('#search').focus(); }
      return;
    }
    if (e.key !== 'Enter' || !t.dataset.add) return;
    e.preventDefault();
    addFromInput(t);
  });
}

function addFromInput(t) {
    const id = nameToId(t.value);
    if (!id) { toast(`'${t.value}' 챔피언을 찾지 못했습니다.`); return; }
    const card = t.closest('[data-m]');
    const m = card ? S.team.members[card.dataset.m] : null;
    const kind = t.dataset.add;
    const role = t.parentElement.querySelector('[data-addrole]')?.value || m?.role;
    if (kind === 'pool' && m && !m.pool.some((p) => p.champ === id && p.role === role)) m.pool.push({ champ: id, role, tier: 2 });
    if (kind === 'hate' && m && !m.hates.includes(id)) m.hates.push(id);
    if (kind === 'threat' && !S.team.threats.includes(id)) S.team.threats.push(id);
    save(); renderTeam();
    const again = card ? $(`[data-m="${card.dataset.m}"] [data-add="${kind}"]`) : $(`[data-add="${kind}"]`);
    again?.focus();
}

async function loadJson(url) {
  try {
    const res = await fetch(url, { cache: 'no-cache' });
    return res.ok ? await res.json() : null;
  } catch { return null; }
}

async function main() {
  restore();
  bind();
  const { list, source } = await loadChampions();
  S.champs = list; S.champMap = new Map(list.map((c) => [c.id, c])); S.source = source;
  const [meta, collected, attrs] = await Promise.all([loadJson('data/meta.json'), loadJson('data/team.json'), loadJson('data/champ-attrs.json')]);
  // Riot 클라이언트의 챔피언 성향 등급(CC 등). 없으면 data/traits.js 수동 분류만 쓴다.
  for (const [id, a] of Object.entries(attrs?.champs || {})) { const c = S.champMap.get(id); if (c) Object.assign(c, a); }
  S.meta = meta?.games ? meta : null;
  S.collected = collected?.members?.length ? collected : null;
  // 처음 열었거나, 수집 데이터로 만든 팀인데 더 새 수집 결과가 있으면 다시 채운다(상대하기 싫은 챔피언·경계 목록은 유지)
  const newer = S.collected && S.team.collectedAt && S.collected.updatedAt > S.team.collectedAt;
  if (S.collected && (S.fresh || newer)) { S.team = teamFromCollected(S.collected, S.champMap, S.team, S.meta); save(); }
  render();
  if (S.toast) toast(S.toast);
}
main();
