import { describe, it, expect, beforeEach } from "vitest";
import { ProjectParser } from "../parser/ProjectParser.js";
import path from "node:path";

describe("ProjectParser", () => {
  let parser: ProjectParser;

  beforeEach(() => {
    parser = new ProjectParser();
  });

  describe("parse", () => {
    it("should parse a directory and return file info", async () => {
      const testDir = path.resolve("./fixtures/test-project");
      const result = await parser.parse(testDir);

      expect(result.totalFiles).toBe(3);
      expect(result.totalFunctions).toBeGreaterThan(0);
      expect(result.files.length).toBe(3);
    }, 30000);

    it("should count functions correctly", async () => {
      const testDir = path.resolve("./fixtures/test-project");
      const result = await parser.parse(testDir);

      expect(result.totalFunctions).toBe(3);
    });

    it("should count classes correctly", async () => {
      const testDir = path.resolve("./fixtures/test-project");
      const result = await parser.parse(testDir);

      expect(result.totalClasses).toBe(1);
    });

    it("should count imports correctly", async () => {
      const testDir = path.resolve("./fixtures/test-project");
      const result = await parser.parse(testDir);

      expect(result.totalImports).toBeGreaterThan(0);
    });

    it("should count exports correctly", async () => {
      const testDir = path.resolve("./fixtures/test-project");
      const result = await parser.parse(testDir);

      expect(result.totalExports).toBeGreaterThan(0);
    });

    it("should cache results for same directory", async () => {
      const testDir = path.resolve("./fixtures/test-project");
      const result1 = await parser.parse(testDir);
      const result2 = await parser.parse(testDir);

      expect(result1).toBe(result2);
    });

    it("should throw for non-existent directory", async () => {
      await expect(parser.parse("/non/existent/path")).rejects.toThrow();
    });

    it("should return empty result for empty directory", async () => {
      const emptyDir = path.resolve("./fixtures/empty-project");
      const fs = await import("node:fs");
      fs.mkdirSync(emptyDir, { recursive: true });
      
      try {
        const result = await parser.parse(emptyDir);
        expect(result.totalFiles).toBe(0);
        expect(result.files).toEqual([]);
      } finally {
        fs.rmSync(emptyDir, { recursive: true, force: true });
      }
    });
  });
});
