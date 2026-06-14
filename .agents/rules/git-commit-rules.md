---
trigger: always_on
---
- Conventional Commits 形式を厳守: feat / fix / docs / style / refactor / perf / test / chore
- 曖昧な表現を禁止: update / fix / change / modify / 更新 / 修正 / 変更 / 対応 / wip
- 1コミット1変更の原則。複数 type をまたぐ場合は分割を提案する。
- staged 変更がない場合はコミットメッセージを生成せず、ステージングを促すメッセージのみ返す。
