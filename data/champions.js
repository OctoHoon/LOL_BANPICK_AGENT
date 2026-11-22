// 챔피언 기본 표.
// 1) Data Dragon(Riot 공식 정적 데이터)을 못 불러올 때 쓰는 오프라인 예비 목록이다.
// 2) Data Dragon을 불러와도 피해 유형(AD/AP)과 앞라인 여부는 이 표를 우선한다.
//    Data Dragon에는 이 두 정보가 없어서 info 수치로 추정하는데, 추정이 틀리는 챔피언이 많기 때문이다.
// 형식: 영문 id | 한국어 이름 | 역할 태그 | 주 피해 유형(AD/AP) | 앞라인 가능(1/0)
// 피해 유형과 앞라인 여부는 조합 균형을 대략 보기 위한 수동 분류이며 공식 데이터가 아니다.
const RAW = `
Aatrox|아트록스|Fighter,Tank|AD|1
Ahri|아리|Mage,Assassin|AP|0
Akali|아칼리|Assassin|AP|0
Akshan|아크샨|Marksman,Assassin|AD|0
Alistar|알리스타|Tank,Support|AP|1
Ambessa|암베사|Fighter,Assassin|AD|0
Amumu|아무무|Tank,Mage|AP|1
Anivia|애니비아|Mage,Support|AP|0
Annie|애니|Mage|AP|0
Aphelios|아펠리오스|Marksman|AD|0
Ashe|애쉬|Marksman,Support|AD|0
AurelionSol|아우렐리온 솔|Mage|AP|0
Aurora|오로라|Mage,Assassin|AP|0
Azir|아지르|Mage,Marksman|AP|0
Bard|바드|Support,Mage|AP|0
Belveth|벨베스|Fighter|AD|0
Blitzcrank|블리츠크랭크|Tank,Fighter|AP|1
Brand|브랜드|Mage|AP|0
Braum|브라움|Support,Tank|AP|1
Briar|브라이어|Fighter,Assassin|AD|0
Caitlyn|케이틀린|Marksman|AD|0
Camille|카밀|Fighter,Tank|AD|0
Cassiopeia|카시오페아|Mage|AP|0
Chogath|초가스|Tank,Mage|AP|1
Corki|코르키|Marksman|AD|0
Darius|다리우스|Fighter,Tank|AD|1
Diana|다이애나|Fighter,Mage|AP|0
Draven|드레이븐|Marksman|AD|0
DrMundo|문도 박사|Fighter,Tank|AD|1
Ekko|에코|Assassin,Fighter|AP|0
Elise|엘리스|Mage,Fighter|AP|0
Evelynn|이블린|Assassin,Mage|AP|0
Ezreal|이즈리얼|Marksman,Mage|AD|0
Fiddlesticks|피들스틱|Mage,Support|AP|0
Fiora|피오라|Fighter,Assassin|AD|0
Fizz|피즈|Assassin,Fighter|AP|0
Galio|갈리오|Tank,Mage|AP|1
Gangplank|갱플랭크|Fighter|AD|0
Garen|가렌|Fighter,Tank|AD|1
Gnar|나르|Fighter,Tank|AD|1
Gragas|그라가스|Fighter,Mage|AP|1
Graves|그레이브즈|Marksman|AD|0
Gwen|그웬|Fighter,Assassin|AP|0
Hecarim|헤카림|Fighter,Tank|AD|1
Heimerdinger|하이머딩거|Mage,Support|AP|0
Hwei|흐웨이|Mage,Support|AP|0
Illaoi|일라오이|Fighter,Tank|AD|1
Irelia|이렐리아|Fighter,Assassin|AD|0
Ivern|아이번|Support,Mage|AP|0
Janna|잔나|Support,Mage|AP|0
JarvanIV|자르반 4세|Tank,Fighter|AD|1
Jax|잭스|Fighter,Assassin|AD|0
Jayce|제이스|Fighter,Marksman|AD|0
Jhin|진|Marksman,Mage|AD|0
Jinx|징크스|Marksman|AD|0
Kaisa|카이사|Marksman|AD|0
Kalista|칼리스타|Marksman|AD|0
Karma|카르마|Mage,Support|AP|0
Karthus|카서스|Mage|AP|0
Kassadin|카사딘|Assassin,Mage|AP|0
Katarina|카타리나|Assassin,Mage|AP|0
Kayle|케일|Fighter,Support|AP|0
Kayn|케인|Fighter,Assassin|AD|0
Kennen|케넨|Mage|AP|0
Khazix|카직스|Assassin|AD|0
Kindred|킨드레드|Marksman|AD|0
Kled|클레드|Fighter,Tank|AD|0
KogMaw|코그모|Marksman,Mage|AD|0
KSante|크산테|Tank,Fighter|AD|1
Leblanc|르블랑|Assassin,Mage|AP|0
LeeSin|리 신|Fighter,Assassin|AD|0
Leona|레오나|Tank,Support|AP|1
Lillia|릴리아|Fighter,Mage|AP|0
Lissandra|리산드라|Mage|AP|0
Lucian|루시안|Marksman|AD|0
Lulu|룰루|Support,Mage|AP|0
Lux|럭스|Mage,Support|AP|0
Malphite|말파이트|Tank,Fighter|AP|1
Malzahar|말자하|Mage,Assassin|AP|0
Maokai|마오카이|Tank,Mage|AP|1
MasterYi|마스터 이|Assassin,Fighter|AD|0
Mel|멜|Mage,Support|AP|0
Milio|밀리오|Support,Mage|AP|0
MissFortune|미스 포츈|Marksman|AD|0
MonkeyKing|오공|Fighter,Tank|AD|1
Mordekaiser|모데카이저|Fighter,Mage|AP|1
Morgana|모르가나|Mage,Support|AP|0
Naafiri|나피리|Assassin|AD|0
Nami|나미|Support,Mage|AP|0
Nasus|나서스|Fighter,Tank|AD|1
Nautilus|노틸러스|Tank,Support|AP|1
Neeko|니코|Mage,Support|AP|0
Nidalee|니달리|Assassin,Mage|AP|0
Nilah|닐라|Fighter,Assassin|AD|0
Nocturne|녹턴|Assassin,Fighter|AD|0
Nunu|누누와 윌럼프|Tank,Mage|AP|1
Olaf|올라프|Fighter,Tank|AD|1
Orianna|오리아나|Mage,Support|AP|0
Ornn|오른|Tank,Fighter|AD|1
Pantheon|판테온|Fighter,Assassin|AD|0
Poppy|뽀삐|Tank,Fighter|AD|1
Pyke|파이크|Support,Assassin|AD|0
Qiyana|키아나|Assassin,Fighter|AD|0
Quinn|퀸|Marksman,Assassin|AD|0
Rakan|라칸|Support|AP|0
Rammus|람머스|Tank,Fighter|AP|1
RekSai|렉사이|Fighter|AD|0
Rell|렐|Tank,Support|AP|1
Renata|레나타 글라스크|Support,Mage|AP|0
Renekton|레넥톤|Fighter,Tank|AD|1
Rengar|렝가|Assassin,Fighter|AD|0
Riven|리븐|Fighter,Assassin|AD|0
Rumble|럼블|Fighter,Mage|AP|0
Ryze|라이즈|Mage,Fighter|AP|0
Samira|사미라|Marksman|AD|0
Sejuani|세주아니|Tank,Fighter|AP|1
Senna|세나|Support,Marksman|AD|0
Seraphine|세라핀|Mage,Support|AP|0
Sett|세트|Fighter,Tank|AD|1
Shaco|샤코|Assassin|AD|0
Shen|쉔|Tank|AP|1
Shyvana|쉬바나|Fighter,Tank|AP|1
Singed|신지드|Tank,Mage|AP|1
Sion|사이온|Tank,Fighter|AD|1
Sivir|시비르|Marksman|AD|0
Skarner|스카너|Tank,Fighter|AD|1
Smolder|스몰더|Marksman,Mage|AD|0
Sona|소나|Support,Mage|AP|0
Soraka|소라카|Support,Mage|AP|0
Swain|스웨인|Mage,Fighter|AP|1
Sylas|사일러스|Mage,Assassin|AP|0
Syndra|신드라|Mage|AP|0
TahmKench|탐 켄치|Tank,Support|AP|1
Taliyah|탈리야|Mage,Support|AP|0
Talon|탈론|Assassin|AD|0
Taric|타릭|Support,Fighter|AP|1
Teemo|티모|Marksman,Assassin|AP|0
Thresh|쓰레쉬|Support,Fighter|AP|1
Tristana|트리스타나|Marksman,Assassin|AD|0
Trundle|트런들|Fighter,Tank|AD|1
Tryndamere|트린다미어|Fighter,Assassin|AD|0
TwistedFate|트위스티드 페이트|Mage|AP|0
Twitch|트위치|Marksman,Assassin|AD|0
Udyr|우디르|Fighter,Tank|AP|1
Urgot|우르곳|Fighter,Tank|AD|1
Varus|바루스|Marksman,Mage|AD|0
Vayne|베인|Marksman,Assassin|AD|0
Veigar|베이가|Mage|AP|0
Velkoz|벨코즈|Mage|AP|0
Vex|벡스|Mage|AP|0
Vi|바이|Fighter,Assassin|AD|0
Viego|비에고|Assassin,Fighter|AD|0
Viktor|빅토르|Mage|AP|0
Vladimir|블라디미르|Mage,Fighter|AP|0
Volibear|볼리베어|Fighter,Tank|AD|1
Warwick|워윅|Fighter,Tank|AD|1
Xayah|자야|Marksman|AD|0
Xerath|제라스|Mage|AP|0
XinZhao|신 짜오|Fighter,Assassin|AD|0
Yasuo|야스오|Fighter,Assassin|AD|0
Yone|요네|Assassin,Fighter|AD|0
Yorick|요릭|Fighter,Tank|AD|0
Yunara|유나라|Marksman|AD|0
Yuumi|유미|Support,Mage|AP|0
Zac|자크|Tank,Fighter|AP|1
Zed|제드|Assassin|AD|0
Zeri|제리|Marksman|AD|0
Ziggs|직스|Mage|AP|0
Zilean|질리언|Support,Mage|AP|0
Zoe|조이|Mage,Support|AP|0
Zyra|자이라|Mage,Support|AP|0
`;

export const BASE_CHAMPIONS = RAW.trim().split('\n').map((line) => {
  const [id, name, tags, dmg, front] = line.split('|');
  return { id, name, tags: tags.split(','), dmg, front: front === '1' };
});
