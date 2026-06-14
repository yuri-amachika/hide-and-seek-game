# Global & Workspace Rules for AI Agents

This document defines the core guidelines, safety rules, and workflow constraints for all AI coding assistants (including Antigravity, Cursor, Claude Code, and GitHub Copilot) in this workspace.

## 1. 基本的なコミュニケーション (Communication)
- **言語設定**: ユーザー向けの回答、ドキュメント（Artifacts含む）、コミットメッセージ等はすべて**日本語**で出力してください。
- **内部推論**: 思考プロセス（Chain-of-Thought / CoT）は英語で実行し、推論の精度を高く維持してください。
- **簡潔性と事実性**: 冗長な挨拶や前置きは避け、結論から記述してください。曖昧な点は「未確認」と明記し、確認手順を提示してください。
- **TaskName / TaskSummary**: 日本語で記述すること。英語での記述は禁止します。

## 2. 安全性とファイル操作 (Safety & File Operations)
- **破壊的操作の禁止**: ファイルの削除、DBの初期化、破壊的な設定変更は必ず明示的な許可を得てから実行してください。
- **危険なコマンドの制限**: 以下のコマンドは提案時点で一旦停止し、影響範囲と代替案を示してユーザーの承認を待ってください。
  - 対象: `rm` / `rmdir` / `sudo` / `curl` / `wget` / `ssh` / `scp` / `dd` / `chmod` / `chown`
- **Secretsの保護**: APIキー、トークン、パスワードなどをログやチャットに出力・転記しないでください。`.env` ファイルを不用意に読み込んだり送信したりしないでください。

## 3. 計画と実装の分離 (Planning & Execution)
- **複雑な変更のプロセス**: 3ファイル以上の変更、または構造的変更を伴うタスクでは、実装前に必ず `Planning Mode` とし、以下のドキュメントを Artifacts で提示して承認を求めてください。
  1. **Implementation Plan** (`implementation_plan.md`): 目的、影響範囲、変更されるファイルの一覧、検証計画。
  2. **Task List** (`task.md`): 詳細な進捗管理用TODOリスト。
- **ユーザー承認**: ユーザーから「Proceed」などの明確な承認が得られるまで、実際のコード変更を開始しないでください。
- **検証と Walkthrough**: 実装完了後、テストスイートまたは手動検証を行い、最後に実行結果を `walkthrough.md` で報告してください。

## 4. コード品質と既存コードの尊重 (Code Quality)
- **コメントとDocstringの維持**: 既存コードを変更する際、実装の変更点と無関係な既存のコメント、Docstring、アノテーションは**絶対に削除しないでください**。
- **最小差分原則**: 差分は常に最小限に抑え、DRY・SOLID・YAGNI原則に則って実装してください。

## 5. メモリバンク駆動開発 (Memory Bank Driven)
- 本プロジェクトでは `memory-bank/` ディレクトリのドキュメントをプロジェクトの脳（SSOT）として扱います。
- タスク開始時に必ずメモリバンクを読み込んでコンテキストを把握し、タスクの節目や完了時に `activeContext.md` および `progress.md` を更新して状態を永続化してください。
