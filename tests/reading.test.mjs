import test from "node:test";
import assert from "node:assert/strict";
import { model } from "../scripts/model.mjs";
test("legacy imports, people aliases and original text", () => {
  const a = model.normalize(model.sample);
  assert.equal(a.body, model.sample.body);
  const notes = [
    {
      kind: "person",
      term: "John Fitzgerald Kennedy",
      aliases: ["John F. Kennedy", "Kennedy", "JFK"],
      meaning: "总统",
      context: "语境",
    },
  ];
  const text = "John F. Kennedy, Kennedy and JFK. Kennedyville";
  const parts = model.annotatedParts(text, notes);
  assert.equal(parts.filter((p) => p.index === 0).length, 3);
  assert.equal(parts.map((p) => p.text).join(""), text);
});
test("updated time and progress survive export and import", () => {
  const a = model.normalize({
    ...model.sample,
    position: 0.73,
    updated: 123456,
    status: "reading",
    personalNotes: "笔记",
  });
  const b = model.parseImport(
    JSON.parse(JSON.stringify({ schemaVersion: 1, articles: [a] })),
  )[0];
  assert.equal(b.position, 0.73);
  assert.equal(b.updated, 123456);
  assert.equal(b.personalNotes, "笔记");
});
test("prompt includes extra requirements and person notes", () => {
  assert(model.generationPrompt("本次要求").endsWith("本次要求"));
  assert(model.generationPrompt("").includes("公众人物注释规则"));
});
test("whole words and background notes", () => {
  const notes = [
    { ...model.sample.analysis.notes[0], term: "din", kind: "background" },
  ];
  assert.deepEqual(
    model.annotatedParts("demanding DIN.", notes).map((p) => p.index),
    [-1, 0, -1],
  );
  const withBody = (body) =>
    model.normalize({ ...model.sample, body, analysis: { notes } });
  assert.equal(withBody("demanding").analysis.notes.length, 0);
  assert.equal(withBody("a din").analysis.notes[0].kind, "background");
});
test("cached progress and manual override", () => {
  const row = { position: 0.25, status: "done", updated: 200 };
  assert.equal(model.cachedProgress(row, { position: 0.2, updated: 100 }), row);
  assert.equal(
    model.cachedProgress(row, { position: 0.8, updated: 300 }).status,
    "reading",
  );
  assert.equal(
    model.cachedProgress(row, { position: 0.25, updated: 300 }).status,
    "done",
  );
  assert.deepEqual(
    [0, 0.001, 0.999, 1].map(model.progressPercent),
    [0, 1, 99, 100],
  );
  assert.deepEqual([0, 0.3, 1].map(model.statusForPosition), [
    "unread",
    "reading",
    "done",
  ]);
});
test("all sort options order correctly", () => {
  for (const [order, expected] of [
    ["updated-desc", "b"],
    ["updated-asc", "a"],
    ["desc", "a"],
    ["asc", "b"],
  ]) {
    const rows = [
      { id: "a", created: 20, updated: 40 },
      { id: "b", created: 10, updated: 50 },
    ];
    assert.equal(
      rows.sort((a, b) => model.compareArticles(a, b, order))[0].id,
      expected,
    );
  }
});

test("dotted abbreviations match independently of other cards", () => {
  const notes = [{ ...model.sample.analysis.notes[0], term: "M.O." }];
  const body = "I.M.O. (M.O.), M.O.A. and M.O.";
  const hits = model.annotatedParts(body, notes).filter(part => part.index >= 0);
  assert.deepEqual(hits.map(part => part.text), ["M.O.", "M.O."]);
  assert.equal(model.normalize({ body: "I.M.O.", analysis: { notes } }).analysis.notes.length, 0);
});


function personArticle(aliases) {
  return {
    body: "John F. Kennedy met JFK.",
    analysis: {
      notes: [{ kind: "person", term: "John F. Kennedy", ...aliases }],
    },
  };
}

test("person aliases accept missing, null and single-string legacy values", () => {
  for (const fields of [{}, { aliases: null }, { aliases: [] }]) {
    assert.deepEqual(model.normalize(personArticle(fields)).analysis.notes[0].aliases, []);
  }
  const article = model.normalize(personArticle({ aliases: " JFK " }));
  assert.deepEqual(article.analysis.notes[0].aliases, ["JFK"]);
  assert.deepEqual(
    model.annotatedParts(article.body, article.analysis.notes)
      .filter(part => part.index >= 0)
      .map(part => part.text),
    ["John F. Kennedy", "JFK"],
  );
  assert.deepEqual(
    model.parseImport(JSON.parse(JSON.stringify(article)))[0].analysis.notes[0].aliases,
    ["JFK"],
  );
});

test("person aliases trim, discard blanks and deduplicate before checking limit", () => {
  const normalizeAliases = aliases =>
    model.normalize(personArticle({ aliases })).analysis.notes[0].aliases;
  assert.deepEqual(normalizeAliases([" JFK ", "", "  ", "JFK"]), ["JFK"]);
  assert.deepEqual(normalizeAliases(Array(101).fill("JFK")), ["JFK"]);
  assert.deepEqual(normalizeAliases("Kennedy, John"), ["Kennedy, John"]);
  const aliases = Array.from({ length: 100 }, (_, i) => `Name ${i}`);
  assert.equal(normalizeAliases(aliases).length, 100);
  assert.throws(() => normalizeAliases([...aliases, "Extra"]), /当前 101 项/);
});

test("invalid alias types report the person and do not invent missing names", () => {
  for (const aliases of [{ name: "JFK" }, 42, [42], [null]]) {
    assert.throws(
      () => model.normalize(personArticle({ aliases })),
      /人物「John F. Kennedy」/,
    );
  }
  assert.throws(
    () => model.normalize({ ...personArticle({}), body: "Kennedy spoke." }),
    /未出现在原文中/,
  );
  const prompt = model.generationPrompt("");
  assert(prompt.includes('"aliases": []'));
  assert(prompt.includes('"aliases": ["Kennedy"]'));
});
