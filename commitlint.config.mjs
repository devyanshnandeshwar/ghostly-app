/**
 * Conventional Commits, with the subject rules relaxed where they fight
 * readability rather than help it.
 */
export default {
    extends: ["@commitlint/config-conventional"],
    rules: {
        "type-enum": [
            2,
            "always",
            ["feat", "fix", "refactor", "perf", "docs", "test", "build", "ci", "chore", "revert"]
        ],
        // 72 rather than the default 100: a subject that does not fit in a
        // terminal `git log --oneline` is a subject nobody reads.
        "subject-max-length": [2, "always", 72],
        // Sentence case reads better than the default lower-case-only rule for
        // subjects that begin with a proper noun (Redis, Render, Socket.IO).
        "subject-case": [0],
        // A body is where the reasoning goes, so it must be separated and
        // wrapped to stay readable in `git log`.
        "body-leading-blank": [2, "always"],
        "body-max-line-length": [2, "always", 78],
        "footer-leading-blank": [2, "always"]
    }
};
