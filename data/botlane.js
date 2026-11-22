// 널리 알려진 바텀 듀오 궁합. 통계가 아니라 커뮤니티에서 오래 통용된 조합을 손으로 적은 것이다.
// 상위권 통계(meta.json 의 duos)가 쌓이면 그쪽이 실제 승률로 따로 반영된다. 틀리면 이 파일만 고친다.
// [원딜 id, 서포터 id, 이유]
export const FAMOUS_DUOS = [
  ['Lucian', 'Nami', '나미 E 강화가 루시안 연속 평타에 잘 붙음'],
  ['Lucian', 'Braum', '루시안 평타로 브라움 패시브 기절이 빨리 쌓임'],
  ['Xayah', 'Rakan', '전용 상호작용(함께 귀환, 긴 진입 거리)'],
  ['Draven', 'Leona', '초반 올인 라인전'],
  ['Draven', 'Nautilus', '초반 올인 라인전'],
  ['Draven', 'Thresh', '초반 올인 라인전'],
  ['Samira', 'Nautilus', 'CC로 사미라 스타일 등급을 빨리 채움'],
  ['Samira', 'Rell', 'CC로 사미라 스타일 등급을 빨리 채움'],
  ['Samira', 'Leona', 'CC로 사미라 스타일 등급을 빨리 채움'],
  ['Kaisa', 'Nautilus', '노틸러스 CC 뒤 카이사 궁 진입'],
  ['Kaisa', 'Leona', '레오나 CC 뒤 카이사 궁 진입'],
  ['Caitlyn', 'Lux', '속박한 상대에 덫 연계'],
  ['Caitlyn', 'Morgana', '속박한 상대에 덫 연계'],
  ['Caitlyn', 'Karma', '긴 사거리 포킹 라인'],
  ['Ezreal', 'Karma', '긴 사거리 포킹 라인'],
  ['MissFortune', 'Leona', 'CC 뒤 미스 포츈 궁 광역 피해'],
  ['MissFortune', 'Amumu', 'CC 뒤 미스 포츈 궁 광역 피해'],
  ['KogMaw', 'Lulu', '보호·강화로 코그모 후반 캐리'],
  ['Jinx', 'Lulu', '보호·강화로 징크스 후반 캐리'],
  ['Twitch', 'Yuumi', '은신 기습에 유미가 함께 들어감'],
  ['Zeri', 'Yuumi', '기동성 원딜에 유미가 붙어 다님'],
  ['Jhin', 'Morgana', '속박한 상대에 진 W 연계'],
  ['Ashe', 'Sona', '둘 다 긴 사거리 견제와 광역 지원'],
];

export const DUO_MAP = new Map(FAMOUS_DUOS.map(([a, s, why]) => [`${a}|${s}`, why]));

// 널리 알려진 미드·정글 궁합. [미드 id, 정글 id, 이유]
export const FAMOUS_MIDJG = [
  ['Orianna', 'JarvanIV', '진입하는 자르반에 공을 붙여 궁 연계'],
  ['Orianna', 'Vi', '진입하는 바이에 공을 붙여 궁 연계'],
  ['Orianna', 'Hecarim', '돌진하는 헤카림에 공을 붙여 궁 연계'],
  ['Orianna', 'Nocturne', '궁으로 날아가는 녹턴에 공을 붙여 연계'],
  ['Orianna', 'MonkeyKing', '오공 궁과 오리아나 궁 광역 CC 연계'],
  ['TwistedFate', 'Nocturne', '둘 다 전역 궁으로 사이드 기습'],
  ['TwistedFate', 'Elise', '카드 기절 뒤 엘리스 고치 연계 갱킹'],
  ['Galio', 'Nocturne', '녹턴 궁 진입을 갈리오 궁으로 따라감'],
  ['Galio', 'Vi', '바이 궁 진입을 갈리오 궁으로 따라감'],
  ['Yasuo', 'JarvanIV', '자르반 깃발 연계 에어본으로 야스오 궁'],
  ['Yasuo', 'Gragas', '그라가스 몸통 박치기 에어본으로 야스오 궁'],
];

export const MIDJG_MAP = new Map(FAMOUS_MIDJG.map(([m, j, why]) => [`${m}|${j}`, why]));
