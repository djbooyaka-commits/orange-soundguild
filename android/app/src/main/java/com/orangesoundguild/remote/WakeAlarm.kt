package com.orangesoundguild.remote

import android.app.AlarmManager
import android.app.PendingIntent
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.os.Build
import android.os.SystemClock

/**
 * Wakes the phone about once a minute, even in deep Doze (phone lying still for hours),
 * and restarts the connection loop if Android froze it.
 */
class WakeAlarm : BroadcastReceiver() {

    companion object {
        private const val EVERY_MS = 60_000L

        fun schedule(ctx: Context) {
            if (Prefs.deviceId(ctx) == null) return
            val am = ctx.getSystemService(AlarmManager::class.java) ?: return
            val pi = PendingIntent.getBroadcast(
                ctx, 7301, Intent(ctx, WakeAlarm::class.java),
                PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT,
            )
            val at = SystemClock.elapsedRealtime() + EVERY_MS
            try {
                if (Build.VERSION.SDK_INT < 31 || am.canScheduleExactAlarms()) {
                    am.setExactAndAllowWhileIdle(AlarmManager.ELAPSED_REALTIME_WAKEUP, at, pi)
                } else {
                    am.setAndAllowWhileIdle(AlarmManager.ELAPSED_REALTIME_WAKEUP, at, pi)
                }
            } catch (_: Exception) {
                try { am.setAndAllowWhileIdle(AlarmManager.ELAPSED_REALTIME_WAKEUP, at, pi) } catch (_: Exception) {}
            }
        }
    }

    override fun onReceive(context: Context, intent: Intent) {
        val done = goAsync()
        try {
            KeepAliveService.start(context)
            RemoteAccessibilityService.instance?.ensurePolling(force = true)
        } catch (_: Exception) {
        } finally {
            schedule(context)
            // Give the poll a few seconds to go out before Android dozes again.
            android.os.Handler(android.os.Looper.getMainLooper()).postDelayed({ done.finish() }, 8_000L)
        }
    }
}
