package app.deepboost.focusguard;

import android.app.Activity;
import android.content.Intent;
import android.graphics.Color;
import android.graphics.Typeface;
import android.graphics.drawable.GradientDrawable;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.view.Gravity;
import android.view.MotionEvent;
import android.view.View;
import android.widget.Button;
import android.widget.LinearLayout;
import android.widget.TextView;

/** Full-screen "This app is blocked" screen shown during a focus session. */
public class BlockActivity extends Activity {

    private final Handler handler = new Handler(Looper.getMainLooper());
    private TextView timeLeft;
    private Button emergency;
    private long holdStart = 0L;
    private static final long HOLD_MS = 5000L;

    private final Runnable tick = new Runnable() {
        @Override
        public void run() {
            if (!FocusState.isRunning(BlockActivity.this)) {
                finish();
                return;
            }
            long left = FocusState.prefs(BlockActivity.this).getLong("endsAt", 0L) - System.currentTimeMillis();
            long m = Math.max(0L, left / 60000L);
            long s = Math.max(0L, (left / 1000L) % 60L);
            timeLeft.setText(String.format(java.util.Locale.US, "%d:%02d left in this focus session", m, s));
            if (holdStart > 0L) {
                long held = System.currentTimeMillis() - holdStart;
                if (held >= HOLD_MS) {
                    holdStart = 0L;
                    FocusState.finish(BlockActivity.this, "emergency_exit");
                    finish();
                    return;
                }
                emergency.setText("Keep holding… " + ((HOLD_MS - held) / 1000L + 1) + "s");
            }
            handler.postDelayed(this, 250);
        }
    };

    private int dp(int v) {
        return Math.round(v * getResources().getDisplayMetrics().density);
    }

    private Button button(String text, int bg, int fg) {
        Button b = new Button(this);
        b.setText(text);
        b.setAllCaps(false);
        b.setTextSize(15);
        b.setTextColor(fg);
        GradientDrawable d = new GradientDrawable();
        d.setColor(bg);
        d.setCornerRadius(dp(14));
        b.setBackground(d);
        LinearLayout.LayoutParams lp = new LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, dp(50));
        lp.topMargin = dp(10);
        b.setLayoutParams(lp);
        return b;
    }

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        String pkg = getIntent() != null ? getIntent().getStringExtra("pkg") : null;
        String label = pkg == null ? "This app" : FocusState.labelOf(this, pkg);

        LinearLayout root = new LinearLayout(this);
        root.setOrientation(LinearLayout.VERTICAL);
        root.setGravity(Gravity.CENTER);
        root.setPadding(dp(28), dp(28), dp(28), dp(28));
        root.setBackgroundColor(Color.parseColor("#0B0F0D"));

        TextView icon = new TextView(this);
        icon.setText("⏳");
        icon.setTextSize(52);
        icon.setGravity(Gravity.CENTER);
        root.addView(icon);

        TextView title = new TextView(this);
        title.setText(label + " is blocked");
        title.setTextColor(Color.WHITE);
        title.setTextSize(24);
        title.setTypeface(Typeface.DEFAULT_BOLD);
        title.setGravity(Gravity.CENTER);
        title.setPadding(0, dp(14), 0, dp(6));
        root.addView(title);

        TextView sub = new TextView(this);
        sub.setText("You started a focus session in DeepBoost Life. Stay with it — this app opens again when the session ends.");
        sub.setTextColor(Color.parseColor("#B8C4BE"));
        sub.setTextSize(14);
        sub.setGravity(Gravity.CENTER);
        root.addView(sub);

        timeLeft = new TextView(this);
        timeLeft.setTextColor(Color.parseColor("#7FE0A8"));
        timeLeft.setTextSize(15);
        timeLeft.setTypeface(Typeface.DEFAULT_BOLD);
        timeLeft.setGravity(Gravity.CENTER);
        timeLeft.setPadding(0, dp(18), 0, dp(18));
        root.addView(timeLeft);

        Button back = button("Back to DeepBoost Life", Color.parseColor("#1E7A4C"), Color.WHITE);
        back.setOnClickListener(v -> {
            Intent i = getPackageManager().getLaunchIntentForPackage(getPackageName());
            if (i != null) {
                i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_REORDER_TO_FRONT);
                startActivity(i);
            }
            finish();
        });
        root.addView(back);

        Button home = button("Go to home screen", Color.parseColor("#1C2421"), Color.WHITE);
        home.setOnClickListener(v -> goHome());
        root.addView(home);

        emergency = button("Emergency exit — hold 5 seconds", Color.TRANSPARENT, Color.parseColor("#FF8A80"));
        emergency.setOnTouchListener((View v, MotionEvent e) -> {
            if (e.getAction() == MotionEvent.ACTION_DOWN) {
                holdStart = System.currentTimeMillis();
            } else if (e.getAction() == MotionEvent.ACTION_UP || e.getAction() == MotionEvent.ACTION_CANCEL) {
                holdStart = 0L;
                emergency.setText("Emergency exit — hold 5 seconds");
            }
            return true;
        });
        root.addView(emergency);

        setContentView(root);
    }

    private void goHome() {
        Intent h = new Intent(Intent.ACTION_MAIN);
        h.addCategory(Intent.CATEGORY_HOME);
        h.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        try {
            startActivity(h);
        } catch (Exception ignored) {
        }
        finish();
    }

    @Override
    protected void onResume() {
        super.onResume();
        handler.removeCallbacks(tick);
        handler.post(tick);
    }

    @Override
    protected void onPause() {
        handler.removeCallbacks(tick);
        holdStart = 0L;
        super.onPause();
    }

    @Override
    public void onBackPressed() {
        goHome();
    }
}
