package leshugan.fm;

import android.content.Intent;
import android.content.IntentFilter;
import android.content.Context;
import android.content.BroadcastReceiver;
import android.content.pm.PackageManager;
import android.content.pm.PackageInfo;
import android.content.pm.PackageInstaller;
import android.content.pm.ResolveInfo;
import android.os.FileObserver;
import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.IntentSender;
import android.graphics.Bitmap;
import android.graphics.Canvas;
import android.graphics.drawable.Drawable;
import android.net.Uri;
import android.os.Build;
import android.os.StrictMode;
import android.os.Environment;
import android.provider.Settings;
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
import java.io.FileInputStream;
import java.io.InputStream;
import java.io.OutputStream;
import java.util.List;

@CapacitorPlugin(name = "Apps")
public class AppsPlugin extends Plugin {

    private FileObserver observer;
    private boolean instRegistered = false;

    @PluginMethod
    public void query(PluginCall call) {
        String mime = call.getString("mime", "*/*");
        String uriStr = call.getString("uri");
        PackageManager pm = getContext().getPackageManager();

        Intent intent = new Intent(Intent.ACTION_VIEW);
        boolean dataSet = false;
        if (uriStr != null) {
            try {
                try { StrictMode.setVmPolicy(new StrictMode.VmPolicy.Builder().build()); } catch (Exception ignored) {}
                intent.setDataAndType(Uri.fromFile(toFile(uriStr)), mime);
                dataSet = true;
            } catch (Exception ignored) {}
        }
        if (!dataSet) intent.setType(mime);

        List<ResolveInfo> list = pm.queryIntentActivities(intent, PackageManager.MATCH_ALL);
        if (list.isEmpty()) {
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
            if (!f.exists()) { call.reject("Файл не найден: " + f.getAbsolutePath()); return; }
            if (f.isDirectory()) { call.reject("Это папка: " + f.getAbsolutePath()); return; }
            try { StrictMode.setVmPolicy(new StrictMode.VmPolicy.Builder().build()); } catch (Exception ignored) {}
            Uri data = Uri.fromFile(f);
            Intent i = new Intent(Intent.ACTION_VIEW);
            i.setDataAndType(data, mime);
            i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
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
                    boolean isDir = k.isDirectory();
                    o.put("type", isDir ? "directory" : "file");
                    if (isDir) {
                        File[] sub = k.listFiles();
                        int cnt = 0; File thumb = null; long thumbTime = 0;
                        if (sub != null) {
                            for (File sf : sub) {
                                if (sf.getName().startsWith(".")) continue;
                                cnt++;
                                String ln = sf.getName().toLowerCase();
                                if (!sf.isDirectory() && (ln.endsWith(".jpg") || ln.endsWith(".jpeg") || ln.endsWith(".png") || ln.endsWith(".webp") || ln.endsWith(".gif") || ln.endsWith(".bmp"))) {
                                    if (sf.lastModified() >= thumbTime) { thumbTime = sf.lastModified(); thumb = sf; }
                                }
                            }
                        }
                        o.put("count", cnt);
                        if (thumb != null) o.put("thumb", "file://" + thumb.getAbsolutePath());
                    }
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
    public void pdfThumb(PluginCall call) {
        String uriStr = call.getString("uri");
        if (uriStr == null) { call.reject("no uri"); return; }
        try {
            File f = toFile(uriStr);
            android.os.ParcelFileDescriptor pfd = android.os.ParcelFileDescriptor.open(f, android.os.ParcelFileDescriptor.MODE_READ_ONLY);
            android.graphics.pdf.PdfRenderer r = new android.graphics.pdf.PdfRenderer(pfd);
            JSObject ret = new JSObject();
            if (r.getPageCount() > 0) {
                android.graphics.pdf.PdfRenderer.Page page = r.openPage(0);
                int w = 160, h = (int) (160f * page.getHeight() / Math.max(1, page.getWidth()));
                if (h <= 0) h = 200;
                Bitmap b = Bitmap.createBitmap(w, h, Bitmap.Config.ARGB_8888);
                b.eraseColor(0xFFFFFFFF);
                page.render(b, null, null, android.graphics.pdf.PdfRenderer.Page.RENDER_MODE_FOR_DISPLAY);
                page.close();
                ByteArrayOutputStream out = new ByteArrayOutputStream();
                b.compress(Bitmap.CompressFormat.PNG, 90, out);
                ret.put("thumb", "data:image/png;base64," + Base64.encodeToString(out.toByteArray(), Base64.NO_WRAP));
            }
            r.close(); pfd.close();
            call.resolve(ret);
        } catch (Exception e) { call.reject(e.getMessage()); }
    }

    @PluginMethod
    public void apkIcon(PluginCall call) {
        String uriStr = call.getString("uri");
        if (uriStr == null) { call.reject("no uri"); return; }
        try {
            File f = toFile(uriStr);
            String p = f.getAbsolutePath();
            PackageManager pm = getContext().getPackageManager();
            android.content.pm.PackageInfo pi = pm.getPackageArchiveInfo(p, 0);
            JSObject ret = new JSObject();
            if (pi != null) {
                pi.applicationInfo.sourceDir = p;
                pi.applicationInfo.publicSourceDir = p;
                Drawable icon = pi.applicationInfo.loadIcon(pm);
                ret.put("icon", drawableToBase64(icon));
            }
            call.resolve(ret);
        } catch (Exception e) { call.reject(e.getMessage()); }
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

    @PluginMethod
    public void hasAllFiles(PluginCall call) {
        boolean granted;
        if (Build.VERSION.SDK_INT >= 30) granted = Environment.isExternalStorageManager();
        else granted = true;
        JSObject ret = new JSObject();
        ret.put("granted", granted);
        call.resolve(ret);
    }

    @PluginMethod
    public void requestAllFiles(PluginCall call) {
        try {
            Intent i;
            if (Build.VERSION.SDK_INT >= 30) {
                i = new Intent(Settings.ACTION_MANAGE_APP_ALL_FILES_ACCESS_PERMISSION);
                i.setData(Uri.parse("package:" + getContext().getPackageName()));
            } else {
                i = new Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS);
                i.setData(Uri.parse("package:" + getContext().getPackageName()));
            }
            i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            getContext().startActivity(i);
            call.resolve();
        } catch (Exception e) {
            call.reject(e.getMessage());
        }
    }

    @PluginMethod
    public void installApk(PluginCall call) {
        String uriStr = call.getString("uri");
        if (uriStr == null) { call.reject("no uri"); return; }
        try {
            File f = toFile(uriStr);
            if (!f.exists()) { call.reject("Файл не найден: " + f.getAbsolutePath()); return; }
            registerInstallReceiver();
            PackageInstaller pi = getContext().getPackageManager().getPackageInstaller();
            PackageInstaller.SessionParams params = new PackageInstaller.SessionParams(PackageInstaller.SessionParams.MODE_FULL_INSTALL);
            int sessionId = pi.createSession(params);
            PackageInstaller.Session session = pi.openSession(sessionId);
            OutputStream out = session.openWrite("apk", 0, f.length());
            InputStream in = new FileInputStream(f);
            byte[] buf = new byte[65536];
            int n;
            while ((n = in.read(buf)) > 0) out.write(buf, 0, n);
            session.fsync(out);
            in.close();
            out.close();
            Intent statusIntent = new Intent("leshugan.fm.INSTALL_RESULT").setPackage(getContext().getPackageName());
            int flags = PendingIntent.FLAG_UPDATE_CURRENT;
            if (Build.VERSION.SDK_INT >= 31) flags |= PendingIntent.FLAG_MUTABLE;
            PendingIntent pending = PendingIntent.getBroadcast(getContext(), sessionId, statusIntent, flags);
            session.commit(pending.getIntentSender());
            session.close();
            call.resolve();
        } catch (Exception e) { call.reject(e.getMessage()); }
    }

    @PluginMethod
    public void uninstall(PluginCall call) {
        String uriStr = call.getString("uri");
        if (uriStr == null) { call.reject("no uri"); return; }
        try {
            File f = toFile(uriStr);
            PackageInfo info = getContext().getPackageManager().getPackageArchiveInfo(f.getAbsolutePath(), 0);
            if (info == null) { call.reject("Не удалось прочитать пакет"); return; }
            Intent i = new Intent(Intent.ACTION_DELETE, Uri.parse("package:" + info.packageName));
            i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            getContext().startActivity(i);
            call.resolve();
        } catch (Exception e) { call.reject(e.getMessage()); }
    }

    private void registerInstallReceiver() {
        if (instRegistered) return;
        BroadcastReceiver r = new BroadcastReceiver() {
            @Override public void onReceive(Context c, Intent i) {
                int status = i.getIntExtra(PackageInstaller.EXTRA_STATUS, -1);
                if (status == PackageInstaller.STATUS_PENDING_USER_ACTION) {
                    Intent confirm = i.getParcelableExtra(Intent.EXTRA_INTENT);
                    if (confirm != null) { confirm.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK); c.startActivity(confirm); }
                }
            }
        };
        IntentFilter filter = new IntentFilter("leshugan.fm.INSTALL_RESULT");
        if (Build.VERSION.SDK_INT >= 33) getContext().registerReceiver(r, filter, Context.RECEIVER_NOT_EXPORTED);
        else getContext().registerReceiver(r, filter);
        instRegistered = true;
    }

    @PluginMethod
    public void notifyProgress(PluginCall call) {
        String title = call.getString("title", "Операция");
        int progress = call.getInt("progress", 0);
        int max = call.getInt("max", 100);
        String text = call.getString("text", "");
        try {
            NotificationManager nm = (NotificationManager) getContext().getSystemService(Context.NOTIFICATION_SERVICE);
            String ch = "yev_progress";
            Notification.Builder b;
            if (Build.VERSION.SDK_INT >= 26) {
                NotificationChannel c = new NotificationChannel(ch, "Операции с файлами", NotificationManager.IMPORTANCE_LOW);
                nm.createNotificationChannel(c);
                b = new Notification.Builder(getContext(), ch);
            } else {
                b = new Notification.Builder(getContext());
            }
            b.setContentTitle(title).setContentText(text)
             .setSmallIcon(android.R.drawable.stat_sys_download)
             .setProgress(max, progress, false).setOngoing(true).setOnlyAlertOnce(true);
            nm.notify(777, b.build());
            call.resolve();
        } catch (Exception e) { call.reject(e.getMessage()); }
    }

    @PluginMethod
    public void cancelNotify(PluginCall call) {
        try { NotificationManager nm = (NotificationManager) getContext().getSystemService(Context.NOTIFICATION_SERVICE); nm.cancel(777); } catch (Exception ignored) {}
        call.resolve();
    }

    @PluginMethod
    public void watch(PluginCall call) {
        String uriStr = call.getString("uri");
        if (uriStr == null) { call.reject("no uri"); return; }
        try {
            final String path = toFile(uriStr).getAbsolutePath();
            if (observer != null) { observer.stopWatching(); observer = null; }
            int mask = FileObserver.CREATE | FileObserver.DELETE | FileObserver.MOVED_FROM | FileObserver.MOVED_TO | FileObserver.CLOSE_WRITE | FileObserver.MODIFY;
            observer = new FileObserver(path, mask) {
                @Override public void onEvent(int event, String p) { notifyListeners("fschange", new JSObject()); }
            };
            observer.startWatching();
            call.resolve();
        } catch (Exception e) { call.reject(e.getMessage()); }
    }

    @PluginMethod
    public void unwatch(PluginCall call) {
        if (observer != null) { observer.stopWatching(); observer = null; }
        call.resolve();
    }

    private boolean deleteRecursive(File f) {
        if (f.isDirectory()) {
            File[] kids = f.listFiles();
            if (kids != null) for (File k : kids) deleteRecursive(k);
        }
        return f.delete();
    }

    private File toFile(String u) {
        String p = u;
        if (p.startsWith("file://")) p = p.substring(7);
        if (p.indexOf('%') >= 0) { try { p = java.net.URLDecoder.decode(p, "UTF-8"); } catch (Exception ignored) {} }
        return new File(p);
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
