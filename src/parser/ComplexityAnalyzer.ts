import { SourceFile, Project, SyntaxKind } from "ts-morph";
import { ParseResult } from "./types.js";

export interface ComplexityResult {
  filePath: string;
  relativePath: string;
  cyclomaticComplexity: number;
  cognitiveComplexity: number;
  nestingDepth: number;
  linesOfCode: number;
  functionCount: number;
  classCount: number;
  overallScore: number;
  issues: string[];
}

export class ComplexityAnalyzer {
  private project: Project;
  private baseDirectory: string;

  constructor(project: Project, baseDirectory: string) {
    this.project = project;
    this.baseDirectory = baseDirectory;
  }

  /**
   * @param sourceFile - The ts-morph SourceFile to analyze.
   */
  analyze(sourceFile: SourceFile): ComplexityResult {
    const filePath = sourceFile.getFilePath();
    const relativePath = this.getRelativePath(filePath);
    const linesOfCode = sourceFile.getEndLineNumber() ?? 0;
    const functionCount = sourceFile.getFunctions().length;
    const classCount = sourceFile.getClasses().length;

    const cyclomaticComplexity = this.calculateCyclomaticComplexity(sourceFile);
    const cognitiveComplexity = this.calculateCognitiveComplexity(sourceFile);
    const nestingDepth = this.calculateNestingDepth(sourceFile);

    const issues = this.identifyIssues({
      cyclomaticComplexity,
      cognitiveComplexity,
      nestingDepth,
      linesOfCode,
      functionCount,
      classCount,
    });

    const overallScore = this.calculateOverallScore({
      cyclomaticComplexity,
      cognitiveComplexity,
      nestingDepth,
      linesOfCode,
      functionCount,
      classCount,
    });

    return {
      filePath,
      relativePath,
      cyclomaticComplexity,
      cognitiveComplexity,
      nestingDepth,
      linesOfCode,
      functionCount,
      classCount,
      overallScore,
      issues,
    };
  }

  /**
   * @param parseResult - The ParseResult from ProjectParser containing all project files.
   */
  analyzeProject(parseResult: ParseResult): ComplexityResult[] {
    const results: ComplexityResult[] = [];
    const failedFiles: string[] = [];

    for (const fileInfo of parseResult.files) {
      try {
        const sourceFile = this.project.getSourceFile(fileInfo.filePath);
        if (sourceFile) {
          results.push(this.analyze(sourceFile));
        } else {
          failedFiles.push(fileInfo.filePath);
        }
      } catch (err) {
        console.error(`ComplexityAnalyzer: Failed to analyze ${fileInfo.filePath}:`, err);
        failedFiles.push(fileInfo.filePath);
      }
    }

    if (failedFiles.length > 0) {
      console.warn(`ComplexityAnalyzer: Failed to analyze ${failedFiles.length} file(s): ${failedFiles.join(", ")}`);
    }

    return results;
  }

  /**
   * @param n - The number of top complex files to return.
   */
  getTopComplexFiles(n: number): ComplexityResult[] {
    const sourceFiles = this.project.getSourceFiles();

    const results: ComplexityResult[] = [];
    for (const sourceFile of sourceFiles) {
      results.push(this.analyze(sourceFile));
    }

    return results
      .sort((a, b) => b.overallScore - a.overallScore)
      .slice(0, n);
  }

  private getRelativePath(target: string): string {
    const baseParts = this.baseDirectory.replace(/\\/g, "/").split("/").filter(Boolean);
    const targetParts = target.replace(/\\/g, "/").split("/").filter(Boolean);

    let i = 0;
    while (i < baseParts.length && i < targetParts.length && baseParts[i] === targetParts[i]) {
      i++;
    }

    if (i < baseParts.length) {
      return targetParts.slice(i).join("/");
    }

    const up = baseParts.length - i;
    const down = targetParts.slice(i);
    return [...Array(up).fill(".."), ...down].join("/");
  }

  private calculateCyclomaticComplexity(sourceFile: SourceFile): number {
    let complexity = 1;

    sourceFile.forEachDescendant(node => {
      const kind = node.getKind();
      if (
        kind === SyntaxKind.IfStatement ||
        kind === SyntaxKind.ForStatement ||
        kind === SyntaxKind.ForInStatement ||
        kind === SyntaxKind.ForOfStatement ||
        kind === SyntaxKind.WhileStatement ||
        kind === SyntaxKind.SwitchStatement ||
        kind === SyntaxKind.CatchClause ||
        kind === SyntaxKind.BinaryExpression
      ) {
        if (kind === SyntaxKind.BinaryExpression) {
          const text = node.getText();
          if (text.includes("&&") || text.includes("||")) {
            complexity++;
          }
        } else {
          complexity++;
        }
      }
    });

    return complexity;
  }

