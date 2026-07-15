package gateway

import (
	"context"
	"os"
	"path/filepath"
	"testing"
)

func TestEncryptedBackupExcludesSecretsVerifiesAndRestoresAtomically(t *testing.T) {
	home := filepath.Join(t.TempDir(), "hermes")
	backupDir := filepath.Join(t.TempDir(), "backups")
	if err := os.MkdirAll(filepath.Join(home, "sessions"), 0o700); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(home, "config.yaml"), []byte("model: before\n"), 0o600); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(home, "sessions", "one.json"), []byte("{}\n"), 0o600); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(home, ".env"), []byte("SECRET=do-not-copy\n"), 0o600); err != nil {
		t.Fatal(err)
	}
	config := Config{HermesHome: home, BackupDirectory: backupDir, BackupEncryptionKey: "backup-encryption-key-with-at-least-32-characters", BackupRestoreEnabled: true}
	created, err := createEncryptedProfileBackup(context.Background(), config, "default", "backup-one", false)
	if err != nil {
		t.Fatal(err)
	}
	if !created.Verified || created.SecretsPolicy != "excluded" || created.ChecksumSHA256 == "" {
		t.Fatalf("invalid backup metadata: %#v", created)
	}
	if _, err := verifyEncryptedProfileBackup(context.Background(), config, "default", "backup-one"); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(home, "config.yaml"), []byte("model: after\n"), 0o600); err != nil {
		t.Fatal(err)
	}
	if _, err := restoreEncryptedProfileBackup(context.Background(), config, "default", "backup-one"); err != nil {
		t.Fatal(err)
	}
	contents, _ := os.ReadFile(filepath.Join(home, "config.yaml"))
	if string(contents) != "model: before\n" {
		t.Fatalf("backup was not restored: %q", contents)
	}
	if _, err := os.Stat(filepath.Join(home, ".env")); !os.IsNotExist(err) {
		t.Fatal("excluded secret survived replacement restore")
	}

	encryptedPath := backupPath(config, "backup-one")
	encrypted, _ := os.ReadFile(encryptedPath)
	encrypted[len(encrypted)-1] ^= 0xff
	if err := os.WriteFile(encryptedPath, encrypted, 0o600); err != nil {
		t.Fatal(err)
	}
	if _, err := verifyEncryptedProfileBackup(context.Background(), config, "default", "backup-one"); err == nil {
		t.Fatal("tampered encrypted backup passed verification")
	}
}

func TestBackupRejectsSymlinkEscapes(t *testing.T) {
	home := t.TempDir()
	if err := os.Mkdir(filepath.Join(home, "sessions"), 0o700); err != nil {
		t.Fatal(err)
	}
	if err := os.Symlink("/etc/passwd", filepath.Join(home, "sessions", "escape")); err != nil {
		t.Fatal(err)
	}
	config := Config{HermesHome: home, BackupDirectory: t.TempDir(), BackupEncryptionKey: "backup-encryption-key-with-at-least-32-characters"}
	if _, err := createEncryptedProfileBackup(context.Background(), config, "default", "unsafe", false); err == nil {
		t.Fatal("backup followed a symlink")
	}
}

func TestEncryptedBackupRestoresIntoANewInstallationWithSharedStorage(t *testing.T) {
	root := t.TempDir()
	sourceHome := filepath.Join(root, "source")
	targetHome := filepath.Join(root, "target")
	sharedBackups := filepath.Join(root, "shared-backups")
	for _, home := range []string{sourceHome, targetHome} {
		if err := os.MkdirAll(home, 0o700); err != nil {
			t.Fatal(err)
		}
	}
	if err := os.WriteFile(filepath.Join(sourceHome, "config.yaml"), []byte("source-state\n"), 0o600); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(targetHome, "config.yaml"), []byte("fresh-target\n"), 0o600); err != nil {
		t.Fatal(err)
	}
	key := "shared-backup-encryption-key-with-at-least-32-characters"
	source := Config{HermesHome: sourceHome, BackupDirectory: sharedBackups, BackupEncryptionKey: key}
	target := Config{HermesHome: targetHome, BackupDirectory: sharedBackups, BackupEncryptionKey: key, BackupRestoreEnabled: true}
	if _, err := createEncryptedProfileBackup(context.Background(), source, "default", "portable", false); err != nil {
		t.Fatal(err)
	}
	if _, err := restoreEncryptedProfileBackup(context.Background(), target, "default", "portable"); err != nil {
		t.Fatal(err)
	}
	contents, _ := os.ReadFile(filepath.Join(targetHome, "config.yaml"))
	if string(contents) != "source-state\n" {
		t.Fatalf("new installation did not receive backup: %q", contents)
	}
}
