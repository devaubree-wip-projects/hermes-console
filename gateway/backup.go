package gateway

import (
	"archive/tar"
	"bytes"
	"compress/gzip"
	"context"
	"crypto/aes"
	"crypto/cipher"
	"crypto/rand"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"os"
	"path/filepath"
	"regexp"
	"strings"
	"time"
)

var backupIDPattern = regexp.MustCompile(`^[a-zA-Z0-9][a-zA-Z0-9_-]{0,127}$`)
var profileBackupEntries = []string{"config.yaml", "SOUL.md", "skills", "plugins", "sessions", "memory", "memories", "cron", "state.db", "state.db-wal", "state.db-shm"}
var secretBackupEntries = []string{".env", "auth.json", "secrets.json", "credentials.json"}
var backupMagic = []byte("HCB1")

type backupResult struct {
	BackupID       string `json:"backupId"`
	StorageRef     string `json:"storageRef"`
	ChecksumSHA256 string `json:"checksumSha256"`
	SizeBytes      int64  `json:"sizeBytes"`
	SecretsPolicy  string `json:"secretsPolicy"`
	Verified       bool   `json:"verified"`
}

func (server *Server) controlBackup(w http.ResponseWriter, r *http.Request) {
	body, err := io.ReadAll(http.MaxBytesReader(w, r.Body, server.config.MaxRequestBodySize))
	if err != nil {
		http.Error(w, "request body too large", http.StatusRequestEntityTooLarge)
		return
	}
	profile, err := server.verifyServiceRequest(r, body)
	if err != nil {
		http.Error(w, "invalid service authentication", http.StatusUnauthorized)
		return
	}
	var command struct {
		Action         string `json:"action"`
		Profile        string `json:"profile"`
		BackupID       string `json:"backupId"`
		IncludeSecrets bool   `json:"includeSecrets"`
	}
	if json.Unmarshal(body, &command) != nil || command.Profile != profile || !backupIDPattern.MatchString(command.BackupID) {
		http.Error(w, "invalid backup command", http.StatusBadRequest)
		return
	}
	if server.config.BackupDirectory == "" || len(server.config.BackupEncryptionKey) < 32 {
		http.Error(w, "encrypted backups are not configured", http.StatusNotImplemented)
		return
	}
	var result backupResult
	switch command.Action {
	case "create":
		result, err = createEncryptedProfileBackup(r.Context(), server.config, profile, command.BackupID, command.IncludeSecrets)
	case "verify":
		result, err = verifyEncryptedProfileBackup(r.Context(), server.config, profile, command.BackupID)
	case "restore":
		if !server.config.BackupRestoreEnabled {
			http.Error(w, "restore capability is disabled", http.StatusForbidden)
			return
		}
		result, err = restoreEncryptedProfileBackup(r.Context(), server.config, profile, command.BackupID)
	case "delete":
		err = os.Remove(backupPath(server.config, command.BackupID))
		if err == nil {
			result = backupResult{BackupID: command.BackupID, StorageRef: "edge://backups/" + command.BackupID}
		}
	default:
		http.Error(w, "unsupported backup action", http.StatusBadRequest)
		return
	}
	if err != nil {
		server.logger.Error("Backup operation failed", "action", command.Action, "backupId", command.BackupID, "error", err)
		http.Error(w, "backup operation failed", http.StatusBadGateway)
		return
	}
	writeJSON(w, http.StatusOK, result)
}

func backupAEAD(secret string) (cipher.AEAD, error) {
	if len(secret) < 32 {
		return nil, errors.New("backup encryption key must contain at least 32 characters")
	}
	digest := sha256.Sum256([]byte(secret))
	block, err := aes.NewCipher(digest[:])
	if err != nil {
		return nil, err
	}
	return cipher.NewGCM(block)
}

func profileDirectory(home, profile string) (string, error) {
	if !validProfile(profile) {
		return "", errors.New("invalid profile")
	}
	if profile == "default" {
		return filepath.Clean(home), nil
	}
	return filepath.Join(filepath.Clean(home), "profiles", profile), nil
}

func isSecretEntry(relative string) bool {
	base := filepath.Base(relative)
	for _, secret := range secretBackupEntries {
		if base == secret {
			return true
		}
	}
	return false
}

