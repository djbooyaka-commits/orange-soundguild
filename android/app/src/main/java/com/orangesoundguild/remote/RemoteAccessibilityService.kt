package com.orangesoundguild.remote

import android.accessibilityservice.AccessibilityService
import android.accessibilityservice.GestureDescription
import android.content.Context
import android.content.Intent
import android.graphics.Bitmap
import android.graphics.Path
import android.net.Uri
import android.os.Bundle
import android.os.Handler
import android.os.HandlerThread
import android.os.PowerManager
import android.util.Base64
import android.view.Display
import android.view.WindowManager
import android.view.accessibility.AccessibilityEvent
import android.view.accessibility.AccessibilityNodeInfo
import org.json.JSONArray
import org.json.JSONObject
import java.io.ByteArrayOutputStream
import java.util.concurrent.CountDownLatch
import java.util.concurrent.Executors
import java.util.concurrent.TimeUnit

/**
 * One service does everything: it polls the Orange Sound Guild site for commands,
 * performs them (taps, swipes, app/URL launching, text), and uploads screenshots
 * while someone is watching the Phone Remote page.
 */
class RemoteAccessibilityService : AccessibilityService() {

    companion object {
        @Volatile var instance: RemoteAccessibilityService? = null
        @Volatile var status: String = "Accessibility service is off"
        @Volatile private var autoAcceptUntil = 0L

        /** Called right before we show Android's screen-cast prompt; auto-accepts it for ~20 s. */
        fun armAutoAccept() {
            autoAcceptUntil = System.currentTimeMillis() + 20_000L
            instance?.entireChosen = false
        }
    }

    private var lastAutoClickAt = 0L

    private fun isCastPromptPackage(pkg: String?): Boolean {
        if (pkg == null) return false
        return pkg.contains("systemui") || pkg.contains("mediaprojection") ||
            pkg.contains("permissioncontroller") || pkg == "android"
    }

    private var entireChosen = false

    private fun clickableFor(node: AccessibilityNodeInfo?): AccessibilityNodeInfo? {
        var n = node
        while (n != null && !n.isClickable) n = n.parent
        return n
    }

    private fun findByLabels(root: AccessibilityNodeInfo, labels: List<String>): AccessibilityNodeInfo? {
        for (label in labels) {
            root.findAccessibilityNodeInfosByText(label).firstOrNull {
                it.isEnabled && it.text?.toString()?.trim()?.equals(label, ignoreCase = true) == true
            }?.let { return it }
        }
        return null
    }

    private val entireLabels = listOf("Entire screen", "Share entire screen", "Record entire screen", "Full screen", "Whole screen")
    private val singleLabels = listOf("A single app", "Single app", "One app", "Share one app", "Record one app")

    private fun findAcceptButton(root: AccessibilityNodeInfo): AccessibilityNodeInfo? {
        // The dialog's positive button is android:id/button1 on most phones.
        root.findAccessibilityNodeInfosByViewId("android:id/button1").firstOrNull { it.isClickable && it.isEnabled }?.let { return it }
        return clickableFor(findByLabels(root, listOf("Start now", "Start", "Next", "Allow", "Share screen")))
    }

    /** Android 14+: make sure "Entire screen" is chosen before confirming. Returns true if it acted. */
    private fun ensureEntireScreen(root: AccessibilityNodeInfo): Boolean {
        if (entireChosen) return false
        val entire = findByLabels(root, entireLabels)
        val single = findByLabels(root, singleLabels)
        if (entire != null) {
            // Radio/list option visible (or dropdown open): pick it unless already selected.
            val target = clickableFor(entire)
            if (target != null && !(target.isChecked || target.isSelected || entire.isChecked)) {
                // If only the spinner label shows "Entire screen" and no single-app option exists, it's already chosen.
                if (single != null || target.className?.toString()?.contains("Spinner") != true) {
                    target.performAction(AccessibilityNodeInfo.ACTION_CLICK)
                }
            }
            entireChosen = true
            return true
        }
        if (single != null) {
            // Dropdown currently set to "A single app": open it so the options appear.
            clickableFor(single)?.performAction(AccessibilityNodeInfo.ACTION_CLICK)
            return true
        }
        return false
    }

    private fun tryAutoAccept(event: AccessibilityEvent) {
        if (System.currentTimeMillis() > autoAcceptUntil) { entireChosen = false; return }
        if (!isCastPromptPackage(event.packageName?.toString())) return
        val now = System.currentTimeMillis()
        if (now - lastAutoClickAt < 500) return
        val root = rootInActiveWindow ?: return
        if (!isCastPromptPackage(root.packageName?.toString())) return
        if (ensureEntireScreen(root)) { lastAutoClickAt = now; return }
        val button = findAcceptButton(root) ?: return
        lastAutoClickAt = now
        button.performAction(AccessibilityNodeInfo.ACTION_CLICK)
    }

