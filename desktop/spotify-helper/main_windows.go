package main

import (
	"fmt"
	"path/filepath"
	"runtime"
	"strings"
	"syscall"
	"time"
	"unsafe"

	"github.com/lxn/walk"
	. "github.com/lxn/walk/declarative"
	"github.com/lxn/win"
	"golang.org/x/sys/windows"
)

type App struct {
	window                              *walk.MainWindow
	key                                 *walk.LineEdit
	list                                *walk.ListBox
	tracks                              *walk.TextEdit
	manual                              *walk.TextEdit
	playlist                            *walk.LineEdit
	status                              *walk.Label
	loadButton, addButton, manualButton *walk.PushButton
	data                                []Playlist
	busy                                bool
}

func (a *App) message(text string) { a.window.Synchronize(func() { a.status.SetText(text) }) }
func (a *App) setBusy(value bool) {
	a.busy = value
	a.loadButton.SetEnabled(!value)
	a.addButton.SetEnabled(!value)
	a.manualButton.SetEnabled(!value)
}
func (a *App) load() {
	key := strings.TrimSpace(a.key.Text())
	if key == "" {
		walk.MsgBox(a.window, "Desktop key", "Copy your desktop key from the OSG Curator page first.", walk.MsgBoxIconInformation)
		return
	}
	a.setBusy(true)
	a.status.SetText("Loading your curator queue...")
	go func() {
		r, err := desktopAPI(key, "queue", nil)
		a.window.Synchronize(func() {
			defer a.setBusy(false)
			if err != nil {
				a.status.SetText(err.Error())
				return
			}
			a.data = r.Playlists
			names := make([]string, len(a.data))
			total := 0
			for i, p := range a.data {
				names[i] = fmt.Sprintf("%s — %d to add", p.Name, len(p.Tracks))
				total += len(p.Tracks)
			}
			a.list.SetModel(names)
			a.tracks.SetText("")
			if len(names) > 0 {
				a.list.SetCurrentIndex(0)
				a.showTracks()
			}
			a.status.SetText(fmt.Sprintf("%d track(s) waiting to be added.", total))
		})
	}()
}
func (a *App) showTracks() {
	i := a.list.CurrentIndex()
	if i < 0 || i >= len(a.data) {
		return
	}
	var names []string
	for _, t := range a.data[i].Tracks {
		names = append(names, t.Name)
	}
	a.tracks.SetText(strings.Join(names, "\r\n"))
}
func (a *App) addQueue() {
	i := a.list.CurrentIndex()
	if i < 0 || i >= len(a.data) || len(a.data[i].Tracks) == 0 {
		walk.MsgBox(a.window, "Nothing to add", "Select a playlist with waiting tracks.", walk.MsgBoxIconInformation)
		return
	}
	p := a.data[i]
	var uris, ids []string
	for _, t := range p.Tracks {
		uris = append(uris, t.URI)
		ids = append(ids, t.ID)
	}
	a.paste(p.SpotifyID, p.Name, uris, ids)
}
func (a *App) addManual() {
	uris := manualTracks(a.manual.Text())
	match := playlistPattern.FindStringSubmatch(strings.TrimSpace(a.playlist.Text()))
	if len(uris) == 0 || match == nil {
		walk.MsgBox(a.window, "Missing links", "Enter Spotify track links and a Spotify playlist link.", walk.MsgBoxIconInformation)
		return
	}
	a.paste(match[1], "your playlist", uris, nil)
}

