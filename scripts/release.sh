#!/usr/bin/env bash
# release.sh — version + CHANGELOG.md + annotated tag release using git-cliff
#
# Usage:
#   ./scripts/release.sh --version 0.4.0
#   ./scripts/release.sh --major
#   ./scripts/release.sh --minor
#   ./scripts/release.sh --patch
#   ./scripts/release.sh --auto
#   ./scripts/release.sh --minor --rc
#   ./scripts/release.sh --version 1.0.0-rc.3
#   ./scripts/release.sh --version 1.0.0 --omit-tag-prefix --push
#   ./scripts/release.sh --version 1.0.0 --omit-tag-prefix --sync --push
#
# Notes:
# - Version publish is delegated to package.json scripts.
# - Default version publish runs: bun run version -- <version>
# - With --sync, version publish runs: bun run version:all -- <version>
# - Does not build.
# - Does not commit dist/.
# - Creates annotated tag vX.Y.Z by default.
# - Use --omit-tag-prefix for Obsidian community releases.

set -euo pipefail

RED='\033[31m'
GREEN='\033[32m'
PURPLE='\033[35m'
YELLOW='\033[33m'
RESET='\033[0m'

LOG_INDENT_WIDTH=1

log_with_level() {
  local color="$1"
  local level="$2"
  local message="$3"
  local fd="${4:-1}"

  printf '%*s%b%-5s%b %s\n' \
    "$LOG_INDENT_WIDTH" '' \
    "$color" \
    "$level" \
    "$RESET" \
    "$message" >&"$fd"
}

log_step() {
  log_with_level "$GREEN" "INFO" "$1"
}

log_step_debug() {
  log_with_level "$PURPLE" "DEBUG" "$1"
}

log_step_warn() {
  log_with_level "$YELLOW" "WARN" "$1"
}

print_error() {
  printf '%b\n' "${RED}$*${RESET}" >&2
}

print_error_block() {
  local output="$1"
  local line

  while IFS= read -r line; do
    [[ -n "$line" ]] && print_error "$line"
  done <<< "$output"
}

err() {
  print_error "error: $*"
  exit 1
}

check() {
  command -v "$1" >/dev/null 2>&1 || err "missing command: $1"
}

REPO_ROOT="$(git rev-parse --show-toplevel 2>/dev/null || echo "")"
[[ -n "$REPO_ROOT" ]] || err "not a git repo"
cd "$REPO_ROOT"

CLIFF_CONFIG="cliff.toml"
CLIFF_CONFIG_DETAILED="cliff-detailed.toml"

TAG_PREFIX="v"
SYNC_VERSIONS="false"

SIGN_MODE="auto"
DRY_RUN="false"
PUSH_CHANGES="false"
GIT_USER=""
GIT_EMAIL=""
GPG_KEY=""
SKIP_UNTRACKED="false"
ALLOW_DIRTY="false"

BUMP_KIND=""
USER_VERSION=""
AUTO_KIND="false"

RC_MODE="false"
PREID="rc"

