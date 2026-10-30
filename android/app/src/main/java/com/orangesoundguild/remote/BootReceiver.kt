package com.orangesoundguild.remote

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent

/** Restarts the keep-alive service after a reboot or an app update. */
class BootReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        when (intent.action) {
            Intent.ACTION_BOOT_COMPLETED,
            Intent.ACTION_LOCKED_BOOT_COMPLETED,
            Intent.ACTION_MY_PACKAGE_REPLACED,
            "android.intent.action.QUICKBOOT_POWERON" -> KeepAliveService.start(context)
        }
    }
}
