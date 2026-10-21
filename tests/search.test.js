import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { buildIndex, search } from '../src/search.js';

const { regions } = JSON.parse(readFileSync(new URL('../data/psh.json', import.meta.url), 'utf8'));
const index = buildIndex(regions);
const names = (q, limit = 8) => search(index, q, limit).items.map((e) => e.name);
const top = (q) => names(q)[0];

test('이름 일부', () => {
  assert.deepEqual(names('안산'), ['경기 안산시 상록구', '경기 안산시 단원구']);
});

test('초성, 초성+완성 섞기', () => {
  assert.ok(names('ㅇㅅ', 300).includes('경기 안산시 상록구'));
  assert.equal(top('안ㅅㅅ'), '경기 안산시 상록구');
});

test('조합 중인 마지막 글자도 맞는다', () => {
  assert.equal(top('상로'), '경기 안산시 상록구'); // '록' 입력 중
  assert.ok(names('앗').includes('충남 아산시'));   // '아산' 입력 중 '앗'
});

test('띄어쓰기 무시, 단어 건너뛰기', () => {
  assert.equal(top('안산시상록구'), '경기 안산시 상록구');
  assert.equal(top('경기 상록'), '경기 안산시 상록구');
});

test('시도 정식 이름, 옛 도 이름', () => {
  assert.equal(top('경기도 안산시 단원구'), '경기 안산시 단원구');
  assert.equal(top('강원도 고성'), '강원 고성군');
  assert.equal(top('전라북도 전주'), '전북 전주시 완산구');
});

test('통합 전 광주·전남 이름으로 찾는다', () => {
  assert.equal(top('광주 북구'), '전남광주 북구');
  assert.equal(top('전남 순천'), '전남광주 순천시');
  assert.equal(top('전라남도 여수'), '전남광주 여수시');
  assert.equal(top('광주'), '경기 광주시'); // 이름 자체가 '광주'로 시작하는 쪽이 먼저
});

test('인천 개편 전 이름으로 찾는다', () => {
  assert.deepEqual(names('인천 서구'), ['인천 서해구', '인천 검단구']);
  assert.deepEqual(names('인천 중구'), ['인천 제물포구', '인천 영종구']);
});

test('같은 이름의 구는 공식 순서(코드순)', () => {
  assert.deepEqual(names('중구').slice(0, 5), ['서울 중구', '부산 중구', '대구 중구', '대전 중구', '울산 중구']);
});

test('세종, 없는 지역, 빈 입력', () => {
  assert.equal(top('세종'), '세종');
  assert.equal(search(index, '평양').total, 0);
  assert.deepEqual(search(index, '  '), { items: [], total: 0 });
});

test('결과는 limit개, total은 전체 개수', () => {
  const r = search(index, '서울', 8);
  assert.equal(r.items.length, 8);
  assert.equal(r.total, 25);
});
