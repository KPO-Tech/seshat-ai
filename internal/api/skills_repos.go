package api

import (
	"encoding/json"
	"fmt"
	"net/http"
	"net/url"
	"os"
	"path/filepath"
	"strings"

	skillsloader "github.com/EngineerProjects/nexus-engine/pkg/skills"
	"github.com/EngineerProjects/nexus-engine/pkg/skills/skillrepos"
)

// FeaturedSkillRepo describes a curated skill repository shown in the install catalog.
type FeaturedSkillRepo struct {
	Name        string `json:"name"`
	URL         string `json:"url"`
	Description string `json:"description"`
}

// DefaultNexusSkillsRepo is the official Nexus skills collection. It is cloned
// in the background at first boot so skills are available without user action.
// Operators can override with NEXUS_DEFAULT_SKILL_REPO or disable with "none".
const DefaultNexusSkillsRepo = "https://github.com/EngineerProjects/nexus-skills"

// defaultAllowedSkillRepoHosts is the curated allowlist of git hosting services accepted
// when installing a skill repo via the HTTP API. Operators may override with NEXUS_SKILL_REPO_HOSTS.
var defaultAllowedSkillRepoHosts = []string{
	"github.com",
	"gitlab.com",
	"bitbucket.org",
	"codeberg.org",
}

// validateSkillRepoURL enforces that a repo URL uses HTTPS and comes from an allowed host.
// If allowedHosts is empty, defaultAllowedSkillRepoHosts is used.
func validateSkillRepoURL(raw string, allowedHosts []string) error {
	if !strings.HasPrefix(raw, "https://") {
		scheme := strings.SplitN(raw, "://", 2)[0]
		return fmt.Errorf("skill repo URL must use https:// — %q scheme is not allowed", scheme+"://")
	}
	u, err := url.Parse(raw)
	if err != nil || strings.TrimSpace(u.Host) == "" {
		return fmt.Errorf("skill repo URL is not a valid HTTPS URL")
	}
	hosts := allowedHosts
	if len(hosts) == 0 {
		hosts = defaultAllowedSkillRepoHosts
	}
	host := strings.ToLower(strings.TrimPrefix(u.Host, "www."))
	for _, allowed := range hosts {
		if strings.ToLower(strings.TrimPrefix(allowed, "www.")) == host {
			return nil
		}
	}
	return fmt.Errorf("host %q is not in the allowed skill repo hosts list (allowed: %s) — set NEXUS_SKILL_REPO_HOSTS to add it",
		u.Host, strings.Join(hosts, ", "))
}

// ParseSkillRepoHosts parses a comma-separated list of allowed git hosting domains.
func ParseSkillRepoHosts(raw string) []string {
	var hosts []string
	for _, h := range strings.Split(raw, ",") {
		h = strings.TrimSpace(strings.ToLower(h))
		if h != "" {
			hosts = append(hosts, h)
		}
	}
	return hosts
}

// DefaultFeaturedRepos are always included in the catalog unless the operator
// sets NEXUS_FEATURED_SKILL_REPOS to override them entirely.
var DefaultFeaturedRepos = []FeaturedSkillRepo{
	{
		Name:        "nexus-skills",
		URL:         DefaultNexusSkillsRepo,
		Description: "Official Nexus skills collection: brainstorming, writing-plans, subagent-driven-development, systematic-debugging, TDD, code-review, requesting-code-review, verification-before-completion, skill-creator.",
	},
	{
		Name:        "gstack",
		URL:         "https://github.com/garrytan/gstack",
		Description: "50+ production-ready skills by Garry Tan (YC CEO). Includes review, planning, investigation, documentation, spec writing, retro, and more.",
	},
	{
		Name:        "paperasse",
		URL:         "https://github.com/romainsimon/paperasse",
		Description: "A collection of document and administrative workflow skills.",
	},
	{
		Name:        "ppt-master",
		URL:         "https://github.com/hugohe3/ppt-master",
		Description: "Advanced AI-driven PowerPoint generation (PDF/DOCX/URL → PPTX). Requires Python: pip install -r skills/ppt-master/requirements.txt",
	},
	{
		Name:        "linkedin-skills",
		URL:         "https://github.com/sergebulaev/linkedin-skills",
		Description: "Skills for LinkedIn profile optimization, job search automation, and professional networking.",
	},
}

// countSkillsInRepo counts skills found in repoRoot. It handles two layouts:
//   - multi-skill repos: each subdirectory containing a skill.md is one skill
//   - single-skill repos: a skill.md directly at the repo root counts as one skill
func countSkillsInRepo(repoRoot string) int {
	entries, err := os.ReadDir(repoRoot)
	if err != nil {
		return 0
	}
	count := 0
	for _, e := range entries {
		if e.IsDir() {
			if dirHasSkillFile(filepath.Join(repoRoot, e.Name())) {
				count++
			}
		} else if strings.EqualFold(e.Name(), "skill.md") {
			count++ // root-level single-skill repo
		}
	}
	return count
}

// dirHasSkillFile reports whether dir contains a file named skill.md
// (case-insensitive) at its top level.
func dirHasSkillFile(dir string) bool {
	children, err := os.ReadDir(dir)
	if err != nil {
		return false
	}
	for _, c := range children {
		if !c.IsDir() && strings.EqualFold(c.Name(), "skill.md") {
			return true
		}
	}
	return false
}

// installedRepoNames returns the names of repos currently cloned under reposDir.
func installedRepoNames() map[string]struct{} {
	reposDir := skillsloader.GetSkillReposPath()
	entries, err := os.ReadDir(reposDir)
	if err != nil {
		return nil
	}
	names := make(map[string]struct{}, len(entries))
	for _, e := range entries {
		if e.IsDir() {
			names[e.Name()] = struct{}{}
		}
	}
	return names
}

