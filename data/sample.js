// 처음 열었을 때 보여 주는 예시 팀. 실제 사람이나 통계와 무관하다.
export const SAMPLE_TEAM = {
  side: 'blue',
  format: 'ranked',
  members: [
    { id: 'm1', name: '팀원A', riotId: '', role: 'top', hates: ['Fiora', 'Teemo'],
      pool: [{ champ: 'Ornn', tier: 1 }, { champ: 'KSante', tier: 1 }, { champ: 'Renekton', tier: 2 }, { champ: 'Gnar', tier: 3 }] },
    { id: 'm2', name: '팀원B', riotId: '', role: 'jungle', hates: ['Khazix'],
      pool: [{ champ: 'LeeSin', tier: 1, games: 24, wins: 14 }, { champ: 'Vi', tier: 1 }, { champ: 'Sejuani', tier: 2 }, { champ: 'Viego', tier: 3 }] },
    { id: 'm3', name: '팀원C', riotId: '', role: 'mid', hates: ['Yasuo', 'Zed'],
      pool: [{ champ: 'Ahri', tier: 1, games: 30, wins: 17 }, { champ: 'Orianna', tier: 1 }, { champ: 'Sylas', tier: 2 }, { champ: 'Galio', tier: 2 }] },
    { id: 'm4', name: '팀원D', riotId: '', role: 'adc', hates: ['Draven'],
      pool: [{ champ: 'Jinx', tier: 1 }, { champ: 'Kaisa', tier: 1, games: 18, wins: 7 }, { champ: 'Ezreal', tier: 2 }, { champ: 'Varus', tier: 3 }] },
    { id: 'm5', name: '팀원E', riotId: '', role: 'support', hates: ['Blitzcrank'],
      pool: [{ champ: 'Nautilus', tier: 1 }, { champ: 'Thresh', tier: 1 }, { champ: 'Lulu', tier: 2 }, { champ: 'Galio', tier: 3 }] },
  ],
  // 예시 경계 목록. 메타 통계가 아니며 직접 고쳐 쓰는 칸이다.
  threats: ['Yone', 'Kalista', 'Aurora', 'Skarner', 'Rell'],
};
