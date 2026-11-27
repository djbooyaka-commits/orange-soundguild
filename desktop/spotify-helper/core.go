package main

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"regexp"
	"sort"
	"strings"
	"time"
)

const site = "https://orangesoundguild.com"

type Track struct {
	ID   string `json:"id"`
	Name string `json:"name"`
	URI  string `json:"uri"`
}
type Playlist struct {
	ID        string  `json:"id"`
	Name      string  `json:"name"`
	SpotifyID string  `json:"spotify_playlist_id"`
	Tracks    []Track `json:"tracks"`
}
type Response struct {
	Playlists []Playlist `json:"playlists"`
	Updated   int        `json:"updated"`
	Error     string     `json:"error"`
}

var trackPattern = regexp.MustCompile(`(?:spotify:track:|open\.spotify\.com/(?:intl-[a-z]+/)?track/)([A-Za-z0-9]{22})(?:[^A-Za-z0-9]|$)`)
var playlistPattern = regexp.MustCompile(`(?:spotify:playlist:|open\.spotify\.com/(?:intl-[a-z]+/)?playlist/)([A-Za-z0-9]{22})(?:[^A-Za-z0-9]|$)`)
var spotifyIDPattern = regexp.MustCompile(`^[A-Za-z0-9]{22}$`)
var uriPattern = regexp.MustCompile(`^spotify:track:[A-Za-z0-9]{22}$`)

func prioritizeWaitingPlaylists(playlists []Playlist) {
	sort.SliceStable(playlists, func(i, j int) bool {
		return len(playlists[i].Tracks) > 0 && len(playlists[j].Tracks) == 0
	})
}

func manualTracks(text string) []string {
	var uris []string
	seen := map[string]bool{}
	for _, match := range trackPattern.FindAllStringSubmatch(text, -1) {
		uri := "spotify:track:" + match[1]
		if !seen[uri] {
			seen[uri] = true
			uris = append(uris, uri)
		}
	}
	return uris
}

func callAPI(client *http.Client, endpoint, key, action string, ids []string) (Response, error) {
	payload := map[string]any{"key": strings.TrimSpace(key), "action": action}
	if ids != nil {
		payload["ids"] = ids
	}
	body, err := json.Marshal(payload)
	if err != nil {
		return Response{}, err
	}
	req, err := http.NewRequest("POST", endpoint, bytes.NewReader(body))
	if err != nil {
		return Response{}, err
	}
	req.Header.Set("Content-Type", "application/json")
	r, err := client.Do(req)
	if err != nil {
		return Response{}, fmt.Errorf("could not reach OSG; check your connection")
	}
	defer r.Body.Close()
	var result Response
	if err := json.NewDecoder(io.LimitReader(r.Body, 4<<20)).Decode(&result); err != nil {
		return Response{}, fmt.Errorf("OSG returned an unreadable response; try again after publishing the site")
	}
	if r.StatusCode < 200 || r.StatusCode >= 300 || result.Error != "" {
		if result.Error != "" {
			return Response{}, fmt.Errorf("%s", result.Error)
		}
		return Response{}, fmt.Errorf("OSG request failed (%d)", r.StatusCode)
	}
	return result, nil
}

func desktopAPI(key, action string, ids []string) (Response, error) {
	client := &http.Client{Timeout: 30 * time.Second, CheckRedirect: func(req *http.Request, via []*http.Request) error { return http.ErrUseLastResponse }}
	return callAPI(client, site+"/api/public/curator-desktop", key, action, ids)
}

func pasteWhenSpotifyActive(active func() bool, sendKeys func() error) error {
	if !active() {
		return fmt.Errorf("Spotify was not the active window. Click its playlist window and press Ctrl+V; the links are already copied. Nothing marked added.")
	}
	return sendKeys()
}
