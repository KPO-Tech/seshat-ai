package iam

import (
	"fmt"
	"strconv"
	"strings"
)

// parseAppVersion parses a plain "major.minor.patch" version string (no "v"
// prefix, no pre-release suffix - the exact format seshat-ui's own
// package.json version field uses) into its three integer components. A
// small hand-rolled parser instead of a semver dependency: this dotted
// three-integer shape is the only version format any part of the product
// actually produces or needs to compare.
func parseAppVersion(raw string) ([3]int, error) {
	var out [3]int
	parts := strings.Split(strings.TrimSpace(raw), ".")
	if len(parts) != 3 {
		return out, fmt.Errorf("invalid app version %q: expected major.minor.patch", raw)
	}
	for i, part := range parts {
		n, err := strconv.Atoi(strings.TrimSpace(part))
		if err != nil || n < 0 {
			return out, fmt.Errorf("invalid app version %q: segment %q is not a non-negative integer", raw, part)
		}
		out[i] = n
	}
	return out, nil
}

// CompareAppVersions returns -1, 0, or 1 as a is less than, equal to, or
// greater than b, comparing major/minor/patch in order. Returns an error if
// either version fails to parse as major.minor.patch - callers in this
// codebase treat that as "skip the comparison," not as an outage, since
// app-version restriction is enforced as a warning, never a block.
func CompareAppVersions(a, b string) (int, error) {
	av, err := parseAppVersion(a)
	if err != nil {
		return 0, err
	}
	bv, err := parseAppVersion(b)
	if err != nil {
		return 0, err
	}
	for i := 0; i < 3; i++ {
		if av[i] != bv[i] {
			if av[i] < bv[i] {
				return -1, nil
			}
			return 1, nil
		}
	}
	return 0, nil
}

// normalizeAppVersion trims raw and returns nil if it's empty (no minimum
// version configured), or a pointer to the trimmed value once it's been
// validated to parse as major.minor.patch.
func normalizeAppVersion(raw string) (*string, error) {
	trimmed := strings.TrimSpace(raw)
	if trimmed == "" {
		return nil, nil
	}
	if _, err := parseAppVersion(trimmed); err != nil {
		return nil, ErrInvalidInput(err.Error())
	}
	return &trimmed, nil
}
