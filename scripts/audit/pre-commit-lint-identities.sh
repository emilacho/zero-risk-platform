#!/usr/bin/env bash
# pre-commit-lint-identities.sh · Wave 11 · CC#2
#
# Husky-style pre-commit hook that blocks commits touching identity files
# (docs/04-agentes/identidades/) if the linter fails.
#
# Install (one-time, manual):
#   git config core.hooksPath .githooks
#   ln -s ../scripts/audit/pre-commit-lint-identities.sh .githooks/pre-commit
#
# Or with husky (if/when added to project):
#   husky add .husky/pre-commit "bash zero-risk-platform/scripts/audit/pre-commit-lint-identities.sh"
#
# Behavior:
#   - Runs only when staged files include something under docs/04-agentes/identidades/
#   - Otherwise no-op (fast path · doesn't block other commits)
#   - Exit 0 if linter passes · exit 1 if linter fails (commit blocked)
#   - Honors LINT_STRICT=1 env var (warns also block)
#   - Honors LINT_INCLUDE_SEO=1 env var (also lint sub-agentes · default off)
#
# Compatible: bash 3.2+ (macOS default) · git 2.x

set -euo pipefail

# Detect project root
PROJECT_ROOT="$(git rev-parse --show-toplevel 2>/dev/null || pwd)"
LINTER="${PROJECT_ROOT}/scripts/audit/lint-identity-files.mjs"

# If linter doesn't exist (e.g., wrong cwd), skip silently
if [[ ! -f "$LINTER" ]]; then
  # Try project_root parent in case we're in a sub-tree
  ALT_LINTER="${PROJECT_ROOT}/zero-risk-platform/scripts/audit/lint-identity-files.mjs"
  if [[ -f "$ALT_LINTER" ]]; then
    LINTER="$ALT_LINTER"
  else
    echo "[pre-commit] linter not found at $LINTER · skipping identity lint"
    exit 0
  fi
fi

# Check if any staged file lives under docs/04-agentes/identidades/
STAGED_IDENTITIES=$(git diff --cached --name-only --diff-filter=ACMR 2>/dev/null | grep -E 'docs/04-agentes/identidades/.*\.md$' || true)

if [[ -z "$STAGED_IDENTITIES" ]]; then
  # No identity files staged · nothing to do
  exit 0
fi

echo "[pre-commit] identity files staged · running linter"
echo "[pre-commit] staged:"
echo "$STAGED_IDENTITIES" | sed 's/^/  - /'
echo ""

# Build linter args
LINTER_ARGS=()
if [[ "${LINT_STRICT:-0}" == "1" ]]; then
  LINTER_ARGS+=("--strict")
fi
if [[ "${LINT_INCLUDE_SEO:-0}" == "1" ]]; then
  LINTER_ARGS+=("--include-seo")
fi

# Default to include-seo when any seo file is staged
if echo "$STAGED_IDENTITIES" | grep -q 'identidades/seo/'; then
  if [[ ! " ${LINTER_ARGS[*]:-} " =~ " --include-seo " ]]; then
    LINTER_ARGS+=("--include-seo")
    echo "[pre-commit] auto-enabling --include-seo (seo file staged)"
  fi
fi

# Run linter
if node "$LINTER" "${LINTER_ARGS[@]}"; then
  echo ""
  echo "[pre-commit] ✓ identity lint passed"
  exit 0
else
  EXIT_CODE=$?
  echo ""
  echo "[pre-commit] ✗ identity lint failed (exit $EXIT_CODE)"
  echo "[pre-commit] commit BLOCKED · fix fails above and re-stage"
  echo "[pre-commit] override (NOT recommended): run with --no-verify"
  exit 1
fi
