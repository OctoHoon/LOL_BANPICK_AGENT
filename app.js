import { loadChampions } from './champions-loader.js';
import { teamFromCollected } from './team-data.js';
import { SAMPLE_TEAM } from './data/sample.js';
import {
  assignEnemyPositions, ROLES, TIERS, draftSequence, currentStep, sideChampions, teamProfile,
  recommendPicks, recommendBans, guessMember, matchChampion,
} from './logic.js';

const STORE = 'banpick.state.v1';
const $ = (sel, el = document) => el.querySelector(sel);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const clone = (o) => JSON.parse(JSON.stringify(o));
const roleLabel = (id) => ROLES.find((r) => r.id === id)?.label ?? '';

const S = {
  champs: [], champMap: new Map(), source: '', meta: null, collected: null, fresh: false,
  team: null, actions: [], assign: {},
  tab: 'draft', search: '', tag: '', poolOnly: false, toast: '',
};

// ---------- 저장 ----------
function seq() { return draftSequence(S.team.format); }
function save() {
  try { localStorage.setItem(STORE, JSON.stringify({ team: S.team, actions: S.actions, assign: S.assign, tab: S.tab })); } catch { /* 무시 */ }
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
    });
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
  const filled = new Set(Object.entries(S.assign).filter(([i]) => S.actions[i]).map(([, m]) => m));
  const prof = teamProfile(picks.filter((p) => p.champ).map((p) => p.champ), S.champMap);
  const total = prof.ad + prof.ap || 1;
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
      return `
      <li class="slot pick ${p.i === cur ? 'now' : ''}">
        <button class="pickbtn" data-slot="${p.i}" title="${p.champ ? '눌러서 비우기' : stepLabel(p.i)}">
          ${p.champ ? portrait(p.champ) : '<span class="pt empty"></span>'}
          <span class="pick-name">${p.champ ? esc(champName(p.champ)) : `<em>${stepLabel(p.i)}</em>`}${enemyPos[p.champ] ? `<small class="guess" title="상위권 통계로 추정한 포지션">${esc(roleLabel(enemyPos[p.champ]))}?</small>` : ''}</span>
        </button>
        ${ours && p.champ ? `
        <select class="assign" data-assign="${p.i}" aria-label="담당 팀원">
          ${S.team.members.map((m) => `<option value="${m.id}" ${m.id === mid ? 'selected' : ''} ${filled.has(m.id) && m.id !== mid ? 'disabled' : ''}>${esc(roleLabel(m.role))} · ${esc(m.name || '이름 없음')}</option>`).join('')}
        </select>` : ''}
        ${ours && p.champ && member && !member.pool.some((x) => x.champ === p.champ) ? '<span class="warn">챔프폭 밖</span>' : ''}
      </li>`;
    }).join('')}</ol>
    <div class="profile" title="Data Dragon 태그와 수동 분류 기반 추정">
      <div class="dmgbar"><span class="ad" style="width:${(prof.ad / total) * 100}%"></span><span class="ap" style="width:${(prof.ap / total) * 100}%"></span></div>
      <div class="profile-txt">AD ${prof.ad} · AP ${prof.ap} · 앞라인 ${prof.front}</div>
    </div>
  </section>`;
}

function recoItem(r, kind) {
  const m = S.team.members.find((x) => x.id === r.memberId);
  return `
  <li>
    <button class="reco" data-reco="${esc(r.champ)}" ${r.memberId ? `data-member="${r.memberId}"` : ''}>
      ${portrait(r.champ)}
      <span class="reco-body">
        <span class="reco-head"><b>${esc(champName(r.champ))}</b>
          ${kind === 'pick' && m ? `<span class="tag">${esc(roleLabel(m.role))} · ${esc(m.name || '팀원')}</span>` : ''}
          <span class="score">${r.score}점</span></span>
        <span class="reasons">${r.reasons.map(esc).join(' · ')}</span>
      </span>
    </button>
  </li>`;
}

function renderReco() {
  const cur = currentStep(S.actions);
  if (cur == null) {
    return `<div class="banner done">밴픽이 끝났습니다. 슬롯을 눌러 수정하거나 새로 시작하세요.</div>`;
  }
  const s = seq()[cur];
  const ours = s.side === S.team.side;
  const st = { team: S.team, actions: S.actions, seq: seq(), assign: S.assign };
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

function renderDraft() {
  $('#main').innerHTML = `
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

function fillSlot(champ, memberId) {
  const cur = currentStep(S.actions);
  if (cur == null || S.actions.includes(champ)) return;
  const s = seq()[cur];
  S.actions[cur] = champ;
  if (s.type === 'pick' && s.side === S.team.side) {
    const filled = new Set(Object.entries(S.assign).filter(([i]) => S.actions[i] && Number(i) !== cur).map(([, m]) => m));
    S.assign[cur] = memberId && !filled.has(memberId) ? memberId : guessMember(S.team, champ, filled);
  }
  save(); renderDraft();
}

// ---------- 팀 챔프폭 화면 ----------
function datalist() {
  return `<datalist id="champ-names">${S.champs.map((c) => `<option value="${esc(c.name)}"></option>`).join('')}</datalist>`;
}