    private lateinit var thread: HandlerThread
    private lateinit var handler: Handler
    private val shotExecutor = Executors.newSingleThreadExecutor()
    @Volatile private var running = false
    @Volatile private var watching = false
    private var lastCommandAt = 0L
    private var pendingFrame: String? = null
    private var pendingAnswer: JSONObject? = null
    private var screenW = 0
    private var screenH = 0
    private val results = JSONArray()

    override fun onServiceConnected() {
        instance = this
        status = "Connected"
        thread = HandlerThread("osg-remote").also { it.start() }
        handler = Handler(thread.looper)
        running = true
        handler.post { tick() }
    }

    override fun onAccessibilityEvent(event: AccessibilityEvent?) {
        if (event != null) try { tryAutoAccept(event) } catch (_: Exception) {}
    }
    override fun onInterrupt() {}

    override fun onDestroy() {
        running = false
        instance = null
        status = "Accessibility service is off"
        if (::thread.isInitialized) thread.quitSafely()
        shotExecutor.shutdown()
        super.onDestroy()
    }

    // ---------------------------------------------------------------- polling loop

    private fun tick() {
        if (!running) return
        var delay = 2500L
        try {
            val deviceId = Prefs.deviceId(this)
            val token = Prefs.token(this)
            if (deviceId == null || token == null) {
                status = "Not paired — enter your pairing code in the app"
                handler.postDelayed({ tick() }, 3000)
                return
            }

            if (watching && ScreenStreamService.instance?.live != true) {
                captureFrame()?.let { pendingFrame = it }
            }
            if (screenW == 0) updateScreenSize()

            val body = JSONObject()
                .put("deviceId", deviceId)
                .put("token", token)
                .put("width", screenW)
                .put("height", screenH)
            pendingFrame?.let { body.put("frame", it) }
            pendingAnswer?.let { body.put("answer", it) }
            val sentResults: JSONArray
            synchronized(results) {
                sentResults = JSONArray(results.toString())
            }
            body.put("results", sentResults)

            val reply = Api.post(Prefs.server(this), "/api/public/remote/poll", body)
            pendingFrame = null
            pendingAnswer = null
            synchronized(results) {
                // Remove only the results that were just delivered.
                val keep = JSONArray()
                for (i in sentResults.length() until results.length()) keep.put(results.get(i))
                while (results.length() > 0) results.remove(0)
                for (i in 0 until keep.length()) results.put(keep.get(i))
            }
            watching = reply.optBoolean("watch", false)
            status = if (watching) "Connected — streaming your screen" else "Connected — waiting for commands"

            val commands = reply.optJSONArray("commands") ?: JSONArray()
            for (i in 0 until commands.length()) {
                val c = commands.getJSONObject(i)
                lastCommandAt = System.currentTimeMillis()
                val error = try {
                    execute(c.optString("kind"), c.optJSONObject("payload") ?: JSONObject())
                } catch (e: Exception) {
                    e.message ?: "Failed"
                }
                synchronized(results) {
                    results.put(
                        JSONObject().put("id", c.getString("id"))
                            .put("status", if (error == null) "done" else "failed")
                            .put("result", error ?: "OK")
                    )
                }
            }

            delay = when {
                watching -> 700L
                System.currentTimeMillis() - lastCommandAt < 30_000 -> 1000L
                else -> 2500L
            }
        } catch (e: Api.HttpError) {
            if (e.code == 401) {
                Prefs.clear(this)
                status = "This phone was unpaired — pair it again"
            } else {
                status = "Server error: ${e.message}"
                delay = 5000L
            }
        } catch (e: Exception) {
            status = "Offline — retrying"
            delay = 5000L
        }
        if (running) handler.postDelayed({ tick() }, delay)
    }

    /** Commands arriving over the live video data channel run right away. */
    fun runRemote(kind: String, p: JSONObject) {
        if (kind == "webrtc_offer") return
        handler.post { try { execute(kind, p) } catch (_: Exception) {} }
    }

    // ---------------------------------------------------------------- commands

    /** Returns null on success, or an error message. */
    private fun execute(kind: String, p: JSONObject): String? {
        return when (kind) {
            "tap" -> gesture(point(p.optInt("x"), p.optInt("y")), 50)
            "long_press" -> gesture(point(p.optInt("x"), p.optInt("y")), 700)
            "swipe" -> {
                val path = Path().apply {
                    moveTo(clampX(p.optInt("x1")), clampY(p.optInt("y1")))
                    lineTo(clampX(p.optInt("x2")), clampY(p.optInt("y2")))
                }
                gesture(path, p.optLong("duration", 300).coerceIn(100, 3000))
            }
            "back" -> global(GLOBAL_ACTION_BACK)
            "home" -> global(GLOBAL_ACTION_HOME)
            "recents" -> global(GLOBAL_ACTION_RECENTS)
            "wake" -> wake()
            "screenshot" -> {
                val f = captureFrame()
                if (f == null) "Could not take a screenshot (some screens block it)" else { pendingFrame = f; null }
            }
            "open_app" -> openApp(p.optString("package"))
            "open_url" -> openUrl(p.optString("url"))
            "type_text" -> typeText(p.optString("text"))
            "webrtc_offer" -> {
                val svc = ScreenStreamService.instance
                    ?: return "Open OSG Remote on the phone and tap \"Start live video\""
                val sdp = svc.answer(p.optString("sdp"))
                pendingAnswer = JSONObject().put("session", p.optString("session")).put("sdp", sdp)
                null
            }
            else -> "Unknown command: $kind"
        }
    }

