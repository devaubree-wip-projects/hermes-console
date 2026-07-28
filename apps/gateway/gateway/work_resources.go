package gateway

import (
	"bytes"
	"context"
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"time"

	"golang.org/x/sys/unix"
)

const workResourceDownloadPath = "/api/runtime/work/resources/download"
const defaultWorkResourceMaxCount = 32

type claimedWorkResource struct {
	ResourceID string `json:"resourceId"`
	Name       string `json:"name"`
	Source     string `json:"source"`
	TargetPath string `json:"targetPath"`
	GrantAlias string `json:"grantAlias,omitempty"`
	GrantPath  string `json:"grantPath,omitempty"`
}

func (executor *WorkExecutor) materializeRunResources(ctx context.Context, run claimedWorkRun, runRoot string) error {
	resourcesRoot, err := resetRunResources(runRoot)
	if err != nil {
		return err
	}
	if len(run.Resources) == 0 {
		return nil
	}
	perFileLimit := int64Value("HERMES_WORK_RESOURCE_MAX_BYTES", 20*1024*1024)
	totalLimit := int64Value("HERMES_WORK_RESOURCE_TOTAL_MAX_BYTES", 100*1024*1024)
	countLimit := int64Value("HERMES_WORK_RESOURCE_MAX_COUNT", defaultWorkResourceMaxCount)
	if perFileLimit < 1 || totalLimit < perFileLimit || countLimit < 1 || countLimit > 128 {
		return fmt.Errorf("invalid Work resource quotas")
	}
	if int64(len(run.Resources)) > countLimit {
		return fmt.Errorf("Work run has too many resources")
	}
	seenTargets := make(map[string]struct{}, len(run.Resources))
	var total int64
	for _, resource := range run.Resources {
		relative, err := safeResourceRelativePath(resource.TargetPath)
		if err != nil {
			return fmt.Errorf("resource %q target: %w", resource.Name, err)
		}
		if _, duplicate := seenTargets[relative]; duplicate {
			return fmt.Errorf("duplicate Work resource target %q", relative)
		}
		seenTargets[relative] = struct{}{}
		destination := filepath.Join(resourcesRoot, relative)
		var source io.ReadCloser
		var declaredSize int64 = -1
		switch resource.Source {
		case "console":
			source, declaredSize, err = executor.downloadConsoleResource(ctx, run, resource)
		case "grant":
			source, declaredSize, err = openGrantedResource(resource)
		default:
			err = fmt.Errorf("unsupported resource source")
		}
		if err != nil {
			return fmt.Errorf("materialize resource %q: %w", resource.Name, err)
		}
		if declaredSize > perFileLimit || (declaredSize >= 0 && total+declaredSize > totalLimit) {
			_ = source.Close()
			return fmt.Errorf("resource %q exceeds configured quota", resource.Name)
		}
		written, stageErr := stageResourceAtomically(resourcesRoot, destination, source, perFileLimit)
		closeErr := source.Close()
		if stageErr != nil {
			return fmt.Errorf("materialize resource %q: %w", resource.Name, stageErr)
		}
		if closeErr != nil {
			return fmt.Errorf("close resource %q: %w", resource.Name, closeErr)
		}
		total += written
		if total > totalLimit {
			_ = os.Remove(destination)
			return fmt.Errorf("Work resources exceed configured total quota")
		}
	}
	return nil
}

// A retry keeps the same run identifier, but its authorization snapshot can
// shrink. Remove the previous snapshot before staging the current one so a
// revoked file or grant cannot survive in ./resources. os.RemoveAll does not
// follow symbolic links; secureMkdirAll then recreates a real run-local
// directory and rejects a swapped symlink/non-directory.
func resetRunResources(runRoot string) (string, error) {
	resourcesRoot := filepath.Join(runRoot, "resources")
	if info, err := os.Lstat(resourcesRoot); err == nil {
		if info.Mode()&os.ModeSymlink != 0 || !info.IsDir() {
			if err := os.Remove(resourcesRoot); err != nil {
				return "", err
			}
		} else if err := os.RemoveAll(resourcesRoot); err != nil {
			return "", err
		}
	} else if !os.IsNotExist(err) {
		return "", err
	}
	if err := secureMkdirAll(runRoot, resourcesRoot); err != nil {
		return "", err
	}
	return resourcesRoot, nil
}