func writeTarEntry(writer *tar.Writer, root, target, relative string, includeSecrets bool) error {
	info, err := os.Lstat(target)
	if err != nil {
		return err
	}
	if info.Mode()&os.ModeSymlink != 0 {
		return fmt.Errorf("symlink rejected: %s", relative)
	}
	if isSecretEntry(relative) && !includeSecrets {
		return nil
	}
	header, err := tar.FileInfoHeader(info, "")
	if err != nil {
		return err
	}
	header.Name = filepath.ToSlash(relative)
	header.Uid, header.Gid = 0, 0
	header.ModTime, header.AccessTime, header.ChangeTime = time.Time{}, time.Time{}, time.Time{}
	if err := writer.WriteHeader(header); err != nil {
		return err
	}
	if info.IsDir() {
		entries, err := os.ReadDir(target)
		if err != nil {
			return err
		}
		for _, entry := range entries {
			childRelative := filepath.Join(relative, entry.Name())
			if err := writeTarEntry(writer, root, filepath.Join(target, entry.Name()), childRelative, includeSecrets); err != nil {
				return err
			}
		}
		return nil
	}
	if !info.Mode().IsRegular() {
		return fmt.Errorf("unsupported file type: %s", relative)
	}
	file, err := os.Open(target)
	if err != nil {
		return err
	}
	defer file.Close()
	_, err = io.Copy(writer, file)
	return err
}

func archiveProfile(ctx context.Context, home, profile string, includeSecrets bool) ([]byte, error) {
	root, err := profileDirectory(home, profile)
	if err != nil {
		return nil, err
	}
	if _, err := os.Stat(root); err != nil {
		return nil, err
	}
	var compressed bytes.Buffer
	gzipWriter := gzip.NewWriter(&compressed)
	tarWriter := tar.NewWriter(gzipWriter)
	entries := append([]string(nil), profileBackupEntries...)
	if includeSecrets {
		entries = append(entries, secretBackupEntries...)
	}
	for _, entry := range entries {
		if ctx.Err() != nil {
			return nil, ctx.Err()
		}
		target := filepath.Join(root, entry)
		if _, statErr := os.Lstat(target); errors.Is(statErr, os.ErrNotExist) {
			continue
		} else if statErr != nil {
			return nil, statErr
		}
		if err := writeTarEntry(tarWriter, root, target, entry, includeSecrets); err != nil {
			return nil, err
		}
	}
	if err := tarWriter.Close(); err != nil {
		return nil, err
	}
	if err := gzipWriter.Close(); err != nil {
		return nil, err
	}
	return compressed.Bytes(), nil
}

func backupPath(config Config, backupID string) string {
	return filepath.Join(config.BackupDirectory, backupID+".hcb")
}

func createEncryptedProfileBackup(ctx context.Context, config Config, profile, backupID string, includeSecrets bool) (backupResult, error) {
	archive, err := archiveProfile(ctx, config.HermesHome, profile, includeSecrets)
	if err != nil {
		return backupResult{}, err
	}
	aead, err := backupAEAD(config.BackupEncryptionKey)
	if err != nil {
		return backupResult{}, err
	}
	nonce := make([]byte, aead.NonceSize())
	if _, err := rand.Read(nonce); err != nil {
		return backupResult{}, err
	}
	contents := append(append(append([]byte(nil), backupMagic...), nonce...), aead.Seal(nil, nonce, archive, []byte(profile))...)
	if err := os.MkdirAll(config.BackupDirectory, 0o700); err != nil {
		return backupResult{}, err
	}
	target := backupPath(config, backupID)
	if _, err := os.Stat(target); err == nil {
		return backupResult{}, errors.New("backup already exists")
	}
	temporary := target + ".tmp"
	if err := os.WriteFile(temporary, contents, 0o600); err != nil {
		return backupResult{}, err
	}
	if err := os.Rename(temporary, target); err != nil {
		_ = os.Remove(temporary)
		return backupResult{}, err
	}
	digest := sha256.Sum256(contents)
	return backupResult{BackupID: backupID, StorageRef: "edge://backups/" + backupID, ChecksumSHA256: hex.EncodeToString(digest[:]), SizeBytes: int64(len(contents)), SecretsPolicy: map[bool]string{true: "encrypted", false: "excluded"}[includeSecrets], Verified: true}, nil
}

