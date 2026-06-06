import { describe, it, expect } from "vitest";
import { baseForm, normalize, DEFAULT_NORMALIZE_OPTIONS } from "../src/core/normalizer";

describe("baseForm", () => {
  it("handles regular plurals", () => {
    expect(baseForm("cats")).toBe("cat");
    expect(baseForm("microservices")).toBe("microservice");
  });

  it("handles -ies -> -y", () => {
    expect(baseForm("categories")).toBe("category");
    expect(baseForm("queries")).toBe("query");
  });

  it("handles -es families", () => {
    expect(baseForm("boxes")).toBe("box");
    expect(baseForm("dishes")).toBe("dish");
    expect(baseForm("matches")).toBe("match");
    expect(baseForm("classes")).toBe("class");
  });

  it("does not strip -ss words", () => {
    expect(baseForm("class")).toBe("class");
    expect(baseForm("address")).toBe("address");
  });

  it("leaves short words alone", () => {
    expect(baseForm("is")).toBe("is");
    expect(baseForm("gas")).toBe("gas");
    expect(baseForm("api")).toBe("api");
  });
});

describe("normalize", () => {
  it("lowercases when case-insensitive", () => {
    expect(normalize("API Gateway", DEFAULT_NORMALIZE_OPTIONS)).toBe("api gateway");
  });

  it("preserves case when case-sensitive", () => {
    expect(normalize("API Gateway", { caseInsensitive: false, matchBaseForm: false })).toBe(
      "API Gateway",
    );
  });

  it("applies base form per word and preserves spacing", () => {
    expect(normalize("Time Tables", { caseInsensitive: true, matchBaseForm: true })).toBe(
      "time table",
    );
  });
});
