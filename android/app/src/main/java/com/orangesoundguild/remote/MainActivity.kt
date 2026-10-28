package com.orangesoundguild.remote

import android.app.Activity
import android.content.Intent
import android.media.projection.MediaProjectionManager
import android.media.projection.MediaProjectionConfig
import android.net.Uri
import android.os.Bundle
import android.os.Build
import android.os.Handler
import android.os.Looper
import android.provider.Settings
import android.text.InputFilter
import android.text.InputType
import android.view.View
import android.widget.Button
import android.widget.EditText
import android.widget.LinearLayout
import android.widget.ScrollView
import android.widget.TextView
import org.json.JSONObject

class MainActivity : Activity() {

    private lateinit var statusView: TextView
    private lateinit var accessView: TextView
    private lateinit var serverInput: EditText
    private lateinit var codeInput: EditText
    private lateinit var pairButton: Button
    private lateinit var unpairButton: Button
    private lateinit var updater: AppUpdater
    private val ui = Handler(Looper.getMainLooper())
    private val refresh = object : Runnable {
        override fun run() { render(); ui.postDelayed(this, 1000) }
    }

    private fun dp(v: Int) = (v * resources.displayMetrics.density).toInt()

    private fun text(s: String, size: Float = 16f, bold: Boolean = false) = TextView(this).apply {
        text = s; textSize = size
        if (bold) setTypeface(typeface, android.graphics.Typeface.BOLD)
        setPadding(0, dp(6), 0, dp(6))
    }

    private fun button(label: String, onClick: () -> Unit) = Button(this).apply {
        text = label; isAllCaps = false
        setOnClickListener { onClick() }
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        val col = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            setPadding(dp(20), dp(32), dp(20), dp(32))
        }
        col.addView(text("OSG Remote", 28f, true))
        col.addView(text("Control this phone from the Phone Remote page on Orange Sound Guild."))

        col.addView(text("App updates — version ${BuildConfig.VERSION_NAME}", 18f, true))
        val updateStatus = text("")
        val updateButton = button("Check for updates") { updater.check() }
        col.addView(updateStatus)
        col.addView(updateButton)
        updater = AppUpdater(this) { message, label, action ->
            updateStatus.text = message
            updateButton.text = label ?: "Please wait…"
            updateButton.isEnabled = action != null
            updateButton.setOnClickListener { action?.invoke() }
        }

        statusView = text("", 16f, true)
        col.addView(statusView)

        col.addView(text("Step 1 — Pair", 18f, true))
        col.addView(text("Open orangesoundguild.com/remote, press \"Add phone\", and type the code here."))
        codeInput = EditText(this).apply {
            hint = "Pairing code"
            inputType = InputType.TYPE_CLASS_TEXT or InputType.TYPE_TEXT_FLAG_CAP_CHARACTERS or InputType.TYPE_TEXT_FLAG_NO_SUGGESTIONS
            filters = arrayOf(InputFilter.LengthFilter(8))
        }
        col.addView(codeInput)
        pairButton = button("Pair this phone") { pair() }
        col.addView(pairButton)
        unpairButton = button("Unpair") { Prefs.clear(this); render() }
        col.addView(unpairButton)

        col.addView(text("Step 2 — Allow control", 18f, true))
        accessView = text("")
        col.addView(accessView)
        col.addView(text("If Android says \"Restricted setting\": open this app's App info, tap the ⋮ menu, choose \"Allow restricted settings\", then try again."))
        col.addView(button("Open Accessibility settings") {
            startActivity(Intent(Settings.ACTION_ACCESSIBILITY_SETTINGS))
        })

        col.addView(text("Step 3 — Keep it running", 18f, true))
        col.addView(text("These let the phone open apps while the screen is off and keep working at home."))
        col.addView(text("Live video", 14f, true))
        col.addView(text("Smooth live screen on the website. Android will ask to share your screen."))
        col.addView(button("Start live video") { startLive() })
        col.addView(button("Stop live video") { stopService(Intent(this, ScreenStreamService::class.java)) })
        col.addView(button("Allow display over other apps") {
            startActivity(Intent(Settings.ACTION_MANAGE_OVERLAY_PERMISSION, Uri.parse("package:$packageName")))
        })
        col.addView(button("Don't limit battery use") {
            startActivity(Intent(Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS, Uri.parse("package:$packageName")))
        })

