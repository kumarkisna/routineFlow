package expo.modules.routinekeepalive

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Context
import android.content.Intent
import android.os.Build
import android.os.IBinder
import android.os.PowerManager

class RoutineKeepaliveService : Service() {
  private var wakeLock: PowerManager.WakeLock? = null

  override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
    if (intent?.action == ACTION_STOP) {
      stopForegroundCompat()
      stopSelf(startId)
      return START_NOT_STICKY
    }

    val title = intent?.getStringExtra(EXTRA_TITLE) ?: DEFAULT_TITLE
    val body = intent?.getStringExtra(EXTRA_BODY) ?: DEFAULT_BODY
    val manager = getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
    ensureNotificationChannel(manager)
    startForeground(NOTIFICATION_ID, buildNotification(this, title, body))
    acquireWakeLock()
    return START_NOT_STICKY
  }

  override fun onDestroy() {
    releaseWakeLock()
    releaseStartClaim()
    stopForegroundCompat()
    super.onDestroy()
  }

  override fun onBind(intent: Intent?): IBinder? = null

  private fun acquireWakeLock() {
    val powerManager = getSystemService(Context.POWER_SERVICE) as PowerManager
    val lock = wakeLock ?: powerManager.newWakeLock(
      PowerManager.PARTIAL_WAKE_LOCK,
      "$packageName:RoutineKeepalive",
    ).also { wakeLock = it }
    if (!lock.isHeld) lock.acquire()
  }

  private fun releaseWakeLock() {
    wakeLock?.let { if (it.isHeld) it.release() }
    wakeLock = null
  }

  private fun stopForegroundCompat() {
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.N) {
      stopForeground(STOP_FOREGROUND_REMOVE)
    } else {
      @Suppress("DEPRECATION")
      stopForeground(true)
    }
  }

  companion object {
    const val ACTION_START = "expo.modules.routinekeepalive.START"
    const val ACTION_STOP = "expo.modules.routinekeepalive.STOP"
    const val EXTRA_TITLE = "routine_title"
    const val EXTRA_BODY = "routine_body"
    const val NOTIFICATION_ID = 57421
    private const val CHANNEL_ID = "routine-playback"
    private const val DEFAULT_TITLE = "Routine Flow"
    private const val DEFAULT_BODY = "A routine is running."
    @Volatile private var startClaimed = false

    @Synchronized
    fun claimStart(): Boolean {
      if (startClaimed) return false
      startClaimed = true
      return true
    }

    @Synchronized
    fun releaseStartClaim() {
      startClaimed = false
    }

    fun updateNotification(context: Context, title: String, body: String) {
      val manager = context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
      ensureNotificationChannel(manager)
      manager.notify(NOTIFICATION_ID, buildNotification(context, title, body))
    }

    private fun buildNotification(context: Context, title: String, body: String): Notification {
      val builder = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
        Notification.Builder(context, CHANNEL_ID)
      } else {
        @Suppress("DEPRECATION")
        Notification.Builder(context)
      }

      val launchIntent = context.packageManager.getLaunchIntentForPackage(context.packageName)
      if (launchIntent != null) {
        val pendingIntent = PendingIntent.getActivity(
          context,
          0,
          launchIntent,
          PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
        )
        builder.setContentIntent(pendingIntent)
      }

      builder
        .setSmallIcon(android.R.drawable.ic_lock_idle_alarm)
        .setContentTitle(title.ifBlank { DEFAULT_TITLE })
        .setContentText(body.ifBlank { DEFAULT_BODY })
        .setCategory(Notification.CATEGORY_SERVICE)
        .setOngoing(true)
        .setOnlyAlertOnce(true)
        .setVisibility(Notification.VISIBILITY_PRIVATE)
        .setShowWhen(false)
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
        builder.setSilent(true)
      } else {
        @Suppress("DEPRECATION")
        builder.setPriority(Notification.PRIORITY_LOW)
      }
      return builder.build()
    }

    private fun ensureNotificationChannel(manager: NotificationManager) {
      if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return
      manager.createNotificationChannel(
        NotificationChannel(
          CHANNEL_ID,
          "Active routine",
          NotificationManager.IMPORTANCE_LOW,
        ).apply {
          description = "Shows the routine currently running in the background."
          setSound(null, null)
          enableVibration(false)
          setShowBadge(false)
        },
      )
    }
  }
}
