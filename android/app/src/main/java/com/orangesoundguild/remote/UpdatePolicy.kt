package com.orangesoundguild.remote

object UpdatePolicy {
    const val MAX_APK_BYTES = 150L * 1024 * 1024
    const val RELEASE_BASE = "https://github.com/djbooyaka-commits/orange-soundguild/releases/download/osg-remote-latest"
    const val APK_URL = "$RELEASE_BASE/osg-remote.apk"
    fun isNewer(installed: Long, available: Long) = available > installed
    fun validHash(hash: String) = hash.matches(Regex("[a-fA-F0-9]{64}"))
}