func (executor *WorkExecutor) downloadConsoleResource(
	ctx context.Context,
	run claimedWorkRun,
	resource claimedWorkResource,
) (io.ReadCloser, int64, error) {
	if !safeWorkPathSegment.MatchString(resource.ResourceID) {
		return nil, -1, fmt.Errorf("invalid resource identifier")
	}
	payload, err := json.Marshal(map[string]any{
		"installationId": executor.runInstallationID(run),
		"runId":          run.RunID,
		"resourceId":     resource.ResourceID,
		"leaseToken":     run.LeaseToken,
	})
	if err != nil {
		return nil, -1, err
	}
	endpoint := *executor.config.WorkControlPlaneURL
	endpoint.Path = strings.TrimSuffix(endpoint.Path, "/") + workResourceDownloadPath
	endpoint.RawQuery = ""
	request, err := http.NewRequestWithContext(ctx, http.MethodPost, endpoint.String(), bytes.NewReader(payload))
	if err != nil {
		return nil, -1, err
	}
	nonceBytes := make([]byte, 24)
	if _, err := rand.Read(nonceBytes); err != nil {
		return nil, -1, err
	}
	nonce := hex.EncodeToString(nonceBytes)
	timestamp := time.Now().UnixMilli()
	profile := run.Profile
	if profile == "" {
		profile = "default"
	}
	request.Header.Set("Content-Type", "application/json")
	request.Header.Set(serviceInstallationHeader, executor.config.InstallationID)
	request.Header.Set(serviceProfileHeader, profile)
	request.Header.Set(serviceTimestampHeader, strconv.FormatInt(timestamp, 10))
	request.Header.Set(serviceNonceHeader, nonce)
	request.Header.Set(
		serviceSignatureHeader,
		ServiceSignature(executor.config.ServiceSecret, request.Method, request.URL.RequestURI(), timestamp, nonce, profile, payload),
	)
	response, err := executor.client.Do(request)
	if err != nil {
		return nil, -1, err
	}
	if response.StatusCode < 200 || response.StatusCode >= 300 {
		defer response.Body.Close()
		message, _ := io.ReadAll(io.LimitReader(response.Body, 4096))
		return nil, -1, fmt.Errorf("resource download returned %s: %s", response.Status, strings.TrimSpace(string(message)))
	}
	return response.Body, response.ContentLength, nil
}

func openGrantedResource(resource claimedWorkResource) (io.ReadCloser, int64, error) {
	if !strings.EqualFold(strings.TrimSpace(os.Getenv("HERMES_FS_GRANTS_ENABLED")), "true") {
		return nil, -1, fmt.Errorf("filesystem grants are disabled")
	}
	if !safeGrantAlias(resource.GrantAlias) {
		return nil, -1, fmt.Errorf("invalid grant alias")
	}
	relative, err := safeResourceRelativePath(resource.GrantPath)
	if err != nil {
		return nil, -1, fmt.Errorf("invalid grant path: %w", err)
	}
	root := filepath.Clean(strings.TrimSpace(os.Getenv("HERMES_FS_GRANT_ROOT")))
	if root == "." || !filepath.IsAbs(root) {
		return nil, -1, fmt.Errorf("filesystem grant root is not configured")
	}
	grantRelative := filepath.Join(resource.GrantAlias, relative)
	file, err := openRegularFileBeneath(root, grantRelative)
	if err != nil {
		return nil, -1, err
	}
	info, err := file.Stat()
	if err != nil {
		_ = file.Close()
		return nil, -1, err
	}
	if !info.Mode().IsRegular() {
		_ = file.Close()
		return nil, -1, fmt.Errorf("grant target is not a regular file")
	}
	return file, info.Size(), nil
}

// openRegularFileBeneath resolves every path component relative to an already
// opened grant root. openat2 is the primary Linux boundary: BENEATH prevents
// escape, NO_SYMLINKS closes intermediate-component races, and NO_XDEV rejects
// a host mount inserted below an approved alias. The dirfd walk is a safe
// fallback for older kernels; it never returns to pathname-based resolution.
func openRegularFileBeneath(root, relative string) (*os.File, error) {
	rootFD, err := unix.Open(
		root,
		unix.O_RDONLY|unix.O_DIRECTORY|unix.O_CLOEXEC|unix.O_NOFOLLOW,
		0,
	)
	if err != nil {
		return nil, err
	}
	defer unix.Close(rootFD)

	how := &unix.OpenHow{
		Flags: uint64(unix.O_RDONLY | unix.O_CLOEXEC | unix.O_NOFOLLOW),
		Resolve: unix.RESOLVE_BENEATH |
			unix.RESOLVE_NO_SYMLINKS |
			unix.RESOLVE_NO_MAGICLINKS |
			unix.RESOLVE_NO_XDEV,
	}
	fd, openErr := unix.Openat2(rootFD, relative, how)
	if openErr == nil {
		return os.NewFile(uintptr(fd), filepath.Join(root, relative)), nil
	}
	if openErr != unix.ENOSYS && openErr != unix.EINVAL {
		return nil, openErr
	}
	fd, err = openFileByDirectoryFD(rootFD, relative)
	if err != nil {
		return nil, err
	}
	return os.NewFile(uintptr(fd), filepath.Join(root, relative)), nil
}

