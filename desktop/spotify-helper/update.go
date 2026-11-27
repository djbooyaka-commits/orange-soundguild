package main

import (
	"crypto/sha256"
	"debug/pe"
	_ "embed"
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
)

//go:embed version.txt
var embeddedVersion string

const updateManifestURL = site + "/downloads/spotify-helper-update.json"
const updateBinaryURL = site + "/downloads/OSG-Spotify-Helper.exe"
const maxUpdateSize = 64 << 20

type UpdateManifest struct {
	Version string `json:"version"`
	URL     string `json:"url"`
	SHA256  string `json:"sha256"`
	Size    int64  `json:"size"`
}

func versionParts(v string) ([3]int, error) {
	var result [3]int
	parts := strings.Split(strings.TrimSpace(v), ".")
	if len(parts) != 3 {
		return result, fmt.Errorf("invalid release version")
	}
	for i, part := range parts {
		n, err := strconv.Atoi(part)
		if err != nil || n < 0 || strconv.Itoa(n) != part {
			return result, fmt.Errorf("invalid release version")
		}
		result[i] = n
	}
	return result, nil
}

func newerVersion(next, current string) (bool, error) {
	n, err := versionParts(next)
	if err != nil {
		return false, err
	}
	c, err := versionParts(current)
	if err != nil {
		return false, err
	}
	for i := range n {
		if n[i] != c[i] {
			return n[i] > c[i], nil
		}
	}
	return false, nil
}

func validateManifest(m UpdateManifest) error {
	if _, err := versionParts(m.Version); err != nil {
		return err
	}
	hash, err := hex.DecodeString(m.SHA256)
	if err != nil || len(hash) != sha256.Size || m.URL != updateBinaryURL || m.Size <= 0 || m.Size > maxUpdateSize {
		return fmt.Errorf("update details failed validation")
	}
	return nil
}

func updateClient(timeout time.Duration) *http.Client {
	return &http.Client{Timeout: timeout, CheckRedirect: func(*http.Request, []*http.Request) error { return http.ErrUseLastResponse }}
}

func fetchUpdate(client *http.Client) (UpdateManifest, error) {
	var m UpdateManifest
	req, err := http.NewRequest("GET", updateManifestURL, nil)
	if err != nil {
		return m, err
	}
	req.Header.Set("Cache-Control", "no-cache")
	r, err := client.Do(req)
	if err != nil {
		return m, err
	}
	defer r.Body.Close()
	if r.StatusCode != http.StatusOK {
		return m, fmt.Errorf("update check unavailable")
	}
	if err = json.NewDecoder(io.LimitReader(r.Body, 8192)).Decode(&m); err != nil {
		return m, err
	}
	return m, validateManifest(m)
}

func verifyUpdate(path string, m UpdateManifest) error {
	f, err := os.Open(path)
	if err != nil {
		return err
	}
	defer f.Close()
	info, err := f.Stat()
	if err != nil {
		return err
	}
	if info.Size() != m.Size {
		return fmt.Errorf("update size mismatch")
	}
	h := sha256.New()
	if _, err := io.Copy(h, f); err != nil {
		return err
	}
	if !strings.EqualFold(hex.EncodeToString(h.Sum(nil)), m.SHA256) {
		return fmt.Errorf("update checksum mismatch")
	}
	if _, err := f.Seek(0, io.SeekStart); err != nil {
		return err
	}
	exe, err := pe.NewFile(f)
	if err != nil {
		return fmt.Errorf("update is not a Windows executable")
	}
	defer exe.Close()
	if exe.Machine != pe.IMAGE_FILE_MACHINE_AMD64 {
		return fmt.Errorf("update is not a 64-bit Windows executable")
	}
	return nil
}

func downloadUpdate(client *http.Client, m UpdateManifest) (string, error) {
	if err := validateManifest(m); err != nil {
		return "", err
	}
	dir, err := os.MkdirTemp("", "osg-spotify-update-")
	if err != nil {
		return "", err
	}
	success := false
	defer func() {
		if !success {
			os.RemoveAll(dir)
		}
	}()
	r, err := client.Get(m.URL)
	if err != nil {
		return "", err
	}
	defer r.Body.Close()
	if r.StatusCode != http.StatusOK {
		return "", fmt.Errorf("update download unavailable")
	}
	path := filepath.Join(dir, "release.exe")
	f, err := os.OpenFile(path, os.O_CREATE|os.O_EXCL|os.O_WRONLY, 0600)
	if err != nil {
		return "", err
	}
	n, copyErr := io.Copy(f, io.LimitReader(r.Body, m.Size+1))
	closeErr := f.Close()
	if copyErr != nil || closeErr != nil || n != m.Size {
		return "", fmt.Errorf("update download incomplete")
	}
	if err := verifyUpdate(path, m); err != nil {
		return "", err
	}
	success = true
	return path, nil
}