func decryptBackup(config Config, profile, backupID string) ([]byte, backupResult, error) {
	contents, err := os.ReadFile(backupPath(config, backupID))
	if err != nil {
		return nil, backupResult{}, err
	}
	aead, err := backupAEAD(config.BackupEncryptionKey)
	if err != nil {
		return nil, backupResult{}, err
	}
	if len(contents) < len(backupMagic)+aead.NonceSize() || !bytes.Equal(contents[:len(backupMagic)], backupMagic) {
		return nil, backupResult{}, errors.New("invalid backup format")
	}
	nonce := contents[len(backupMagic) : len(backupMagic)+aead.NonceSize()]
	archive, err := aead.Open(nil, nonce, contents[len(backupMagic)+aead.NonceSize():], []byte(profile))
	if err != nil {
		return nil, backupResult{}, err
	}
	if err := validateArchive(archive); err != nil {
		return nil, backupResult{}, err
	}
	digest := sha256.Sum256(contents)
	return archive, backupResult{BackupID: backupID, StorageRef: "edge://backups/" + backupID, ChecksumSHA256: hex.EncodeToString(digest[:]), SizeBytes: int64(len(contents)), Verified: true}, nil
}

func validateArchive(archive []byte) error {
	gzipReader, err := gzip.NewReader(bytes.NewReader(archive))
	if err != nil {
		return err
	}
	defer gzipReader.Close()
	reader := tar.NewReader(gzipReader)
	for {
		header, err := reader.Next()
		if errors.Is(err, io.EOF) {
			return nil
		}
		if err != nil {
			return err
		}
		clean := filepath.Clean(filepath.FromSlash(header.Name))
		if clean == "." || filepath.IsAbs(clean) || strings.HasPrefix(clean, ".."+string(filepath.Separator)) || header.Typeflag == tar.TypeSymlink || header.Typeflag == tar.TypeLink {
			return errors.New("unsafe backup archive")
		}
	}
}

func verifyEncryptedProfileBackup(_ context.Context, config Config, profile, backupID string) (backupResult, error) {
	_, result, err := decryptBackup(config, profile, backupID)
	if err != nil {
		return backupResult{}, errors.New("backup integrity verification failed")
	}
	return result, nil
}

func restoreEncryptedProfileBackup(_ context.Context, config Config, profile, backupID string) (backupResult, error) {
	archive, result, err := decryptBackup(config, profile, backupID)
	if err != nil {
		return backupResult{}, err
	}
	target, err := profileDirectory(config.HermesHome, profile)
	if err != nil {
		return backupResult{}, err
	}
	temporary := target + fmt.Sprintf(".restoring-%d", time.Now().UnixNano())
	if err := os.MkdirAll(temporary, 0o700); err != nil {
		return backupResult{}, err
	}
	defer os.RemoveAll(temporary)
	if err := extractArchive(archive, temporary); err != nil {
		return backupResult{}, err
	}
	previous := target + fmt.Sprintf(".pre-restore-%d", time.Now().UnixNano())
	if err := os.Rename(target, previous); err != nil {
		return backupResult{}, err
	}
	if err := os.Rename(temporary, target); err != nil {
		_ = os.Rename(previous, target)
		return backupResult{}, err
	}
	_ = os.RemoveAll(previous)
	result.Verified = true
	return result, nil
}

func extractArchive(archive []byte, target string) error {
	gzipReader, err := gzip.NewReader(bytes.NewReader(archive))
	if err != nil {
		return err
	}
	defer gzipReader.Close()
	reader := tar.NewReader(gzipReader)
	for {
		header, err := reader.Next()
		if errors.Is(err, io.EOF) {
			return nil
		}
		if err != nil {
			return err
		}
		clean := filepath.Clean(filepath.FromSlash(header.Name))
		if clean == "." || filepath.IsAbs(clean) || strings.HasPrefix(clean, ".."+string(filepath.Separator)) {
			return errors.New("unsafe backup path")
		}
		path := filepath.Join(target, clean)
		if !strings.HasPrefix(path, filepath.Clean(target)+string(filepath.Separator)) {
			return errors.New("backup path escape")
		}
		switch header.Typeflag {
		case tar.TypeDir:
			if err := os.MkdirAll(path, os.FileMode(header.Mode)&0o700); err != nil {
				return err
			}
		case tar.TypeReg:
			if err := os.MkdirAll(filepath.Dir(path), 0o700); err != nil {
				return err
			}
			file, err := os.OpenFile(path, os.O_CREATE|os.O_EXCL|os.O_WRONLY, os.FileMode(header.Mode)&0o600)
			if err != nil {
				return err
			}
			if _, err = io.Copy(file, reader); err != nil {
				_ = file.Close()
				return err
			}
			if err = file.Close(); err != nil {
				return err
			}
		default:
			return errors.New("unsupported backup entry")
		}
	}
}