    private fun updateScreenSize() {
        val b = (getSystemService(Context.WINDOW_SERVICE) as WindowManager).maximumWindowMetrics.bounds
        screenW = b.width()
        screenH = b.height()
    }

    private fun clampX(x: Int) = x.coerceIn(0, (screenW - 1).coerceAtLeast(1)).toFloat()
    private fun clampY(y: Int) = y.coerceIn(0, (screenH - 1).coerceAtLeast(1)).toFloat()

    private fun point(x: Int, y: Int) = Path().apply { moveTo(clampX(x), clampY(y)) }

    private fun gesture(path: Path, durationMs: Long): String? {
        val latch = CountDownLatch(1)
        var ok = false
        val desc = GestureDescription.Builder()
            .addStroke(GestureDescription.StrokeDescription(path, 0, durationMs))
            .build()
        val dispatched = dispatchGesture(desc, object : GestureResultCallback() {
            override fun onCompleted(gestureDescription: GestureDescription?) { ok = true; latch.countDown() }
            override fun onCancelled(gestureDescription: GestureDescription?) { latch.countDown() }
        }, null)
        if (!dispatched) return "The phone rejected the gesture"
        latch.await(durationMs + 2000, TimeUnit.MILLISECONDS)
        return if (ok) null else "Gesture was cancelled"
    }

    private fun global(action: Int): String? =
        if (performGlobalAction(action)) null else "Action failed"

    @Suppress("DEPRECATION")
    private fun wake(): String? {
        val pm = getSystemService(Context.POWER_SERVICE) as PowerManager
        val lock = pm.newWakeLock(
            PowerManager.SCREEN_BRIGHT_WAKE_LOCK or PowerManager.ACQUIRE_CAUSES_WAKEUP,
            "osgremote:wake"
        )
        lock.acquire(3000)
        return null
    }

    private fun openApp(pkg: String): String? {
        if (pkg.isBlank()) return "No app given"
        val intent = packageManager.getLaunchIntentForPackage(pkg) ?: return "App not installed: $pkg"
        intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        startActivity(intent)
        return null
    }

    private fun openUrl(url: String): String? {
        if (!url.startsWith("http://") && !url.startsWith("https://")) return "Only web addresses are allowed"
        val intent = Intent(Intent.ACTION_VIEW, Uri.parse(url)).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        startActivity(intent)
        return null
    }

    private fun typeText(text: String): String? {
        val focus = rootInActiveWindow?.findFocus(AccessibilityNodeInfo.FOCUS_INPUT)
            ?: return "No text box is selected — tap one first"
        val existing = if (focus.isShowingHintText) "" else focus.text?.toString() ?: ""
        val args = Bundle().apply {
            putCharSequence(AccessibilityNodeInfo.ACTION_ARGUMENT_SET_TEXT_CHARSEQUENCE, existing + text)
        }
        return if (focus.performAction(AccessibilityNodeInfo.ACTION_SET_TEXT, args)) null else "Could not type there"
    }

    // ---------------------------------------------------------------- screen picture

    private fun captureFrame(): String? {
        val latch = CountDownLatch(1)
        var out: String? = null
        try {
            takeScreenshot(Display.DEFAULT_DISPLAY, shotExecutor, object : TakeScreenshotCallback {
                override fun onSuccess(result: ScreenshotResult) {
                    try {
                        val hw = Bitmap.wrapHardwareBuffer(result.hardwareBuffer, result.colorSpace)
                        if (hw != null) {
                            screenW = hw.width
                            screenH = hw.height
                            val soft = hw.copy(Bitmap.Config.ARGB_8888, false)
                            // Small, light frames (~20-25 KB) upload and display much faster.
                            val w = 400
                            val h = (soft.height.toLong() * w / soft.width).toInt()
                            val scaled = Bitmap.createScaledBitmap(soft, w, h, true)
                            soft.recycle()
                            val bytes = ByteArrayOutputStream()
                            scaled.compress(Bitmap.CompressFormat.JPEG, 40, bytes)
                            scaled.recycle()
                            out = "data:image/jpeg;base64," + Base64.encodeToString(bytes.toByteArray(), Base64.NO_WRAP)
                        }
                    } catch (_: Exception) {
                    } finally {
                        result.hardwareBuffer.close()
                        latch.countDown()
                    }
                }

                override fun onFailure(errorCode: Int) { latch.countDown() }
            })
        } catch (_: Exception) {
            return null
        }
        latch.await(3, TimeUnit.SECONDS)
        return out
    }
}
