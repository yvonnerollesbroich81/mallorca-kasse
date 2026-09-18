import test from "node:test";
import assert from "node:assert/strict";

import {
  applySettlements,
  calculateBalances,
  calculateSettlements,
} from "../js/calculations.js";
import { parseEuroToCents, splitAmount } from "../js/money.js";

const PEOPLE = ["yvonne", "alice", "birgit", "svenja"];

function expense(amountCents, payerId, participantIds) {
  return {
    amountCents,
    payerId,
    shares: splitAmount(amountCents, participantIds),
  };
}

test("Test 1: Yvonne zahlt 100 Euro für alle", () => {
  const balances = calculateBalances(PEOPLE, [expense(10_000, "yvonne", PEOPLE)]);
  assert.deepEqual(balances, {
    yvonne: 7_500,
    alice: -2_500,
    birgit: -2_500,
    svenja: -2_500,
  });
  assert.equal(Object.values(balances).reduce((sum, value) => sum + value, 0), 0);
});

test("Test 2: Alice zahlt 60 Euro für Alice, Birgit und Svenja", () => {
  const balances = calculateBalances(PEOPLE, [
    expense(6_000, "alice", ["alice", "birgit", "svenja"]),
  ]);
  assert.deepEqual(balances, {
    yvonne: 0,
    alice: 4_000,
    birgit: -2_000,
    svenja: -2_000,
  });
});

test("Test 3: 100 Euro auf drei Personen verlieren keinen Cent", () => {
  const shares = splitAmount(10_000, ["yvonne", "alice", "birgit"]);
  assert.deepEqual(shares.map((share) => share.shareCents), [3_334, 3_333, 3_333]);
  assert.equal(shares.reduce((sum, share) => sum + share.shareCents, 0), 10_000);
});

test("Test 4: unterschiedliche Ausgaben ergeben zusammen immer null", () => {
  const expenses = [
    expense(7_240, "yvonne", PEOPLE),
    expense(9_600, "alice", PEOPLE),
    expense(3_500, "birgit", ["birgit", "svenja"]),
    expense(4_860, "svenja", ["alice", "birgit", "svenja"]),
  ];
  const balances = calculateBalances(PEOPLE, expenses);
  assert.equal(Object.values(balances).reduce((sum, value) => sum + value, 0), 0);
});

test("Test 5: eine Änderung berechnet alle Salden neu", () => {
  const expenses = [expense(8_000, "alice", PEOPLE)];
  const before = calculateBalances(PEOPLE, expenses);
  expenses[0] = expense(9_000, "yvonne", ["yvonne", "alice", "svenja"]);
  const after = calculateBalances(PEOPLE, expenses);

  assert.notDeepEqual(after, before);
  assert.deepEqual(after, {
    yvonne: 6_000,
    alice: -3_000,
    birgit: 0,
    svenja: -3_000,
  });
});

test("Test 6: das Löschen einer Ausgabe berechnet die Restbeträge neu", () => {
  const expenses = [
    expense(8_000, "alice", PEOPLE),
    expense(3_000, "birgit", ["birgit", "svenja"]),
  ];
  const before = calculateBalances(PEOPLE, expenses);
  const after = calculateBalances(PEOPLE, expenses.slice(1));

  assert.notDeepEqual(after, before);
  assert.deepEqual(after, { yvonne: 0, alice: 0, birgit: 1_500, svenja: -1_500 });
});

test("Test 7: die Abschlussabrechnung setzt alle Salden exakt auf null", () => {
  const balances = {
    yvonne: 3_740,
    alice: 1_820,
    birgit: -1_820,
    svenja: -3_740,
  };
  const settlements = calculateSettlements(balances);
  const result = applySettlements(balances, settlements);

  assert.ok(settlements.length <= PEOPLE.length - 1);
  assert.deepEqual(result, { yvonne: 0, alice: 0, birgit: 0, svenja: 0 });
});

test("Test 8: Rundungsfälle verteilen jeden Cent vollständig", () => {
  for (const amountCents of [1, 10, 100, 1_000, 10_000]) {
    for (let participantCount = 1; participantCount <= PEOPLE.length; participantCount += 1) {
      const shares = splitAmount(amountCents, PEOPLE.slice(0, participantCount));
      assert.equal(
        shares.reduce((sum, share) => sum + share.shareCents, 0),
        amountCents,
      );
      assert.ok(Math.max(...shares.map((share) => share.shareCents)) - Math.min(...shares.map((share) => share.shareCents)) <= 1);
    }
  }
});

test("Euro-Eingaben werden ohne Fließkomma in Cent umgewandelt", () => {
  assert.equal(parseEuroToCents("72,40 €"), 7_240);
  assert.equal(parseEuroToCents("1.247,80"), 124_780);
  assert.equal(parseEuroToCents("1000"), 100_000);
  assert.equal(parseEuroToCents("1.000"), 100_000);
  assert.equal(parseEuroToCents("0,01"), 1);
  assert.equal(parseEuroToCents("-2"), null);
  assert.equal(parseEuroToCents("abc"), null);
});
