package app.deepboost.focusguard;

import android.app.AppOpsManager;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.pm.PackageManager;
import android.content.pm.ResolveInfo;
import android.net.Uri;
import android.os.Build;
import android.provider.Settings;

import androidx.core.content.ContextCompat;

import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.util.ArrayList;
import java.util.Collections;
import java.util.HashSet;
import java.util.List;
import java.util.Set;

/**
 * Focus mode for DeepBoost Life.
 * While a focus session runs, if the user opens an app that is not on their allowed list,
 * DeepBoost Life is brought back to the front. Needs two permissions the user grants in
 * Android settings: "Usage access" and "Display over other apps".
 */
@CapacitorPlugin(name = "FocusGuard")
public class FocusGuardPlugin extends Plugin {

    static boolean hasUsageAccess(Context c) {
        try {
            AppOpsManager ops = (AppOpsManager) c.getSystemService(Context.APP_OPS_SERVICE);
            int mode;
            if (Build.VERSION.SDK_INT >= 29) {
                mode = ops.unsafeCheckOpNoThrow(AppOpsManager.OPSTR_GET_USAGE_STATS, android.os.Process.myUid(), c.getPackageName());
            } else {
                mode = ops.checkOpNoThrow(AppOpsManager.OPSTR_GET_USAGE_STATS, android.os.Process.myUid(), c.getPackageName());
            }
            return mode == AppOpsManager.MODE_ALLOWED;
        } catch (Exception e) {
            return false;
        }
    }

    static boolean canDrawOverlays(Context c) {
        return Build.VERSION.SDK_INT < 23 || Settings.canDrawOverlays(c);
    }

    @PluginMethod
    public void getStatus(PluginCall call) {
        Context c = getContext();
        SharedPreferences p = FocusState.prefs(c);
        JSObject r = new JSObject();
        r.put("supported", true);
        r.put("usageAccess", hasUsageAccess(c));
        r.put("overlay", canDrawOverlays(c));
        r.put("accessibility", FocusState.accessibilityOn(c));
        boolean running = FocusState.isRunning(c);
        if (!running && p.getBoolean("running", false)) FocusState.finish(c, "completed");
        r.put("running", running);
        r.put("paused", running && FocusState.isPaused(c));
        r.put("endsAt", p.getLong("endsAt", 0L));
        r.put("startedAt", p.getLong("startedAt", 0L));
        r.put("mode", p.getString("mode", "block"));
        r.put("blockedCount", p.getInt("blockedCount", 0));
        r.put("hasLastSession", p.getString("lastSession", null) != null);
        call.resolve(r);
    }

    /** Screen time between start and end (ms epoch), worked out from Android usage events. Stays on the phone. */
    @PluginMethod
    public void getUsage(PluginCall call) {
        Context c = getContext();
        if (!hasUsageAccess(c)) {
            call.reject("Usage access is off");
            return;
        }
        Double s0 = call.getDouble("start");
        Double e0 = call.getDouble("end");
        long now = System.currentTimeMillis();
        long start = s0 == null ? now - 86400000L : s0.longValue();
        long end = e0 == null ? now : Math.min(now, e0.longValue());
        if (end <= start) {
            call.reject("Bad time range");
            return;
        }
        try {
            android.app.usage.UsageStatsManager usm = (android.app.usage.UsageStatsManager) c.getSystemService(Context.USAGE_STATS_SERVICE);
            android.app.usage.UsageEvents events = usm.queryEvents(start, end);
            android.app.usage.UsageEvents.Event ev = new android.app.usage.UsageEvents.Event();
            java.util.Map<String, Long> fgSince = new java.util.HashMap<>();
            java.util.Map<String, Long> total = new java.util.HashMap<>();
            int unlocks = 0;
            String home = FocusState.homePackage(c);
            while (events.hasNextEvent()) {
                events.getNextEvent(ev);
                int t = ev.getEventType();
                String pkg = ev.getPackageName();
                long ts = ev.getTimeStamp();
                if (t == 18) { // KEYGUARD_HIDDEN = phone unlocked (Android 9+)
                    unlocks++;
                    continue;
                }
                if (pkg == null) continue;
                if (t == android.app.usage.UsageEvents.Event.MOVE_TO_FOREGROUND) {
                    if (!fgSince.containsKey(pkg)) fgSince.put(pkg, ts);
                } else if (t == android.app.usage.UsageEvents.Event.MOVE_TO_BACKGROUND) {
                    Long since = fgSince.remove(pkg);
                    if (since != null && ts > since) total.put(pkg, (total.containsKey(pkg) ? total.get(pkg) : 0L) + (ts - since));
                }
            }
            for (java.util.Map.Entry<String, Long> en : fgSince.entrySet()) {
                // still open at the end of the range (cap at 3 hours to avoid a missed close event counting forever)
                long add = Math.min(end - en.getValue(), 3L * 3600000L);
                if (add > 0) total.put(en.getKey(), (total.containsKey(en.getKey()) ? total.get(en.getKey()) : 0L) + add);
            }
            PackageManager pm = c.getPackageManager();
            List<JSObject> apps = new ArrayList<>();
            long sum = 0L;
            for (java.util.Map.Entry<String, Long> en : total.entrySet()) {
                String pkg = en.getKey();
                if (pkg.equals(home) || pkg.equals("com.android.systemui") || pkg.contains("launcher") || en.getValue() < 1000L) continue;
                if (pm.getLaunchIntentForPackage(pkg) == null && !pkg.equals(c.getPackageName())) continue; // background/system parts
                JSObject a = new JSObject();
                a.put("packageName", pkg);
                a.put("label", FocusState.labelOf(c, pkg));
                a.put("ms", en.getValue());
                apps.add(a);
                sum += en.getValue();
            }
            Collections.sort(apps, (x, y) -> Long.compare(y.optLong("ms", 0L), x.optLong("ms", 0L)));
            JSArray arr = new JSArray();
            for (JSObject a : apps) arr.put(a);
            JSObject r = new JSObject();
            r.put("totalMs", sum);
            r.put("unlocks", Build.VERSION.SDK_INT >= 28 ? unlocks : -1);
            r.put("apps", arr);
            call.resolve(r);
        } catch (Exception e) {
            call.reject("Could not read screen time: " + e.getMessage());
        }
    }

