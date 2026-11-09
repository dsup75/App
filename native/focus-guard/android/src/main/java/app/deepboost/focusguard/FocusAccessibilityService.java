package app.deepboost.focusguard;

import android.accessibilityservice.AccessibilityService;
import android.view.accessibility.AccessibilityEvent;

/**
 * Focus mode blocker. Android tells this service whenever a new window (app) comes to the front.
 * During a focus session, if that app is blocked, the DeepBoost block screen is shown on top.
 * It reads nothing on screen — only the package name of the app that opened.
 */
public class FocusAccessibilityService extends AccessibilityService {

    private long lastShown = 0L;
    private String lastPkg = "";

    @Override
    public void onAccessibilityEvent(AccessibilityEvent event) {
        if (event == null || event.getEventType() != AccessibilityEvent.TYPE_WINDOW_STATE_CHANGED) return;
        CharSequence cs = event.getPackageName();
        if (cs == null) return;
        String pkg = cs.toString();
        try {
            if (!FocusState.shouldBlock(this, pkg)) return;
            long now = System.currentTimeMillis();
            // avoid counting the same open twice in a row
            if (!(pkg.equals(lastPkg) && now - lastShown < 1500)) FocusState.countBlock(this, pkg);
            lastPkg = pkg;
            lastShown = now;
            performGlobalAction(GLOBAL_ACTION_HOME);
            FocusState.showBlockScreen(this, pkg);
        } catch (Exception ignored) {
            // never crash the accessibility service
        }
    }

    @Override
    public void onInterrupt() {
    }
}
