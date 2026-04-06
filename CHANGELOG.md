# Changelog

All notable changes to this project will be documented in this file.

## [1.0.0] - 2026-04-06

### Added
- **Regex search support** - Optional `useRegex` parameter in `find_function` tool for regex-based searching
- **Enhanced error handling** - Contextual error messages with error codes (`ERR_DIRECTORY_NOT_FOUND`, `ERR_TOO_MANY_FILES`, `ERR_NOT_A_DIRECTORY`, `ERR_NO_FILES_FOUND`, `ERR_INVALID_REGEX`)
- **PageRank support** - Installed `graphology-pagerank` dependency
- **Progress indicators** - Progress callback support in `ProjectParser.parse()`

### Fixed
- **Critical: Duplicate Project instances** - Removed duplicate ts-morph Project creation in `analyze_complexity` tool
- **Critical: Cache inconsistency** - Fixed cache sync between ProjectParser and MCP layer
- **Critical: Missing metric property** - Added `metric` to ranked output in `rank_impact` tool
- **Medium: Invalid regex error handling** - Added error code for invalid regex patterns
- **Medium: Dead code removal** - Removed unused `fileNodeIds` Map in GraphBuilder
- **Medium: Silent failures** - Added error logging for failed complexity analysis

### Changed
- **AI slop cleanup** - Removed verbose JSDoc, over-engineering, and dead code across all files
- **Simplified GraphBuilder** - Removed duplicate edge pushing, simplified extension handling
- **Improved cache.ts** - Fixed dead branch, simplified LRU eviction

### Removed
- **Deprecated PHASE2_PLAN.md** - Moved to `docs/impro/IMPROVEMENTS_PLAN.md`

### Infrastructure
- Added vitest test framework
- All 45 tests passing
