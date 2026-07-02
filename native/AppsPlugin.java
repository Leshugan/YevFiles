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
import android.view.Window;
import android.view.View;
import android.graphics.Color;
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
import java.io.FileOutputStream;
import java.io.InputStream;
import java.io.OutputStream;
import java.util.Enumeration;
import java.util.zip.ZipFile;
import java.util.zip.ZipEntry;
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
        String action = call.getString("action", "view");
        String act = "edit".equals(action) ? Intent.ACTION_EDIT : Intent.ACTION_VIEW;
        PackageManager pm = getContext().getPackageManager();

        Intent intent = new Intent(act);
        boolean dataSet = false;
        if (uriStr != null) {
            try {
                try { StrictMode.setVmPolicy(new StrictMode.VmPolicy.Builder().build()); } catch (Exception ignored) {}
                intent.setDataAndType(contentUriFor(toFile(uriStr)), mime);
                dataSet = true;
            } catch (Exception ignored) {}
        }
        if (!dataSet) intent.setType(mime);

        List<ResolveInfo> list = pm.queryIntentActivities(intent, PackageManager.MATCH_ALL);
        if (list.isEmpty()) {
            Intent alt = new Intent(act);
            alt.setType(mime);
            list = pm.queryIntentActivities(alt, PackageManager.MATCH_ALL);
        }
        if (list.isEmpty() && !"edit".equals(action)) {
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
        String action = call.getString("action", "view");
        if (uriStr == null) { call.reject("no uri"); return; }
        try {
            File f = toFile(uriStr);
            if (!f.exists()) { call.reject("Файл не найден: " + f.getAbsolutePath()); return; }
            if (f.isDirectory()) { call.reject("Это папка: " + f.getAbsolutePath()); return; }
            try { StrictMode.setVmPolicy(new StrictMode.VmPolicy.Builder().build()); } catch (Exception ignored) {}
            Uri data = contentUriFor(f);
            Intent i = new Intent("edit".equals(action) ? Intent.ACTION_EDIT : Intent.ACTION_VIEW);
            i.setDataAndType(data, mime);
            i.setClipData(android.content.ClipData.newRawUri("", data));
            i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_GRANT_READ_URI_PERMISSION);
            if ("edit".equals(action)) i.addFlags(Intent.FLAG_GRANT_WRITE_URI_PERMISSION);
            if (pkg != null && act != null) i.setClassName(pkg, act);
            else if (pkg != null) i.setPackage(pkg);
            int gf = Intent.FLAG_GRANT_READ_URI_PERMISSION | ("edit".equals(action) ? Intent.FLAG_GRANT_WRITE_URI_PERMISSION : 0);
            try {
                if (pkg != null) getContext().grantUriPermission(pkg, data, gf);
                // грант всем, кто может обработать intent (на случай, если редактор читает файл из другого компонента)
                java.util.List<android.content.pm.ResolveInfo> ris = getContext().getPackageManager().queryIntentActivities(i, PackageManager.MATCH_DEFAULT_ONLY);
                for (android.content.pm.ResolveInfo ri : ris) { try { getContext().grantUriPermission(ri.activityInfo.packageName, data, gf); } catch (Exception ignored) {} }
            } catch (Exception ignored) {}
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
        File base = getContext().getExternalCacheDir();
        if (base == null) base = getContext().getCacheDir();
        File d = new File(base, "yev_thumbs");
        if (!d.exists()) d.mkdirs();
        return d;
    }
    private byte[] xorBytes(byte[] d) {
        final byte[] k = { (byte) 0x5A, (byte) 0xA5, (byte) 0x3C, (byte) 0xC3, (byte) 0x69, (byte) 0x96, (byte) 0x1E, (byte) 0xE1 };
        byte[] o = new byte[d.length];
        for (int i = 0; i < d.length; i++) o[i] = (byte) (d[i] ^ k[i % k.length]);
        return o;
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
            String name = f.getName().toLowerCase();
            boolean isApk = name.endsWith(".apk");
            String ext = isApk ? ".png" : ".jpg";
            String mimeOut = isApk ? "image/png" : "image/jpeg";
            File cacheFile = new File(thumbDir(), thumbKey(f) + ".t");
            JSObject ret = new JSObject();
            // готовое превью из кэша (деобфускация)
            if (cacheFile.exists()) {
                byte[] data = xorBytes(readAll(new FileInputStream(cacheFile)));
                ret.put("thumb", "data:" + mimeOut + ";base64," + Base64.encodeToString(data, Base64.NO_WRAP));
                call.resolve(ret); return;
            }
            // удалить устаревшие кэши этого же файла (другой mtime)
            String prefix = Integer.toHexString((f.getAbsolutePath() + "|").hashCode());
            File[] stale = thumbDir().listFiles();
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
            if (isApk) b.compress(Bitmap.CompressFormat.PNG, 100, out);
            else b.compress(Bitmap.CompressFormat.JPEG, 80, out);
            byte[] bytes = out.toByteArray();
            try { OutputStream fos = new java.io.FileOutputStream(cacheFile); fos.write(xorBytes(bytes)); fos.close(); } catch (Exception ignored) {}
            ret.put("thumb", "data:" + mimeOut + ";base64," + Base64.encodeToString(bytes, Base64.NO_WRAP));
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
        if (d == null) return null;
        try { if (d instanceof android.graphics.drawable.BitmapDrawable) { Bitmap bm = ((android.graphics.drawable.BitmapDrawable) d).getBitmap(); if (bm != null) return bm; } } catch (Exception ignored) {}
        int w = d.getIntrinsicWidth(), h = d.getIntrinsicHeight();
        if (w <= 0 || h <= 0) { w = 144; h = 144; }
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
            String lower = f.getName().toLowerCase();
            boolean split = lower.endsWith(".apks") || lower.endsWith(".xapk") || lower.endsWith(".apkm") || lower.endsWith(".apkx");
            File tmpBase = null;
            if (split) { tmpBase = extractBaseApk(f); if (tmpBase != null) p = tmpBase.getAbsolutePath(); }
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
                try { Drawable ic = pm.getApplicationIcon(pi.applicationInfo); ret.put("icon", drawableToBase64(ic)); } catch (Exception ignored) {}
                // подпись apk (из архива)
                String apkSig = null;
                try { android.content.pm.PackageInfo sp = pm.getPackageArchiveInfo(p, PackageManager.GET_SIGNATURES); apkSig = firstCertSha256(sp); } catch (Exception ignored) {}
                if (apkSig != null) ret.put("sig", apkSig);
                // установлена ли уже + версия + подпись установленной
                try {
                    android.content.pm.PackageInfo inst = pm.getPackageInfo(pi.packageName, 0);
                    ret.put("installedVersionName", inst.versionName);
                    ret.put("installedVersionCode", android.os.Build.VERSION.SDK_INT >= 28 ? inst.getLongVersionCode() : inst.versionCode);
                    ret.put("installed", true);
                    try {
                        android.content.pm.PackageInfo instSig = pm.getPackageInfo(pi.packageName, PackageManager.GET_SIGNATURES);
                        String is = firstCertSha256(instSig);
                        if (is != null) ret.put("installedSig", is);
                        if (apkSig != null && is != null) ret.put("sigMatch", apkSig.equals(is));
                    } catch (Exception ignored) {}
                } catch (Exception e) { ret.put("installed", false); }
            }
            if (tmpBase != null) try { tmpBase.delete(); } catch (Exception ignored) {}
            call.resolve(ret);
        } catch (Exception e) { call.reject(e.getMessage()); }
    }

    private String firstCertSha256(android.content.pm.PackageInfo pi) {
        try {
            android.content.pm.Signature[] sigs = pi.signatures;
            if (sigs == null || sigs.length == 0) return null;
            java.security.MessageDigest md = java.security.MessageDigest.getInstance("SHA-256");
            byte[] d = md.digest(sigs[0].toByteArray());
            StringBuilder sb = new StringBuilder();
            for (byte b : d) sb.append(String.format("%02X", b));
            return sb.toString();
        } catch (Exception e) { return null; }
    }

    private File extractBaseApk(File pkg) {
        try {
            ZipFile zf = new ZipFile(pkg);
            ZipEntry best = null; long bestSize = -1;
            Enumeration<? extends ZipEntry> en = zf.entries();
            while (en.hasMoreElements()) {
                ZipEntry e = en.nextElement();
                if (e.isDirectory()) continue;
                String nm = e.getName().toLowerCase();
                if (!nm.endsWith(".apk")) continue;
                long sz = e.getSize();
                // base обычно самый большой .apk (не config.* / split_*)
                boolean cfg = nm.contains("config.") || nm.contains("split_") || nm.contains("split.");
                if (!cfg && (best == null || sz > bestSize)) { best = e; bestSize = sz; }
                else if (best == null) { best = e; bestSize = sz; }
            }
            if (best == null) { zf.close(); return null; }
            File out = new File(getContext().getCacheDir(), "base_" + System.currentTimeMillis() + ".apk");
            InputStream in = zf.getInputStream(best);
            OutputStream os = new FileOutputStream(out);
            byte[] buf = new byte[65536]; int n; while ((n = in.read(buf)) > 0) os.write(buf, 0, n);
            os.close(); in.close(); zf.close();
            return out;
        } catch (Exception e) { return null; }
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
    public void installSplit(PluginCall call) {
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
            ZipFile zf = new ZipFile(f);
            Enumeration<? extends ZipEntry> en = zf.entries();
            int idx = 0; boolean any = false;
            byte[] buf = new byte[65536];
            while (en.hasMoreElements()) {
                ZipEntry e = en.nextElement();
                if (e.isDirectory()) continue;
                String nm = e.getName().toLowerCase();
                if (!nm.endsWith(".apk")) continue;
                long sz = e.getSize();
                InputStream in = zf.getInputStream(e);
                if (sz <= 0) {
                    ByteArrayOutputStream bos = new ByteArrayOutputStream();
                    int m; while ((m = in.read(buf)) > 0) bos.write(buf, 0, m);
                    byte[] data = bos.toByteArray();
                    OutputStream out = session.openWrite("split" + idx, 0, data.length);
                    out.write(data); session.fsync(out); out.close();
                } else {
                    OutputStream out = session.openWrite("split" + idx, 0, sz);
                    int n; while ((n = in.read(buf)) > 0) out.write(buf, 0, n);
                    session.fsync(out); out.close();
                }
                in.close(); idx++; any = true;
            }
            zf.close();
            if (!any) { session.abandon(); call.reject("В пакете нет apk"); return; }
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

    private boolean zipIsEncrypted(File f) {
        try { net.lingala.zip4j.ZipFile z = new net.lingala.zip4j.ZipFile(f); boolean e = z.isEncrypted(); z.close(); return e; }
        catch (Exception ex) { return false; }
    }

    private void zip4jExtract(File src, String destDir, java.util.List<String> names, String password) throws Exception {
        net.lingala.zip4j.ZipFile z = new net.lingala.zip4j.ZipFile(src);
        if (password != null) z.setPassword(password.toCharArray());
        try {
            if (names != null && !names.isEmpty()) {
                int total = names.size(), done = 0;
                for (String nm : names) {
                    z.extractFile(nm, destDir);
                    done++;
                    JSObject ev = new JSObject(); ev.put("done", done); ev.put("total", total); ev.put("name", nm);
                    notifyListeners("opProgress", ev);
                }
            } else {
                z.extractAll(destDir);
            }
        } finally { try { z.close(); } catch (Exception ignored) {} }
    }

    // ==== gz / tar / tgz поддержка (без внешних библиотек) ====
    private String arcKind(File f) {
        String n = f.getName().toLowerCase();
        if (n.endsWith(".tar.gz") || n.endsWith(".tgz")) return "tgz";
        if (n.endsWith(".tar")) return "tar";
        if (n.endsWith(".gz")) return "gz";
        return "zip";
    }
    private String gzBase(File f) {
        String n = f.getName(); String low = n.toLowerCase();
        if (low.endsWith(".tar.gz")) return n.substring(0, n.length() - 3);
        if (low.endsWith(".tgz")) return n.substring(0, n.length() - 4) + ".tar";
        if (low.endsWith(".gz")) return n.substring(0, n.length() - 3);
        return n;
    }
    private void gzExtract(File f, File outFile) throws Exception {
        if (outFile.getParentFile() != null) outFile.getParentFile().mkdirs();
        InputStream in = new java.util.zip.GZIPInputStream(new FileInputStream(f));
        OutputStream os = new FileOutputStream(outFile);
        byte[] buf = new byte[65536]; int n; while ((n = in.read(buf)) > 0) os.write(buf, 0, n);
        os.close(); in.close();
    }
    private InputStream tarStream(File f, String kind) throws Exception {
        return kind.equals("tgz") ? new java.util.zip.GZIPInputStream(new FileInputStream(f)) : new FileInputStream(f);
    }
    private int readFully(InputStream in, byte[] b, int len) throws Exception { int off = 0; while (off < len) { int r = in.read(b, off, len - off); if (r < 0) break; off += r; } return off; }
    private void skipFully(InputStream in, long n) throws Exception { byte[] t = new byte[8192]; while (n > 0) { int want = (int) Math.min(t.length, n); int r = in.read(t, 0, want); if (r < 0) break; n -= r; } }
    private String tarStr(byte[] b, int off, int len) { int end = off; while (end < off + len && b[end] != 0) end++; return new String(b, off, end - off).trim(); }
    private long tarOctal(byte[] b, int off, int len) { long v = 0; for (int i = off; i < off + len; i++) { int c = b[i] & 0xff; if (c == 0 || c == ' ') continue; if (c < '0' || c > '7') continue; v = v * 8 + (c - '0'); } return v; }
    private java.util.List<String[]> tarEntries(InputStream in) throws Exception {
        java.util.List<String[]> out = new java.util.ArrayList<>(); byte[] hdr = new byte[512];
        while (true) {
            if (readFully(in, hdr, 512) < 512) break;
            boolean zero = true; for (byte b : hdr) if (b != 0) { zero = false; break; } if (zero) break;
            String name = tarStr(hdr, 0, 100); if (name.isEmpty()) break;
            long size = tarOctal(hdr, 124, 12); char type = (char) hdr[156];
            out.add(new String[]{ name, String.valueOf(size), String.valueOf(type) });
            skipFully(in, ((size + 511) / 512) * 512);
        }
        return out;
    }
    private void tarExtract(InputStream in, File destDir, java.util.Set<String> only, File singleOut, int total) throws Exception {
        byte[] hdr = new byte[512]; byte[] buf = new byte[65536]; int done = 0;
        while (true) {
            if (readFully(in, hdr, 512) < 512) break;
            boolean zero = true; for (byte b : hdr) if (b != 0) { zero = false; break; } if (zero) break;
            String name = tarStr(hdr, 0, 100); if (name.isEmpty()) break;
            long size = tarOctal(hdr, 124, 12); char type = (char) hdr[156];
            boolean isDir = type == '5' || name.endsWith("/");
            long pad = ((size + 511) / 512) * 512 - size;
            boolean take = !isDir && (only == null || only.contains(name));
            if (take) {
                File out = singleOut != null ? singleOut : new File(destDir, name);
                if (out.getParentFile() != null) out.getParentFile().mkdirs();
                OutputStream fos = new FileOutputStream(out);
                long rem = size; while (rem > 0) { int want = (int) Math.min(buf.length, rem); int got = in.read(buf, 0, want); if (got < 0) break; fos.write(buf, 0, got); rem -= got; }
                fos.close(); skipFully(in, pad);
                done++;
                JSObject ev = new JSObject(); ev.put("done", done); ev.put("total", total); ev.put("name", name); notifyListeners("opProgress", ev);
                if (singleOut != null) return;
            } else { skipFully(in, size + pad); }
        }
    }

    @PluginMethod
    public void zipList(PluginCall call) {
        String uriStr = call.getString("uri");
        if (uriStr == null) { call.reject("no uri"); return; }
        try {
            File f = toFile(uriStr);
            String kind = arcKind(f);
            if (kind.equals("gz")) {
                JSArray arr = new JSArray(); JSObject o = new JSObject(); o.put("name", gzBase(f)); o.put("size", 0); o.put("dir", false); arr.put(o);
                JSObject ret = new JSObject(); ret.put("entries", arr); ret.put("encrypted", false); call.resolve(ret); return;
            }
            if (kind.equals("tar") || kind.equals("tgz")) {
                InputStream in = tarStream(f, kind); java.util.List<String[]> es = tarEntries(in); in.close();
                JSArray arr = new JSArray();
                for (String[] e : es) { JSObject o = new JSObject(); o.put("name", e[0]); o.put("size", Long.parseLong(e[1])); o.put("dir", e[2].equals("5") || e[0].endsWith("/")); arr.put(o); }
                JSObject ret = new JSObject(); ret.put("entries", arr); ret.put("encrypted", false); call.resolve(ret); return;
            }
            boolean enc = zipIsEncrypted(f);
            JSArray arr = new JSArray();
            if (enc) {
                // зашифрованный архив — список через zip4j (без пароля читаются только заголовки)
                net.lingala.zip4j.ZipFile z = new net.lingala.zip4j.ZipFile(f);
                java.util.List<net.lingala.zip4j.model.FileHeader> hs = z.getFileHeaders();
                for (net.lingala.zip4j.model.FileHeader h : hs) {
                    JSObject o = new JSObject();
                    o.put("name", h.getFileName());
                    o.put("size", h.getUncompressedSize());
                    o.put("dir", h.isDirectory());
                    arr.put(o);
                }
                z.close();
            } else {
                ZipFile zf = new ZipFile(f);
                Enumeration<? extends ZipEntry> en = zf.entries();
                while (en.hasMoreElements()) {
                    ZipEntry e = en.nextElement();
                    JSObject o = new JSObject();
                    o.put("name", e.getName());
                    o.put("size", e.getSize());
                    o.put("dir", e.isDirectory());
                    arr.put(o);
                }
                zf.close();
            }
            JSObject ret = new JSObject();
            ret.put("entries", arr);
            ret.put("encrypted", enc);
            call.resolve(ret);
        } catch (Exception e) { call.reject(e.getMessage()); }
    }

    @PluginMethod
    public void zipExtract(PluginCall call) {
        String uriStr = call.getString("uri");
        String entry = call.getString("entry");
        String dest = call.getString("dest");
        if (uriStr == null || entry == null || dest == null) { call.reject("bad args"); return; }
        String password = call.getString("password");
        File src0 = toFile(uriStr);
        String k0 = arcKind(src0);
        if (!k0.equals("zip")) {
            try {
                if (k0.equals("gz")) { gzExtract(src0, new File(dest)); }
                else { InputStream in = tarStream(src0, k0); java.util.Set<String> only = new java.util.HashSet<>(); only.add(entry); tarExtract(in, null, only, new File(dest), 1); in.close(); }
                JSObject ret = new JSObject(); ret.put("path", dest); call.resolve(ret); return;
            } catch (Exception e) { call.reject(e.getMessage()); return; }
        }
        if (zipIsEncrypted(src0)) {
            if (password == null) { call.reject("Требуется пароль", "ENCRYPTED"); return; }
            try {
                File out = new File(dest);
                String destDir = out.getParentFile() != null ? out.getParentFile().getAbsolutePath() : dest;
                java.util.List<String> one = new java.util.ArrayList<>(); one.add(entry);
                zip4jExtract(src0, destDir, one, password);
                JSObject ret = new JSObject(); ret.put("path", dest); call.resolve(ret); return;
            } catch (Exception e) { call.reject("Неверный пароль или ошибка", "BADPASS"); return; }
        }
        ZipFile zf = null;
        try {
            zf = new ZipFile(toFile(uriStr));
            ZipEntry ze = zf.getEntry(entry);
            if (ze == null) { call.reject("entry not found"); return; }
            File out = new File(dest);
            if (out.getParentFile() != null) out.getParentFile().mkdirs();
            InputStream in = zf.getInputStream(ze);
            OutputStream fos = new FileOutputStream(out);
            byte[] buf = new byte[65536];
            int n;
            while ((n = in.read(buf)) > 0) fos.write(buf, 0, n);
            fos.close(); in.close();
            JSObject ret = new JSObject();
            ret.put("path", out.getAbsolutePath());
            call.resolve(ret);
        } catch (Exception e) { call.reject(e.getMessage()); }
        finally { if (zf != null) try { zf.close(); } catch (Exception ignored) {} }
    }

    @PluginMethod
    public void zipExtractAll(PluginCall call) {
        String uriStr = call.getString("uri");
        String destDir = call.getString("dest");
        if (uriStr == null || destDir == null) { call.reject("bad args"); return; }
        JSArray names = call.getArray("entries");
        String password = call.getString("password");
        File src = toFile(uriStr);
        String kA = arcKind(src);
        if (!kA.equals("zip")) {
            try {
                if (kA.equals("gz")) {
                    File out = new File(destDir, gzBase(src)); gzExtract(src, out);
                    JSObject ev = new JSObject(); ev.put("done", 1); ev.put("total", 1); ev.put("name", gzBase(src)); notifyListeners("opProgress", ev);
                } else {
                    java.util.Set<String> only = null; int total = 0;
                    InputStream cin = tarStream(src, kA); java.util.List<String[]> es = tarEntries(cin); cin.close();
                    for (String[] e : es) if (!(e[2].equals("5") || e[0].endsWith("/"))) total++;
                    if (names != null) { only = new java.util.HashSet<>(); for (int i = 0; i < names.length(); i++) only.add(names.getString(i)); total = only.size(); }
                    InputStream in = tarStream(src, kA); tarExtract(in, new File(destDir), only, null, total); in.close();
                }
                JSObject ret = new JSObject(); ret.put("done", true); call.resolve(ret); return;
            } catch (Exception e) { call.reject(e.getMessage()); return; }
        }
        // архивы с паролем — через zip4j
        if (zipIsEncrypted(src)) {
            if (password == null) { call.reject("Требуется пароль", "ENCRYPTED"); return; }
            try {
                java.util.List<String> list = null;
                if (names != null) { list = new java.util.ArrayList<>(); for (int i = 0; i < names.length(); i++) list.add(names.getString(i)); }
                zip4jExtract(src, destDir, list, password);
                JSObject ret = new JSObject(); ret.put("done", true); call.resolve(ret); return;
            } catch (Exception e) { call.reject("Неверный пароль или ошибка", "BADPASS"); return; }
        }
        ZipFile zf = null;
        try {
            zf = new ZipFile(toFile(uriStr));
            java.util.List<String> list = new java.util.ArrayList<>();
            if (names != null) {
                for (int i = 0; i < names.length(); i++) list.add(names.getString(i));
            } else {
                Enumeration<? extends ZipEntry> en = zf.entries();
                while (en.hasMoreElements()) { ZipEntry e = en.nextElement(); if (!e.isDirectory()) list.add(e.getName()); }
            }
            int total = list.size(), done = 0;
            byte[] buf = new byte[65536];
            for (String nm : list) {
                ZipEntry ze = zf.getEntry(nm);
                if (ze == null) continue;
                File out = new File(destDir, nm);
                if (ze.isDirectory()) { out.mkdirs(); continue; }
                if (out.getParentFile() != null) out.getParentFile().mkdirs();
                InputStream in = zf.getInputStream(ze);
                OutputStream fos = new FileOutputStream(out);
                int n;
                while ((n = in.read(buf)) > 0) fos.write(buf, 0, n);
                fos.close(); in.close();
                done++;
                JSObject ev = new JSObject();
                ev.put("done", done); ev.put("total", total); ev.put("name", nm);
                notifyListeners("opProgress", ev);
            }
            call.resolve();
        } catch (Exception e) { call.reject(e.getMessage()); }
        finally { if (zf != null) try { zf.close(); } catch (Exception ignored) {} }
    }

    @PluginMethod
    public void pathSize(final PluginCall call) {
        String uriStr = call.getString("uri");
        if (uriStr == null) { call.reject("no uri"); return; }
        final File root = toFile(uriStr);
        new Thread(new Runnable() {
            public void run() {
                final long[] acc = { 0L, 0L };
                sizeRecursive(root, acc);
                try { getActivity().runOnUiThread(new Runnable() { public void run() {
                    JSObject r = new JSObject(); r.put("bytes", acc[0]); r.put("count", acc[1]); call.resolve(r);
                } }); } catch (Exception e) { JSObject r = new JSObject(); r.put("bytes", acc[0]); r.put("count", acc[1]); call.resolve(r); }
            }
        }).start();
    }

    private void sizeRecursive(File f, long[] acc) {
        try {
            if (f.isDirectory()) {
                File[] kids = f.listFiles();
                if (kids != null) for (File k : kids) sizeRecursive(k, acc);
            } else { acc[0] += f.length(); acc[1]++; }
        } catch (Exception ignored) {}
    }

    @PluginMethod
    public void deletePath(final PluginCall call) {
        String uriStr = call.getString("uri");
        if (uriStr == null) { call.reject("no uri"); return; }
        final File root = toFile(uriStr);
        new Thread(new Runnable() {
            public void run() {
                final boolean ok = deleteRecursive(root);
                try { getActivity().runOnUiThread(new Runnable() { public void run() {
                    JSObject r = new JSObject(); r.put("ok", ok); call.resolve(r);
                } }); } catch (Exception e) { JSObject r = new JSObject(); r.put("ok", ok); call.resolve(r); }
            }
        }).start();
    }

    @PluginMethod
    public void share(PluginCall call) {
        String uriStr = call.getString("uri");
        String mime = call.getString("mime", "*/*");
        if (uriStr == null) { call.reject("no uri"); return; }
        try {
            File f = toFile(uriStr);
            if (!f.exists()) { call.reject("Файл не найден"); return; }
            try { StrictMode.setVmPolicy(new StrictMode.VmPolicy.Builder().build()); } catch (Exception ignored) {}
            Intent i = new Intent(Intent.ACTION_SEND);
            i.setType(mime);
            i.putExtra(Intent.EXTRA_STREAM, contentUriFor(f));
            i.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
            Intent ch = Intent.createChooser(i, "Поделиться");
            ch.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            getContext().startActivity(ch);
            call.resolve();
        } catch (Exception e) { call.reject(e.getMessage()); }
    }

    @PluginMethod
    public void editImage(PluginCall call) {
        String uriStr = call.getString("uri");
        String mime = call.getString("mime", "image/*");
        if (uriStr == null) { call.reject("no uri"); return; }
        try {
            File f = toFile(uriStr);
            if (!f.exists()) { call.reject("Файл не найден"); return; }
            try { StrictMode.setVmPolicy(new StrictMode.VmPolicy.Builder().build()); } catch (Exception ignored) {}
            Intent i = new Intent(Intent.ACTION_EDIT);
            Uri u = contentUriFor(f);
            i.setDataAndType(u, mime);
            i.setClipData(android.content.ClipData.newRawUri("", u));
            i.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION | Intent.FLAG_GRANT_WRITE_URI_PERMISSION);
            Intent ch = Intent.createChooser(i, "Изменить через");
            ch.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            getContext().startActivity(ch);
            call.resolve();
        } catch (Exception e) { call.reject(e.getMessage()); }
    }

    @PluginMethod
    public void setBars(PluginCall call) {
        final String color = call.getString("color", "#000000");
        final boolean light = call.getBoolean("light", false);
        try {
            getActivity().runOnUiThread(() -> {
                try {
                    Window w = getActivity().getWindow();
                    int c = Color.parseColor(color);
                    w.setStatusBarColor(c);
                    w.setNavigationBarColor(c);
                    View dv = w.getDecorView();
                    int flags = dv.getSystemUiVisibility();
                    if (Build.VERSION.SDK_INT >= 23) {
                        if (light) flags |= View.SYSTEM_UI_FLAG_LIGHT_STATUS_BAR;
                        else flags &= ~View.SYSTEM_UI_FLAG_LIGHT_STATUS_BAR;
                    }
                    if (Build.VERSION.SDK_INT >= 26) {
                        if (light) flags |= View.SYSTEM_UI_FLAG_LIGHT_NAVIGATION_BAR;
                        else flags &= ~View.SYSTEM_UI_FLAG_LIGHT_NAVIGATION_BAR;
                    }
                    dv.setSystemUiVisibility(flags);
                } catch (Exception ignored) {}
            });
        } catch (Exception ignored) {}
        call.resolve();
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

    private Uri contentUriFor(File f) {
        String pkg = getContext().getPackageName();
        // основной: провайдер Capacitor (.fileprovider) — он гарантированно зарегистрирован;
        // его пути переопределены нашим file_paths.xml (весь storage)
        try { return FileProvider.getUriForFile(getContext(), pkg + ".fileprovider", f); } catch (Exception ignored) {}
        try { return FileProvider.getUriForFile(getContext(), pkg + ".appsfp", f); } catch (Exception ignored) {}
        try { StrictMode.setVmPolicy(new StrictMode.VmPolicy.Builder().build()); } catch (Exception ignored) {}
        return Uri.fromFile(f);
    }

    private String drawableToBase64(Drawable d) {
        Bitmap b = drawableToBitmap(d);
        if (b == null) return null;
        int mx = Math.max(b.getWidth(), b.getHeight());
        if (mx > 144) { float sc = 144f / mx; b = Bitmap.createScaledBitmap(b, Math.max(1, Math.round(b.getWidth() * sc)), Math.max(1, Math.round(b.getHeight() * sc)), true); }
        ByteArrayOutputStream out = new ByteArrayOutputStream();
        b.compress(Bitmap.CompressFormat.PNG, 100, out);
        return "data:image/png;base64," + Base64.encodeToString(out.toByteArray(), Base64.NO_WRAP);
    }
}
