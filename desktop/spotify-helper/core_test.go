package main

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"reflect"
	"testing"
)

func TestManualLinks(t *testing.T) {
	id := "1234567890123456789012"
	want := []string{"spotify:track:" + id}
	got := manualTracks("https://open.spotify.com/track/" + id + "?si=example\nspotify:track:" + id)
	if !reflect.DeepEqual(got, want) {
		t.Fatalf("got %v, want %v", got, want)
	}
	if len(manualTracks("https://open.spotify.com/track/"+id+"3")) != 0 {
		t.Fatal("accepted overlong track ID")
	}
}

func TestQueueAndConfirmedMarkAdded(t *testing.T) {
	s := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		var body struct {
			Key    string   `json:"key"`
			Action string   `json:"action"`
			IDs    []string `json:"ids"`
		}
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
			t.Error(err)
			w.WriteHeader(400)
			return
		}
		if body.Key != "test-key" {
			t.Errorf("wrong key: %q", body.Key)
		}
		w.Header().Set("Content-Type", "application/json")
		switch body.Action {
		case "queue":
			ioResponse := `{"playlists":[{"id":"p1","name":"Playlist","spotify_playlist_id":"1234567890123456789012","tracks":[{"id":"s1","name":"Song","uri":"spotify:track:1234567890123456789012"}]}]}`
			w.Write([]byte(ioResponse))
		case "mark_added":
			if !reflect.DeepEqual(body.IDs, []string{"s1"}) {
				t.Errorf("wrong submissions %v", body.IDs)
			}
			w.Write([]byte(`{"updated":1}`))
		default:
			t.Errorf("unknown action %q", body.Action)
		}
	}))
	defer s.Close()
	r, err := callAPI(s.Client(), s.URL, " test-key ", "queue", nil)
	if err != nil || len(r.Playlists) != 1 || len(r.Playlists[0].Tracks) != 1 || r.Playlists[0].Tracks[0].ID != "s1" {
		t.Fatalf("unexpected queue: %+v %v", r, err)
	}
	r, err = callAPI(s.Client(), s.URL, "test-key", "mark_added", []string{"s1"})
	if err != nil || r.Updated != 1 {
		t.Fatalf("unexpected mark result %+v %v", r, err)
	}
}

func TestRejectedKeyDoesNotReturnQueue(t *testing.T) {
	s := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(401)
		w.Write([]byte(`{"error":"Invalid key"}`))
	}))
	defer s.Close()
	r, err := callAPI(s.Client(), s.URL, "invalid", "queue", nil)
	if err == nil || len(r.Playlists) != 0 {
		t.Fatal("invalid key returned a usable queue")
	}
}
