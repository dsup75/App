package app.deepboost.focusguard;

import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.pm.PackageManager;
import android.content.pm.ResolveInfo;
import android.provider.Settings;
import android.text.TextUtils;

import org.json.JSONObject;

import java.util.HashSet;
import java.util.Set;

/** Shared focus-session state (SharedPreferences) used by the plugin, the services and the block screen. */
final class FocusState {

    static final String PREFS = "focus_guard";

    // Never blocked: phone, emergency, system UI, settings, permission dialogs
    private static final String[] ALWAYS_ALLOWED = {
        "android", "com.android.systemui", "com.android.settings", "com.android.phone", "com.android.dialer",
        "com.google.android.dialer", "com.samsung.android.dialer", "com.android.server.telecom", "com.android.emergency",
        "com.google.android.apps.safetyhub", "com.android.incallui", "com.miui.securitycenter", "com.android.permissioncontroller",
        "com.google.android.permissioncontroller", "com.android.packageinstaller", "com.google.android.packageinstaller"
    };

    private FocusState() {}

    static SharedPreferences prefs(Context c) {
        return c.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
    }

    static boolean isRunning(Context c) {
        SharedPreferences p = prefs(c);
        return p.getBoolean("running", false) && p.getLong("endsAt", 0L) > System.currentTimeMillis();
    }

    static boolean isPaused(Context c) {
        return prefs(c).getLong("pausedAt", 0L) > 0L;
    }

    /**
     * The Accessibility-based blocker was removed: Google Play Protect (fraud protection in India)
     * blocks installing any downloaded APK that declares an Accessibility service.
     * Blocking uses Usage access + "Display over other apps" instead.
     */
    static boolean accessibilityOn(Context c) {
        return false;
    }

    static String homePackage(Context c) {
        try {
            Intent i = new Intent(Intent.ACTION_MAIN);
            i.addCategory(Intent.CATEGORY_HOME);
            ResolveInfo ri = c.getPackageManager().resolveActivity(i, PackageManager.MATCH_DEFAULT_ONLY);
            return ri != null && ri.activityInfo != null ? ri.activityInfo.packageName : "";
        } catch (Exception e) {
            return "";
        }
    }

    private static boolean isSystemSafe(Context c, String pkg) {
        if (pkg.equals(c.getPackageName())) return true;
        for (String a : ALWAYS_ALLOWED) if (a.equals(pkg)) return true;
        return pkg.contains("launcher") || pkg.contains("inputmethod") || pkg.contains("keyboard") || pkg.equals(homePackage(c));
    }

    /** True when this app must be blocked right now. Also ends the session if its time is over. */
    static boolean shouldBlock(Context c, String pkg) {
        if (pkg == null || pkg.isEmpty()) return false;
        SharedPreferences p = prefs(c);
        if (!p.getBoolean("running", false)) return false;
        if (p.getLong("endsAt", 0L) <= System.currentTimeMillis()) {
            finish(c, "completed");
            return false;
        }
        if (p.getLong("pausedAt", 0L) > 0L) return false;
        if (isSystemSafe(c, pkg)) return false;
        Set<String> list = p.getStringSet("list", new HashSet<>());
        String mode = p.getString("mode", "block");
        return "allow".equals(mode) ? !list.contains(pkg) : list.contains(pkg);
    }

    static void countBlock(Context c, String pkg) {
        SharedPreferences p = prefs(c);
        p.edit().putInt("blockedCount", p.getInt("blockedCount", 0) + 1).putString("lastBlocked", pkg).apply();
    }

    /** Ends the running session (once) and keeps a summary for the app to save in history. */
    static synchronized void finish(Context c, String reason) {
        SharedPreferences p = prefs(c);
        if (!p.getBoolean("running", false)) return;
        long now = System.currentTimeMillis();
        long started = p.getLong("startedAt", now);
        long endsAt = p.getLong("endsAt", now);
        long pausedTotal = p.getLong("pausedTotal", 0L);
        long pausedAt = p.getLong("pausedAt", 0L);
        if (pausedAt > 0L) pausedTotal += Math.max(0L, now - pausedAt);
        long endedAt = "completed".equals(reason) ? Math.min(now, endsAt) : now;
        try {
            JSONObject s = new JSONObject();
            s.put("startedAt", started);
            s.put("endedAt", endedAt);
            s.put("plannedMinutes", p.getInt("plannedMinutes", 0));
            s.put("focusedMinutes", Math.max(0L, (endedAt - started - pausedTotal) / 60000L));
            s.put("blockedAttempts", p.getInt("blockedCount", 0));
            s.put("mode", p.getString("mode", "block"));
            s.put("appsCount", p.getStringSet("list", new HashSet<>()).size());
            s.put("endReason", reason);
            s.put("method", accessibilityOn(c) ? "accessibility" : "usage_stats");
            p.edit().putString("lastSession", s.toString()).apply();
        } catch (Exception ignored) {
        }
        p.edit().putBoolean("running", false).putLong("pausedAt", 0L).apply();
    }

    static void showBlockScreen(Context c, String pkg) {
        // App blocker removed (Play Protect install issues). Kept as a no-op for older callers.
    }

    static String labelOf(Context c, String pkg) {
        try {
            PackageManager pm = c.getPackageManager();
            return String.valueOf(pm.getApplicationLabel(pm.getApplicationInfo(pkg, 0)));
        } catch (Exception e) {
            return pkg;
        }
    }
}