// ─── HTTP handlers ────────────────────────────────────────────────────────────

// handleSkillRepos dispatches GET and POST on /api/v1/skills/repos.
func (a *App) handleSkillRepos(w http.ResponseWriter, r *http.Request) {
	switch r.Method {
	case http.MethodGet:
		a.handleSkillReposList(w, r)
	case http.MethodPost:
		a.handleSkillRepoInstall(w, r)
	default:
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
	}
}

// GET /api/v1/skills/repos
// Returns:
//
//	{
//	  "installed": [{"name","url","skill_count"}],
//	  "catalog":   [{"name","url","description","installed"}]
//	}
func (a *App) handleSkillReposList(w http.ResponseWriter, r *http.Request) {
	reposDir := skillsloader.GetSkillReposPath()
	installedNames := installedRepoNames()

	type installedEntry struct {
		Name       string `json:"name"`
		URL        string `json:"url,omitempty"`
		SkillCount int    `json:"skill_count"`
	}
	type catalogEntry struct {
		Name        string `json:"name"`
		URL         string `json:"url"`
		Description string `json:"description"`
		Installed   bool   `json:"installed"`
	}

	// Build installed list (never nil so JSON serializes as [] not null).
	installed := make([]installedEntry, 0)
	for name := range installedNames {
		repoRoot := filepath.Join(reposDir, name)
		// Try to read the remote URL from git config for display purposes.
		url := readGitRemoteURL(repoRoot)
		installed = append(installed, installedEntry{
			Name:       name,
			URL:        url,
			SkillCount: countSkillsInRepo(repoRoot),
		})
	}

	// Build catalog from featured repos (never nil so JSON serializes as [] not null).
	catalog := make([]catalogEntry, 0)
	for _, fr := range a.featuredRepos {
		_, isInstalled := installedNames[fr.Name]
		catalog = append(catalog, catalogEntry{
			Name:        fr.Name,
			URL:         fr.URL,
			Description: fr.Description,
			Installed:   isInstalled,
		})
	}

	writeJSON(w, http.StatusOK, map[string]any{
		"installed": installed,
		"catalog":   catalog,
	})
}

// POST /api/v1/skills/repos
// Body: {"url": "https://github.com/..."}
func (a *App) handleSkillRepoInstall(w http.ResponseWriter, r *http.Request) {
	var body struct {
		URL string `json:"url"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		writeJSONError(w, http.StatusBadRequest, "invalid JSON body")
		return
	}
	url := strings.TrimSpace(body.URL)
	if url == "" {
		writeJSONError(w, http.StatusBadRequest, "url is required")
		return
	}
	if err := validateSkillRepoURL(url, a.allowedSkillRepoHosts); err != nil {
		writeJSONError(w, http.StatusBadRequest, err.Error())
		return
	}

	repo := skillrepos.RepoFromURL(url)
	reposDir := skillsloader.GetSkillReposPath()

	// Check it's not already installed.
	target := filepath.Join(reposDir, repo.Name)
	if _, err := os.Stat(filepath.Join(target, ".git")); err == nil {
		writeJSONError(w, http.StatusConflict, fmt.Sprintf("repo %q is already installed", repo.Name))
		return
	}

	cloned := skillrepos.EnsureCloned(r.Context(), reposDir, []skillrepos.Repo{repo})
	if len(cloned) == 0 {
		writeJSONError(w, http.StatusInternalServerError, "failed to clone repository — check the URL and try again")
		return
	}

	writeJSON(w, http.StatusCreated, map[string]any{
		"name":        repo.Name,
		"skill_count": countSkillsInRepo(target),
	})
}

// handleSkillRepoByNameDispatch routes DELETE /api/v1/skills/repos/{name}.
func (a *App) handleSkillRepoByNameDispatch(w http.ResponseWriter, r *http.Request) {
	// Strip leading "/skills/repos/" prefix.
	trimmed := strings.TrimPrefix(r.URL.Path, "/skills/repos/")
	name := filepath.Base(strings.Trim(trimmed, "/"))
	if name == "" || name == "." || name == ".." {
		writeJSONError(w, http.StatusBadRequest, "invalid repo name")
		return
	}
	switch r.Method {
	case http.MethodDelete:
		a.handleSkillRepoUninstall(w, r, name)
	default:
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
	}
}

// DELETE /api/v1/skills/repos/{name}
func (a *App) handleSkillRepoUninstall(w http.ResponseWriter, r *http.Request, name string) {
	reposDir := skillsloader.GetSkillReposPath()
	target := filepath.Join(reposDir, name)

	// Prevent path traversal: the cleaned target must still be inside reposDir.
	if !strings.HasPrefix(filepath.Clean(target)+string(filepath.Separator), filepath.Clean(reposDir)+string(filepath.Separator)) {
		writeJSONError(w, http.StatusBadRequest, "invalid repo name")
		return
	}

	if _, err := os.Stat(target); os.IsNotExist(err) {
		writeJSONError(w, http.StatusNotFound, fmt.Sprintf("repo %q is not installed", name))
		return
	}

	if err := os.RemoveAll(target); err != nil {
		writeJSONError(w, http.StatusInternalServerError, "failed to remove repository")
		return
	}

	w.WriteHeader(http.StatusNoContent)
}

// readGitRemoteURL returns the remote origin URL of a cloned repo, or empty string on error.
func readGitRemoteURL(repoDir string) string {
	data, err := os.ReadFile(filepath.Join(repoDir, ".git", "config"))
	if err != nil {
		return ""
	}
	for _, line := range strings.Split(string(data), "\n") {
		line = strings.TrimSpace(line)
		if strings.HasPrefix(line, "url = ") {
			return strings.TrimPrefix(line, "url = ")
		}
	}
	return ""
}
