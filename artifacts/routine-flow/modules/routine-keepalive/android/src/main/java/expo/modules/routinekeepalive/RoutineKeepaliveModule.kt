package expo.modules.routinekeepalive

import android.content.Intent
import android.os.Build
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

class RoutineKeepaliveModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("RoutineKeepalive")

    Function("start") { title: String, body: String ->
      val context = appContext.reactContext?.applicationContext ?: return@Function false
      if (!RoutineKeepaliveService.claimStart()) {
        return@Function try {
          RoutineKeepaliveService.updateNotification(context, title, body)
          true
        } catch (_: Exception) {
          false
        }
      }

      val intent = Intent(context, RoutineKeepaliveService::class.java).apply {
        action = RoutineKeepaliveService.ACTION_START
        putExtra(RoutineKeepaliveService.EXTRA_TITLE, title)
        putExtra(RoutineKeepaliveService.EXTRA_BODY, body)
      }
      try {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) context.startForegroundService(intent)
        else context.startService(intent)
        true
      } catch (_: Exception) {
        RoutineKeepaliveService.releaseStartClaim()
        false
      }
    }

    Function("update") { title: String, body: String ->
      val context = appContext.reactContext?.applicationContext ?: return@Function false
      try {
        RoutineKeepaliveService.updateNotification(context, title, body)
        true
      } catch (_: Exception) {
        false
      }
    }

    Function("stop") {
      val context = appContext.reactContext?.applicationContext ?: return@Function false
      try {
        RoutineKeepaliveService.releaseStartClaim()
        context.stopService(Intent(context, RoutineKeepaliveService::class.java))
        true
      } catch (_: Exception) {
        false
      }
    }
  }
}
