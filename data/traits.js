// 조합 규칙용 챔피언 특성 표. 통계가 아니라 널리 알려진 성향을 손으로 분류한 것이다.
// 틀린 분류가 있으면 이 파일만 고치면 된다. id 는 Data Dragon 영문 id.
//
// dive     : 돌진기·순간이동으로 후방을 파고드는 챔피언(암살자, 돌진형 전사)
// antidive : 돌진을 끊거나 아군을 지키는 기술이 있는 챔피언
// engage   : 한타를 강제로 여는 이니시에이터
// tankshred: 체력 비례·고정 피해로 탱커를 잘 녹이는 챔피언
// poke     : 멀리서 견제하는 포킹 챔피언
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
};

export const TRAIT_SETS = Object.fromEntries(Object.entries(TRAITS).map(([k, v]) => [k, new Set(v)]));
