package leshugan.fm;

import android.content.Intent;
import android.content.pm.PackageManager;
import android.content.pm.ResolveInfo;
import android.graphics.Bitmap;
import android.graphics.Canvas;
import android.graphics.drawable.Drawable;
import android.net.Uri;
import android.util.Base64;

import androidx.core.content.FileProvider;

import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.io.ByteArrayOutputStream;
import java.io.File;
import java.util.List;

@CapacitorPlugin(name = "Apps")
public class AppsPlugin extends Plugin {

    @PluginMethod
    public void query(PluginCall call) {
        String mime = call.getString("mime", "*/*");
        String uriStr = call.getString("uri");
        PackageManager pm = getContext().getPackageManager();

        Intent intent = new Intent(Intent.ACTION_VIEW);
        boolean dataSet = false;
        if (uriStr != null) {
            try {
                File f = toFile(uriStr);
                Uri content = FileProvider.getUriForFile(getContext(), getContext().getPackageName() + ".appsfp", f);
                intent.setDataAndType(content, mime);
                intent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
                dataSet = true;
            } catch (Exception ignored) {}
        }
        if (!dataSet) intent.setType(mime);

        List<ResolveInfo> list = pm.queryIntentActivities(intent, PackageManager.MATCH_ALL);
        if (list.isEmpty() && dataSet) {
            Intent alt = new Intent(Intent.ACTION_VIEW);
            alt.setType(mime);
            list = pm.queryIntentActivities(alt, PackageManager.MATCH_ALL);
        }
        if (list.isEmpty()) {
            Intent edit = new Intent(Intent.ACTION_EDIT);
            edit.setType(mime);
            list = pm.queryIntentActivities(edit, PackageManager.MATCH_ALL);
        }

        JSArray apps = new JSArray();
        for (ResolveInfo ri : list) {
            if (ri.activityInfo == null) continue;
            JSObject o = new JSObject();
            o.put("label", String.valueOf(ri.loadLabel(pm)));
            o.put("packageName", ri.activityInfo.packageName);
            o.put("activityName", ri.activityInfo.name);
            try { o.put("icon", drawableToBase64(ri.loadIcon(pm))); } catch (Exception ignored) {}
            apps.put(o);
        }
        JSObject ret = new JSObject();
        ret.put("apps", apps);
        call.resolve(ret);
    }

    @PluginMethod
    public void open(PluginCall call) {
        String uriStr = call.getString("uri");
        String mime = call.getString("mime", "*/*");
        String pkg = call.getString("packageName");
        String act = call.getString("activityName");
        if (uriStr == null) { call.reject("no uri"); return; }
        try {
            File f = toFile(uriStr);
            Uri content = FileProvider.getUriForFile(getContext(), getContext().getPackageName() + ".appsfp", f);
            Intent i = new Intent(Intent.ACTION_VIEW);
            i.setDataAndType(content, mime);
            i.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION | Intent.FLAG_ACTIVITY_NEW_TASK);
            if (pkg != null && act != null) i.setClassName(pkg, act);
            else if (pkg != null) i.setPackage(pkg);
            getContext().startActivity(i);
            call.resolve();
        } catch (Exception e) {
            call.reject(e.getMessage());
        }
    }

    @PluginMethod
    public void list(PluginCall call) {
        String uriStr = call.getString("uri");
        if (uriStr == null) { call.reject("no uri"); return; }
        try {
            File dir = toFile(uriStr);
            File[] kids = dir.listFiles();
            JSArray arr = new JSArray();
            if (kids != null) {
                for (File k : kids) {
                    JSObject o = new JSObject();
                    o.put("name", k.getName());
                    o.put("type", k.isDirectory() ? "directory" : "file");
                    o.put("size", k.length());
                    o.put("mtime", k.lastModified());
                    o.put("uri", "file://" + k.getAbsolutePath());
                    arr.put(o);
                }
            }
            JSObject ret = new JSObject();
            ret.put("files", arr);
            call.resolve(ret);
        } catch (Exception e) {
            call.reject(e.getMessage());
        }
    }

    @PluginMethod
    public void delete(PluginCall call) {
        String uriStr = call.getString("uri");
        if (uriStr == null) { call.reject("no uri"); return; }
        File f = toFile(uriStr);
        boolean ok = deleteRecursive(f);
        JSObject ret = new JSObject();
        ret.put("deleted", ok || !f.exists());
        call.resolve(ret);
    }

    private boolean deleteRecursive(File f) {
        if (f.isDirectory()) {
            File[] kids = f.listFiles();
            if (kids != null) for (File k : kids) deleteRecursive(k);
        }
        return f.delete();
    }

    private File toFile(String u) {
        if (u.startsWith("file://")) return new File(Uri.parse(u).getPath());
        return new File(u);
    }

    private String drawableToBase64(Drawable d) {
        int w = d.getIntrinsicWidth(), h = d.getIntrinsicHeight();
        if (w <= 0) w = 96; if (h <= 0) h = 96;
        w = Math.min(w, 144); h = Math.min(h, 144);
        Bitmap b = Bitmap.createBitmap(w, h, Bitmap.Config.ARGB_8888);
        Canvas c = new Canvas(b);
        d.setBounds(0, 0, w, h);
        d.draw(c);
        ByteArrayOutputStream out = new ByteArrayOutputStream();
        b.compress(Bitmap.CompressFormat.PNG, 100, out);
        return "data:image/png;base64," + Base64.encodeToString(out.toByteArray(), Base64.NO_WRAP);
    }
}
