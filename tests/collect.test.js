// 가짜 Riot 서버를 띄워 수집기를 끝까지 돌려 본다. 실제 Riot 응답 형식을 흉내 낸 것이므로
// 실제 서버와의 차이는 첫 실제 실행에서 확인해야 한다.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { addMatch, buildMeta } from '../scripts/collect.mjs';

const run = promisify(execFile);
const CHAMPS = [
  ['Ornn', 516], ['LeeSin', 64], ['Ahri', 103], ['Jinx', 222], ['Nautilus', 111],
  ['Gnar', 150], ['Vi', 254], ['Orianna', 61], ['Kaisa', 145], ['Thresh', 412],
];
const POS = ['TOP', 'JUNGLE', 'MIDDLE', 'BOTTOM', 'UTILITY'];

function fakeMatch(n, puuids) {
  // 블루 = CHAMPS 0~4, 레드 = 5~9. 짝수 판은 블루 승
  const participants = CHAMPS.map(([name, key], i) => ({
    puuid: puuids[i] || `p${n}-${i}`, championName: name, championId: key,
    teamId: i < 5 ? 100 : 200, teamPosition: POS[i % 5], win: (i < 5) === (n % 2 === 0),
  }));
  return {
    info: {
      gameDuration: 1800, queueId: n % 3 === 0 ? 440 : 420, gameVersion: '15.23.123.4567', gameStartTimestamp: n,
      participants,
      teams: [{ teamId: 100, bans: [{ championId: 157 }] }, { teamId: 200, bans: [{ championId: -1 }] }],
    },
  };
}

test('라인 상성·듀오 집계', () => {
  const raw = { patches: {} };
  for (let n = 0; n < 4; n += 1) { const m = fakeMatch(n, []); m.info.queueId = 420; addMatch(raw, m); }
  const meta = buildMeta(raw, 2);
  assert.equal(meta.games, 4);
  assert.deepEqual(meta.champs.Ornn.pos.top, [4, 2]);
  assert.deepEqual(meta.matchups.top.Ornn.Gnar, [4, 2]);
  assert.deepEqual(meta.duos['Jinx|Nautilus'], [4, 2]);
});

test('수집기 전체 실행 (가짜 Riot 서버)', async () => {
  const members = ['me1', 'me2', 'me3', 'me4', 'me5'];
  const server = http.createServer((req, res) => {
    const u = new URL(req.url, 'http://x');
    const send = (o, code = 200) => { res.writeHead(code, { 'content-type': 'application/json' }); res.end(JSON.stringify(o)); };
    if (req.headers['x-riot-token'] !== 'TESTKEY') return send({}, 401);
    let m;
    if ((m = u.pathname.match(/by-riot-id\/([^/]+)\/([^/]+)$/))) {
      const name = decodeURIComponent(m[1]);
      const i = ['ヨイショト', '야리야', 'Nica', '신동우', '민트초코스무디'].indexOf(name);
      return i < 0 ? send({}, 404) : send({ puuid: members[i], gameName: name, tagLine: decodeURIComponent(m[2]) });
    }
    if (u.pathname.includes('champion-masteries')) return send([{ championId: 103, championPoints: 120000, championLevel: 30 }]);
    if (u.pathname.includes('leagues/by-queue')) return send({ entries: [{ puuid: 'hi1' }, { puuid: 'hi2' }] });
    if ((m = u.pathname.match(/by-puuid\/([^/]+)\/ids$/))) {
      const base = members.includes(m[1]) ? 100 : (m[1] === 'hi1' ? 200 : 300);
      return send(Array.from({ length: 6 }, (_, k) => `KR_${base + k}`));
    }
    if ((m = u.pathname.match(/matches\/KR_(\d+)$/))) {
      const n = Number(m[1]);
      return send(fakeMatch(n, n < 200 ? members : []));
    }
    return send({}, 404);
  });
  await new Promise((r) => server.listen(0, r));
  const port = server.address().port;
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'banpick-'));
  await fs.mkdir(path.join(dir, 'config'));
  await fs.copyFile(new URL('../config/team.json', import.meta.url), path.join(dir, 'config/team.json'));
  try {
    const { stdout } = await run('node', [new URL('../scripts/collect.mjs', import.meta.url).pathname], {
      env: { ...process.env, RIOT_API_KEY: 'TESTKEY', RIOT_BASE_OVERRIDE: `http://127.0.0.1:${port}`, BANPICK_ROOT: dir, RIOT_RATE: '1000:1' },
    });
    assert.match(stdout, /완료/);
    const team = JSON.parse(await fs.readFile(path.join(dir, 'data/team.json'), 'utf8'));
    assert.equal(team.members.length, 5);
    assert.equal(team.members[0].mainRole, 'top');
    assert.equal(team.members[2].champs[0].champ, 'Ahri');
    assert.ok(team.members[0].withTeam > 0);
    assert.ok(!('puuid' in team.members[0]));
    assert.deepEqual(team.members[2].champs[0].pos, { mid: [6, 3] });
    const raw = await fs.readFile(path.join(dir, 'data/raw/member-matches.json'), 'utf8');
    assert.ok(!raw.includes('p1') && !raw.includes('mates'));
    const meta = JSON.parse(await fs.readFile(path.join(dir, 'data/meta.json'), 'utf8'));
    assert.ok(meta.games > 0);
    assert.ok(meta.matchups.mid.Ahri.Orianna);
    // 두 번째 실행은 이미 본 경기를 다시 받지 않는다
    const { stdout: s2 } = await run('node', [new URL('../scripts/collect.mjs', import.meta.url).pathname, '--meta'], {
      env: { ...process.env, RIOT_API_KEY: 'TESTKEY', RIOT_BASE_OVERRIDE: `http://127.0.0.1:${port}`, BANPICK_ROOT: dir, RIOT_RATE: '1000:1' },
    });
    assert.match(s2, /새 경기 0판/);
  } finally {
    server.close();
  }
});
