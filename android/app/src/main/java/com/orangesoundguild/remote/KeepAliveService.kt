package com.orangesoundguild.remote

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Context
import android.content.Intent
import android.content.pm.ServiceInfo
import android.os.Build
import android.os.Handler
import android.os.IBinder
import android.os.Looper
import android.os.PowerManager

/**
 * Ongoing foreground service so Android / MIUI treat OSG Remote as an active task
 * instead of a disposable background app. It also runs a watchdog that restarts the
 * polling loop if it has stalled (e.g. after Doze or Wi-Fi power saving).
 */
class KeepAliveService : Service() {

    companion object {
        private const val CHANNEL = "osg_keepalive"
        private const val NOTIF_ID = 4201

        fun start(ctx: Context) {
            if (Prefs.deviceId(ctx) == null) return
            try {
                ctx.startForegroundService(Intent(ctx, KeepAliveService::class.java))
            } catch (_: Exception) {}
        }
    }

    private val handler = Handler(Looper.getMainLooper())
    private var wake: PowerManager.WakeLock? = null
    private val watchdog = object : Runnable {
        override fun run() {
            try { RemoteAccessibilityService.instance?.ensurePolling() } catch (_: Exception) {}
            handler.postDelayed(this, 30_000L)
        }
    }

    override fun onBind(intent: Intent?): IBinder? = null

    override fun onCreate() {
        super.onCreate()
        val nm = getSystemService(NotificationManager::class.java)
        nm.createNotificationChannel(NotificationChannel(CHANNEL, "Stay connected", NotificationManager.IMPORTANCE_LOW))
        val open = PendingIntent.getActivity(this, 0, Intent(this, MainActivity::class.java), PendingIntent.FLAG_IMMUTABLE)
        val n = Notification.Builder(this, CHANNEL)
            .setContentTitle("OSG Remote is connected")
            .setContentText("Standing by for commands from the website")
            .setSmallIcon(android.R.drawable.stat_notify_sync)
            .setOngoing(true)
            .setContentIntent(open)
            .build()
        if (Build.VERSION.SDK_INT >= 34) {
            startForeground(NOTIF_ID, n, ServiceInfo.FOREGROUND_SERVICE_TYPE_SPECIAL_USE)
        } else {
            startForeground(NOTIF_ID, n)
        }
        try {
            val pm = getSystemService(Context.POWER_SERVICE) as PowerManager
            wake = pm.newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "osg:keepalive").apply { setReferenceCounted(false); acquire() }
        } catch (_: Exception) {}
        handler.postDelayed(watchdog, 30_000L)
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int = START_STICKY

    override fun onTaskRemoved(rootIntent: Intent?) {
        // Swiped away from recents: come straight back.
        start(applicationContext)
        super.onTaskRemoved(rootIntent)
    }

    override fun onDestroy() {
        handler.removeCallbacks(watchdog)
        try { wake?.release() } catch (_: Exception) {}
        super.onDestroy()
    }
}
