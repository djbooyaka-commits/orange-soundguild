package com.orangesoundguild.remote

import android.content.Context
import android.content.Intent
import android.os.Build

/**
 * Samsung-only "play sound from several apps at once" (same system feature Sound Assistant uses).
 * Uses Samsung's private SemSoundAssistantManager via reflection; other brands get a clear message.
 */
object MultiSound {
    val STREAMING_APPS = listOf(
        "com.spotify.music", "com.apple.android.music", "com.google.android.youtube",
        "com.google.android.apps.youtube.music", "com.aspiro.tidal", "com.soundcloud.android",
        "deezer.android.app", "com.amazon.mp3",
    )

    fun isSamsung() = Build.MANUFACTURER.equals("samsung", ignoreCase = true)

    private fun manager(ctx: Context): Any? = try {
        val cls = Class.forName("com.samsung.android.media.SemSoundAssistantManager")
        cls.getConstructor(Context::class.java).newInstance(ctx)
    } catch (_: Throwable) { null }

    /** Returns null on success, or an error message. */
    fun set(ctx: Context, on: Boolean): String? {
        if (!isSamsung()) return "Multi-Sound only works on Samsung phones"
        val m = manager(ctx) ?: return openSettings(ctx)
        return try {
            m.javaClass.getMethod("setMultiSoundOn", Boolean::class.javaPrimitiveType).invoke(m, on)
            val ignore = m.javaClass.methods.firstOrNull { it.name == "ignoreAudioFocusForApp" && it.parameterTypes.size == 2 }
            if (ignore != null) {
                for (pkg in STREAMING_APPS) {
                    val uid = try { ctx.packageManager.getApplicationInfo(pkg, 0).uid } catch (_: Exception) { continue }
                    try { ignore.invoke(m, uid, on) } catch (_: Throwable) {}
                }
            }
            null
        } catch (_: Throwable) {
            openSettings(ctx)
        }
    }

    /** If Samsung blocks the direct switch, open Sound Assistant so it can be turned on by hand. */
    private fun openSettings(ctx: Context): String {
        val i = ctx.packageManager.getLaunchIntentForPackage("com.samsung.android.soundassistant")
        if (i != null) {
            ctx.startActivity(i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
            return "Samsung blocked the direct switch — opened Sound Assistant, turn on \"Separate app sound\" / Multi sound there"
        }
        return "Samsung blocked the direct switch — install Samsung Sound Assistant from Galaxy Store"
    }
}
