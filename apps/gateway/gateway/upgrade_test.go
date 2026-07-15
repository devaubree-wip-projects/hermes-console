package gateway

import (
	"context"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestUpgradeExecutorUsesFixedArgumentsAndNoShell(t *testing.T) {
	directory := t.TempDir()
	output := filepath.Join(directory, "args")
	script := filepath.Join(directory, "executor")
	contents := "#!/bin/sh\nprintf '%s\\n' \"$@\" > " + output + "\n"
	if err := os.WriteFile(script, []byte(contents), 0o700); err != nil {
		t.Fatal(err)
	}
	if err := executeUpgradeCommand(context.Background(), script, "upgrade", "v2026.8.0", "profile-a"); err != nil {
		t.Fatal(err)
	}
	arguments, _ := os.ReadFile(output)
	if strings.TrimSpace(string(arguments)) != "upgrade\n--version\nv2026.8.0\n--profile\nprofile-a" {
		t.Fatalf("unexpected arguments: %q", arguments)
	}
	if err := executeUpgradeCommand(context.Background(), script, "shell", "$(touch /tmp/pwn)", "profile-a"); err == nil {
		t.Fatal("arbitrary action accepted")
	}
}

func TestUpgradeMutationCanRollbackApplicationAndDataCopy(t *testing.T) {
	root := t.TempDir()
	home := filepath.Join(root, "hermes")
	if err := os.MkdirAll(home, 0o700); err != nil {
		t.Fatal(err)
	}
	configPath := filepath.Join(home, "config.yaml")
	if err := os.WriteFile(configPath, []byte("version: before\n"), 0o600); err != nil {
		t.Fatal(err)
	}
	backupConfig := Config{HermesHome: home, BackupDirectory: filepath.Join(root, "backups"), BackupEncryptionKey: "rollback-encryption-key-with-at-least-32-characters", BackupRestoreEnabled: true}
	if _, err := createEncryptedProfileBackup(context.Background(), backupConfig, "default", "pre-upgrade", false); err != nil {
		t.Fatal(err)
	}

	marker := filepath.Join(root, "application-version")
	executor := filepath.Join(root, "executor")
	script := "#!/bin/sh\nprintf '%s' \"$1:$3\" > " + marker + "\n"
	if err := os.WriteFile(executor, []byte(script), 0o700); err != nil {
		t.Fatal(err)
	}
	if err := executeUpgradeCommand(context.Background(), executor, "upgrade", "v-next", "default"); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(configPath, []byte("version: incompatible\n"), 0o600); err != nil {
		t.Fatal(err)
	}
	if err := executeUpgradeCommand(context.Background(), executor, "rollback", "v-before", "default"); err != nil {
		t.Fatal(err)
	}
	if _, err := restoreEncryptedProfileBackup(context.Background(), backupConfig, "default", "pre-upgrade"); err != nil {
		t.Fatal(err)
	}
	application, _ := os.ReadFile(marker)
	data, _ := os.ReadFile(configPath)
	if string(application) != "rollback:v-before" || string(data) != "version: before\n" {
		t.Fatalf("rollback incomplete: app=%q data=%q", application, data)
	}
}
