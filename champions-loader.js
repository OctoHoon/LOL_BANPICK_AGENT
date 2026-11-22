// Data Dragon(Riot 공식 정적 데이터)에서 최신 챔피언 목록과 한국어 이름, 초상화를 불러온다.
// 실패하면 data/champions.js 의 예비 목록으로 동작한다.
import { BASE_CHAMPIONS } from './data/champions.js';

const DD = 'https://ddragon.leagueoflegends.com';
const CACHE_KEY = 'banpick.champions.v1';

function derive(c) {
  // 예비 표에 없는 신규 챔피언은 info 수치로 대략 추정한다.
  const dmg = (c.info?.magic ?? 0) > (c.info?.attack ?? 0) ? 'AP' : 'AD';
  const front = c.tags?.[0] === 'Tank' || (c.info?.defense ?? 0) >= 7;
  return { dmg, front, estimated: true };
}

export async function loadChampions() {
  const base = new Map(BASE_CHAMPIONS.map((c) => [c.id, c]));
  try {
    const vRes = await fetch(`${DD}/api/versions.json`, { signal: AbortSignal.timeout(6000) });
    const version = (await vRes.json())[0];

    let raw = null;
    try {
      const cached = JSON.parse(localStorage.getItem(CACHE_KEY) || 'null');
      if (cached?.version === version) raw = cached.data;
    } catch { /* 저장소를 못 쓰면 매번 받는다 */ }
    if (!raw) {
      const res = await fetch(`${DD}/cdn/${version}/data/ko_KR/champion.json`, { signal: AbortSignal.timeout(8000) });
      raw = (await res.json()).data;
      try { localStorage.setItem(CACHE_KEY, JSON.stringify({ version, data: raw })); } catch { /* 무시 */ }
    }

    const list = Object.values(raw).map((c) => {
      const b = base.get(c.id);
      return {
        id: c.id,
        key: c.key,
        name: c.name,
        tags: c.tags,
        ...(b ? { dmg: b.dmg, front: b.front } : derive(c)),
        img: `${DD}/cdn/${version}/img/champion/${c.image.full}`,
      };
    });
    list.sort((a, b) => a.name.localeCompare(b.name, 'ko'));
    return { list, source: `Data Dragon ${version}` };
  } catch {
    const list = [...BASE_CHAMPIONS].sort((a, b) => a.name.localeCompare(b.name, 'ko'));
    return { list, source: '오프라인 예비 목록(일부 신규 챔피언 없음)' };
  }
}
