package com.orangesoundguild.remote

import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.os.Build
import android.provider.Settings

/** Shortcuts to brand-specific "keep this app alive" settings pages. */
object PhoneMaker {
    val isXiaomi: Boolean get() = Build.MANUFACTURER.lowercase().let {
        it.contains("xiaomi") || it.contains("redmi") || it.contains("poco")
    }

    private fun tryStart(ctx: Context, vararg intents: Intent): Boolean {
        for (i in intents) {
            try {
                ctx.startActivity(i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)); return true
            } catch (_: Exception) {}
        }
        return false
    }

    private fun appInfo(ctx: Context) =
        Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS, Uri.parse("package:${ctx.packageName}"))

    fun openAutostart(ctx: Context) {
        tryStart(ctx,
            Intent().setComponent(ComponentName("com.miui.securitycenter", "com.miui.permcenter.autostart.AutoStartManagementActivity")),
            Intent("miui.intent.action.OP_AUTO_START").addCategory(Intent.CATEGORY_DEFAULT),
            appInfo(ctx))
    }

    fun openBatterySaver(ctx: Context) {
        tryStart(ctx,
            Intent("miui.intent.action.HIDDEN_APPS_CONFIG_ACTIVITY")
                .putExtra("package_name", ctx.packageName)
                .putExtra("package_label", "OSG Remote"),
            Intent().setComponent(ComponentName("com.miui.powerkeeper", "com.miui.powerkeeper.ui.HiddenAppsConfigActivity"))
                .putExtra("package_name", ctx.packageName)
                .putExtra("package_label", "OSG Remote"),
            appInfo(ctx))
    }

    fun openAppInfo(ctx: Context) { tryStart(ctx, appInfo(ctx)) }
}