  private calculateCognitiveComplexity(sourceFile: SourceFile): number {
    let complexity = 0;
    let nestingLevel = 0;

    const incrementComplexity = (kind: SyntaxKind, text?: string) => {
      complexity++;
      if (kind === SyntaxKind.IfStatement ||
          kind === SyntaxKind.ForStatement ||
          kind === SyntaxKind.ForInStatement ||
          kind === SyntaxKind.ForOfStatement ||
          kind === SyntaxKind.WhileStatement ||
          kind === SyntaxKind.SwitchStatement ||
          kind === SyntaxKind.CatchClause ||
          kind === SyntaxKind.TryStatement ||
          kind === SyntaxKind.ConditionalExpression) {
        nestingLevel++;
      }
      if (text) {
        if (text.includes("&&") || text.includes("||")) {
          complexity += nestingLevel;
        }
      }
    };

    const decrementNesting = (kind: SyntaxKind) => {
      if (kind === SyntaxKind.IfStatement ||
          kind === SyntaxKind.ForStatement ||
          kind === SyntaxKind.ForInStatement ||
          kind === SyntaxKind.ForOfStatement ||
          kind === SyntaxKind.WhileStatement ||
          kind === SyntaxKind.SwitchStatement ||
          kind === SyntaxKind.CatchClause ||
          kind === SyntaxKind.TryStatement ||
          kind === SyntaxKind.ConditionalExpression) {
        nestingLevel = Math.max(0, nestingLevel - 1);
      }
    };

    sourceFile.forEachDescendant(node => {
      const kind = node.getKind();
      const text = kind === SyntaxKind.BinaryExpression ? node.getText() : undefined;
      incrementComplexity(kind, text);
    });

    return complexity;
  }

  private calculateNestingDepth(sourceFile: SourceFile): number {
    let maxNesting = 0;
    let currentNesting = 0;

    sourceFile.forEachDescendant(node => {
      const kind = node.getKind();
      if (this.isControlStructure(kind)) {
        currentNesting++;
        maxNesting = Math.max(maxNesting, currentNesting);
      }
    });

    return maxNesting;
  }

  private isControlStructure(kind: SyntaxKind): boolean {
    return kind === SyntaxKind.IfStatement ||
           kind === SyntaxKind.ForStatement ||
           kind === SyntaxKind.ForInStatement ||
           kind === SyntaxKind.ForOfStatement ||
           kind === SyntaxKind.WhileStatement ||
           kind === SyntaxKind.SwitchStatement ||
           kind === SyntaxKind.TryStatement ||
           kind === SyntaxKind.CatchClause;
  }

  private identifyIssues(metrics: {
    cyclomaticComplexity: number;
    cognitiveComplexity: number;
    nestingDepth: number;
    linesOfCode: number;
    functionCount: number;
    classCount: number;
  }): string[] {
    const issues: string[] = [];

    if (metrics.cyclomaticComplexity > 10) {
      issues.push(`Cyclomatic complexity (${metrics.cyclomaticComplexity}) exceeds threshold of 10`);
    }

    if (metrics.cognitiveComplexity > 15) {
      issues.push(`Cognitive complexity (${metrics.cognitiveComplexity}) exceeds threshold of 15`);
    }

    if (metrics.nestingDepth > 4) {
      issues.push(`Nesting depth (${metrics.nestingDepth}) exceeds threshold of 4`);
    }

    if (metrics.linesOfCode > 500) {
      issues.push(`Lines of code (${metrics.linesOfCode}) exceeds 500 - file is large`);
    }

    if (metrics.functionCount > 20) {
      issues.push(`Function count (${metrics.functionCount}) exceeds 20 - too many functions`);
    }

    if (metrics.classCount > 10) {
      issues.push(`Class count (${metrics.classCount}) exceeds 10 - too many classes`);
    }

    return issues;
  }

  private calculateOverallScore(metrics: {
    cyclomaticComplexity: number;
    cognitiveComplexity: number;
    nestingDepth: number;
    linesOfCode: number;
    functionCount: number;
    classCount: number;
  }): number {
    let score = 0;

    score += Math.min(metrics.cyclomaticComplexity * 4, 25);
    score += Math.min(metrics.cognitiveComplexity * 3, 25);
    score += Math.min(metrics.nestingDepth * 5, 25);
    score += Math.min((metrics.linesOfCode / 500) * 15, 15);
    score += Math.min((metrics.functionCount / 20) * 5, 5);
    score += Math.min((metrics.classCount / 10) * 5, 5);

    return Math.min(Math.round(score), 100);
  }
}
