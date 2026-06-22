package leshugan.fm;

import android.os.Bundle;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(AppsPlugin.class);
        super.onCreate(savedInstanceState);
    }
}
