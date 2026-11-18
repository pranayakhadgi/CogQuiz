import { test } from "node:test";
import assert from "node:assert/strict";
import { parseModelJson, normalizeQuestion, normalizeQuiz, MAX_QUESTIONS } from "./quiz-format.js";

const good = {
  question: "What is 2+2?",
  options: { A: "3", B: "4", C: "5", D: "6" },
  correct: "B",
  explanation: "Basic arithmetic.",
};

test("parseModelJson handles fences and surrounding prose", () => {
  assert.deepEqual(parseModelJson('```json\n{"a":1}\n```'), { a: 1 });
  assert.deepEqual(parseModelJson('Here you go: {"a":1} hope it helps'), { a: 1 });
  assert.deepEqual(parseModelJson("[1,2]"), [1, 2]);
  assert.throws(() => parseModelJson("not json"), SyntaxError);
  assert.throws(() => parseModelJson(""), SyntaxError);
  assert.throws(() => parseModelJson(undefined), SyntaxError);
});

test("normalizeQuestion keeps valid questions", () => {
  assert.deepEqual(normalizeQuestion(good), good);
});

test("normalizeQuestion coerces common shape variations", () => {
  const arr = normalizeQuestion({ ...good, options: ["3", "4", "5", "6"], correct: "b)" });
  assert.deepEqual(arr.options, good.options);
  assert.equal(arr.correct, "B");
  assert.equal(normalizeQuestion({ ...good, options: { a: "3", b: "4", c: "5", d: "6" } }).options.A, "3");
  assert.equal(normalizeQuestion({ ...good, correct: "Option C" }).correct, "C");
  assert.equal(normalizeQuestion({ ...good, correct: "4" }).correct, "B"); // option text
  assert.equal(normalizeQuestion({ ...good, correct: 3 }).correct, "D"); // index
  assert.equal(normalizeQuestion({ ...good, explanation: undefined }).explanation, "");
});

test("normalizeQuestion drops malformed questions", () => {
  assert.equal(normalizeQuestion(null), null);
  assert.equal(normalizeQuestion({ ...good, question: "  " }), null);
  assert.equal(normalizeQuestion({ ...good, options: { A: "1", B: "2", C: "3" } }), null);
  assert.equal(normalizeQuestion({ ...good, options: ["1", "2", "3", "4", "5"] }), null);
  assert.equal(normalizeQuestion({ ...good, options: { A: "1", B: "", C: "3", D: "4" } }), null);
  assert.equal(normalizeQuestion({ ...good, options: { A: "x", B: "x", C: "3", D: "4" } }), null);
  assert.equal(normalizeQuestion({ ...good, correct: "E" }), null);
  assert.equal(normalizeQuestion({ ...good, correct: "" }), null);
  assert.equal(normalizeQuestion({ ...good, options: "A) 3 B) 4" }), null);
});

test("normalizeQuiz drops bad/duplicate items, defaults category, caps at 50", () => {
  const many = Array.from({ length: 80 }, (_, i) => ({ ...good, question: `Q${i}?` }));
  const res = normalizeQuiz({ category: "  Math ", questions: [{ bad: true }, good, { ...good }, ...many] });
  assert.equal(res.category, "Math");
  assert.equal(res.questions.length, MAX_QUESTIONS);
  assert.equal(res.questions[0].question, good.question);
  assert.equal(normalizeQuiz({ questions: [good] }).category, "General");
  assert.equal(normalizeQuiz([good]).questions.length, 1);
  assert.deepEqual(normalizeQuiz({ questions: "nope" }).questions, []);
  assert.deepEqual(normalizeQuiz(null).questions, []);
});