function renderMember(m, idx) {
  return `
  <article class="member" data-m="${idx}">
    <div class="member-head">
      <select data-f="role" aria-label="라인">${ROLES.map((r) => `<option value="${r.id}" ${m.role === r.id ? 'selected' : ''}>${r.label}</option>`).join('')}</select>
      <input data-f="name" value="${esc(m.name)}" placeholder="팀원 이름" aria-label="팀원 이름">
    </div>
    <div class="riot">
      <input data-f="riotId" value="${esc(m.riotId)}" placeholder="이름#태그" aria-label="Riot ID">
      <button class="ghost" data-act="import">숙련도 가져오기</button>
    </div>
    <h4>챔프폭</h4>
    <ul class="pool">
      ${m.pool.map((p, pi) => `
      <li>
        ${portrait(p.champ, 'sm')}
        <span class="pname">${esc(champName(p.champ))}</span>
        <select data-pool="${pi}" data-pf="tier" aria-label="숙련도">${[1, 2, 3].map((t) => `<option value="${t}" ${p.tier === t ? 'selected' : ''}>${TIERS[t].label}</option>`).join('')}</select>
        <input class="num" data-pool="${pi}" data-pf="record" value="${p.games ? `${p.wins ?? 0}/${p.games}` : ''}" placeholder="승/판" inputmode="numeric" aria-label="최근 전적 (승/판)" title="최근 전적, 예: 14/24 (5판 이상부터 반영)">
        <button class="x" data-del-pool="${pi}" aria-label="삭제">×</button>
      </li>`).join('') || '<li class="muted">아직 없습니다.</li>'}
    </ul>
    <input class="add" data-add="pool" list="champ-names" placeholder="+ 챔피언 추가">
    <h4>상대하기 싫은 챔피언 <small>밴 추천에 반영</small></h4>
    <div class="chips">${(m.hates || []).map((h, hi) => `<span class="chip">${esc(champName(h))}<button class="x" data-del-hate="${hi}" aria-label="삭제">×</button></span>`).join('')}</div>
    <input class="add" data-add="hate" list="champ-names" placeholder="+ 챔피언 추가">
  </article>`;
}

function teamNotice() {
  if (S.team.collectedAt) {
    return `<p class="notice ok">챔프폭은 ${esc(new Date(S.team.collectedAt).toLocaleString('ko-KR'))}에 수집한 최근 랭크 전적에서 채웠습니다. 주력·가능·연습은 판수로 임시 판정한 것이니 고쳐 쓰세요.</p>`;
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
      fillSlot(t.dataset.reco, cur != null && seq()[cur].side === S.team.side ? t.dataset.member : null);
      return;
    }
    if (t.dataset.slot != null && S.actions[t.dataset.slot]) {
      S.actions[t.dataset.slot] = null; delete S.assign[t.dataset.slot]; save(); renderDraft(); return;
    }
    if (t.id === 'undo') {
      const last = S.actions.map((a, i) => (a ? i : -1)).filter((i) => i >= 0).pop();
      if (last != null) { S.actions[last] = null; delete S.assign[last]; save(); renderDraft(); }
      return;
    }
    if (t.id === 'resetDraft') { S.actions = Array(seq().length).fill(null); S.assign = {}; save(); renderDraft(); return; }

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
    if (t.id === 'loadSample') { S.team = clone(SAMPLE_TEAM); S.actions = Array(seq().length).fill(null); S.assign = {}; save(); render(); return; }
    if (t.id === 'clearTeam') {
      S.team = normalizeTeam({ side: S.team.side, format: S.team.format, threats: [] });
      S.actions = Array(seq().length).fill(null); S.assign = {}; save(); render();
    }
  });

  document.addEventListener('change', (e) => {
    const t = e.target;
    if (t.id === 'side' || t.id === 'format') {
      S.team[t.id] = t.value;
      S.actions = Array(seq().length).fill(null); S.assign = {};
      save(); render(); return;
    }
    if (t.id === 'tag') { S.tag = t.value; renderGrid(); return; }
    if (t.id === 'poolOnly') { S.poolOnly = t.checked; renderGrid(); return; }
    if (t.dataset.assign != null) { S.assign[t.dataset.assign] = t.value; save(); renderDraft(); return; }
    const card = t.closest('[data-m]');
    const m = card ? S.team.members[card.dataset.m] : null;
    if (!m) return;
    if (t.dataset.f) { m[t.dataset.f] = t.value.trim(); save(); return; }
    if (t.dataset.pool != null) {
      const p = m.pool[t.dataset.pool];
      const r = t.value.match(/^\s*(\d+)\s*\/\s*(\d+)\s*$/);
      if (r && Number(r[1]) <= Number(r[2])) { p.wins = Number(r[1]); p.games = Number(r[2]); }
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
    if (kind === 'pool' && m && !m.pool.some((p) => p.champ === id)) m.pool.push({ champ: id, tier: 2 });
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
  const [meta, collected] = await Promise.all([loadJson('data/meta.json'), loadJson('data/team.json')]);
  S.meta = meta?.games ? meta : null;
  S.collected = collected?.members?.length ? collected : null;
  if (S.fresh && S.collected) { S.team = teamFromCollected(S.collected, S.champMap, S.team, S.meta); save(); }
  render();
  if (S.toast) toast(S.toast);
}
main();
