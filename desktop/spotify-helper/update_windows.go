package main

import (
	"fmt"
	"io"
	"os"
	"os/exec"
	"path/filepath"
	"strconv"
	"strings"
	"syscall"
	"time"

	"github.com/lxn/walk"
	"golang.org/x/sys/windows"
)

func detachedStart(path string, args ...string) error {
	cmd := exec.Command(path, args...)
	cmd.SysProcAttr = &syscall.SysProcAttr{CreationFlags: 0x00000008 | 0x00000200, HideWindow: true}
	if err := cmd.Start(); err != nil {
		return err
	}
	return cmd.Process.Release()
}

func startUpdate(staged string, m UpdateManifest) error {
	current, err := os.Executable()
	if err != nil {
		return err
	}
	if err := verifyUpdate(staged, m); err != nil {
		return err
	}
	// Run a copy of this version, not the downloaded executable, to do the swap.
	helper := filepath.Join(filepath.Dir(staged), "updater.exe")
	source, err := os.Open(current)
	if err != nil {
		return err
	}
	defer source.Close()
	f, err := os.OpenFile(helper, os.O_CREATE|os.O_EXCL|os.O_WRONLY, 0700)
	if err != nil {
		return err
	}
	_, copyErr := io.Copy(f, source)
	closeErr := f.Close()
	if copyErr != nil {
		return copyErr
	}
	if closeErr != nil {
		return closeErr
	}
	return detachedStart(helper, "--apply-update", current, staged, m.SHA256, strconv.FormatInt(m.Size, 10), strconv.Itoa(os.Getpid()))
}

func updateTempDir(dir string) bool {
	abs, err := filepath.Abs(dir)
	if err != nil {
		return false
	}
	return strings.EqualFold(filepath.Dir(abs), filepath.Clean(os.TempDir())) && strings.HasPrefix(filepath.Base(abs), "osg-spotify-update-")
}

func retryMove(from, to string) error {
	var err error
	for i := 0; i < 60; i++ {
		src, e := windows.UTF16PtrFromString(from)
		if e != nil {
			return e
		}
		dst, e := windows.UTF16PtrFromString(to)
		if e != nil {
			return e
		}
		err = windows.MoveFileEx(src, dst, windows.MOVEFILE_REPLACE_EXISTING|windows.MOVEFILE_WRITE_THROUGH)
		if err == nil {
			return nil
		}
		time.Sleep(500 * time.Millisecond)
	}
	return err
}

func applyUpdate(args []string) error {
	if len(args) != 5 {
		return fmt.Errorf("invalid update arguments")
	}
	dest, staged, hash := args[0], args[1], args[2]
	size, err := strconv.ParseInt(args[3], 10, 64)
	if err != nil {
		return err
	}
	pid, err := strconv.ParseUint(args[4], 10, 32)
	if err != nil {
		return err
	}
	helper, err := os.Executable()
	if err != nil {
		return err
	}
	if !filepath.IsAbs(dest) || !strings.EqualFold(filepath.Ext(dest), ".exe") ||
		!updateTempDir(filepath.Dir(staged)) || !strings.EqualFold(filepath.Dir(helper), filepath.Dir(staged)) ||
		strings.EqualFold(dest, helper) || strings.EqualFold(dest, staged) {
		return fmt.Errorf("invalid update location")
	}
	m := UpdateManifest{Version: "1.0.0", URL: updateBinaryURL, SHA256: hash, Size: size}
	if err := validateManifest(m); err != nil {
		return err
	}
	if err := verifyUpdate(staged, m); err != nil {
		return err
	}
	// Wait for the actual parent process, not a fixed sleep, then retry locked files.
	h, err := windows.OpenProcess(windows.SYNCHRONIZE, false, uint32(pid))
	if err == nil {
		result, waitErr := windows.WaitForSingleObject(h, 60000)
		windows.CloseHandle(h)
		if waitErr != nil || result != windows.WAIT_OBJECT_0 {
			return fmt.Errorf("helper is still running; update postponed")
		}
	} else if err != windows.ERROR_INVALID_PARAMETER {
		return err
	}
	if err := verifyUpdate(staged, m); err != nil {
		return err
	}
	backup := dest + ".previous"
	if err := retryMove(dest, backup); err != nil {
		return err
	}
	if err := retryMove(staged, dest); err != nil {
		if restoreErr := retryMove(backup, dest); restoreErr != nil {
			return fmt.Errorf("update could not restore original: %w", restoreErr)
		}
		_ = detachedStart(dest, "--update-failed")
		return err
	}
	if err := detachedStart(dest, "--updated", filepath.Dir(staged)); err != nil {
		if restoreErr := retryMove(backup, dest); restoreErr != nil {
			return restoreErr
		}
		_ = detachedStart(dest, "--update-failed")
		return err
	}
	os.Remove(backup)
	return nil
}

func (a *App) checkForUpdate() {
	if len(os.Args) > 1 && os.Args[1] == "--update-failed" {
		a.status.SetText("The update failed; your previous version was restored. You can keep using it and retry next time.")
		return
	}
	a.setBusy(true)
	a.status.SetText("Checking for a new Spotify Helper version...")
	go func() {
		m, err := fetchUpdate(updateClient(15 * time.Second))
		newer := false
		if err == nil {
			newer, err = newerVersion(m.Version, embeddedVersion)
		}
		if err == nil && !newer {
			a.window.Synchronize(func() {
				a.setBusy(false)
				a.status.SetText("Spotify Helper is up to date. Paste your desktop key and load your queue.")
			})
			return
		}
		if err == nil {
			a.message("Downloading Spotify Helper " + m.Version + " — the app will restart automatically...")
			var staged string
			staged, err = downloadUpdate(updateClient(2*time.Minute), m)
			if err == nil {
				err = startUpdate(staged, m)
				if err != nil {
					os.RemoveAll(filepath.Dir(staged))
				}
			}
		}
		a.window.Synchronize(func() {
			if err != nil {
				a.setBusy(false)
				a.status.SetText("Automatic update unavailable. You can keep using this version; it will retry next time you open it.")
				return
			}
			a.window.Close()
		})
	}()
}

func handleUpdateArguments() bool {
	if len(os.Args) > 1 && os.Args[1] == "--apply-update" {
		if err := applyUpdate(os.Args[2:]); err != nil {
			walk.MsgBox(nil, "Spotify Helper update", "The update could not finish. Your previous version was kept. Open it again or download the latest app from OSG.", walk.MsgBoxIconWarning)
		}
		return true
	}
	if len(os.Args) == 3 && os.Args[1] == "--updated" && updateTempDir(os.Args[2]) {
		dir := os.Args[2]
		go func() {
			for i := 0; i < 60; i++ {
				if os.RemoveAll(dir) == nil {
					return
				}
				time.Sleep(time.Second)
			}
		}()
	}
	return false
}
