// 처음 열었을 때 보여 주는 팀. Riot ID는 실제 멤버이고, 라인·챔프폭은 전적 수집 전 임시 예시다.
// data/team.json 이 있으면 앱이 이 예시 대신 수집한 전적으로 채운다.
export const SAMPLE_TEAM = {
  side: 'blue',
  format: 'ranked',
  example: true,
  members: [
    { id: 'm1', name: '요이쇼또', riotId: '요이쇼또#hooon', role: 'top', hates: ['Fiora', 'Teemo'],
      pool: [{ champ: 'Ornn', tier: 1 }, { champ: 'KSante', tier: 1 }, { champ: 'Renekton', tier: 2 }, { champ: 'Gnar', tier: 3 }] },
    { id: 'm2', name: '야리야', riotId: '야리야#KR1', role: 'jungle', hates: ['Khazix'],
      pool: [{ champ: 'LeeSin', tier: 1 }, { champ: 'Vi', tier: 1 }, { champ: 'Sejuani', tier: 2 }, { champ: 'Viego', tier: 3 }] },
    { id: 'm3', name: 'Nica', riotId: 'Nica#KR1', role: 'mid', hates: ['Yasuo', 'Zed'],
      pool: [{ champ: 'Ahri', tier: 1 }, { champ: 'Orianna', tier: 1 }, { champ: 'Sylas', tier: 2 }, { champ: 'Galio', tier: 2 }] },
    { id: 'm4', name: '신동우', riotId: '신동우#KR1', role: 'adc', hates: ['Draven'],
      pool: [{ champ: 'Jinx', tier: 1 }, { champ: 'Kaisa', tier: 1 }, { champ: 'Ezreal', tier: 2 }, { champ: 'Varus', tier: 3 }] },
    { id: 'm5', name: '민트초코스무디', riotId: '민트초코스무디#1557', role: 'support', hates: ['Blitzcrank'],
      pool: [{ champ: 'Nautilus', tier: 1 }, { champ: 'Thresh', tier: 1 }, { champ: 'Lulu', tier: 2 }, { champ: 'Galio', tier: 3 }] },
  ],
  // 예시 경계 목록. 메타 통계가 아니며 직접 고쳐 쓰는 칸이다.
  threats: ['Yone', 'Kalista', 'Aurora', 'Skarner', 'Rell'],
};