show_help() {
  echo "$(basename "$0") — release using git-cliff"
  echo
  echo "Usage:"
  echo "  $(basename "$0") --version 0.4.0"
  echo "  $(basename "$0") --major | --minor | --patch"
  echo "  $(basename "$0") --auto"
  echo "  $(basename "$0") [--major|--minor|--patch|--auto] --rc [--preid rc]"
  echo
  echo "Options:"
  echo "  --config <file>                Path to cliff.toml (default: ./${CLIFF_CONFIG})"
  echo "  --omit-tag-prefix              Create tags without v prefix"
  echo "  --sync                         Run version:all to also update versions.json"
  echo "  --push                         Push current branch and annotated tags"
  echo "  --sign                         Force signed tag"
  echo "  --no-sign                      Force unsigned tag"
  echo "  --gpg-key <keyid>              Inline git -c user.signingkey=<keyid>"
  echo "  --git-user <name>              Inline git -c user.name=<name>"
  echo "  --git-email <email>            Inline git -c user.email=<email>"
  echo "  --skip-untracked-files         Allow only untracked files in worktree"
  echo "  --allow-dirty                  Skip ALL worktree checks"
  echo "  --major | --minor | --patch    Manual bump kind"
  echo "  --auto                         Infer bump from commits since last final tag"
  echo "  --version <semver>             Set exact version"
  echo "  --rc                           Create pre-release tag"
  echo "  --preid <id>                   Pre-release identifier (default: rc)"
  echo "  --dry-run                      Print actions without making changes"
  echo "  -h, --help                     Show help"
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --config)
      CLIFF_CONFIG="${2:-}"
      shift 2
      ;;
    --omit-tag-prefix)
      TAG_PREFIX=""
      shift
      ;;
    --sync)
      SYNC_VERSIONS="true"
      shift
      ;;
    --push)
      PUSH_CHANGES="true"
      shift
      ;;
    --sign)
      SIGN_MODE="true"
      shift
      ;;
    --no-sign)
      SIGN_MODE="false"
      shift
      ;;
    --dry-run)
      DRY_RUN="true"
      shift
      ;;
    --git-user)
      GIT_USER="${2:-}"
      shift 2
      ;;
    --git-email)
      GIT_EMAIL="${2:-}"
      shift 2
      ;;
    --gpg-key)
      GPG_KEY="${2:-}"
      shift 2
      ;;
    --skip-untracked-files)
      SKIP_UNTRACKED="true"
      shift
      ;;
    --allow-dirty)
      ALLOW_DIRTY="true"
      shift
      ;;
    --major)
      [[ -z "$BUMP_KIND" && "$AUTO_KIND" != "true" && -z "$USER_VERSION" ]] || err "choose one of --major/--minor/--patch/--auto/--version"
      BUMP_KIND="major"
      shift
      ;;
    --minor)
      [[ -z "$BUMP_KIND" && "$AUTO_KIND" != "true" && -z "$USER_VERSION" ]] || err "choose one of --major/--minor/--patch/--auto/--version"
      BUMP_KIND="minor"
      shift
      ;;
    --patch)
      [[ -z "$BUMP_KIND" && "$AUTO_KIND" != "true" && -z "$USER_VERSION" ]] || err "choose one of --major/--minor/--patch/--auto/--version"
      BUMP_KIND="patch"
      shift
      ;;
    --auto)
      [[ -z "$BUMP_KIND" && "$AUTO_KIND" != "true" && -z "$USER_VERSION" ]] || err "choose one of --major/--minor/--patch/--auto/--version"
      AUTO_KIND="true"
      shift
      ;;
    --version)
      [[ -z "$BUMP_KIND" && "$AUTO_KIND" != "true" && -z "$USER_VERSION" ]] || err "choose one of --major/--minor/--patch/--auto/--version"
      USER_VERSION="${2:-}"
      shift 2
      ;;
    --rc)
      RC_MODE="true"
      shift
      ;;
    --preid)
      PREID="${2:-rc}"
      shift 2
      ;;
    -h|--help)
      show_help
      exit 0
      ;;
    *)
      err "unknown flag: $1"
      ;;
  esac
done

check git
check git-cliff
check bun
check node
check awk

[[ -n "$CLIFF_CONFIG" ]] || err "--config cannot be empty"
[[ -f "$CLIFF_CONFIG" ]] || err "cliff config not found: $CLIFF_CONFIG"
[[ -f "package.json" ]] || err "package.json not found"
[[ -f "manifest.json" ]] || err "manifest.json not found"
[[ -f "versions.json" ]] || err "versions.json not found"

if [[ -e "$CLIFF_CONFIG_DETAILED" && ! -f "$CLIFF_CONFIG_DETAILED" ]]; then
  err "cannot access detailed cliff config: $CLIFF_CONFIG_DETAILED"
fi

if [[ -z "$USER_VERSION" && -z "$BUMP_KIND" && "$AUTO_KIND" != "true" ]]; then
  err "provide one of: --version <semver> | --major | --minor | --patch | --auto"
fi

