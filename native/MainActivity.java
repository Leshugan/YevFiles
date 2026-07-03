package leshugan.fm;

import android.content.Intent;
import android.net.Uri;
import android.os.Bundle;
import com.getcapacitor.BridgeActivity;

import java.util.ArrayList;

public class MainActivity extends BridgeActivity {
    // Файлы из "Поделиться"/"Открыть", ждут обработки. Читаются плагином AppsPlugin.getShared().
    public static final ArrayList<Uri> pendingShared = new ArrayList<>();
    public static String pendingMode = null; // "save" (Сохранить в...) или "open" (Открыть)

    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(AppsPlugin.class);
        super.onCreate(savedInstanceState);
        handleShare(getIntent());
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
            if (u != null && "content".equals(u.getScheme())) { pendingShared.clear(); pendingShared.add(u); pendingMode = "ask"; }
        }
    }
}
