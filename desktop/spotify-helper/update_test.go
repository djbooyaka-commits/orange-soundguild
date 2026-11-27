package main

import (
	"bytes"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"io"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

type updateTransport func(*http.Request) (*http.Response, error)

func (f updateTransport) RoundTrip(r *http.Request) (*http.Response, error) { return f(r) }

func TestNewVersionsOnly(t *testing.T) {
	for _, tc := range []struct {
		next, current string
		want          bool
	}{
		{"1.1.0", "1.0.0", true}, {"1.10.0", "1.9.0", true},
		{"1.1.0", "1.1.0", false}, {"1.0.0", "1.1.0", false}, {"2.0.0", "1.9.9", true},
	} {
		got, err := newerVersion(tc.next, tc.current)
		if err != nil || got != tc.want {
			t.Fatalf("%s vs %s: %v %v", tc.next, tc.current, got, err)
		}
	}
	if _, err := newerVersion("invalid", "1.0.0"); err == nil {
		t.Fatal("accepted invalid version")
	}
}

func validManifest(data []byte) UpdateManifest {
	hash := sha256.Sum256(data)
	return UpdateManifest{Version: "1.1.0", URL: updateBinaryURL, SHA256: hex.EncodeToString(hash[:]), Size: int64(len(data))}
}

func TestManifestRejectsUntrustedDownloads(t *testing.T) {
	m := validManifest([]byte("example"))
	for _, url := range []string{"http://orangesoundguild.com/downloads/OSG-Spotify-Helper.exe", "https://evil.example/app.exe", updateBinaryURL + "?other=1"} {
		bad := m
		bad.URL = url
		if validateManifest(bad) == nil {
			t.Fatalf("accepted URL %s", url)
		}
	}
	bad := m
	bad.Size = maxUpdateSize + 1
	if validateManifest(bad) == nil {
		t.Fatal("accepted oversized release")
	}
	bad = m
	bad.SHA256 = "bad"
	if validateManifest(bad) == nil {
		t.Fatal("accepted invalid checksum")
	}
}

func releaseBytes(t *testing.T) []byte {
	t.Helper()
	data, err := os.ReadFile("../../public/downloads/OSG-Spotify-Helper.exe")
	if err != nil {
		t.Fatal(err)
	}
	return data
}

func TestVerifiedUpdateDownloadAndNoCredentials(t *testing.T) {
	data := releaseBytes(t)
	m := validManifest(data)
	client := &http.Client{Transport: updateTransport(func(r *http.Request) (*http.Response, error) {
		if r.Header.Get("Authorization") != "" || r.Header.Get("Cookie") != "" || r.URL.RawQuery != "" {
			t.Fatal("update request sent credentials")
		}
		var body []byte
		switch r.URL.String() {
		case updateManifestURL:
			body, _ = json.Marshal(m)
		case updateBinaryURL:
			body = data
		default:
			t.Fatal("untrusted URL requested")
		}
		return &http.Response{StatusCode: 200, Body: io.NopCloser(bytes.NewReader(body)), Header: make(http.Header)}, nil
	})}
	got, err := fetchUpdate(client)
	if err != nil || got != m {
		t.Fatalf("manifest: %+v %v", got, err)
	}
	path, err := downloadUpdate(client, got)
	if err != nil {
		t.Fatal(err)
	}
	defer os.RemoveAll(filepath.Dir(path))
	if err := verifyUpdate(path, m); err != nil {
		t.Fatal(err)
	}
}

func TestCorruptOrIncompleteUpdateRejected(t *testing.T) {
	data := releaseBytes(t)
	m := validManifest(data)
	for _, body := range [][]byte{data[:len(data)-1], append(data, 0), bytes.Repeat([]byte{0}, len(data))} {
		client := &http.Client{Transport: updateTransport(func(*http.Request) (*http.Response, error) {
			return &http.Response{StatusCode: 200, Body: io.NopCloser(bytes.NewReader(body))}, nil
		})}
		if path, err := downloadUpdate(client, m); err == nil || path != "" {
			t.Fatal("accepted corrupt or incomplete download")
		}
	}
}

func TestNonExecutableRejectedEvenWithMatchingChecksum(t *testing.T) {
	data := []byte("not an executable")
	m := validManifest(data)
	client := &http.Client{Transport: updateTransport(func(*http.Request) (*http.Response, error) {
		return &http.Response{StatusCode: 200, Body: io.NopCloser(strings.NewReader(string(data)))}, nil
	})}
	if _, err := downloadUpdate(client, m); err == nil {
		t.Fatal("accepted non-executable")
	}
}
