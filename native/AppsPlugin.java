package leshugan.fm;

import android.content.Intent;
import android.content.IntentFilter;
import android.content.Context;
import android.content.BroadcastReceiver;
import android.content.pm.PackageManager;
import android.content.pm.PackageInfo;
import android.content.pm.PackageInstaller;
import androidx.core.content.FileProvider;
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

    private File thumbDir() {
        File d = new File(android.os.Environment.getExternalStorageDirectory(), ".yev_thumbs");
        if (!d.exists()) d.mkdirs();
        return d;
    }
    private String thumbKey(File src) {
        // ключ = хэш пути + mtime, чтобы кэш инвалидировался при изменении файла
        String base = src.getAbsolutePath() + "|" + src.lastModified() + "|" + src.length();
        return Integer.toHexString(base.hashCode()) + "_" + src.lastModified();
    }

    @PluginMethod
    public void thumb(PluginCall call) {
        String uriStr = call.getString("uri");
        if (uriStr == null) { call.reject("no uri"); return; }
        try {
            File f = toFile(uriStr);
            if (!f.exists()) { call.resolve(new JSObject()); return; }
            File cacheFile = new File(thumbDir(), thumbKey(f) + ".jpg");
            JSObject ret = new JSObject();
            // готовое превью из кэша
            if (cacheFile.exists()) {
                byte[] data = readAll(new FileInputStream(cacheFile));
                ret.put("thumb", "data:image/jpeg;base64," + Base64.encodeToString(data, Base64.NO_WRAP));
                call.resolve(ret); return;
            }
            // удалить устаревшие кэши этого же файла (другой mtime)
            String prefix = Integer.toHexString((f.getAbsolutePath() + "|").hashCode());
            File[] stale = thumbDir().listFiles();
            String name = f.getName().toLowerCase();
            Bitmap b = null;
            if (name.matches(".*\\.(jpg|jpeg|png|webp|gif|bmp)$")) {
                android.graphics.BitmapFactory.Options o = new android.graphics.BitmapFactory.Options();
                o.inJustDecodeBounds = true;
                android.graphics.BitmapFactory.decodeFile(f.getAbsolutePath(), o);
                int s = 1; while (o.outWidth / s > 200 || o.outHeight / s > 200) s *= 2;
                android.graphics.BitmapFactory.Options o2 = new android.graphics.BitmapFactory.Options();
                o2.inSampleSize = s;
                b = android.graphics.BitmapFactory.decodeFile(f.getAbsolutePath(), o2);
            } else if (name.endsWith(".pdf")) {
                android.os.ParcelFileDescriptor pfd = android.os.ParcelFileDescriptor.open(f, android.os.ParcelFileDescriptor.MODE_READ_ONLY);
                android.graphics.pdf.PdfRenderer r = new android.graphics.pdf.PdfRenderer(pfd);
                if (r.getPageCount() > 0) {
                    android.graphics.pdf.PdfRenderer.Page page = r.openPage(0);
                    int w = 150, h = (int) (150f * page.getHeight() / Math.max(1, page.getWidth())); if (h <= 0) h = 190;
                    b = Bitmap.createBitmap(w, h, Bitmap.Config.ARGB_8888); b.eraseColor(0xFFFFFFFF);
                    page.render(b, null, null, android.graphics.pdf.PdfRenderer.Page.RENDER_MODE_FOR_DISPLAY); page.close();
                }
                r.close(); pfd.close();
            } else if (name.endsWith(".apk")) {
                PackageManager pm = getContext().getPackageManager();
                android.content.pm.PackageInfo pi = pm.getPackageArchiveInfo(f.getAbsolutePath(), 0);
                if (pi != null) { pi.applicationInfo.sourceDir = f.getAbsolutePath(); pi.applicationInfo.publicSourceDir = f.getAbsolutePath();
                    Drawable d = pi.applicationInfo.loadIcon(pm); b = drawableToBitmap(d); }
            }
            if (b == null) { call.resolve(ret); return; }
            // даунскейл до ~150px
            int mx = Math.max(b.getWidth(), b.getHeight());
            if (mx > 150) { float sc = 150f / mx; b = Bitmap.createScaledBitmap(b, Math.round(b.getWidth() * sc), Math.round(b.getHeight() * sc), true); }
            ByteArrayOutputStream out = new ByteArrayOutputStream();
            b.compress(Bitmap.CompressFormat.JPEG, 80, out);
            byte[] bytes = out.toByteArray();
            try { OutputStream fos = new java.io.FileOutputStream(cacheFile); fos.write(bytes); fos.close(); } catch (Exception ignored) {}
            ret.put("thumb", "data:image/jpeg;base64," + Base64.encodeToString(bytes, Base64.NO_WRAP));
            call.resolve(ret);
        } catch (Exception e) { call.resolve(new JSObject()); }
    }

    @PluginMethod
    public void thumbSweep(PluginCall call) {
        // удаляет кэши старше 30 дней или сверх лимита, чтобы папка не разрасталась
        try {
            File dir = thumbDir();
            File[] files = dir.listFiles();
            if (files != null) {
                long now = System.currentTimeMillis();
                long maxAge = 30L * 24 * 3600 * 1000;
                long total = 0;
                java.util.Arrays.sort(files, (a, c) -> Long.compare(c.lastModified(), a.lastModified()));
                for (File f : files) {
                    total += f.length();
                    if (now - f.lastModified() > maxAge || total > 80L * 1024 * 1024) f.delete();
                }
            }
            call.resolve(new JSObject());
        } catch (Exception e) { call.resolve(new JSObject()); }
    }

    private Bitmap drawableToBitmap(Drawable d) {
        int w = Math.max(1, d.getIntrinsicWidth()), h = Math.max(1, d.getIntrinsicHeight());
        Bitmap b = Bitmap.createBitmap(w, h, Bitmap.Config.ARGB_8888);
        android.graphics.Canvas c = new android.graphics.Canvas(b);
        d.setBounds(0, 0, w, h); d.draw(c);
        return b;
    }

    private byte[] readAll(InputStream in) throws Exception {
        ByteArrayOutputStream o = new ByteArrayOutputStream();
        byte[] buf = new byte[65536]; int r;
        while ((r = in.read(buf)) > 0) o.write(buf, 0, r);
        in.close(); return o.toByteArray();
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
    public void saveSharedTemp(PluginCall call) {
        try {
            if (MainActivity.pendingShared.isEmpty()) { call.resolve(new JSObject()); return; }
            android.net.Uri u = MainActivity.pendingShared.get(0);
            String name = queryName(u);
            File dir = new File(android.os.Environment.getExternalStorageDirectory(), "Download/.yevtmp");
            if (!dir.exists()) dir.mkdirs();
            File out = new File(dir, name);
            java.io.InputStream in = getContext().getContentResolver().openInputStream(u);
            java.io.FileOutputStream fos = new java.io.FileOutputStream(out);
            byte[] buf = new byte[65536]; int r;
            while ((r = in.read(buf)) > 0) fos.write(buf, 0, r);
            fos.close(); in.close();
            MainActivity.pendingShared.clear();
            JSObject ret = new JSObject(); ret.put("uri", "file://" + out.getAbsolutePath()); ret.put("name", name); call.resolve(ret);
        } catch (Exception e) { call.reject(e.getMessage()); }
    }

    @PluginMethod
    public void getShared(PluginCall call) {
        try {
            JSArray arr = new JSArray();
            for (android.net.Uri u : MainActivity.pendingShared) {
                JSObject o = new JSObject();
                String name = queryName(u);
                o.put("name", name);
                o.put("mime", getContext().getContentResolver().getType(u));
                arr.put(o);
            }
            JSObject ret = new JSObject(); ret.put("files", arr); ret.put("mode", MainActivity.pendingMode); call.resolve(ret);
        } catch (Exception e) { call.reject(e.getMessage()); }
    }

    @PluginMethod
    public void saveShared(PluginCall call) {
        String destDir = call.getString("dir");
        if (destDir == null) { call.reject("no dir"); return; }
        try {
            File dir = toFile(destDir);
            int ok = 0;
            for (android.net.Uri u : MainActivity.pendingShared) {
                String name = queryName(u);
                File out = new File(dir, name);
                int n = 0; String base = name, ext = "";
                int dot = name.lastIndexOf('.');
                if (dot > 0) { base = name.substring(0, dot); ext = name.substring(dot); }
                while (out.exists()) { n++; out = new File(dir, base + " (" + n + ")" + ext); }
                java.io.InputStream in = getContext().getContentResolver().openInputStream(u);
                java.io.FileOutputStream fos = new java.io.FileOutputStream(out);
                byte[] buf = new byte[65536]; int r;
                while ((r = in.read(buf)) > 0) fos.write(buf, 0, r);
                fos.close(); in.close(); ok++;
            }
            MainActivity.pendingShared.clear();
            JSObject ret = new JSObject(); ret.put("saved", ok); call.resolve(ret);
        } catch (Exception e) { call.reject(e.getMessage()); }
    }

    @PluginMethod
    public void clearShared(PluginCall call) {
        MainActivity.pendingShared.clear();
        call.resolve(new JSObject());
    }

    private String queryName(android.net.Uri u) {
        String name = null;
        try {
            android.database.Cursor c = getContext().getContentResolver().query(u, null, null, null, null);
            if (c != null) {
                int idx = c.getColumnIndex(android.provider.OpenableColumns.DISPLAY_NAME);
                if (idx >= 0 && c.moveToFirst()) name = c.getString(idx);
                c.close();
            }
        } catch (Exception ignored) {}
        if (name == null) { name = u.getLastPathSegment(); if (name != null && name.contains("/")) name = name.substring(name.lastIndexOf('/') + 1); }
        if (name == null || name.isEmpty()) name = "shared_" + System.currentTimeMillis();
        return name;
    }

    @PluginMethod
    public void apkInfo(PluginCall call) {
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
                ret.put("package", pi.packageName);
                ret.put("versionName", pi.versionName);
                ret.put("versionCode", android.os.Build.VERSION.SDK_INT >= 28 ? pi.getLongVersionCode() : pi.versionCode);
                ret.put("targetSdk", pi.applicationInfo.targetSdkVersion);
                if (android.os.Build.VERSION.SDK_INT >= 24) ret.put("minSdk", pi.applicationInfo.minSdkVersion);
                try { ret.put("label", pm.getApplicationLabel(pi.applicationInfo).toString()); } catch (Exception ignored) {}
                // установлена ли уже + версия установленной
                try {
                    android.content.pm.PackageInfo inst = pm.getPackageInfo(pi.packageName, 0);
                    ret.put("installedVersionName", inst.versionName);
                    ret.put("installed", true);
                } catch (Exception e) { ret.put("installed", false); }
            }
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

    private int[] copyCounter = new int[2]; // [done, total]

    @PluginMethod
    public void copyTree(PluginCall call) {
        String fromStr = call.getString("from");
        String toStr = call.getString("to");
        if (fromStr == null || toStr == null) { call.reject("no from/to"); return; }
        try {
            File src = toFile(fromStr);
            File dst = toFile(toStr);
            String skip = dst.getCanonicalPath();
            copyCounter[0] = 0;
            copyCounter[1] = countFiles(src, skip);
            copyRecursive(src, dst, skip);
            JSObject ret = new JSObject(); ret.put("ok", true); ret.put("total", copyCounter[1]); call.resolve(ret);
        } catch (Exception e) { call.reject(e.getMessage()); }
    }

    private int countFiles(File src, String skipPath) {
        try { if (src.getCanonicalPath().equals(skipPath)) return 0; } catch (Exception e) { return 0; }
        if (src.isDirectory()) {
            int c = 0; File[] kids = src.listFiles();
            if (kids != null) for (File k : kids) c += countFiles(k, skipPath);
            return c;
        }
        return 1;
    }

    private void copyRecursive(File src, File dst, String skipPath) throws Exception {
        if (src.getCanonicalPath().equals(skipPath)) return;
        if (src.isDirectory()) {
            if (!dst.exists()) dst.mkdirs();
            File[] kids = src.listFiles();
            if (kids != null) for (File c : kids) {
                if (c.getCanonicalPath().equals(skipPath)) continue;
                copyRecursive(c, new File(dst, c.getName()), skipPath);
            }
        } else {
            java.io.FileInputStream in = new java.io.FileInputStream(src);
            java.io.FileOutputStream out = new java.io.FileOutputStream(dst);
            byte[] buf = new byte[65536]; int r;
            while ((r = in.read(buf)) > 0) out.write(buf, 0, r);
            in.close(); out.close();
            copyCounter[0]++;
            // событие прогресса в JS + уведомление Android
            JSObject ev = new JSObject(); ev.put("done", copyCounter[0]); ev.put("total", copyCounter[1]); ev.put("name", src.getName());
            notifyListeners("opProgress", ev);
            if (copyCounter[1] > 0) postProgressNotif("Копирование", src.getName(), copyCounter[0], copyCounter[1]);
        }
    }

    private void postProgressNotif(String title, String text, int prog, int max) {
        try {
            NotificationManager nm = (NotificationManager) getContext().getSystemService(Context.NOTIFICATION_SERVICE);
            if (android.os.Build.VERSION.SDK_INT >= 26) {
                NotificationChannel ch = new NotificationChannel("yev_progress", "Операции с файлами", NotificationManager.IMPORTANCE_LOW);
                nm.createNotificationChannel(ch);
            }
            Notification.Builder b = android.os.Build.VERSION.SDK_INT >= 26 ? new Notification.Builder(getContext(), "yev_progress") : new Notification.Builder(getContext());
            b.setContentTitle(title).setContentText(text).setSmallIcon(android.R.drawable.stat_sys_download)
             .setProgress(max, prog, false).setOngoing(prog < max);
            nm.notify(777, b.build());
            if (prog >= max) nm.cancel(777);
        } catch (Exception ignored) {}
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
            // Системный установщик через ACTION_VIEW + FileProvider — после установки покажет "Открыть"
            try {
                Uri apkUri = FileProvider.getUriForFile(getContext(), getContext().getPackageName() + ".appsfp", f);
                Intent i = new Intent(Intent.ACTION_VIEW);
                i.setDataAndType(apkUri, "application/vnd.android.package-archive");
                i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_GRANT_READ_URI_PERMISSION);
                getContext().startActivity(i);
                call.resolve();
                return;
            } catch (Exception viewEx) {
                // путь не покрыт FileProvider — запасной способ через PackageInstaller-сессию
            }
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
