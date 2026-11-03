package com.orangesoundguild.remote

import android.content.ComponentName
import android.content.Context
import android.media.MediaMetadata
import android.media.session.MediaController
import android.media.session.MediaSessionManager
import android.media.session.PlaybackState
import android.provider.Settings
import android.service.notification.NotificationListenerService
import org.json.JSONArray
import org.json.JSONObject

/**
 * Reads what music apps (Spotify, Apple Music, YouTube, YouTube Music, TIDAL...) report
 * to Android's media system and queues finished plays of 30 s or more. The polling loop
 * in RemoteAccessibilityService sends the queue to the website.
 */
class MusicTracker : NotificationListenerService() {

    companion object {
        private const val MIN_SECONDS = 30
        private val queue = JSONArray()

        private val APPS = mapOf(
            "com.spotify.music" to "Spotify",
            "com.apple.android.music" to "Apple Music",
            "com.google.android.youtube" to "YouTube",
            "com.google.android.apps.youtube.music" to "YouTube Music",
            "com.aspiro.tidal" to "TIDAL",
        )

        fun isEnabled(ctx: Context): Boolean {
            val flat = Settings.Secure.getString(ctx.contentResolver, "enabled_notification_listeners") ?: return false
            return flat.contains(ComponentName(ctx, MusicTracker::class.java).flattenToString())
        }

        /** Takes everything queued so far (caller re-adds on failure). */
        fun drain(): JSONArray = synchronized(queue) {
            val out = JSONArray(queue.toString())
            while (queue.length() > 0) queue.remove(0)
            out
        }

        fun restore(items: JSONArray) = synchronized(queue) {
            for (i in 0 until items.length()) if (queue.length() < 200) queue.put(items.get(i))
        }

        private fun enqueue(o: JSONObject) = synchronized(queue) {
            if (queue.length() >= 200) queue.remove(0)
            queue.put(o)
        }
    }

    /** One track currently loaded in one app. */
    private class Track(val pkg: String, val title: String, val artist: String?, val album: String?) {
        var playlist: String? = null
        val startedAt = System.currentTimeMillis()
        var playedMs = 0L
        var playingSince = 0L
        fun pause(now: Long) { if (playingSince > 0) { playedMs += now - playingSince; playingSince = 0 } }
        fun play(now: Long) { if (playingSince == 0L) playingSince = now }
    }

    private val tracks = HashMap<String, Track>()
    private val callbacks = HashMap<MediaController, MediaController.Callback>()
    private var msm: MediaSessionManager? = null
    private val sessionsListener = MediaSessionManager.OnActiveSessionsChangedListener { list -> watch(list ?: emptyList()) }

    override fun onListenerConnected() {
        super.onListenerConnected()
        try {
            val m = getSystemService(MediaSessionManager::class.java)
            msm = m
            val me = ComponentName(this, MusicTracker::class.java)
            m.addOnActiveSessionsChangedListener(sessionsListener, me)
            watch(m.getActiveSessions(me))
        } catch (_: Exception) {}
    }

    override fun onListenerDisconnected() {
        try { msm?.removeOnActiveSessionsChangedListener(sessionsListener) } catch (_: Exception) {}
        callbacks.forEach { (c, cb) -> try { c.unregisterCallback(cb) } catch (_: Exception) {} }
        callbacks.clear()
        tracks.keys.toList().forEach { finish(it) }
        super.onListenerDisconnected()
    }

    private fun watch(list: List<MediaController>) {
        val keep = list.filter { APPS.containsKey(it.packageName) }
        callbacks.keys.filter { old -> keep.none { it.sessionToken == old.sessionToken } }.forEach { old ->
            try { old.unregisterCallback(callbacks.remove(old)!!) } catch (_: Exception) {}
            finish(old.packageName)
        }
        for (c in keep) {
            if (callbacks.keys.any { it.sessionToken == c.sessionToken }) continue
            val cb = object : MediaController.Callback() {
                override fun onMetadataChanged(metadata: MediaMetadata?) = update(c)
                override fun onPlaybackStateChanged(state: PlaybackState?) = update(c)
                override fun onSessionDestroyed() = finish(c.packageName)
            }
            try { c.registerCallback(cb); callbacks[c] = cb } catch (_: Exception) {}
            update(c)
        }
    }

    private fun update(c: MediaController) {
        val pkg = c.packageName
        val md = c.metadata
        val title = md?.getString(MediaMetadata.METADATA_KEY_TITLE)?.trim().orEmpty()
        val artist = (md?.getString(MediaMetadata.METADATA_KEY_ARTIST) ?: md?.getString(MediaMetadata.METADATA_KEY_ALBUM_ARTIST))?.trim()
        val album = md?.getString(MediaMetadata.METADATA_KEY_ALBUM)?.trim()
        val now = System.currentTimeMillis()
        val cur = tracks[pkg]
        if (title.isEmpty()) return
        if (cur == null || cur.title != title || cur.artist != artist) {
            finish(pkg)
            tracks[pkg] = Track(pkg, title, artist, album)
        }
        val t = tracks[pkg]!!
        // Spotify and others report the playlist/queue name here (e.g. "Super lucky").
        try { c.queueTitle?.toString()?.trim()?.takeIf { it.isNotEmpty() }?.let { t.playlist = it.take(200) } } catch (_: Exception) {}
        if (c.playbackState?.state == PlaybackState.STATE_PLAYING) t.play(now) else t.pause(now)
    }

    private fun finish(pkg: String) {
        val t = tracks.remove(pkg) ?: return
        t.pause(System.currentTimeMillis())
        val secs = (t.playedMs / 1000).toInt()
        if (secs < MIN_SECONDS) return
        enqueue(
            JSONObject()
                .put("app", APPS[pkg] ?: pkg)
                .put("package", pkg)
                .put("title", t.title)
                .put("artist", t.artist ?: JSONObject.NULL)
                .put("album", t.album ?: JSONObject.NULL)
                .put("playlist", t.playlist ?: JSONObject.NULL)
                .put("playedSeconds", secs)
                .put("startedAt", t.startedAt)
        )
    }
}
