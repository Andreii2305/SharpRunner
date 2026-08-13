import test from "node:test";
import assert from "node:assert/strict";
import { createBakunawaFinaleValidator } from "./validators.js";

const validator = createBakunawaFinaleValidator();

const symbols = "int[] symbols = { 1, 1, 0, 1 };";
const counter = `
static int CountCorrupted(int[] symbols) {
  int count = 0;
  for (int i = 0; i < symbols.Length; i++) {
    if (symbols[i] == 0) { count++; }
  }
  return count;
}`;
const repair = "static void RepairSymbol(int index) { }";
const ward = "static int CalculateWard(int basePower, int bonus) { return basePower + bonus; }";
const moon = `
static int CountMoonCells(int[,] moon) {
  int count = 0;
  for (int row = 0; row < moon.GetLength(0); row++) {
    for (int column = 0; column < moon.GetLength(1); column++) {
      int cell = moon[row, column];
      count++;
    }
  }
  return count;
}`;
const eclipse = `
static void BreakEclipse(int phase) {
  if (phase <= 0) { return; }
  BreakEclipse(phase - 1);
}`;

const program = (members = "", main = "") => `
using System;
namespace SharpRunner {
  class Program {
    ${members}
    static void Main(string[] args) {
      ${main}
    }
  }
}`;

test("finale validator reports phase 1 when the seal array is missing", () => {
  const result = validator(program());
  assert.equal(result.isCorrect, false);
  assert.equal(result.payload.values.failurePhase, 1);
  assert.equal(result.payload.values.completedPhases, 0);
});

test("finale validator preserves the completed-phase count at each boundary", () => {
  const cases = [
    [program("", symbols), 2, 1],
    [program(counter, symbols), 3, 2],
    [program(`${counter}\n${repair}`, `${symbols}\nRepairSymbol(2);`), 4, 3],
    [program(`${counter}\n${repair}\n${ward}`, `${symbols}\nRepairSymbol(2);`), 5, 4],
    [program(`${counter}\n${repair}\n${ward}\n${moon}`, `${symbols}\nRepairSymbol(2);`), 6, 5],
  ];

  for (const [source, phase, completedPhases] of cases) {
    const result = validator(source);
    assert.equal(result.isCorrect, false);
    assert.equal(result.payload.values.failurePhase, phase);
    assert.equal(result.payload.values.completedPhases, completedPhases);
  }
});

test("finale validator accepts a complete six-phase program", () => {
  const source = program(
    `${counter}\n${repair}\n${ward}\n${moon}\n${eclipse}`,
    `${symbols}
     int corrupted = CountCorrupted(symbols);
     RepairSymbol(2);
     int power = CalculateWard(5, 3);
     int[,] moon = { { 1, 1 }, { 1, 1 } };
     int cells = CountMoonCells(moon);
     BreakEclipse(6);`,
  );
  const result = validator(source);
  assert.equal(result.isCorrect, true);
  assert.equal(result.payload.values.completedPhases, 6);
  assert.equal(result.payload.values.corrupted, 1);
});

test("comments cannot satisfy finale requirements", () => {
  const result = validator(program("// int[] symbols = { 1, 1, 0, 1 };"));
  assert.equal(result.isCorrect, false);
  assert.equal(result.payload.values.failurePhase, 1);
});
