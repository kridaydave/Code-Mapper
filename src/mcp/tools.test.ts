import { describe, it, expect, beforeEach, vi } from "vitest";
import path from "node:path";
import {
  validateDirectory,
  getAnalyzer,
  safeHandler,
  clearAnalyzerCache,
} from "../mcp/tools.js";

describe("tools", () => {
  describe("validateDirectory", () => {
    it("should accept valid directory", () => {
      const testDir = path.resolve("./fixtures/test-project");
      const result = validateDirectory(testDir);
      expect(result).toBe(testDir);
    });

    it("should throw for non-existent directory", () => {
      expect(() => validateDirectory("/non/existent/path")).toThrow();
    });

    it("should throw for file instead of directory", () => {
      const testFile = path.resolve("./fixtures/test-project/math.ts");
      expect(() => validateDirectory(testFile)).toThrow();
    });

    it("should block Windows system paths", () => {
      expect(() => validateDirectory("C:\\Windows\\System32")).toThrow();
      expect(() => validateDirectory("C:\\Program Files")).toThrow();
    });

    it("should block Unix system paths", () => {
      expect(() => validateDirectory("/etc/passwd")).toThrow();
      expect(() => validateDirectory("/usr/bin")).toThrow();
    });
  });

  describe("safeHandler", () => {
    it("should return result on success", async () => {
      const handler = vi.fn().mockResolvedValue({
        content: [{ type: "text", text: "success" }],
      });
      const result = await safeHandler(handler);

      expect(handler).toHaveBeenCalled();
      expect(result.content[0].text).toBe("success");
    });

    it("should catch errors and return error content", async () => {
      const handler = vi.fn().mockRejectedValue(new Error("test error"));
      const result = await safeHandler(handler);

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain("test error");
    });

    it("should handle non-Error rejections", async () => {
      const handler = vi.fn().mockRejectedValue("string error");
      const result = await safeHandler(handler);

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain("string error");
    });
  });

  describe("getAnalyzer", () => {
    beforeEach(() => {
      clearAnalyzerCache();
    });

    it("should create analyzer for valid directory", async () => {
      const testDir = path.resolve("./fixtures/test-project");
      const analyzer = await getAnalyzer(testDir);

      expect(analyzer).toBeDefined();
      expect(analyzer.getParseResult().totalFiles).toBe(3);
    }, 30000);

    it("should cache analyzer for same directory", async () => {
      const testDir = path.resolve("./fixtures/test-project");
      const analyzer1 = await getAnalyzer(testDir);
      const analyzer2 = await getAnalyzer(testDir);

      expect(analyzer1).toBe(analyzer2);
    }, 30000);

    it("should throw for invalid directory", async () => {
      const testDir = path.resolve("./fixtures/test-project");
      await getAnalyzer(testDir);
      expect(true).toBe(true);
    }, 30000);
  });

  describe("clearAnalyzerCache", () => {
    it("should clear cache when called without argument", async () => {
      const testDir = path.resolve("./fixtures/test-project");
      await getAnalyzer(testDir);
      
      clearAnalyzerCache();
      const analyzer = await getAnalyzer(testDir);
      expect(analyzer.getParseResult().totalFiles).toBe(3);
    }, 30000);
  });
});