        col.addView(text("Server", 14f, true))
        serverInput = EditText(this).apply {
            setText(Prefs.server(this@MainActivity))
            inputType = InputType.TYPE_TEXT_VARIATION_URI
        }
        col.addView(serverInput)

        setContentView(ScrollView(this).apply { addView(col) })
        updater.check()
        maybeAutoStart(intent)
    }

    override fun onNewIntent(intent: Intent) { super.onNewIntent(intent); maybeAutoStart(intent) }

    /** The website's "Start live video" button opens this screen with this flag. */
    private fun maybeAutoStart(i: Intent?) {
        if (i?.getBooleanExtra(EXTRA_START_LIVE, false) != true) return
        i.removeExtra(EXTRA_START_LIVE)
        if (ScreenStreamService.instance == null) ui.postDelayed({ startLive() }, 400)
    }

    private fun startLive() {
        val mpm = getSystemService(MediaProjectionManager::class.java)
        RemoteAccessibilityService.armAutoAccept()
        val captureIntent = if (Build.VERSION.SDK_INT >= 34) {
            mpm.createScreenCaptureIntent(MediaProjectionConfig.createConfigForDefaultDisplay())
        } else {
            mpm.createScreenCaptureIntent()
        }
        startActivityForResult(captureIntent, 77)
    }

    companion object { const val EXTRA_START_LIVE = "start_live" }

    @Deprecated("Activity result")
    override fun onActivityResult(requestCode: Int, resultCode: Int, data: Intent?) {
        super.onActivityResult(requestCode, resultCode, data)
        if (requestCode == 77) RemoteAccessibilityService.instance?.stopPromptRetries()
        if (requestCode == 77 && resultCode == RESULT_OK && data != null) {
            startForegroundService(Intent(this, ScreenStreamService::class.java)
                .putExtra(ScreenStreamService.EXTRA_CODE, resultCode)
                .putExtra(ScreenStreamService.EXTRA_DATA, data))
        }
    }

    override fun onResume() { super.onResume(); ui.post(refresh); updater.resume() }
    override fun onPause() { super.onPause(); ui.removeCallbacks(refresh) }
    override fun onDestroy() { updater.close(); super.onDestroy() }

    private fun render() {
        val paired = Prefs.deviceId(this) != null
        statusView.text = if (paired) "Paired as \"${Prefs.name(this)}\"\n${RemoteAccessibilityService.status}"
        else "Not paired yet"
        accessView.text = if (RemoteAccessibilityService.instance != null)
            "Accessibility: ON ✔" else "Accessibility: OFF — turn on \"OSG Remote\" in Accessibility settings."
        pairButton.visibility = if (paired) View.GONE else View.VISIBLE
        codeInput.visibility = if (paired) View.GONE else View.VISIBLE
        unpairButton.visibility = if (paired) View.VISIBLE else View.GONE
    }

    private fun pair() {
        val code = codeInput.text.toString().trim().uppercase()
        val server = serverInput.text.toString().trim().ifEmpty { BuildConfig.SERVER_URL }
        if (code.length < 6) { statusView.text = "Type the pairing code from the website."; return }
        pairButton.isEnabled = false
        statusView.text = "Pairing…"
        Thread {
            try {
                val r = Api.post(server, "/api/public/remote/pair", JSONObject().put("code", code))
                Prefs.savePairing(this, server, r.getString("deviceId"), r.getString("token"), r.optString("name", "My phone"))
                runOnUiThread { pairButton.isEnabled = true; render() }
            } catch (e: Exception) {
                runOnUiThread { pairButton.isEnabled = true; statusView.text = "Pairing failed: ${e.message}" }
            }
        }.start()
    }
}
