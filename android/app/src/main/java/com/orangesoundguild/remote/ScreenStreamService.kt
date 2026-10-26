package com.orangesoundguild.remote

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.Service
import android.content.Context
import android.content.Intent
import android.content.pm.ServiceInfo
import android.media.projection.MediaProjection
import android.os.IBinder
import android.view.WindowManager
import org.json.JSONObject
import org.webrtc.DataChannel
import org.webrtc.DefaultVideoDecoderFactory
import org.webrtc.DefaultVideoEncoderFactory
import org.webrtc.EglBase
import org.webrtc.IceCandidate
import org.webrtc.MediaConstraints
import org.webrtc.MediaStream
import org.webrtc.PeerConnection
import org.webrtc.PeerConnectionFactory
import org.webrtc.RtpReceiver
import org.webrtc.ScreenCapturerAndroid
import org.webrtc.SdpObserver
import org.webrtc.SessionDescription
import org.webrtc.SurfaceTextureHelper
import org.webrtc.VideoSource
import java.nio.charset.StandardCharsets
import java.util.concurrent.CountDownLatch
import java.util.concurrent.TimeUnit

/**
 * Live video of the phone screen (WebRTC). The screen is captured once with the user's
 * permission and kept running; each website viewer gets a fresh peer connection.
 * Touches arrive over a "control" data channel and are run by the accessibility service.
 */
class ScreenStreamService : Service() {

    companion object {
        @Volatile var instance: ScreenStreamService? = null
        const val EXTRA_CODE = "code"
        const val EXTRA_DATA = "data"
        private const val CHANNEL = "osg-live"
    }

    private val egl: EglBase = EglBase.create()
    private var factory: PeerConnectionFactory? = null
    private var capturer: ScreenCapturerAndroid? = null
    private var source: VideoSource? = null
    private var helper: SurfaceTextureHelper? = null
    private var pc: PeerConnection? = null
    @Volatile var live = false
        private set

    override fun onBind(intent: Intent?): IBinder? = null

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        val nm = getSystemService(NotificationManager::class.java)
        nm.createNotificationChannel(NotificationChannel(CHANNEL, "Live screen", NotificationManager.IMPORTANCE_LOW))
        val n = Notification.Builder(this, CHANNEL)
            .setContentTitle("OSG Remote")
            .setContentText("Live screen sharing is ready")
            .setSmallIcon(android.R.drawable.presence_video_online)
            .build()
        startForeground(1, n, ServiceInfo.FOREGROUND_SERVICE_TYPE_MEDIA_PROJECTION)

        @Suppress("DEPRECATION")
        val data: Intent? = intent?.getParcelableExtra(EXTRA_DATA)
        val code = intent?.getIntExtra(EXTRA_CODE, 0) ?: 0
        if (data == null || capturer != null) return START_NOT_STICKY

