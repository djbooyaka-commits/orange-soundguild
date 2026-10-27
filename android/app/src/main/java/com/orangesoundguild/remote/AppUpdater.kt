package com.orangesoundguild.remote

import android.app.Activity
import android.content.Intent
import android.content.pm.PackageManager
import android.net.Uri
import android.provider.Settings
import androidx.core.content.FileProvider
import org.json.JSONObject
import java.io.File
import java.net.HttpURLConnection
import java.net.URL
import java.security.MessageDigest
import java.util.concurrent.Executors

class AppUpdater(private val activity: Activity, private val state: (String, String?, (() -> Unit)?) -> Unit) {
    private data class Release(val code: Long, val name: String, val hash: String)
    private val worker = Executors.newSingleThreadExecutor()
    private var busy = false
    private var pending: File? = null
    private var closed = false

    private fun show(message: String, label: String? = null, action: (() -> Unit)? = null) {
        activity.runOnUiThread { if (!closed) state(message, label, action) }
    }

    private fun connection(url: String): HttpURLConnection {
        return (URL(url).openConnection() as HttpURLConnection).apply {
            connectTimeout = 15000
            readTimeout = 30000
            setRequestProperty("User-Agent", "OSG-Remote/${BuildConfig.VERSION_NAME}")
            setRequestProperty("Cache-Control", "no-cache")
        }
    }

    fun check() {
        if (busy || closed) return
        busy = true
        show("Checking for updates…")
        worker.execute {
            try {
                val conn = connection("${UpdatePolicy.RELEASE_BASE}/update.json?t=${System.currentTimeMillis()}")
                val json = try {
                    check(conn.responseCode == 200) { "Release information isn't available yet." }
                    val bytes = conn.inputStream.use { it.readNBytes(16385) }
                    check(bytes.size <= 16384) { "Invalid release information." }
                    JSONObject(String(bytes, Charsets.UTF_8))
                } finally { conn.disconnect() }
                val release = Release(json.getLong("versionCode"), json.getString("versionName"), json.getString("sha256"))
                check(UpdatePolicy.validHash(release.hash)) { "Invalid update checksum." }
                if (UpdatePolicy.isNewer(BuildConfig.VERSION_CODE.toLong(), release.code)) {
                    show("OSG Remote ${release.name} is available.", "Download update") { download(release) }
                } else show("You're up to date — version ${BuildConfig.VERSION_NAME}.", "Check for updates") { check() }
            } catch (e: Exception) {
                show("Couldn't check for updates. ${e.message ?: "Try again later."}", "Check again") { check() }
            } finally { activity.runOnUiThread { busy = false } }
        }
    }

    private fun download(release: Release) {
        if (busy || closed) return
        busy = true
        show("Downloading version ${release.name}…")
        worker.execute {
            val dir = File(activity.cacheDir, "updates").apply { mkdirs() }
            val temp = File(dir, "download.part")
            val apk = File(dir, "osg-remote.apk")
            try {
                val conn = connection(UpdatePolicy.APK_URL)
                val digest = MessageDigest.getInstance("SHA-256")
                try {
                    check(conn.responseCode == 200) { "The download is not available yet." }
                    check(conn.contentLengthLong <= UpdatePolicy.MAX_APK_BYTES) { "Update file is too large." }
                    conn.inputStream.use { input ->
                        temp.outputStream().use { output ->
                            val buffer = ByteArray(32768)
                            var total = 0L
                            var previousPercent = -1
                            while (true) {
                                val count = input.read(buffer)
                                if (count < 0) break
                                total += count
                                check(total <= UpdatePolicy.MAX_APK_BYTES) { "Update file is too large." }
                                output.write(buffer, 0, count)
                                digest.update(buffer, 0, count)
                                if (conn.contentLengthLong > 0) {
                                    val percent = (total * 100 / conn.contentLengthLong).toInt()
                                    if (percent / 5 != previousPercent / 5) {
                                        previousPercent = percent
                                        show("Downloading version ${release.name}… $percent%")
                                    }
                                }
                            }
                        }
                    }
                } finally { conn.disconnect() }
                val actual = digest.digest().joinToString("") { "%02x".format(it.toInt() and 255) }
                check(actual.equals(release.hash, ignoreCase = true)) { "The update changed during download. Please try again." }
                val pm = activity.packageManager
                val archive = pm.getPackageArchiveInfo(temp.absolutePath, PackageManager.GET_SIGNING_CERTIFICATES)
                    ?: error("The download is not a valid Android app.")
                check(archive.packageName == activity.packageName && archive.longVersionCode == release.code) { "The downloaded app doesn't match this update." }
                val installed = pm.getPackageInfo(activity.packageName, PackageManager.GET_SIGNING_CERTIFICATES)
                val currentSigners = installed.signingInfo?.apkContentsSigners?.toSet()
                val updateSigners = archive.signingInfo?.apkContentsSigners?.toSet()
                check(!currentSigners.isNullOrEmpty() && currentSigners == updateSigners) {
                    "This release has a different signing key and can't replace this installation. Your current app has been kept."
                }
                if (apk.exists()) check(apk.delete()) { "Couldn't replace the previous download." }
                check(temp.renameTo(apk)) { "Couldn't save the update." }
                activity.runOnUiThread { if (!closed) { pending = apk; install() } }
            } catch (e: Exception) {
                temp.delete()
                show("Update not installed. ${e.message ?: "Please try again."}", "Retry download") { download(release) }
            } finally { activity.runOnUiThread { busy = false } }
        }
    }

    private fun install() {
        val apk = pending ?: return
        if (!apk.exists()) { pending = null; check(); return }
        try {
            if (!activity.packageManager.canRequestPackageInstalls()) {
                show("Allow OSG Remote to install updates, then return here.", "Install downloaded update") { install() }
                activity.startActivity(Intent(Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES, Uri.parse("package:${activity.packageName}")))
                return
            }
            val uri = FileProvider.getUriForFile(activity, "${activity.packageName}.updates", apk)
            activity.startActivity(Intent(Intent.ACTION_VIEW).apply {
                setDataAndType(uri, "application/vnd.android.package-archive")
                addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
            })
            show("Confirm Update on Android's install screen.", "Install downloaded update") { install() }
        } catch (e: Exception) {
            show("Couldn't open the installer. ${e.message ?: "Try again."}", "Install downloaded update") { install() }
        }
    }

    fun resume() {
        if (pending != null && activity.packageManager.canRequestPackageInstalls()) {
            show("Update downloaded and ready.", "Install downloaded update") { install() }
        }
    }

    fun close() { closed = true; worker.shutdownNow() }
}