if [[ -n "$USER_VERSION" ]]; then
  [[ "$USER_VERSION" =~ ^v?[0-9]+\.[0-9]+\.[0-9]+(-[A-Za-z0-9]+(\.[0-9]+)?)?$ ]] \
    || err "--version must be X.Y.Z, vX.Y.Z, X.Y.Z-preid.N, or vX.Y.Z-preid.N"
fi

[[ "$PREID" =~ ^[A-Za-z0-9]+$ ]] || err "--preid must only contain letters and numbers"

if [[ -n "$USER_VERSION" && "$USER_VERSION" =~ -[A-Za-z0-9]+[.-][0-9]+$ && "$RC_MODE" == "true" ]]; then
  err "--version already contains pre-release; do not combine with --rc"
fi

create_tag_name() {
  local version="$1"
  echo "${TAG_PREFIX}${version}"
}

strip_configured_tag_prefix() {
  local tag="$1"

  if [[ -n "$TAG_PREFIX" && "$tag" == "${TAG_PREFIX}"* ]]; then
    echo "${tag#"$TAG_PREFIX"}"
    return
  fi

  echo "$tag"
}

tag_list_pattern() {
  echo "${TAG_PREFIX}[0-9]*"
}

final_tag_regex() {
  if [[ -n "$TAG_PREFIX" ]]; then
    echo "^${TAG_PREFIX}[0-9]+\\.[0-9]+\\.[0-9]+$"
  else
    echo "^[0-9]+\\.[0-9]+\\.[0-9]+$"
  fi
}

bump_semver() {
  local version="$1"
  local kind="$2"
  local major minor patch

  IFS='.' read -r major minor patch <<<"$version"

  case "$kind" in
    major)
      ((major += 1))
      minor=0
      patch=0
      ;;
    minor)
      ((minor += 1))
      patch=0
      ;;
    patch)
      ((patch += 1))
      ;;
    *)
      err "unknown bump kind: $kind"
      ;;
  esac

  echo "${major}.${minor}.${patch}"
}

semver_gt() {
  local left="$1"
  local right="$2"
  local left_major left_minor left_patch
  local right_major right_minor right_patch

  [[ -z "$right" ]] && return 0

  IFS='.' read -r left_major left_minor left_patch <<<"$left"
  IFS='.' read -r right_major right_minor right_patch <<<"$right"

  ((left_major > right_major)) && return 0
  ((left_major < right_major)) && return 1
  ((left_minor > right_minor)) && return 0
  ((left_minor < right_minor)) && return 1
  ((left_patch > right_patch)) && return 0

  return 1
}

check_worktree_clean() {
  if [[ "$ALLOW_DIRTY" == "true" ]]; then
    log_step_warn "allow-dirty enabled: skipping ALL worktree checks"
    return 0
  fi

  local status
  status="$(git status --porcelain=v1)"

  [[ -z "$status" ]] && return 0

  if [[ "$SKIP_UNTRACKED" == "true" ]]; then
    if awk 'BEGIN{ok=1} { if ($1 != "??") ok=0 } END{ exit(ok?0:1) }' <<<"$status"; then
      log_step_warn "skip-untracked-files enabled: ignoring untracked files"
      return 0
    fi
  fi

  print_error "error: working tree not clean; commit/stash first"
  printf '%s\n' "$status"
  return 1
}

latest_final_tag() {
  local pattern
  local regex

  pattern="$(tag_list_pattern)"
  regex="$(final_tag_regex)"

  git tag --list "$pattern" --sort=-v:refname | awk -v re="$regex" '$0 ~ re { print; exit }'
}

infer_auto_kind_repo() {
  local last_final
  local range=""
  local logs

  last_final="$(latest_final_tag || true)"
  [[ -n "$last_final" ]] && range="${last_final}..HEAD"

  logs="$(git log --no-merges --pretty=format:%s ${range} || true)"

  if grep -Eiq 'BREAKING CHANGE|!:' <<<"$logs"; then
    echo "major"
    return
  fi

  if grep -Eiq '^[[:space:]]*feat(\(|:)|^[[:space:]]*feat!' <<<"$logs"; then
    echo "minor"
    return
  fi

  if grep -Eiq '^[[:space:]]*(fix|perf|refactor|revert|build|ci|test|chore|docs)(\(|:)' <<<"$logs"; then
    echo "patch"
    return
  fi

  echo "patch"
}