        PeerConnectionFactory.initialize(PeerConnectionFactory.InitializationOptions.builder(this).createInitializationOptions())
        val f = PeerConnectionFactory.builder()
            .setVideoEncoderFactory(DefaultVideoEncoderFactory(egl.eglBaseContext, true, true))
            .setVideoDecoderFactory(DefaultVideoDecoderFactory(egl.eglBaseContext))
            .createPeerConnectionFactory()
        factory = f
        val src = f.createVideoSource(true)
        source = src
        val cap = ScreenCapturerAndroid(data, object : MediaProjection.Callback() {
            override fun onStop() { stopSelf() }
        })
        capturer = cap
        helper = SurfaceTextureHelper.create("osg-capture", egl.eglBaseContext)
        cap.initialize(helper, this, src.capturerObserver)
        val b = (getSystemService(Context.WINDOW_SERVICE) as WindowManager).maximumWindowMetrics.bounds
        val w = 720
        val h = (b.height().toLong() * w / b.width().coerceAtLeast(1)).toInt()
        cap.startCapture(w, h, 30)
        instance = this
        code.hashCode()
        return START_NOT_STICKY
    }

    override fun onDestroy() {
        instance = null
        live = false
        try { pc?.close() } catch (_: Exception) {}
        try { capturer?.stopCapture() } catch (_: Exception) {}
        capturer?.dispose()
        source?.dispose()
        helper?.dispose()
        factory?.dispose()
        egl.release()
        super.onDestroy()
    }

    /** Blocking: takes the website's offer, returns our answer (with ICE candidates included). */
    fun answer(offerSdp: String): String {
        val f = factory ?: throw IllegalStateException("Live video is not started")
        try { pc?.close() } catch (_: Exception) {}
        live = false
        val gathered = CountDownLatch(1)
        val config = PeerConnection.RTCConfiguration(
            listOf(PeerConnection.IceServer.builder("stun:stun.l.google.com:19302").createIceServer())
        ).apply { sdpSemantics = PeerConnection.SdpSemantics.UNIFIED_PLAN }

        val conn = f.createPeerConnection(config, object : PeerConnection.Observer {
            override fun onIceGatheringChange(s: PeerConnection.IceGatheringState) {
                if (s == PeerConnection.IceGatheringState.COMPLETE) gathered.countDown()
            }
            override fun onIceConnectionChange(s: PeerConnection.IceConnectionState) {
                live = s == PeerConnection.IceConnectionState.CONNECTED || s == PeerConnection.IceConnectionState.COMPLETED
            }
            override fun onDataChannel(dc: DataChannel) {
                dc.registerObserver(object : DataChannel.Observer {
                    override fun onBufferedAmountChange(p0: Long) {}
                    override fun onStateChange() {}
                    override fun onMessage(buffer: DataChannel.Buffer) {
                        val bytes = ByteArray(buffer.data.remaining())
                        buffer.data.get(bytes)
                        try {
                            val msg = JSONObject(String(bytes, StandardCharsets.UTF_8))
                            RemoteAccessibilityService.instance?.runRemote(
                                msg.optString("kind"), msg.optJSONObject("payload") ?: JSONObject()
                            )
                        } catch (_: Exception) {}
                    }
                })
            }
            override fun onSignalingChange(p0: PeerConnection.SignalingState?) {}
            override fun onIceConnectionReceivingChange(p0: Boolean) {}
            override fun onIceCandidate(p0: IceCandidate?) {}
            override fun onIceCandidatesRemoved(p0: Array<out IceCandidate>?) {}
            override fun onAddStream(p0: MediaStream?) {}
            override fun onRemoveStream(p0: MediaStream?) {}
            override fun onRenegotiationNeeded() {}
            override fun onAddTrack(p0: RtpReceiver?, p1: Array<out MediaStream>?) {}
        }) ?: throw IllegalStateException("Could not start live video")
        pc = conn

        await { obs -> conn.setRemoteDescription(obs, SessionDescription(SessionDescription.Type.OFFER, offerSdp)) }
        conn.addTrack(f.createVideoTrack("screen", source), listOf("osg"))
        var answer: SessionDescription? = null
        await { obs ->
            conn.createAnswer(object : SdpObserver by obs {
                override fun onCreateSuccess(sdp: SessionDescription?) { answer = sdp; obs.onSetSuccess() }
            }, MediaConstraints())
        }
        val a = answer ?: throw IllegalStateException("No answer")
        await { obs -> conn.setLocalDescription(obs, a) }
        gathered.await(5, TimeUnit.SECONDS)
        return conn.localDescription?.description ?: a.description
    }

    private fun await(block: (SdpObserver) -> Unit) {
        val latch = CountDownLatch(1)
        var error: String? = null
        block(object : SdpObserver {
            override fun onCreateSuccess(p0: SessionDescription?) { latch.countDown() }
            override fun onSetSuccess() { latch.countDown() }
            override fun onCreateFailure(e: String?) { error = e; latch.countDown() }
            override fun onSetFailure(e: String?) { error = e; latch.countDown() }
        })
        latch.await(5, TimeUnit.SECONDS)
        error?.let { throw IllegalStateException(it) }
    }
}
