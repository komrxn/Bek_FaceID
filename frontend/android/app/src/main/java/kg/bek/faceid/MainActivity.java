package kg.bek.faceid;

import android.os.Bundle;
import android.view.WindowManager;

import androidx.core.view.WindowCompat;
import androidx.core.view.WindowInsetsCompat;
import androidx.core.view.WindowInsetsControllerCompat;

import com.getcapacitor.BridgeActivity;

/**
 * Kiosk-grade fullscreen: hide both the status bar and the navigation bar
 * so the front-of-house tablet never shows Android system chrome.
 *
 * Behaviour `BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE` means staff (or a
 * manager) can still pull system bars in for a few seconds by swiping
 * from the edge — useful for the manager when they need to exit the app
 * for maintenance, but invisible during normal use.
 *
 * `FLAG_KEEP_SCREEN_ON` is belt-and-suspenders next to the manifest's
 * `android:keepScreenOn="true"` — guarantees the screen never sleeps
 * during a long shift even if the WebView loses focus momentarily.
 */
public class MainActivity extends BridgeActivity {

    @Override
    public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        // Draw the WebView edge-to-edge, under the (now hidden) system bars.
        WindowCompat.setDecorFitsSystemWindows(getWindow(), false);

        WindowInsetsControllerCompat controller = new WindowInsetsControllerCompat(
            getWindow(),
            getWindow().getDecorView()
        );
        controller.hide(WindowInsetsCompat.Type.systemBars());
        controller.setSystemBarsBehavior(
            WindowInsetsControllerCompat.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE
        );

        getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
    }

    @Override
    public void onWindowFocusChanged(boolean hasFocus) {
        super.onWindowFocusChanged(hasFocus);
        // Re-apply immersive mode whenever the activity regains focus — without
        // this, dismissing a permission prompt / camera dialog leaves the system
        // bars visible permanently.
        if (hasFocus) {
            WindowInsetsControllerCompat controller = new WindowInsetsControllerCompat(
                getWindow(),
                getWindow().getDecorView()
            );
            controller.hide(WindowInsetsCompat.Type.systemBars());
        }
    }
}
