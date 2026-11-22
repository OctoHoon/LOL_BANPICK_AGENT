// Vercel 서버 함수: Riot ID로 챔피언 숙련도 상위 목록을 돌려준다.
// API 키는 브라우저에 노출하면 안 되므로 서버 환경 변수 RIOT_API_KEY 로만 읽는다.
// 주의: 이 파일은 실제 Riot 서버와 키로 시험하지 못했다. 배포 후 첫 호출 결과를 확인해야 한다.

const ACCOUNT_HOST = 'https://asia.api.riotgames.com'; // 한국 계정은 asia 라우팅
const PLATFORM_HOST = 'https://kr.api.riotgames.com';  // 한국 서버

export default async function handler(req, res) {
  const key = process.env.RIOT_API_KEY;
  if (!key) {
    res.status(503).json({ error: '서버에 RIOT_API_KEY 가 설정되지 않았습니다.' });
    return;
  }
  const riotId = String(req.query.riotId || '');
  const [gameName, tagLine] = riotId.split('#');
  if (!gameName || !tagLine) {
    res.status(400).json({ error: 'Riot ID는 이름#태그 형식이어야 합니다.' });
    return;
  }

  const headers = { 'X-Riot-Token': key };
  try {
    const acc = await fetch(
      `${ACCOUNT_HOST}/riot/account/v1/accounts/by-riot-id/${encodeURIComponent(gameName)}/${encodeURIComponent(tagLine)}`,
      { headers },
    );
    if (acc.status === 404) { res.status(404).json({ error: '해당 Riot ID를 찾지 못했습니다.' }); return; }
    if (acc.status === 429) { res.status(429).json({ error: '요청이 많습니다. 잠시 뒤 다시 시도하세요.' }); return; }
    if (!acc.ok) { res.status(502).json({ error: `계정 조회 실패 (${acc.status}). API 키 만료 여부를 확인하세요.` }); return; }
    const { puuid } = await acc.json();

    const mas = await fetch(
      `${PLATFORM_HOST}/lol/champion-mastery/v4/champion-masteries/by-puuid/${puuid}/top?count=15`,
      { headers },
    );
    if (!mas.ok) { res.status(502).json({ error: `숙련도 조회 실패 (${mas.status})` }); return; }
    const list = await mas.json();

    res.setHeader('Cache-Control', 's-maxage=3600');
    res.status(200).json({
      champions: list.map((m) => ({ championId: m.championId, points: m.championPoints, level: m.championLevel })),
    });
  } catch (e) {
    res.status(500).json({ error: `Riot API 호출 중 오류: ${e.message}` });
  }
}