    @PluginMethod
    public void takeLastSession(PluginCall call) {
        SharedPreferences p = FocusState.prefs(getContext());
        String s = p.getString("lastSession", null);
        JSObject r = new JSObject();
        if (s != null) {
            try {
                r.put("session", new JSObject(s));
            } catch (Exception ignored) {
            }
            p.edit().remove("lastSession").apply();
        }
        call.resolve(r);
    }

    @PluginMethod
    public void openAccessibilitySettings(PluginCall call) {
        try {
            Intent i = new Intent(Settings.ACTION_ACCESSIBILITY_SETTINGS);
            i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            getContext().startActivity(i);
            call.resolve();
        } catch (Exception e) {
            call.reject("Could not open Accessibility settings");
        }
    }

    @PluginMethod
    public void openAppInfo(PluginCall call) {
        try {
            Intent i = new Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS, Uri.parse("package:" + getContext().getPackageName()));
            i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            getContext().startActivity(i);
            call.resolve();
        } catch (Exception e) {
            call.reject("Could not open App info");
        }
    }

    @PluginMethod
    public void pause(PluginCall call) {
        SharedPreferences p = FocusState.prefs(getContext());
        if (p.getBoolean("running", false) && p.getLong("pausedAt", 0L) == 0L) {
            p.edit().putLong("pausedAt", System.currentTimeMillis()).apply();
        }
        call.resolve();
    }

    @PluginMethod
    public void resume(PluginCall call) {
        Context c = getContext();
        SharedPreferences p = FocusState.prefs(c);
        long pausedAt = p.getLong("pausedAt", 0L);
        if (!p.getBoolean("running", false) || pausedAt == 0L) {
            call.resolve();
            return;
        }
        long now = System.currentTimeMillis();
        Double endsAtD = call.getDouble("endsAt");
        long endsAt = endsAtD != null ? endsAtD.longValue() : p.getLong("endsAt", now) + (now - pausedAt);
        p.edit()
            .putLong("pausedTotal", p.getLong("pausedTotal", 0L) + (now - pausedAt))
            .putLong("pausedAt", 0L)
            .putLong("endsAt", endsAt)
            .apply();
        call.resolve();
    }

    @PluginMethod
    public void openUsageSettings(PluginCall call) {
        try {
            Intent i = new Intent(Settings.ACTION_USAGE_ACCESS_SETTINGS);
            i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            getContext().startActivity(i);
            call.resolve();
        } catch (Exception e) {
            call.reject("Could not open Usage access settings");
        }
    }

    @PluginMethod
    public void openOverlaySettings(PluginCall call) {
        try {
            Intent i = new Intent(Settings.ACTION_MANAGE_OVERLAY_PERMISSION, Uri.parse("package:" + getContext().getPackageName()));
            i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            getContext().startActivity(i);
            call.resolve();
        } catch (Exception e) {
            call.reject("Could not open Display over other apps settings");
        }
    }

    @PluginMethod
    public void listApps(PluginCall call) {
        PackageManager pm = getContext().getPackageManager();
        Intent main = new Intent(Intent.ACTION_MAIN);
        main.addCategory(Intent.CATEGORY_LAUNCHER);
        List<ResolveInfo> found = pm.queryIntentActivities(main, 0);
        Set<String> seen = new HashSet<>();
        List<JSObject> apps = new ArrayList<>();
        String self = getContext().getPackageName();
        for (ResolveInfo ri : found) {
            String pkg = ri.activityInfo.packageName;
            if (pkg.equals(self) || !seen.add(pkg)) continue;
            JSObject a = new JSObject();
            a.put("packageName", pkg);
            a.put("label", String.valueOf(ri.loadLabel(pm)));
            apps.add(a);
        }
        Collections.sort(apps, (x, y) -> x.getString("label", "").compareToIgnoreCase(y.getString("label", "")));
        JSArray arr = new JSArray();
        for (JSObject a : apps) arr.put(a);
        JSObject r = new JSObject();
        r.put("apps", arr);
        call.resolve(r);
    }

    @PluginMethod
    public void start(PluginCall call) {
        call.reject("The app blocker has been removed from DeepBoost Life. The focus timer still works.");
    }

    @PluginMethod
    public void stop(PluginCall call) {
        String reason = call.getString("reason", "stopped");
        FocusState.finish(getContext(), reason == null ? "stopped" : reason);
        call.resolve();
    }
}
