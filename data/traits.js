// 조합 규칙용 챔피언 특성 표. 통계가 아니라 널리 알려진 성향을 손으로 분류한 것이다.
// 틀린 분류가 있으면 이 파일만 고치면 된다. id 는 Data Dragon 영문 id.
//
// dive     : 돌진기·순간이동으로 후방을 파고드는 챔피언(암살자, 돌진형 전사)
// antidive : 돌진을 끊거나 아군을 지키는 기술이 있는 챔피언
// engage   : 한타를 강제로 여는 이니시에이터
// tankshred: 체력 비례·고정 피해로 탱커를 잘 녹이는 챔피언
// poke     : 멀리서 견제하는 포킹 챔피언
// pick     : 한 명을 묶어 끊어먹는 데 강한 챔피언(긴 사거리 CC, 기습)
// split    : 혼자 사이드 라인을 밀며 1대1을 이기는 챔피언
// protect  : 아군 캐리를 지키는 보호·회복형 서포터
// hypercarry: 성장하면 한타를 혼자 책임지는 후반 캐리
// aoe      : 이니시 뒤에 광역 피해·광역 CC로 한타를 터뜨리는 챔피언
// early    : 초반 라인전·교전이 강하고 후반에 힘이 빠지는 챔피언
// late     : 후반으로 갈수록 강해지는 챔피언(hypercarry 포함으로 본다)
// hook     : 그랩·긴 사거리 단일 CC로 한 명을 끌어오거나 묶어 시작하는 서포터
// slippery : 이동기·주문 방어막으로 그랩을 피하기 쉬운 원딜
// immobile : 이동기가 없어 그랩에 잘 걸리는 원딜
// spellshield: 아군을 CC 면역으로 지키는 서포터(그랩 상대로 강함)
// cc       : 확실한 하드 CC(기절·속박·에어본 등)가 있는 챔피언. Riot 클라이언트 CC 등급(data/champ-attrs.json)이 있으면 그쪽을 우선한다.
export const TRAITS = {
  dive: [
    'Akali', 'Ahri', 'Ambessa', 'Belveth', 'Briar', 'Camille', 'Diana', 'Ekko', 'Evelynn', 'Fizz',
    'Gwen', 'Hecarim', 'Irelia', 'JarvanIV', 'Jax', 'Kassadin', 'Katarina', 'Kayn', 'Khazix', 'Leblanc',
    'LeeSin', 'MonkeyKing', 'Naafiri', 'Nidalee', 'Nocturne', 'Pantheon', 'Qiyana', 'Rengar', 'Riven',
    'Samira', 'Talon', 'Vi', 'Viego', 'XinZhao', 'Yasuo', 'Yone', 'Zed',
  ],
  antidive: [
    'Alistar', 'Anivia', 'Annie', 'Braum', 'Cassiopeia', 'Gragas', 'Janna', 'Lissandra', 'Lulu',
    'Malzahar', 'Maokai', 'Milio', 'Morgana', 'Poppy', 'Rammus', 'Renata', 'Taliyah', 'Vex', 'Zilean',
  ],
  engage: [
    'Alistar', 'Amumu', 'Blitzcrank', 'Diana', 'Galio', 'Gragas', 'Hecarim', 'JarvanIV', 'Kennen', 'Kled',
    'Leona', 'Lissandra', 'Malphite', 'Maokai', 'MonkeyKing', 'Nautilus', 'Nunu', 'Ornn', 'Rakan',
    'Rammus', 'Rell', 'Sejuani', 'Sion', 'Skarner', 'Thresh', 'Vi', 'Zac',
  ],
  tankshred: [
    'Belveth', 'Brand', 'Camille', 'Cassiopeia', 'Chogath', 'Darius', 'Fiora', 'Gnar', 'Gwen', 'KogMaw',
    'Lillia', 'MasterYi', 'Mordekaiser', 'Olaf', 'Trundle', 'Varus', 'Vayne', 'Viego',
  ],
  poke: [
    'Caitlyn', 'Corki', 'Ezreal', 'Hwei', 'Jayce', 'Karma', 'Lux', 'Nidalee', 'Varus', 'Velkoz',
    'Xerath', 'Ziggs', 'Zoe',
  ],
  pick: [
    'Ahri', 'Ashe', 'Bard', 'Blitzcrank', 'Elise', 'Evelynn', 'Jhin', 'Leblanc', 'Lux', 'Morgana', 'Nautilus',
    'Neeko', 'Nocturne', 'Pyke', 'Rengar', 'Thresh', 'TwistedFate', 'Varus', 'Zoe',
  ],
  split: [
    'Camille', 'Fiora', 'Gwen', 'Illaoi', 'Jax', 'Kayle', 'Nasus', 'Quinn', 'Riven', 'Shen', 'Trundle',
    'Tryndamere', 'Yorick',
  ],
  protect: [
    'Braum', 'Ivern', 'Janna', 'Karma', 'Lulu', 'Milio', 'Nami', 'Renata', 'Seraphine', 'Sona', 'Soraka',
    'Taric', 'Yuumi', 'Zilean',
  ],
  hypercarry: [
    'Aphelios', 'Jinx', 'Kaisa', 'Kayle', 'KogMaw', 'Smolder', 'Twitch', 'Vayne', 'Xayah', 'Zeri',
  ],
  aoe: [
    'Amumu', 'Annie', 'Diana', 'Fiddlesticks', 'Galio', 'Kennen', 'Malphite', 'MissFortune', 'MonkeyKing',
    'Orianna', 'Rumble', 'Seraphine', 'Sona', 'Yasuo',
  ],
  early: [
    'Darius', 'Draven', 'Elise', 'JarvanIV', 'Jayce', 'Kalista', 'LeeSin', 'Leblanc', 'Lucian', 'Nidalee',
    'Olaf', 'Pantheon', 'Renekton', 'Rengar', 'Talon', 'XinZhao', 'Pyke', 'Leona', 'Draven', 'Graves', 'Kled',
  ],
  late: [
    'Aphelios', 'AurelionSol', 'Azir', 'Cassiopeia', 'Jinx', 'Kaisa', 'Kassadin', 'Kayle', 'KogMaw', 'Nasus',
    'Senna', 'Smolder', 'Twitch', 'Vayne', 'Veigar', 'Viktor', 'Vladimir', 'Xayah', 'Zeri', 'Ryze',
  ],
  hook: ['Blitzcrank', 'Thresh', 'Nautilus', 'Pyke', 'Morgana', 'Bard', 'Lux', 'Zyra', 'Neeko'],
  slippery: ['Ezreal', 'Sivir', 'Kalista', 'Lucian', 'Vayne', 'Tristana', 'Samira', 'Xayah', 'Zeri', 'Corki', 'Kaisa', 'Graves', 'Nilah'],
  immobile: ['Jhin', 'Aphelios', 'Jinx', 'Ashe', 'KogMaw', 'Varus', 'MissFortune', 'Senna', 'Caitlyn', 'Ziggs', 'Twitch', 'Swain'],
  spellshield: ['Morgana', 'Sivir'],
  cc: [
    'Alistar', 'Amumu', 'Annie', 'Ashe', 'Blitzcrank', 'Braum', 'Galio', 'Gragas', 'JarvanIV', 'Kennen',
    'Leona', 'Lissandra', 'Malphite', 'Maokai', 'Morgana', 'Nautilus', 'Neeko', 'Nunu', 'Ornn', 'Poppy', 'Rakan',
    'Rammus', 'Rell', 'Sejuani', 'Sion', 'Skarner', 'Taric', 'Thresh', 'TwistedFate', 'Veigar', 'Vi', 'Zac',
    'Zyra', 'Lux', 'Xerath', 'Varus', 'Vex', 'Annie', 'Pantheon', 'Jax', 'Warwick', 'Volibear', 'Udyr',
  ],
};

// 조합 색깔. 각 색깔에 기여하는 특성과 이름.
export const IDENTITIES = {
  engage: { label: '한타 이니시형', traits: ['engage', 'aoe'] },
  dive: { label: '돌진형', traits: ['dive'] },
  poke: { label: '포킹·공성형', traits: ['poke'] },
  protect: { label: '캐리 보호형', traits: ['protect', 'hypercarry'] },
  split: { label: '스플릿형', traits: ['split'] },
  pick: { label: '끊어먹기형', traits: ['pick'] },
};

export const TRAIT_SETS = Object.fromEntries(Object.entries(TRAITS).map(([k, v]) => [k, new Set(v)]));
