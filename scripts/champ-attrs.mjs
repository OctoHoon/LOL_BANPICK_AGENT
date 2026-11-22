// Riot 클라이언트가 챔피언 정보 화면에 보여 주는 성향 등급(피해·내구·CC·기동성·유틸, 1~3)을
// CommunityDragon(클라이언트 데이터 공개 사본)에서 받아 data/champ-attrs.json 으로 저장한다.
// API 키가 필요 없다. 실패하면 앱은 data/traits.js 수동 분류만 쓴다.
import fs from 'node:fs/promises';

const BASE = 'https://raw.communitydragon.org/latest/plugins/rcp-be-lol-game-data/global/default/v1';

async function get(url) {
  for (let i = 0; i < 3; i += 1) {
    try {
      const r = await fetch(url, { signal: AbortSignal.timeout(15000) });
      if (r.ok) return r.json();
      if (r.status === 404) return null;
    } catch { /* 다시 시도 */ }
    await new Promise((res) => setTimeout(res, 1000 * (i + 1)));
  }
  throw new Error(`받기 실패: ${url}`);
}

export function pickAttrs(d) {
  const p = d?.playstyleInfo;
  if (!p) return null;
  const out = { cc: p.crowdControl, mob: p.mobility, dur: p.durability, dmgR: p.damage, util: p.utility };
  const t = d.tacticalInfo?.damageType;
  if (t) out.dmgType = { kPhysical: 'AD', kMagic: 'AP', kMixed: 'MIX' }[t] || t;
  for (const k of Object.keys(out)) if (out[k] == null) delete out[k];
  return out;
}

async function main() {
  const summary = await get(`${BASE}/champion-summary.json`);
  const list = summary.filter((c) => c.id > 0);
  const champs = {};
  let shown = false;
  for (const c of list) {
    const d = await get(`${BASE}/champions/${c.id}.json`);
    if (!shown && d) { console.log('예시 필드:', c.alias, JSON.stringify({ playstyleInfo: d.playstyleInfo, tacticalInfo: d.tacticalInfo })); shown = true; }
    const a = pickAttrs(d);
    if (a) champs[c.alias] = a;
  }
  const n = Object.keys(champs).length;
  console.log(`챔피언 ${list.length}명 중 ${n}명 성향 등급 저장`);
  if (n < list.length / 2) throw new Error('등급이 있는 챔피언이 너무 적어 저장하지 않음');
  await fs.writeFile('data/champ-attrs.json', JSON.stringify({ source: 'CommunityDragon (Riot 클라이언트 데이터)', updatedAt: new Date().toISOString(), champs }) + '\n');
}

if (import.meta.url === `file://${process.argv[1]}`) main().catch((e) => { console.error(e.message); process.exit(1); });
