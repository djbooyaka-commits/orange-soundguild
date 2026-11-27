package main

import (
	"fmt"
	"path/filepath"
	"strings"
	"syscall"
	"time"
	"unsafe"

	"github.com/lxn/win"
	"golang.org/x/sys/windows"
)

var (
	user32DLL                 = syscall.NewLazyDLL("user32.dll")
	kernel32DLL               = syscall.NewLazyDLL("kernel32.dll")
	enumWindowsProc           = user32DLL.NewProc("EnumWindows")
	queryProcessImageNameProc = kernel32DLL.NewProc("QueryFullProcessImageNameW")
)

func processExecutable(pid uint32) string {
	h, err := windows.OpenProcess(0x1000, false, pid) // PROCESS_QUERY_LIMITED_INFORMATION
	if err != nil {
		return ""
	}
	defer windows.CloseHandle(h)
	buf := make([]uint16, 32768)
	size := uint32(len(buf))
	ok, _, _ := queryProcessImageNameProc.Call(
		uintptr(h), 0, uintptr(unsafe.Pointer(&buf[0])), uintptr(unsafe.Pointer(&size)),
	)
	if ok == 0 {
		return ""
	}
	return syscall.UTF16ToString(buf[:size])
}

func isSpotifyWindow(hwnd win.HWND) bool {
	if hwnd == 0 {
		return false
	}
	var pid uint32
	win.GetWindowThreadProcessId(hwnd, &pid)
	return strings.EqualFold(filepath.Base(processExecutable(pid)), "Spotify.exe")
}

// Check the executable, not the window title: never paste into another application.
func spotifyInFront() bool {
	return isSpotifyWindow(win.GetForegroundWindow())
}

func findSpotifyWindow() win.HWND {
	var best win.HWND
	var bestArea int64
	callback := syscall.NewCallback(func(raw uintptr, _ uintptr) uintptr {
		hwnd := win.HWND(raw)
		if !win.IsWindowVisible(hwnd) || win.GetWindow(hwnd, win.GW_OWNER) != 0 || !isSpotifyWindow(hwnd) {
			return 1
		}
		var rect win.RECT
		if !win.GetWindowRect(hwnd, &rect) {
			return 1
		}
		area := int64(rect.Right-rect.Left) * int64(rect.Bottom-rect.Top)
		if best == 0 || area > bestArea {
			best = hwnd
			bestArea = area
		}
		return 1
	})
	enumWindowsProc.Call(callback, 0)
	return best
}

func focusSpotifyWindow() bool {
	hwnd := findSpotifyWindow()
	if hwnd == 0 {
		return false
	}

	// Attaching to the current foreground thread lets Windows accept the focus
	// change after the playlist URI has already activated another process.
	currentThread := win.GetCurrentThreadId()
	foregroundThread := win.GetWindowThreadProcessId(win.GetForegroundWindow(), nil)
	attached := foregroundThread != 0 && foregroundThread != currentThread &&
		win.AttachThreadInput(int32(currentThread), int32(foregroundThread), true)
	if attached {
		defer win.AttachThreadInput(int32(currentThread), int32(foregroundThread), false)
	}
	if win.IsIconic(hwnd) {
		win.ShowWindow(hwnd, win.SW_RESTORE)
	} else {
		win.ShowWindow(hwnd, win.SW_SHOW)
	}
	win.BringWindowToTop(hwnd)
	win.SetForegroundWindow(hwnd)
	win.SetActiveWindow(hwnd)
	return spotifyInFront()
}

func pasteKeys() error {
	inputs := []win.KEYBD_INPUT{
		{Type: win.INPUT_KEYBOARD, Ki: win.KEYBDINPUT{WVk: win.VK_CONTROL}},
		{Type: win.INPUT_KEYBOARD, Ki: win.KEYBDINPUT{WVk: 'V'}},
		{Type: win.INPUT_KEYBOARD, Ki: win.KEYBDINPUT{WVk: 'V', DwFlags: win.KEYEVENTF_KEYUP}},
		{Type: win.INPUT_KEYBOARD, Ki: win.KEYBDINPUT{WVk: win.VK_CONTROL, DwFlags: win.KEYEVENTF_KEYUP}},
	}
	if win.SendInput(uint32(len(inputs)), unsafe.Pointer(&inputs[0]), int32(unsafe.Sizeof(inputs[0]))) != uint32(len(inputs)) {
		// Always release keys even if Windows blocks part of the input.
		win.SendInput(2, unsafe.Pointer(&inputs[2]), int32(unsafe.Sizeof(inputs[0])))
		return fmt.Errorf("Windows blocked the paste; run Spotify normally, not as administrator")
	}
	return nil
}

func focusSpotifyAndPaste() error {
	deadline := time.Now().Add(20 * time.Second)
	for {
		if focusSpotifyWindow() {
			// Give Spotify time to finish loading the selected playlist, then
			// activate and verify it once more immediately before sending keys.
			time.Sleep(2 * time.Second)
			if focusSpotifyWindow() {
				return pasteWhenSpotifyActive(spotifyInFront, pasteKeys)
			}
		}
		if time.Now().After(deadline) {
			return fmt.Errorf("Spotify did not come forward automatically. Click its playlist window and press Ctrl+V; the links are already copied. Nothing marked added.")
		}
		time.Sleep(250 * time.Millisecond)
	}
}