// Check the executable, not the window title: never paste into another application.
func spotifyInFront() bool {
	hwnd := win.GetForegroundWindow()
	var pid uint32
	win.GetWindowThreadProcessId(hwnd, &pid)
	h, err := windows.OpenProcess(0x1000, false, pid)
	if err != nil {
		return false
	}
	defer windows.CloseHandle(h)
	buf := make([]uint16, 32768)
	size := uint32(len(buf))
	proc := syscall.NewLazyDLL("kernel32.dll").NewProc("QueryFullProcessImageNameW")
	ok, _, _ := proc.Call(uintptr(h), 0, uintptr(unsafe.Pointer(&buf[0])), uintptr(unsafe.Pointer(&size)))
	return ok != 0 && strings.EqualFold(filepath.Base(syscall.UTF16ToString(buf[:size])), "Spotify.exe")
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

func (a *App) paste(pid, name string, uris, ids []string) {
	if a.busy {
		return
	}
	if !spotifyIDPattern.MatchString(pid) || len(uris) == 0 {
		a.status.SetText("Invalid Spotify playlist or empty track list.")
		return
	}
	for _, uri := range uris {
		if !uriPattern.MatchString(uri) {
			a.status.SetText("Invalid Spotify track link in queue.")
			return
		}
	}
	if err := walk.Clipboard().SetText(strings.Join(uris, "\r\n")); err != nil {
		a.status.SetText("Could not copy track links.")
		return
	}
	if !win.ShellExecute(a.window.Handle(), syscall.StringToUTF16Ptr("open"), syscall.StringToUTF16Ptr("spotify:playlist:"+pid), nil, nil, win.SW_SHOWNORMAL) {
		a.status.SetText("Install and open the Spotify desktop app first.")
		return
	}
	answer := walk.MsgBox(a.window, "Ready to paste", fmt.Sprintf("Open '%s' in Spotify and click its track list. After clicking OK here, you have 8 seconds to switch back to Spotify. The helper will paste %d track(s). Cancel to stop.", name, len(uris)), walk.MsgBoxOKCancel|walk.MsgBoxIconInformation)
	if answer != walk.DlgCmdOK {
		a.status.SetText("Cancelled. Nothing marked added.")
		return
	}
	key := strings.TrimSpace(a.key.Text())
	a.setBusy(true)
	go func() {
		for n := 8; n > 0; n-- {
			a.message(fmt.Sprintf("Switch to Spotify and click the track list — pasting in %d...", n))
			time.Sleep(time.Second)
		}
		var err error
		if !spotifyInFront() {
			err = fmt.Errorf("Paste cancelled: Spotify was not the active window. Nothing marked added.")
		} else {
			err = pasteKeys()
		}
		if err != nil {
			a.window.Synchronize(func() { a.setBusy(false); a.status.SetText(err.Error()) })
			return
		}
		time.Sleep(3 * time.Second)
		a.window.Synchronize(func() {
			if ids == nil {
				a.setBusy(false)
				a.status.SetText(fmt.Sprintf("Pasted %d track link(s). Check Spotify to confirm.", len(uris)))
				return
			}
			answer := walk.MsgBox(a.window, "Confirm in Spotify", fmt.Sprintf("Did all %d tracks appear in '%s'? Only choose Yes after checking Spotify.", len(uris), name), walk.MsgBoxYesNo|walk.MsgBoxIconQuestion)
			if answer != walk.DlgCmdYes {
				a.setBusy(false)
				a.status.SetText("Queue unchanged. You can try again.")
				return
			}
			go func() {
				r, err := desktopAPI(key, "mark_added", ids)
				a.window.Synchronize(func() {
					a.setBusy(false)
					if err != nil {
						a.status.SetText("Tracks pasted, but OSG was not updated: " + err.Error())
						return
					}
					a.status.SetText(fmt.Sprintf("Marked %d track(s) added on OSG.", r.Updated))
					a.load()
				})
			}()
		})
	}()
}

func main() {
	runtime.LockOSThread()
	if handleUpdateArguments() {
		return
	}
	a := &App{}
	err := (MainWindow{
		AssignTo: &a.window, Title: "OSG Spotify Helper " + strings.TrimSpace(embeddedVersion), MinSize: Size{Width: 640, Height: 520}, Size: Size{Width: 760, Height: 600}, Layout: VBox{},
		Children: []Widget{
			Composite{Layout: HBox{}, Children: []Widget{
				Label{Text: "Desktop key:"}, LineEdit{AssignTo: &a.key, PasswordMode: true},
				PushButton{AssignTo: &a.loadButton, Text: "Load queue", OnClicked: a.load},
			}},
			TabWidget{Pages: []TabPage{
				{Title: "Curator queue", Layout: VBox{}, Children: []Widget{
					ListBox{AssignTo: &a.list, MinSize: Size{Height: 120}, OnCurrentIndexChanged: a.showTracks},
					TextEdit{AssignTo: &a.tracks, ReadOnly: true, VScroll: true},
					PushButton{AssignTo: &a.addButton, Text: "Add selected playlist's queue to Spotify", OnClicked: a.addQueue},
				}},
				{Title: "Manual links", Layout: VBox{}, Children: []Widget{
					Label{Text: "Spotify track links:"}, TextEdit{AssignTo: &a.manual, VScroll: true},
					Label{Text: "Destination Spotify playlist link:"}, LineEdit{AssignTo: &a.playlist},
					PushButton{AssignTo: &a.manualButton, Text: "Add links to playlist", OnClicked: a.addManual},
				}},
			}},
			Label{AssignTo: &a.status, Text: "Copy your desktop key from orangesoundguild.com/curator to load your queue.", MinSize: Size{Height: 46}},
		},
	}).Create()
	if err != nil {
		walk.MsgBox(nil, "OSG Spotify Helper", err.Error(), walk.MsgBoxIconError)
		return
	}
	// Update only on opening, before a paste or confirmation can be interrupted.
	go a.window.Synchronize(func() { a.checkForUpdate() })
	a.window.Run()
}