should_sign() {
  case "$SIGN_MODE" in
    true)
      return 0
      ;;
    false)
      return 1
      ;;
    auto)
      if git config --bool tag.gpgSign | grep -qi true; then
        return 0
      fi

      if [[ -n "$(git config user.signingkey 2>/dev/null || true)" ]]; then
        return 0
      fi

      if git config --bool commit.gpgsign | grep -qi true; then
        return 0
      fi

      return 1
      ;;
    *)
      return 1
      ;;
  esac
}

next_pre_number() {
  local base="$1"
  local pre="$2"
  local prefix="${base}-${pre}."
  local max=-1
  local num
  local tag

  while IFS= read -r tag; do
    [[ "$tag" == "$prefix"* ]] || continue

    num="${tag#"$prefix"}"
    if [[ "$num" =~ ^[0-9]+$ ]] && ((num > max)); then
      max="$num"
    fi
  done < <(git tag --list "${prefix}*")

  if ((max < 0)); then
    echo 0
  else
    echo $((max + 1))
  fi
}

compute_curr_from_tags() {
  local core
  local version
  local tag
  local max_core=""
  local latest_pre

  while IFS= read -r tag; do
    version="$(strip_configured_tag_prefix "$tag")"
    core="${version%%-*}"

    [[ "$core" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]] || continue

    if semver_gt "$core" "$max_core"; then
      max_core="$core"
    fi
  done < <(git tag --list "$(tag_list_pattern)" || true)

  if [[ -z "$max_core" ]]; then
    CURR_CORE="0.0.0"
    CURR_FULL="0.0.0"
    return
  fi

  CURR_CORE="$max_core"

  if git rev-parse -q --verify "refs/tags/$(create_tag_name "$max_core")" >/dev/null; then
    CURR_FULL="$max_core"
    return
  fi

  latest_pre="$(git tag --list "$(create_tag_name "${max_core}-${PREID}.*")" --sort=-v:refname | head -n1 || true)"

  if [[ -n "$latest_pre" ]]; then
    CURR_FULL="$(strip_configured_tag_prefix "$latest_pre")"
  else
    CURR_FULL="$max_core"
  fi
}

