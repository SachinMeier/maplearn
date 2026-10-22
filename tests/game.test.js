import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { Game } from '../game.js';
const countries = JSON.parse(readFileSync(new URL('../data/countries.json', import.meta.url)));

test('every wrong attempt counts, even on previously completed countries', () => {
  const game = new Game(countries, true, () => .5);
  const first = game.current.code;
  game.guess(first);
  game.guess(first); game.guess(first); game.guess(first);
  assert.equal(game.incorrect, 3);
  assert.equal(game.correct, 1);
  assert.equal(game.completed.size, 1);
  game.guess('ocean');
  assert.equal(game.incorrect, 3);
});
test('reveals count separately, complete the game, and cannot double count', () => {
  const game = new Game(countries.slice(0, 4));
  game.guess(game.current.code);
  while (!game.done) game.reveal();
  assert.equal(game.correct, 1);
  assert.equal(game.reveals, 3);
  assert.equal(game.current, null);
  assert.equal(game.reveal(), null);
  assert.equal(game.guess(countries[0].code), 'ignored');
});
test('canonical microstate flags filter countries without excluding small sovereign states', () => {
  const game = new Game(countries, false);
  assert.equal(game.total, 202);
  assert.equal(new Game(countries).total, 250);
  for (const code of ['VA', 'MC', 'SG', 'AD']) assert.ok(game.ids.has(code), code);
  assert.equal(game.countries.some(country => country.microstate), false);
});
test('reveal all preserves prior guesses and only counts remaining regions', () => {
  const game = new Game(countries.slice(0, 5));
  const correct = game.current.code;
  game.guess(correct);
  game.guess(correct);
  const revealed = game.reveal();
  const remaining = game.revealAll();
  assert.equal(remaining.length, 3);
  assert.equal(new Set(remaining).size, 3);
  assert.equal(remaining.includes(correct) || remaining.includes(revealed), false);
  assert.equal(game.completed.get(correct), 'correct');
  assert.equal(game.correct, 1);
  assert.equal(game.incorrect, 1);
  assert.equal(game.reveals, 4);
  assert.equal(game.done, true);
  assert.deepEqual(game.revealAll(), []);
  assert.equal(game.reveals, 4);
});
test('each target appears once and a retry starts with clear scores', () => {
  const game = new Game(countries);
  const seen = new Set();
  while (!game.done) { seen.add(game.current.code); game.guess(game.current.code); }
  assert.equal(seen.size, countries.length);
  assert.equal(game.correct, countries.length);
  assert.equal(new Game(countries).completed.size, 0);
});
