package leshugan.fm;

import android.content.Intent;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.view.Display;
import android.view.WindowManager;
import com.getcapacitor.BridgeActivity;

import java.util.ArrayList;

public class MainActivity extends BridgeActivity {
    // Файлы из "Поделиться"/"Открыть", ждут обработки. Читаются плагином AppsPlugin.getShared().
    public static final ArrayList<Uri> pendingShared = new ArrayList<>();
    public static String pendingMode = null; // "save" (Сохранить в...) или "open" (Открыть)
    public static String oauthCode = null; // код возврата OAuth из браузера

    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(AppsPlugin.class);
        super.onCreate(savedInstanceState);
        applyHighRefresh();
        handleShare(getIntent());
    }

    @Override
    public void onResume() {
        super.onResume();
        applyHighRefresh();
    }

    // Запросить максимальную частоту обновления экрана (120/144 Гц вместо 60)
    private void applyHighRefresh() {
        try {
            if (Build.VERSION.SDK_INT < 23) return;
            Display display = (Build.VERSION.SDK_INT >= 30) ? getDisplay() : getWindowManager().getDefaultDisplay();
            if (display == null) return;
            Display.Mode cur = display.getMode();
            Display.Mode best = cur;
            for (Display.Mode m : display.getSupportedModes()) {
                if (m.getPhysicalWidth() == cur.getPhysicalWidth() && m.getPhysicalHeight() == cur.getPhysicalHeight()
                        && m.getRefreshRate() > best.getRefreshRate()) best = m;
            }
            WindowManager.LayoutParams lp = getWindow().getAttributes();
            lp.preferredDisplayModeId = best.getModeId();
            if (Build.VERSION.SDK_INT >= 31) lp.preferredRefreshRate = best.getRefreshRate();
            getWindow().setAttributes(lp);
        } catch (Exception ignored) {}
    }

    @Override
    public void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        setIntent(intent);
        handleShare(intent);
    }

    private void handleShare(Intent intent) {
        if (intent == null) return;
        String action = intent.getAction();
        if (Intent.ACTION_SEND.equals(action)) {
            Uri u = intent.getParcelableExtra(Intent.EXTRA_STREAM);
            if (u == null && intent.getData() != null) u = intent.getData();
            if (u != null) { pendingShared.clear(); pendingShared.add(u); pendingMode = "save"; }
        } else if (Intent.ACTION_SEND_MULTIPLE.equals(action)) {
            ArrayList<Uri> list = intent.getParcelableArrayListExtra(Intent.EXTRA_STREAM);
            if (list != null && !list.isEmpty()) { pendingShared.clear(); pendingShared.addAll(list); pendingMode = "save"; }
        } else if (Intent.ACTION_VIEW.equals(action) || Intent.ACTION_EDIT.equals(action)) {
            Uri u = intent.getData();
            if (u != null && u.getScheme() != null && u.getScheme().startsWith("com.googleusercontent.apps")) { oauthCode = u.getQueryParameter("code"); }
            else if (u != null && "content".equals(u.getScheme())) { pendingShared.clear(); pendingShared.add(u); pendingMode = "ask"; }
        }
    }
}
