package app.deepboost.focusguard;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.app.usage.UsageEvents;
import android.app.usage.UsageStatsManager;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.pm.PackageManager;
import android.content.pm.ResolveInfo;
import android.content.pm.ServiceInfo;
import android.os.Build;
import android.os.Handler;
import android.os.IBinder;
import android.os.Looper;

import androidx.core.app.NotificationCompat;

import java.text.DateFormat;
import java.util.Date;
import java.util.HashSet;
import java.util.Set;

/** Watches the app on screen during a focus session and brings DeepBoost Life back if it is not allowed. */
public class FocusGuardService extends Service {

    static final String PREFS = FocusState.PREFS;
    private static final String CHANNEL = "focus_guard";
    private static final int NOTIF_ID = 4711;

    private final Handler handler = new Handler(Looper.getMainLooper());
    private long endsAt = 0L;
    private long lastKick = 0L;

    static boolean isRunning(Context c) {
        return FocusState.isRunning(c);
    }

    static long endsAt(Context c) {
        return FocusState.prefs(c).getLong("endsAt", 0L);
    }

    private final Runnable tick = new Runnable() {
        @Override
        public void run() {
            long now = System.currentTimeMillis();
            endsAt = endsAt(FocusGuardService.this);
            if (!FocusState.prefs(FocusGuardService.this).getBoolean("running", false)) {
                stopSelfSafely();
                return;
            }
            if (now >= endsAt) {
                FocusState.finish(FocusGuardService.this, "completed");
                stopSelfSafely();
                return;
            }
            try {
                // The accessibility blocker reacts instantly; this 1-second check is the fallback when it is off.
                if (!FocusState.accessibilityOn(FocusGuardService.this) && FocusGuardPlugin.hasUsageAccess(FocusGuardService.this)) {
                    String fg = foregroundApp(now);
                    if (fg != null && now - lastKick > 1500 && FocusState.shouldBlock(FocusGuardService.this, fg)) {
                        lastKick = now;
                        FocusState.countBlock(FocusGuardService.this, fg);
                        FocusState.showBlockScreen(FocusGuardService.this, fg);
                    }
                }
            } catch (Exception ignored) {
                // never crash the phone's foreground service
            }
            handler.postDelayed(this, 1000);
        }
    };

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        endsAt = endsAt(this);
        Notification n = buildNotification();
        if (Build.VERSION.SDK_INT >= 34) {
            startForeground(NOTIF_ID, n, ServiceInfo.FOREGROUND_SERVICE_TYPE_SPECIAL_USE);
        } else {
            startForeground(NOTIF_ID, n);
        }
        handler.removeCallbacks(tick);
        handler.post(tick);
        return START_STICKY;
    }

    @Override
    public void onDestroy() {
        handler.removeCallbacks(tick);
        super.onDestroy();
    }

    @Override
    public IBinder onBind(Intent intent) {
        return null;
    }

    private void stopSelfSafely() {
        handler.removeCallbacks(tick);
        if (Build.VERSION.SDK_INT >= 24) {
            stopForeground(STOP_FOREGROUND_REMOVE);
        } else {
            stopForeground(true);
        }
        stopSelf();
    }



    /** Latest app that came to the front in the last 30 seconds */
    private String foregroundApp(long now) {
        UsageStatsManager usm = (UsageStatsManager) getSystemService(Context.USAGE_STATS_SERVICE);
        if (usm == null) return null;
        UsageEvents events = usm.queryEvents(now - 30000, now);
        UsageEvents.Event e = new UsageEvents.Event();
        String last = null;
        while (events.hasNextEvent()) {
            events.getNextEvent(e);
            if (e.getEventType() == UsageEvents.Event.MOVE_TO_FOREGROUND) last = e.getPackageName();
        }
        return last;
    }


    private Notification buildNotification() {
        NotificationManager nm = (NotificationManager) getSystemService(Context.NOTIFICATION_SERVICE);
        if (Build.VERSION.SDK_INT >= 26 && nm != null && nm.getNotificationChannel(CHANNEL) == null) {
            NotificationChannel ch = new NotificationChannel(CHANNEL, "Focus mode", NotificationManager.IMPORTANCE_LOW);
            ch.setDescription("Shown while focus mode keeps you on allowed apps");
            nm.createNotificationChannel(ch);
        }
        Intent open = getPackageManager().getLaunchIntentForPackage(getPackageName());
        PendingIntent pi = open == null ? null : PendingIntent.getActivity(this, 0, open, PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT);
        String until = DateFormat.getTimeInstance(DateFormat.SHORT).format(new Date(endsAt));
        return new NotificationCompat.Builder(this, CHANNEL)
            .setSmallIcon(android.R.drawable.ic_lock_idle_lock)
            .setContentTitle("Focus mode is on")
            .setContentText("Blocking distractions until " + until)
            .setOngoing(true)
            .setOnlyAlertOnce(true)
            .setContentIntent(pi)
            .setPriority(NotificationCompat.PRIORITY_LOW)
            .build();
    }
}
