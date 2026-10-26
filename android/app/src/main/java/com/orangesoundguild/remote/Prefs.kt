package com.orangesoundguild.remote

import android.content.Context

object Prefs {
    private const val FILE = "osg_remote"

    private fun p(c: Context) = c.getSharedPreferences(FILE, Context.MODE_PRIVATE)

    fun server(c: Context): String = p(c).getString("server", BuildConfig.SERVER_URL) ?: BuildConfig.SERVER_URL
    fun deviceId(c: Context): String? = p(c).getString("deviceId", null)
    fun token(c: Context): String? = p(c).getString("token", null)
    fun name(c: Context): String? = p(c).getString("name", null)

    fun savePairing(c: Context, server: String, deviceId: String, token: String, name: String) {
        p(c).edit().putString("server", server).putString("deviceId", deviceId)
            .putString("token", token).putString("name", name).apply()
    }

    fun clear(c: Context) {
        p(c).edit().remove("deviceId").remove("token").remove("name").apply()
    }
}
