import { expect, test } from "bun:test";
import { normalizeRequestTitle, createRequestSchema, statusRequestSchema } from "../../src/lib/content-requests/policy";
test("normalization preserves meaningful spelling but folds Unicode case and whitespace", () => {
  expect(normalizeRequestTitle("  ＡBC\n  عمل  ")).toBe("abc عمل");
  expect(normalizeRequestTitle("أمل")).not.toBe(normalizeRequestTitle("امل"));
});
test("create rejects unsafe reference URLs and invalid categories and keeps original text", () => {
  const value = {title:"  My Work  ", category:"manga", submissionId:"123e4567-e89b-42d3-a456-426614174000"};
  expect(createRequestSchema.safeParse({...value,referenceUrl:"javascript:alert(1)"}).success).toBe(false);
  expect(createRequestSchema.safeParse({...value,category:"anime"}).success).toBe(false);
  expect(createRequestSchema.parse(value).title).toBe("My Work");
  expect(createRequestSchema.safeParse({...value,referenceUrl:"https://user:pass@example.com"}).success).toBe(false);
});
test("available status requires a series and optimistic version rejects malformed values", () => {
  expect(statusRequestSchema.safeParse({id:"a",expectedVersion:1,status:"available"}).success).toBe(false);
  expect(statusRequestSchema.safeParse({id:"a",expectedVersion:-1,status:"new"}).success).toBe(false);
});