extract_tag_verify_summary() {
  local verify_output="$1"
  local key_id=""
  local signature=""

  key_id="$(printf '%s\n' "$verify_output" | sed -nE 's/.*using RSA key ([A-F0-9]+).*/\1/p' | head -n1)"
  signature="$(printf '%s\n' "$verify_output" | sed -nE 's/.*Good signature from "([^"]+)".*/\1/p' | head -n1)"

  [[ -n "$key_id" ]] && log_step "RSA key: $key_id"
  [[ -n "$signature" ]] && log_step "signature: $signature"
}

run_version_script() {
  local version="$1"

  if [[ "$SYNC_VERSIONS" == "true" ]]; then
    log_step "publishing package.json, manifest.json, and versions.json via bun run version:all"

    if [[ "$DRY_RUN" == "true" ]]; then
      log_step_debug "bun run version:all -- ${version}"
      return
    fi

    bun run version:all -- "$version"
    return
  fi

  log_step "publishing package.json and manifest.json via bun run version"

  if [[ "$DRY_RUN" == "true" ]]; then
    log_step_debug "bun run version -- ${version}"
    return
  fi

  bun run version -- "$version"
}

echo
check_worktree_clean || exit 1
echo

echo "==> Mode:          $([[ -n "$USER_VERSION" ]] && echo "explicit ($USER_VERSION)" || { [[ "$AUTO_KIND" == "true" ]] && echo "auto" || echo "auto-bump: $BUMP_KIND"; })"
echo "==> Using config:  $CLIFF_CONFIG"
echo "==> Tag prefix:    ${TAG_PREFIX:-<none>}"
echo "==> Sync versions: $SYNC_VERSIONS"
echo "==> Sign mode:     $SIGN_MODE"
echo "==> RC mode:       $RC_MODE (preid: $PREID)"
echo "==> Push mode:     $PUSH_CHANGES"

if [[ -z "$USER_VERSION" ]]; then
  log_step "checking for unreleased changes since last tag"

  unreleased="$(git-cliff --config "$CLIFF_CONFIG" --unreleased --strip all || true)"

  if [[ -z "${unreleased//[[:space:]]/}" ]]; then
    echo "No new changes since last tag; skipping release and tag creation."
    exit 0
  fi
fi

PRE_PART=""

if [[ -n "$USER_VERSION" ]]; then
  VER_INPUT="${USER_VERSION#v}"
  CORE_NO_PRE="${VER_INPUT%%-*}"
  TARGET_NO_V="$CORE_NO_PRE"

  if [[ "$VER_INPUT" == *-* ]]; then
    PRE_PART="${VER_INPUT#${CORE_NO_PRE}}"
  fi
else
  compute_curr_from_tags

  echo "==> Current core:  $CURR_CORE"
  echo "==> Current full:  $CURR_FULL"

  if [[ "$RC_MODE" == "true" && "$CURR_FULL" =~ ^[0-9]+\.[0-9]+\.[0-9]+-"$PREID"\.[0-9]+$ ]]; then
    TARGET_NO_V="$CURR_CORE"
  elif [[ "$RC_MODE" != "true" && "$CURR_FULL" =~ ^[0-9]+\.[0-9]+\.[0-9]+-"$PREID"\.[0-9]+$ ]]; then
    TARGET_NO_V="$CURR_CORE"
  else
    if [[ "$AUTO_KIND" == "true" ]]; then
      BUMP_KIND="$(infer_auto_kind_repo)"
      echo "==> Auto bump:     $BUMP_KIND"
    fi

    TARGET_NO_V="$(bump_semver "$CURR_CORE" "$BUMP_KIND")"
  fi
fi

BASE_TAG="$(create_tag_name "$TARGET_NO_V")"

if [[ -n "$USER_VERSION" && -n "$PRE_PART" && "$RC_MODE" != "true" ]]; then
  TARGET_VERSION_STR="$VER_INPUT"
  TARGET_TAG="$(create_tag_name "$VER_INPUT")"
elif [[ "$RC_MODE" == "true" ]]; then
  if git rev-parse -q --verify "refs/tags/${BASE_TAG}" >/dev/null; then
    err "final tag ${BASE_TAG} already exists; cannot create pre-release for an already released version"
  fi

  NEXT_N="$(next_pre_number "$BASE_TAG" "$PREID")"
  TARGET_VERSION_STR="${TARGET_NO_V}-${PREID}.${NEXT_N}"
  TARGET_TAG="${BASE_TAG}-${PREID}.${NEXT_N}"
else
  TARGET_VERSION_STR="$TARGET_NO_V"
  TARGET_TAG="$BASE_TAG"
fi

if [[ "$TARGET_TAG" == *-* ]] && git rev-parse -q --verify "refs/tags/${BASE_TAG}" >/dev/null; then
  err "final tag ${BASE_TAG} already exists; cannot create pre-release tag ${TARGET_TAG}"
fi

echo "==> Target version: $TARGET_VERSION_STR"
echo "==> Target tag:     $TARGET_TAG"

if git rev-parse -q --verify "refs/tags/$TARGET_TAG" >/dev/null; then
  err "tag already exists: $TARGET_TAG"
fi

run_version_script "$TARGET_VERSION_STR"

log_step "generating ./CHANGELOG.md via git-cliff"

if [[ "$DRY_RUN" == "true" ]]; then
  log_step_debug "git-cliff --config $CLIFF_CONFIG --tag $TARGET_TAG > CHANGELOG.md"
else
  git-cliff --config "$CLIFF_CONFIG" --tag "$TARGET_TAG" > CHANGELOG.md
  [[ -s "CHANGELOG.md" ]] || err "empty CHANGELOG.md; check cliff config and commit history"
fi

log_step "building tag message via git-cliff"

if [[ "$DRY_RUN" == "true" ]]; then
  log_step_debug "git-cliff --config $CLIFF_CONFIG --unreleased --strip all"
  changelog_for_tag="dry-run changelog"
else
  if [[ -f "$CLIFF_CONFIG_DETAILED" ]]; then
    changelog_for_tag="$(git-cliff --config "$CLIFF_CONFIG_DETAILED" --unreleased --strip all)"
  else
    changelog_for_tag="$(git-cliff --config "$CLIFF_CONFIG" --unreleased --strip all)"
  fi
fi

commit_msg="chore(release): bump version to ${TARGET_TAG}"
log_step "committing: $commit_msg"

if [[ "$DRY_RUN" == "true" ]]; then
  log_step_debug "git add package.json manifest.json versions.json CHANGELOG.md"
  log_step_debug "git commit --quiet -m \"$commit_msg\" -- package.json manifest.json versions.json CHANGELOG.md || true"
else
  git add package.json manifest.json versions.json CHANGELOG.md

  if git diff --cached --quiet -- package.json manifest.json versions.json CHANGELOG.md; then
    log_step_debug "nothing to commit, skipping commit"
  else
    git commit --quiet -m "$commit_msg" -- package.json manifest.json versions.json CHANGELOG.md
  fi
fi

log_step "tagging: $TARGET_TAG"

if [[ "$DRY_RUN" == "true" ]]; then
  if should_sign; then
    log_step_debug "git tag -s -a $TARGET_TAG -m \"Release $TARGET_TAG\" -m \"<changelog>\""
    log_step_debug "git tag -v $TARGET_TAG >/dev/null 2>&1"
    log_step "signed tag verified: $TARGET_TAG"
    log_step_debug "RSA key: <key-id>"
    log_step_debug "signature: <signer>"
  else
    log_step_debug "git tag -a $TARGET_TAG -m \"Release $TARGET_TAG\" -m \"<changelog>\""
  fi
else
  gitc=()

  [[ -n "$GIT_USER" ]] && gitc+=(-c "user.name=$GIT_USER")
  [[ -n "$GIT_EMAIL" ]] && gitc+=(-c "user.email=$GIT_EMAIL")
  [[ -n "$GPG_KEY" ]] && gitc+=(-c "user.signingkey=$GPG_KEY")

  if should_sign; then
    git "${gitc[@]}" tag -s -a "$TARGET_TAG" -m "Release $TARGET_TAG" -m "$changelog_for_tag"

    verify_output="$(git tag -v "$TARGET_TAG" 2>&1 >/dev/null)" || {
      echo
      print_error_block "$verify_output"
      err "failed to verify signed tag: $TARGET_TAG"
    }

    log_step "signed tag verified: $TARGET_TAG"
    extract_tag_verify_summary "$verify_output"
  else
    git "${gitc[@]}" tag -a "$TARGET_TAG" -m "Release $TARGET_TAG" -m "$changelog_for_tag"
  fi
fi

if [[ "$PUSH_CHANGES" == "true" ]]; then
  log_step "pushing current branch and annotated tags"

  if [[ "$DRY_RUN" == "true" ]]; then
    log_step_debug "git push --follow-tags --quiet"
  else
    push_output="$(git push --follow-tags --quiet 2>&1)" || {
      echo
      print_error_block "$push_output"
      err "push failed; release commit and tag were created locally but not pushed"
    }

    log_step "push completed"
  fi
fi

echo
echo "Done → $TARGET_TAG ($( [[ "$TARGET_TAG" == *-* ]] && echo "pre-release" || echo "release" ))"

if [[ "$DRY_RUN" == "true" ]]; then
  echo "Dry-run complete."
elif [[ "$PUSH_CHANGES" == "true" ]]; then
  echo "Release commit and annotated tag have been pushed."
else
  echo "Now push the commit and the tag with: git push --follow-tags"
fi
