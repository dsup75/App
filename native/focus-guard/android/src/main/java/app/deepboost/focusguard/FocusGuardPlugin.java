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
        JSObject r = new JSObject();
        r.put("supported", true);
        r.put("usageAccess", hasUsageAccess(c));
        r.put("overlay", canDrawOverlays(c));
        r.put("running", FocusGuardService.isRunning(c));
        r.put("endsAt", FocusGuardService.endsAt(c));
        call.resolve(r);
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
        if (!hasUsageAccess(c)) {
            call.reject("Usage access is off");
            return;
        }
        if (!canDrawOverlays(c)) {
            call.reject("Display over other apps is off");
            return;
        }
        Double endsAtD = call.getDouble("endsAt");
        long endsAt = endsAtD == null ? 0L : endsAtD.longValue();
        if (endsAt <= System.currentTimeMillis()) {
            call.reject("Focus end time must be in the future");
            return;
        }
        Set<String> allowed = new HashSet<>();
        JSArray arr = call.getArray("allowed");
        if (arr != null) {
            for (int i = 0; i < arr.length(); i++) {
                String p = arr.optString(i, null);
                if (p != null && !p.isEmpty()) allowed.add(p);
            }
        }
        SharedPreferences.Editor ed = c.getSharedPreferences(FocusGuardService.PREFS, Context.MODE_PRIVATE).edit();
        ed.putStringSet("allowed", allowed);
        ed.putLong("endsAt", endsAt);
        ed.putBoolean("running", true);
        ed.apply();
        Intent svc = new Intent(c, FocusGuardService.class);
        try {
            ContextCompat.startForegroundService(c, svc);
            call.resolve();
        } catch (Exception e) {
            ed.putBoolean("running", false).apply();
            call.reject("Could not start focus mode: " + e.getMessage());
        }
    }

    @PluginMethod
    public void stop(PluginCall call) {
        FocusGuardService.stop(getContext());
        call.resolve();
    }
}
