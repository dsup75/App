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
        try {
            ContextCompat.startForegroundService(c, new Intent(c, FocusGuardService.class));
        } catch (Exception ignored) {
        }
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
        Context c = getContext();
        boolean viaAccessibility = FocusState.accessibilityOn(c);
        if (!viaAccessibility && !(hasUsageAccess(c) && canDrawOverlays(c))) {
            call.reject("Turn on the DeepBoost Life blocker in Accessibility settings (or Usage access + Display over other apps)");
            return;
        }
        Double endsAtD = call.getDouble("endsAt");
        long endsAt = endsAtD == null ? 0L : endsAtD.longValue();
        long now = System.currentTimeMillis();
        if (endsAt <= now) {
            call.reject("Focus end time must be in the future");
            return;
        }
        String mode = "allow".equals(call.getString("mode", "block")) ? "allow" : "block";
        Set<String> list = new HashSet<>();
        JSArray arr = call.getArray("apps");
        if (arr == null) arr = call.getArray("allowed");
        if (arr != null) {
            for (int i = 0; i < arr.length(); i++) {
                String p = arr.optString(i, null);
                if (p != null && !p.isEmpty()) list.add(p);
            }
        }
        if ("block".equals(mode) && list.isEmpty()) {
            call.reject("Pick at least one app to block");
            return;
        }
        SharedPreferences p = FocusState.prefs(c);
        if (p.getBoolean("running", false)) FocusState.finish(c, "replaced");
        SharedPreferences.Editor ed = p.edit();
        ed.putStringSet("list", list);
        ed.putString("mode", mode);
        ed.putLong("endsAt", endsAt);
        ed.putLong("startedAt", now);
        ed.putInt("plannedMinutes", (int) Math.round((endsAt - now) / 60000.0));
        ed.putInt("blockedCount", 0);
        ed.putLong("pausedAt", 0L);
        ed.putLong("pausedTotal", 0L);
        ed.putBoolean("running", true);
        ed.apply();
        try {
            ContextCompat.startForegroundService(c, new Intent(c, FocusGuardService.class));
        } catch (Exception e) {
            // the accessibility blocker works without the notification service
            if (!viaAccessibility) {
                p.edit().putBoolean("running", false).apply();
                call.reject("Could not start focus mode: " + e.getMessage());
                return;
            }
        }
        JSObject r = new JSObject();
        r.put("method", viaAccessibility ? "accessibility" : "usage_stats");
        call.resolve(r);
    }

    @PluginMethod
    public void stop(PluginCall call) {
        String reason = call.getString("reason", "stopped");
        FocusState.finish(getContext(), reason == null ? "stopped" : reason);
        call.resolve();
    }
}
