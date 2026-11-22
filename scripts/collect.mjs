#!/usr/bin/env node
// Riot 공식 API로 두 가지를 모은다.
//  1) 팀원 데이터: 숙련도 상위 챔피언, 최근 랭크 경기의 챔피언별 전적과 주 포지션 → data/team.json
//  2) 메타 통계: KR 상위권(챌린저~마스터) 솔로 랭크 경기의 챔피언 포지션별 승률·밴, 라인 상성, 바텀 듀오 궁합 → data/meta.json
// 누적 원자료는 data/raw/ 에 남겨 다음 실행 때 이어서 쌓는다.
//
// 사용법: RIOT_API_KEY=... node scripts/collect.mjs [--members] [--meta]
// 옵션을 안 주면 둘 다 한다. 키는 환경 변수로만 받고 파일에 쓰지 않는다.

import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = process.env.BANPICK_ROOT || path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
// 시크릿에 따옴표·공백·'RIOT_API_KEY=' 같은 군더더기가 섞여 들어가는 경우가 많아 정리한다.
const KEY = (process.env.RIOT_API_KEY || '').trim().replace(/^RIOT_API_KEY\s*=\s*/, '').replace(/^["']|["']$/g, '').trim();
const BASE_OVERRIDE = process.env.RIOT_BASE_OVERRIDE; // 시험용 가짜 서버 주소
const log = (...a) => console.log(new Date().toISOString().slice(11, 19), ...a);

const POS = { TOP: 'top', JUNGLE: 'jungle', MIDDLE: 'mid', BOTTOM: 'adc', UTILITY: 'support' };
const NAME_FIX = { FiddleSticks: 'Fiddlesticks' }; // match-v5 이름과 Data Dragon id가 다른 경우

export function champId(name) { return NAME_FIX[name] || name; }
export function patchOf(gameVersion) { return String(gameVersion).split('.').slice(0, 2).join('.'); }

// ---------- 요청 속도 제한 ----------
// 개발용 키 한도(초당 20, 2분 100)보다 조금 낮게 잡는다. RIOT_RATE="18:1,95:120" 형식으로 바꿀 수 있다.
const LIMITS = (process.env.RIOT_RATE || '18:1,95:120').split(',').map((s) => {
  const [n, sec] = s.split(':').map(Number);
  return { n, ms: sec * 1000 };
});
const stamps = [];
async function throttle() {
  for (;;) {
    const now = Date.now();
    let wait = 0;
    for (const { n, ms } of LIMITS) {
      const recent = stamps.filter((t) => now - t < ms);
      if (recent.length >= n) wait = Math.max(wait, ms - (now - recent[recent.length - n]) + 20);
    }
    if (!wait) break;
    await new Promise((r) => setTimeout(r, wait));
  }
  stamps.push(Date.now());
  if (stamps.length > 500) stamps.splice(0, stamps.length - 500);
}

export class RiotError extends Error {}

export function makeClient(cfg) {
  const host = (kind) => BASE_OVERRIDE || `https://${kind === 'regional' ? cfg.regional : cfg.platform}.api.riotgames.com`;
  let count = 0;
  async function get(kind, p) {
    for (let attempt = 0; attempt < 5; attempt += 1) {
      await throttle();
      count += 1;
      const res = await fetch(host(kind) + p, { headers: { 'X-Riot-Token': KEY } });
      if (res.ok) return res.json();
      if (res.status === 404) return null;
      if (res.status === 401) {
        const body = (await res.text()).slice(0, 200);
        throw new RiotError(`Riot API가 키를 인식하지 못했습니다(401) ${kind} ${p.split('/').slice(0, 5).join('/')} 응답: ${body} / 키 길이 ${KEY.length}자, RGAPI- 로 시작 ${KEY.startsWith('RGAPI-') ? '예' : '아니오'}`);
      }
      if (res.status === 403) {
        throw new RiotError('Riot API가 키를 거부했습니다(403). 키가 만료됐거나 잘못된 키입니다. 개발용 키는 24시간마다 만료됩니다.');
      }
      if (res.status === 429) {
        const sec = Number(res.headers.get('retry-after') || 10);
        log(`요청 한도 도달, ${sec}초 대기`);
        await new Promise((r) => setTimeout(r, sec * 1000));
        continue;
      }
      if (res.status >= 500) { await new Promise((r) => setTimeout(r, 1500 * (attempt + 1))); continue; }
      throw new RiotError(`요청 실패 ${res.status}: ${p}`);
    }
    throw new RiotError(`재시도 후에도 실패: ${p}`);
  }
  return { get, get count() { return count; } };
}

async function readJson(file, fallback) {
  try { return JSON.parse(await fs.readFile(path.join(ROOT, file), 'utf8')); } catch { return fallback; }
}
async function writeJson(file, data, pretty = false) {
  const full = path.join(ROOT, file);
  await fs.mkdir(path.dirname(full), { recursive: true });
  await fs.writeFile(full, JSON.stringify(data, null, pretty ? 2 : 0) + '\n');
}

// ---------- 팀원 ----------
export async function collectMembers(api, cfg) {
  const cache = await readJson('data/raw/member-matches.json', {});
  const out = [];
  // 계정을 먼저 모두 찾아야 "팀원끼리 같은 팀이었는지"를 경기마다 바로 셀 수 있다
  const accounts = [];
  for (const m of cfg.members) {
    const [gameName, tagLine] = m.riotId.split('#');
    accounts.push(await api.get('regional', `/riot/account/v1/accounts/by-riot-id/${encodeURIComponent(gameName)}/${encodeURIComponent(tagLine)}`));
  }
  const memberPuuids = new Set(accounts.filter(Boolean).map((a) => a.puuid));
  for (const [mi, m] of cfg.members.entries()) {
    const acc = accounts[mi];
    if (!acc) { log(`계정을 찾지 못함: ${m.riotId}`); out.push({ riotId: m.riotId, error: 'not_found' }); continue; }
    const puuid = acc.puuid;
    const mastery = (await api.get('platform', `/lol/champion-mastery/v4/champion-masteries/by-puuid/${puuid}/top?count=15`)) || [];

    const ids = new Set();
    const want = cfg.memberMatchCount || 60;
    for (const q of cfg.memberQueues || [440, 420]) {
      // 한 번에 최대 100개라 나눠서 받는다
      for (let start = 0; start < want; start += 100) {
        const count = Math.min(100, want - start);
        const list = (await api.get('regional', `/lol/match/v5/matches/by-puuid/${puuid}/ids?queue=${q}&start=${start}&count=${count}`)) || [];
        list.forEach((id) => ids.add(id));
        if (list.length < count) break;
      }
    }
    // match id 는 서버 접두사 + 증가 번호라서 번호 기준으로 최근 순 정렬
    const recent = [...ids].sort((a, b) => Number(b.split('_')[1]) - Number(a.split('_')[1])).slice(0, cfg.memberMatchCount || 60);

    const games = [];
    for (const id of recent) {
      const key = `${puuid}:${id}`;
      if (!cache[key]) {
        const match = await api.get('regional', `/lol/match/v5/matches/${id}`);
        if (!match) continue;
        const me = match.info.participants.find((p) => p.puuid === puuid);
        if (!me || match.info.gameDuration < 300) { cache[key] = { skip: true }; continue; }
        cache[key] = {
          champ: champId(me.championName), pos: POS[me.teamPosition] || null, win: me.win,
          queue: match.info.queueId, at: match.info.gameStartTimestamp,
          // 공개 저장소에 남는 파일이라 다른 사람의 식별자는 저장하지 않고 팀원 수만 센다
          withMembers: match.info.participants.filter((p) => p.teamId === me.teamId && p.puuid !== puuid && memberPuuids.has(p.puuid)).length,
        };
      }
      if (cache[key].mates) { // 이전 형식 정리
        cache[key].withMembers = cache[key].mates.filter((x) => memberPuuids.has(x)).length;
        delete cache[key].mates;
      }
      if (!cache[key].skip) games.push(cache[key]);
    }

    const byChamp = new Map();
    const roles = {};
    for (const g of games) {
      const c = byChamp.get(g.champ) || { champ: g.champ, games: 0, wins: 0, pos: {} };
      c.games += 1; if (g.win) c.wins += 1;
      if (g.pos) { const v = c.pos[g.pos] || (c.pos[g.pos] = [0, 0]); v[0] += 1; if (g.win) v[1] += 1; }
      byChamp.set(g.champ, c);
      if (g.pos) roles[g.pos] = (roles[g.pos] || 0) + 1;
    }
    const mainRole = Object.entries(roles).sort((a, b) => b[1] - a[1])[0]?.[0] || null;
    out.push({
      riotId: `${acc.gameName}#${acc.tagLine}`,
      puuid,
      mainRole,
      roles,
      games: games.length,
      champs: [...byChamp.values()].sort((a, b) => b.games - a.games),
      mastery: mastery.map((x) => ({ championId: x.championId, points: x.championPoints, level: x.championLevel })),
      recent: games,
    });
    log(`팀원 ${m.riotId}: 경기 ${games.length}판, 주 포지션 ${mainRole}`);
  }

  // 팀원끼리 같은 팀으로 뛴 경기(자유 랭크 함께 한 판) 집계
  for (const m of out) {
    if (!m.recent) continue;
    m.withTeam = m.recent.filter((g) => g.withMembers > 0).length;
  }
  const publicOut = out.map(({ recent, puuid, ...rest }) => rest); // puuid·경기 목록은 공개 파일에 넣지 않는다

  await writeJson('data/raw/member-matches.json', cache);
  await writeJson('data/team.json', { updatedAt: new Date().toISOString(), members: publicOut }, true);
  return publicOut;
}

// ---------- 메타 ----------
function bump(obj, key, win) {
  const v = obj[key] || (obj[key] = [0, 0]);
  v[0] += 1; if (win) v[1] += 1;
}

export function addMatch(raw, match) {
  const info = match.info;
  if (info.gameDuration < 300 || info.queueId !== 420) return false;
  const patch = patchOf(info.gameVersion);
  const b = raw.patches[patch] || (raw.patches[patch] = { games: 0, champs: {}, bans: {}, matchups: {}, duos: {} });
  b.games += 1;
  for (const t of info.teams) for (const ban of t.bans || []) {
    if (ban.championId > 0) b.bans[ban.championId] = (b.bans[ban.championId] || 0) + 1;
  }
  const byTeamPos = {};
  for (const p of info.participants) {
    const pos = POS[p.teamPosition];
    if (!pos) continue;
    const id = champId(p.championName);
    const c = b.champs[id] || (b.champs[id] = { key: p.championId });
    bump(c, pos, p.win);
    byTeamPos[`${p.teamId}:${pos}`] = { id, win: p.win };
  }
  for (const pos of Object.values(POS)) {
    const a = byTeamPos[`100:${pos}`], c = byTeamPos[`200:${pos}`];
    if (!a || !c) continue;
    const mp = b.matchups[pos] || (b.matchups[pos] = {});
    bump(mp[a.id] || (mp[a.id] = {}), c.id, a.win);
    bump(mp[c.id] || (mp[c.id] = {}), a.id, c.win);
  }
  for (const team of ['100', '200']) {
    const ad = byTeamPos[`${team}:adc`], sp = byTeamPos[`${team}:support`];
    if (ad && sp) bump(b.duos, `${ad.id}|${sp.id}`, ad.win);
  }
  return true;
}

export function buildMeta(raw, keepPatches) {
  const patches = Object.keys(raw.patches).sort((a, b) => {
    const [a1, a2] = a.split('.').map(Number), [b1, b2] = b.split('.').map(Number);
    return b1 - a1 || b2 - a2;
  }).slice(0, keepPatches);
  const champs = {}, matchups = {}, duos = {};
  let games = 0;
  const keyToId = {};
  for (const pt of patches) {
    const b = raw.patches[pt];
    games += b.games;
    for (const [id, c] of Object.entries(b.champs)) {
      keyToId[c.key] = id;
      const o = champs[id] || (champs[id] = { pos: {}, bans: 0 });
      for (const pos of Object.values(POS)) if (c[pos]) {
        const v = o.pos[pos] || (o.pos[pos] = [0, 0]);
        v[0] += c[pos][0]; v[1] += c[pos][1];
      }
    }
    for (const [key, n] of Object.entries(b.bans)) {
      const id = keyToId[key] || Object.entries(b.champs).find(([, c]) => String(c.key) === key)?.[0];
      if (!id) continue;
      (champs[id] || (champs[id] = { pos: {}, bans: 0 })).bans += n;
    }
    for (const [pos, m] of Object.entries(b.matchups)) {
      const mp = matchups[pos] || (matchups[pos] = {});
      for (const [a, vs] of Object.entries(m)) for (const [c, [g, w]] of Object.entries(vs)) {
        const v = (mp[a] || (mp[a] = {}))[c] || (mp[a][c] = [0, 0]);
        v[0] += g; v[1] += w;
      }
    }
    for (const [k, [g, w]] of Object.entries(b.duos)) {
      const v = duos[k] || (duos[k] = [0, 0]);
      v[0] += g; v[1] += w;
    }
  }
  // 표본이 너무 적은 상성은 파일 크기만 늘리므로 뺀다
  for (const mp of Object.values(matchups)) for (const [a, vs] of Object.entries(mp)) {
    for (const [c, [g]] of Object.entries(vs)) if (g < 3) delete vs[c];
    if (!Object.keys(vs).length) delete mp[a];
  }
  for (const [k, [g]] of Object.entries(duos)) if (g < 3) delete duos[k];
  return { updatedAt: new Date().toISOString(), source: 'KR 솔로 랭크 상위권(Riot API)', patches, games, champs, matchups, duos };
}

export async function collectMeta(api, cfg) {
  const mc = cfg.meta;
  const raw = await readJson('data/raw/meta-raw.json', { patches: {}, seen: [] });
  const seen = new Set(raw.seen);

  const players = [];
  for (const tier of mc.tiers) {
    const path_ = `/lol/league/v4/${tier}leagues/by-queue/RANKED_SOLO_5x5`;
    const league = await api.get('platform', path_);
    for (const e of league?.entries || []) if (e.puuid) players.push(e.puuid);
  }
  log(`상위권 플레이어 ${players.length}명 확인`);
  // 매번 다른 사람을 고르도록 무작위로 섞는다
  for (let i = players.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [players[i], players[j]] = [players[j], players[i]];
  }

  let added = 0;
  outer: for (const puuid of players.slice(0, mc.playersPerRun)) {
    const ids = (await api.get('regional', `/lol/match/v5/matches/by-puuid/${puuid}/ids?queue=420&start=0&count=${mc.matchesPerPlayer}`)) || [];
    for (const id of ids) {
      if (seen.has(id)) continue;
      seen.add(id);
      const match = await api.get('regional', `/lol/match/v5/matches/${id}`);
      if (match && addMatch(raw, match)) added += 1;
      if (added >= mc.maxNewMatchesPerRun) break outer;
    }
  }

  // 오래된 패치는 버린다
  const keep = Object.keys(raw.patches).sort((a, b) => {
    const [a1, a2] = a.split('.').map(Number), [b1, b2] = b.split('.').map(Number);
    return b1 - a1 || b2 - a2;
  }).slice(0, mc.keepPatches + 1);
  for (const k of Object.keys(raw.patches)) if (!keep.includes(k)) delete raw.patches[k];
  raw.seen = [...seen].slice(-30000);

  await writeJson('data/raw/meta-raw.json', raw);
  const meta = buildMeta(raw, mc.keepPatches);
  await writeJson('data/meta.json', meta);
  log(`새 경기 ${added}판 추가, 누적 ${meta.games}판 (패치 ${meta.patches.join(', ')})`);
  return meta;
}

async function main() {
  if (!KEY) {
    console.error('RIOT_API_KEY 환경 변수가 없습니다. https://developer.riotgames.com 에서 키를 받아 넣어 주세요.');
    process.exit(2);
  }
  const cfg = await readJson('config/team.json', null);
  if (!cfg) { console.error('config/team.json 이 없습니다.'); process.exit(2); }
  const args = process.argv.slice(2);
  const all = !args.includes('--members') && !args.includes('--meta');
  const api = makeClient(cfg.region);
  try {
    if (all || args.includes('--members')) await collectMembers(api, cfg);
    if (all || args.includes('--meta')) await collectMeta(api, cfg);
    log(`완료. API 요청 ${api.count}회`);
  } catch (e) {
    console.error(e instanceof RiotError ? e.message : e);
    process.exit(1);
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
