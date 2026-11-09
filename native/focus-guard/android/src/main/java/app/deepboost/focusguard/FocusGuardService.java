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

    static final String PREFS = "focus_guard";
    private static final String CHANNEL = "focus_guard";
    private static final int NOTIF_ID = 4711;

    // Apps that are never blocked: phone, emergency, system UI, settings, home screen
    private static final String[] ALWAYS_ALLOWED = {
        "android", "com.android.systemui", "com.android.settings", "com.android.phone", "com.android.dialer",
        "com.google.android.dialer", "com.samsung.android.dialer", "com.android.server.telecom", "com.android.emergency",
        "com.google.android.apps.safetyhub", "com.android.incallui", "com.miui.securitycenter", "com.android.permissioncontroller",
        "com.google.android.permissioncontroller"
    };

    private final Handler handler = new Handler(Looper.getMainLooper());
    private Set<String> allowed = new HashSet<>();
    private long endsAt = 0L;
    private long lastKick = 0L;
    private String home = "";

    static boolean isRunning(Context c) {
        SharedPreferences p = c.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
        return p.getBoolean("running", false) && p.getLong("endsAt", 0L) > System.currentTimeMillis();
    }

    static long endsAt(Context c) {
        return c.getSharedPreferences(PREFS, Context.MODE_PRIVATE).getLong("endsAt", 0L);
    }

    static void stop(Context c) {
        c.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit().putBoolean("running", false).apply();
        c.stopService(new Intent(c, FocusGuardService.class));
    }

    private final Runnable tick = new Runnable() {
        @Override
        public void run() {
            long now = System.currentTimeMillis();
            if (now >= endsAt || !getSharedPreferences(PREFS, MODE_PRIVATE).getBoolean("running", false)) {
                stopSelfSafely();
                return;
            }
            try {
                String fg = foregroundApp(now);
                if (fg != null && !isAllowed(fg) && now - lastKick > 1500) {
                    lastKick = now;
                    bringBack(fg);
                }
            } catch (Exception ignored) {
                // never crash the phone's foreground service
            }
            handler.postDelayed(this, 1000);
        }
    };

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        SharedPreferences p = getSharedPreferences(PREFS, MODE_PRIVATE);
        allowed = new HashSet<>(p.getStringSet("allowed", new HashSet<>()));
        endsAt = p.getLong("endsAt", 0L);
        home = homePackage();
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
        getSharedPreferences(PREFS, MODE_PRIVATE).edit().putBoolean("running", false).apply();
        handler.removeCallbacks(tick);
        if (Build.VERSION.SDK_INT >= 24) {
            stopForeground(STOP_FOREGROUND_REMOVE);
        } else {
            stopForeground(true);
        }
        stopSelf();
    }

    private boolean isAllowed(String pkg) {
        if (pkg.equals(getPackageName()) || pkg.equals(home) || allowed.contains(pkg)) return true;
        for (String a : ALWAYS_ALLOWED) if (a.equals(pkg)) return true;
        return pkg.contains("launcher") || pkg.contains("inputmethod") || pkg.contains("keyboard");
    }

    private String homePackage() {
        try {
            Intent i = new Intent(Intent.ACTION_MAIN);
            i.addCategory(Intent.CATEGORY_HOME);
            ResolveInfo ri = getPackageManager().resolveActivity(i, PackageManager.MATCH_DEFAULT_ONLY);
            return ri != null && ri.activityInfo != null ? ri.activityInfo.packageName : "";
        } catch (Exception e) {
            return "";
        }
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

    private void bringBack(String blocked) {
        Intent i = getPackageManager().getLaunchIntentForPackage(getPackageName());
        if (i == null) return;
        i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_REORDER_TO_FRONT | Intent.FLAG_ACTIVITY_SINGLE_TOP);
        i.putExtra("focusBlocked", blocked);
        startActivity(i);
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
            .setContentText("Only allowed apps until " + until)
            .setOngoing(true)
            .setOnlyAlertOnce(true)
            .setContentIntent(pi)
            .setPriority(NotificationCompat.PRIORITY_LOW)
            .build();
    }
}
