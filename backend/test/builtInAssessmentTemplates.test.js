const assert = require("node:assert/strict");
const test = require("node:test");

const contentPackage = require("../src/data/builtInLessonContent.v1.json");
const policy = require("../src/services/assessmentPolicyService");

let catalogModule = null;
try {
  catalogModule = require("../src/data/builtInAssessmentTemplates.v1");
} catch {
  // The first TDD run intentionally reaches this assertion before the catalog exists.
}

const expectedObjectives = {
  arrays: [
    "arrays-declare-initialize",
    "arrays-index-modify",
    "arrays-length-bounds",
    "arrays-traverse",
    "arrays-rectangular",
  ],
  functions: [
    "methods-define-call",
    "methods-void",
    "methods-parameters-arguments",
    "methods-return-scope",
    "methods-recursion",
  ],
  "functions-with-arrays": [
    "array-method-parameter-call",
    "array-method-traversal",
    "array-method-aggregate",
    "array-method-mutation",
    "array-method-grid",
  ],
};

test("catalog contains one ten-point PRE and POST MCQ template for each supported lesson", () => {
  assert.ok(catalogModule, "backend-only template catalog must exist");
  const { templates } = catalogModule;
  assert.equal(templates.length, 6);
  assert.deepEqual(
    [...new Set(templates.map(({ lessonKey }) => lessonKey))].sort(),
    ["arrays", "functions", "functions-with-arrays"],
  );
  for (const template of templates) {
    assert.match(template.templateKey, /^builtin-(arrays|functions|functions-with-arrays)-(pre|post)$/);
    assert.equal(template.templateVersion, 1);
    assert.equal(template.curriculumRevision, contentPackage.contentRevision);
    assert.equal(template.questions.length, 10);
    assert.equal(template.questions.reduce((sum, question) => sum + question.points, 0), 10);
    for (const question of template.questions) {
      assert.equal(question.questionType, "MULTIPLE_CHOICE");
      assert.equal(question.points, 1);
      assert.equal(question.choices.length, 4);
      assert.equal(question.choices.filter(({ isCorrect }) => isCorrect).length, 1);
      assert.equal(typeof question.explanation, "string");
      assert.ok(question.explanation.trim());
    }
  }
});
test("PRE and POST templates have paired objective coverage grounded in real lesson sections", () => {
  assert.ok(catalogModule, "backend-only template catalog must exist");
  const sectionsByLesson = new Map(contentPackage.lessons.map((lesson) => [
    lesson.lessonKey,
    new Set(lesson.sections.map(({ id }) => id)),
  ]));
  for (const [lessonKey, objectiveKeys] of Object.entries(expectedObjectives)) {
    const pair = catalogModule.templates.filter((template) => template.lessonKey === lessonKey);
    assert.equal(pair.length, 2);
    for (const template of pair) {
      const counts = Object.fromEntries(objectiveKeys.map((key) => [key, 0]));
      for (const question of template.questions) {
        assert.ok(Object.hasOwn(counts, question.objectiveKey), question.objectiveKey);
        counts[question.objectiveKey] += 1;
        assert.equal(question.source.lessonKey, lessonKey);
        assert.equal(sectionsByLesson.get(lessonKey).has(question.source.sectionId), true,
          `${question.stableKey} references an unknown lesson section`);
      }
      assert.deepEqual(counts, Object.fromEntries(objectiveKeys.map((key) => [key, 2])));
    }
  }
});

test("corrected traversal, recursion, void, and array-reference questions retain precise context", () => {
  assert.ok(catalogModule, "backend-only template catalog must exist");
  const questions = new Map(catalogModule.templates.flatMap((template) => (
    template.questions.map((question) => [question.stableKey, question])
  )));
  for (const key of ["arr-pre-07", "arr-post-06", "fna-pre-04"]) {
    const question = questions.get(key);
    const shownContext = [question?.questionText, ...(question?.choices || []).map(({ choiceText }) => choiceText)].join("\n");
    assert.match(shownContext, /for\s*\(int i = 0;[^;]+;\s*i\+\+\)|int i = 0;[^;]+;\s*i\+\+/);
  }
  assert.match(questions.get("fn-pre-10")?.questionText || "", /if\s*\(n == 0\)[\s\S]*return;[\s\S]*Console\.Write/);
  assert.equal(questions.get("fn-post-04")?.objectiveKey, "methods-void");
  assert.equal(questions.get("fn-post-04")?.questionText.includes("no ShowWarning"), false);
  assert.match(questions.get("fn-post-09")?.questionText || "", /base case/i);
  assert.match(questions.get("fn-post-10")?.questionText || "", /Console\.Write[\s\S]*(Build|Count|Trace)\(n - 1\)|(Build|Count|Trace)\(n - 1\)[\s\S]*Console\.Write/);
  const mutationExplanation = questions.get("fna-pre-07")?.explanation || "";
  assert.match(mutationExplanation, /copy of the reference/i);
  assert.match(mutationExplanation, /passed by value/i);
  assert.match(mutationExplanation, /does not use ref|no ref/i);
});

test("stable keys and answer positions are unique without a predictable single-option pattern", () => {
  assert.ok(catalogModule, "backend-only template catalog must exist");
  const keys = catalogModule.templates.flatMap((template) => template.questions.map(({ stableKey }) => stableKey));
  assert.equal(new Set(keys).size, 60);
  for (const template of catalogModule.templates) {
    const answerIndexes = template.questions.map((question) => (
      question.choices.findIndex(({ isCorrect }) => isCorrect)
    ));
    assert.ok(new Set(answerIndexes).size >= 3);
    assert.equal(answerIndexes.every((index) => index === answerIndexes[0]), false);
  }
});

test("every template passes the normal authoritative publication validator with existing defaults", () => {
  assert.ok(catalogModule, "backend-only template catalog must exist");
  for (const template of catalogModule.templates) {
    const assessment = policy.normalizeAssessmentConfiguration({
      lessonKey: template.lessonKey,
      type: template.type,
      title: template.title,
      instructions: template.instructions,
    });
    const validated = policy.validateAssessmentForPublish({
      assessment,
      questions: template.questions.map((question, questionIndex) => ({
        ...question,
        id: `question-${questionIndex}`,
        choices: question.choices.map((choice, choiceIndex) => ({
          ...choice,
          id: `question-${questionIndex}-choice-${choiceIndex}`,
        })),
      })),
    });
    assert.equal(validated.questionCount, 10);
    assert.equal(validated.totalPossiblePoints, 10);
  }
});
