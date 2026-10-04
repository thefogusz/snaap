# SNAAP agent instructions

## Branch safety

- Before editing project files, run `git branch --show-current` and `git status --short` in the actual checkout used by this chat. Tell the user which branch you will work on.
- Never edit, stage, or commit project changes on `main` or `master` unless the user explicitly requests work on that exact branch.
- If the checkout is on `main`, `master`, or a detached HEAD, create and switch to a fresh task branch named `codex/<short-task-name>` before editing. Use `git switch -c` from the current HEAD; do not reset or discard changes. A suitable existing task branch may be reused.
- Do not assume selecting Worktree guarantees a task branch. Check the branch in the worktree itself and apply the same rule.
- If branch creation fails or switching would disturb another chat's work, stop before editing and explain the issue. Prefer a separate managed worktree for concurrent tasks.
- Preserve unrelated changes. Stage and commit only the files or hunks belonging to the current task; do not use blanket staging in a shared checkout.
- Merging into the main branch, pushing, and deploying require authorization from the user. A request to edit or test locally is not authorization to deploy.

This is an agent workflow rule, not a technical Git branch protection mechanism.