func openFileByDirectoryFD(rootFD int, relative string) (int, error) {
	var rootStat unix.Stat_t
	if err := unix.Fstat(rootFD, &rootStat); err != nil {
		return -1, err
	}
	current, err := unix.Dup(rootFD)
	if err != nil {
		return -1, err
	}
	parts := strings.Split(relative, string(filepath.Separator))
	for index, part := range parts {
		last := index == len(parts)-1
		flags := unix.O_RDONLY | unix.O_CLOEXEC | unix.O_NOFOLLOW
		if !last {
			flags |= unix.O_DIRECTORY
		}
		next, openErr := unix.Openat(current, part, flags, 0)
		_ = unix.Close(current)
		if openErr != nil {
			return -1, openErr
		}
		var stat unix.Stat_t
		if statErr := unix.Fstat(next, &stat); statErr != nil {
			_ = unix.Close(next)
			return -1, statErr
		}
		if uint64(stat.Dev) != uint64(rootStat.Dev) {
			_ = unix.Close(next)
			return -1, fmt.Errorf("grant path crosses a filesystem boundary")
		}
		if !last && stat.Mode&unix.S_IFMT != unix.S_IFDIR {
			_ = unix.Close(next)
			return -1, fmt.Errorf("grant path contains a non-directory")
		}
		current = next
	}
	return current, nil
}

func safeGrantAlias(value string) bool {
	if len(value) < 1 || len(value) > 64 {
		return false
	}
	for index, char := range value {
		if (char >= 'a' && char <= 'z') ||
			(char >= 'A' && char <= 'Z') ||
			(char >= '0' && char <= '9') ||
			(index > 0 && (char == '_' || char == '-')) {
			continue
		}
		return false
	}
	return true
}

func safeResourceRelativePath(value string) (string, error) {
	if value == "" || strings.Contains(value, "\\") {
		return "", fmt.Errorf("path is empty or contains a backslash")
	}
	candidate := filepath.Clean(filepath.FromSlash(value))
	if candidate == "." || filepath.IsAbs(candidate) || candidate == ".." ||
		strings.HasPrefix(candidate, ".."+string(filepath.Separator)) {
		return "", fmt.Errorf("path escapes its resource root")
	}
	for _, segment := range strings.Split(candidate, string(filepath.Separator)) {
		if segment == "" || segment == "." || segment == ".." || len(segment) > 128 {
			return "", fmt.Errorf("path contains an unsafe segment")
		}
	}
	if len(candidate) > 512 {
		return "", fmt.Errorf("path is too long")
	}
	return candidate, nil
}

func stageResourceAtomically(root, destination string, source io.Reader, limit int64) (int64, error) {
	if err := secureMkdirAll(root, filepath.Dir(destination)); err != nil {
		return 0, err
	}
	if info, err := os.Lstat(destination); err == nil {
		if info.Mode()&os.ModeSymlink != 0 || !info.Mode().IsRegular() {
			return 0, fmt.Errorf("resource target is unsafe")
		}
	} else if !os.IsNotExist(err) {
		return 0, err
	}
	temporary, err := os.CreateTemp(filepath.Dir(destination), ".resource-*")
	if err != nil {
		return 0, err
	}
	temporaryPath := temporary.Name()
	defer os.Remove(temporaryPath)
	if err := temporary.Chmod(0o600); err != nil {
		_ = temporary.Close()
		return 0, err
	}
	written, copyErr := io.Copy(temporary, io.LimitReader(source, limit+1))
	if syncErr := temporary.Sync(); copyErr == nil {
		copyErr = syncErr
	}
	if closeErr := temporary.Close(); copyErr == nil {
		copyErr = closeErr
	}
	if copyErr != nil {
		return 0, copyErr
	}
	if written > limit {
		return 0, fmt.Errorf("resource exceeds configured file quota")
	}
	if err := os.Rename(temporaryPath, destination); err != nil {
		return 0, err
	}
	return written, nil
}
