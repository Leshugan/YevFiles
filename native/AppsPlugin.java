package leshugan.yg;

import android.content.Intent;
import android.content.Context;
import android.content.pm.PackageManager;
import android.graphics.Bitmap;
import android.graphics.Canvas;
import android.graphics.drawable.Drawable;
import android.media.MediaMetadataRetriever;
import android.media.ThumbnailUtils;
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
import java.util.ArrayList;

@CapacitorPlugin(name = "Apps")
public class AppsPlugin extends Plugin {

    private static final String IMG = "jpg|jpeg|png|webp|gif|bmp|heic|heif";
    private static final String VID = "mp4|mkv|avi|mov|webm|3gp|m4v|ts";

    private boolean isImg(String n) { return n.toLowerCase().matches(".*\\.(" + IMG + ")$"); }
    private boolean isVid(String n) { return n.toLowerCase().matches(".*\\.(" + VID + ")$"); }

    // ===== Рекурсивное сканирование медиа за ОДИН проход.
    //   .nomedia  — папка и все её подпапки скрыты (уходят в раздел «Скрытые»).
    //   .nofolder — игнорируются только файлы этой папки, подпапки сканируются как обычно.
    @PluginMethod
    public void scanMedia(PluginCall call) {
        final boolean wantHidden = "hidden".equals(call.getString("mode", "visible"));
        // в фоновом потоке — чтобы не блокировать UI
        new Thread(() -> {
            try {
                File root = Environment.getExternalStorageDirectory();
                JSArray out = new JSArray();
                walk(root, false, wantHidden, out, 0);
                JSObject ret = new JSObject();
                ret.put("items", out);
                ret.put("root", root.getAbsolutePath());
                call.resolve(ret);
            } catch (Exception e) { call.reject(e.getMessage()); }
        }).start();
    }

    // ===== Кэш списка медиа на диске (приватная папка приложения, без лимитов localStorage) =====
    private File cacheFile(String key) { String k = (key == null || key.isEmpty()) ? "media" : key.replaceAll("[^a-zA-Z0-9_]", "_"); File d = getContext().getExternalFilesDir(null); if (d == null) d = getContext().getFilesDir(); return new File(d, "cache_" + k + ".json"); }

    @PluginMethod
    public void cacheGet(PluginCall call) {
        try {
            File f = cacheFile(call.getString("key", "media"));
            JSObject ret = new JSObject();
            if (f.exists()) ret.put("data", new String(readAll(new FileInputStream(f)), "UTF-8"));
            call.resolve(ret);
        } catch (Exception e) { call.resolve(new JSObject()); }
    }

    @PluginMethod
    public void cacheSet(PluginCall call) {
        final String data = call.getString("data", "");
        final String key = call.getString("key", "media");
        new Thread(() -> {
            try { FileOutputStream o = new FileOutputStream(cacheFile(key)); o.write(data.getBytes("UTF-8")); o.close(); } catch (Exception ignored) {}
            call.resolve(new JSObject());
        }).start();
    }

    private void walk(File dir, boolean insideNomedia, boolean wantHidden, JSArray out, int depth) {
        if (dir == null || depth > 12) return;
        File[] kids = dir.listFiles();
        if (kids == null) return;
        boolean branchHidden = insideNomedia || new File(dir, ".nomedia").exists();
        // в обычном режиме НЕ заходим в скрытые ветки вовсе — это даёт мгновенный старт
        if (!wantHidden && branchHidden) return;
        boolean noFolder = new File(dir, ".nofolder").exists(); // игнор файлов только этой папки
        for (File k : kids) {
            String name = k.getName();
            if (name.startsWith(".")) continue;             // служебные/скрытые папки и файлы не трогаем
            if (k.isDirectory()) {
                String dn = k.getName();
                if (dir.getName().equals("Android") && (dn.equals("data") || dn.equals("obb"))) continue; // огромные/недоступные ветки
                walk(k, branchHidden, wantHidden, out, depth + 1);
            } else {
                boolean vid = isVid(name);
                if (!isImg(name) && !vid) continue;
                if (wantHidden && !branchHidden) continue;   // режим скрытых: только из .nomedia-веток
                if (!branchHidden && noFolder) continue;     // .nofolder — пропускаем файлы этой папки
                File p = k.getParentFile();
                JSObject o = new JSObject();
                o.put("uri", "file://" + k.getAbsolutePath());
                o.put("name", name);
                o.put("size", k.length());
                o.put("mtime", k.lastModified());
                o.put("video", vid);
                o.put("bucketPath", p != null ? p.getAbsolutePath() : "");
                o.put("bucketName", p != null ? p.getName() : "");
                out.put(o);
            }
        }
    }

    // ===== Простой список файлов в папке (для корзины) =====
    @PluginMethod
    public void list(PluginCall call) {
        String uriStr = call.getString("uri");
        if (uriStr == null) { call.reject("no uri"); return; }
        try {
            File dir = toFile(uriStr);
            File[] kids = dir.listFiles();
            JSArray arr = new JSArray();
            if (kids != null) for (File k : kids) {
                if (k.isDirectory()) continue;
                JSObject o = new JSObject();
                o.put("uri", "file://" + k.getAbsolutePath());
                o.put("name", k.getName());
                o.put("size", k.length());
                o.put("mtime", k.lastModified());
                o.put("video", isVid(k.getName()));
                arr.put(o);
            }
            JSObject ret = new JSObject(); ret.put("files", arr); call.resolve(ret);
        } catch (Exception e) { call.reject(e.getMessage()); }
    }

    // ===== Превью (фото и видео), кэш на диске =====
    private File thumbDir() {
        File d = new File(Environment.getExternalStorageDirectory(), ".yg_thumbs");
        if (!d.exists()) d.mkdirs();
        return d;
    }
    private String thumbKey(File src) {
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
            if (cacheFile.exists()) {
                byte[] data = readAll(new FileInputStream(cacheFile));
                ret.put("thumb", "data:image/jpeg;base64," + Base64.encodeToString(data, Base64.NO_WRAP));
                try { android.graphics.BitmapFactory.Options bo = new android.graphics.BitmapFactory.Options(); bo.inJustDecodeBounds = true; android.graphics.BitmapFactory.decodeFile(cacheFile.getAbsolutePath(), bo); ret.put("w", bo.outWidth); ret.put("h", bo.outHeight); } catch (Exception ignored) {}
                call.resolve(ret); return;
            }
            String name = f.getName().toLowerCase();
            Bitmap b = null;
            if (isImg(name)) {
                android.graphics.BitmapFactory.Options o = new android.graphics.BitmapFactory.Options();
                o.inJustDecodeBounds = true;
                android.graphics.BitmapFactory.decodeFile(f.getAbsolutePath(), o);
                int s = 1; while (o.outWidth / s > 1024 || o.outHeight / s > 1024) s *= 2;
                android.graphics.BitmapFactory.Options o2 = new android.graphics.BitmapFactory.Options();
                o2.inSampleSize = s;
                b = android.graphics.BitmapFactory.decodeFile(f.getAbsolutePath(), o2);
                b = applyExif(b, f.getAbsolutePath());
            } else if (isVid(name)) {
                try { b = ThumbnailUtils.createVideoThumbnail(f.getAbsolutePath(), android.provider.MediaStore.Images.Thumbnails.MINI_KIND); } catch (Throwable ignored) {}
                if (b == null) {
                    MediaMetadataRetriever r = new MediaMetadataRetriever();
                    try { r.setDataSource(f.getAbsolutePath()); b = r.getFrameAtTime(1000000); } catch (Throwable ignored) {}
                    try { r.release(); } catch (Throwable ignored) {}
                }
            }
            if (b == null) { call.resolve(ret); return; }
            int mx = Math.max(b.getWidth(), b.getHeight());
            if (mx > 512) { float sc = 512f / mx; b = Bitmap.createScaledBitmap(b, Math.round(b.getWidth() * sc), Math.round(b.getHeight() * sc), true); }
            ByteArrayOutputStream out = new ByteArrayOutputStream();
            b.compress(Bitmap.CompressFormat.JPEG, 86, out);
            byte[] bytes = out.toByteArray();
            try { OutputStream fos = new FileOutputStream(cacheFile); fos.write(bytes); fos.close(); } catch (Exception ignored) {}
            ret.put("thumb", "data:image/jpeg;base64," + Base64.encodeToString(bytes, Base64.NO_WRAP));
            ret.put("w", b.getWidth()); ret.put("h", b.getHeight());
            call.resolve(ret);
        } catch (Exception e) { call.resolve(new JSObject()); }
    }

    // ===== Удалить (насовсем) =====
    @PluginMethod
    public void delete(PluginCall call) {
        String uriStr = call.getString("uri");
        if (uriStr == null) { call.reject("no uri"); return; }
        File f = toFile(uriStr);
        boolean ok = deleteRecursive(f);
        JSObject ret = new JSObject(); ret.put("deleted", ok || !f.exists()); call.resolve(ret);
    }

    // ===== Переместить (в корзину / восстановить). Создаёт целевые папки. =====
    @PluginMethod
    public void move(PluginCall call) {
        String from = call.getString("from");
        String to = call.getString("to");
        if (from == null || to == null) { call.reject("no from/to"); return; }
        try {
            File src = toFile(from);
            File dst = toFile(to);
            File parent = dst.getParentFile();
            if (parent != null && !parent.exists()) parent.mkdirs();
            boolean ok = src.renameTo(dst);
            if (!ok) {                                  // разные тома — копируем + удаляем
                FileInputStream in = new FileInputStream(src);
                FileOutputStream o = new FileOutputStream(dst);
                byte[] buf = new byte[65536]; int r;
                while ((r = in.read(buf)) > 0) o.write(buf, 0, r);
                in.close(); o.close();
                ok = src.delete();
            }
            JSObject ret = new JSObject(); ret.put("ok", ok); ret.put("uri", "file://" + dst.getAbsolutePath()); call.resolve(ret);
        } catch (Exception e) { call.reject(e.getMessage()); }
    }

    // ===== Создать .nomedia (скрыть альбом) / удалить .nomedia (показать) =====
    @PluginMethod
    public void setNomedia(PluginCall call) {
        String path = call.getString("path");
        boolean on = Boolean.TRUE.equals(call.getBoolean("on", true));
        if (path == null) { call.reject("no path"); return; }
        try {
            File dir = toFile(path);
            File nm = new File(dir, ".nomedia");
            if (on) { if (!nm.exists()) new FileOutputStream(nm).close(); }
            else { if (nm.exists()) nm.delete(); }
            JSObject ret = new JSObject(); ret.put("ok", true); call.resolve(ret);
        } catch (Exception e) { call.reject(e.getMessage()); }
    }

    // ===== Поделиться =====
    @PluginMethod
    public void share(PluginCall call) {
        String uriStr = call.getString("uri");
        String mime = call.getString("mime", "image/*");
        if (uriStr == null) { call.reject("no uri"); return; }
        try {
            File f = toFile(uriStr);
            if (!f.exists()) { call.reject("Файл не найден"); return; }
            Uri u = providerUri(f);
            Intent i = new Intent(Intent.ACTION_SEND);
            i.setType(mime);
            i.putExtra(Intent.EXTRA_STREAM, u);
            i.setClipData(android.content.ClipData.newRawUri("", u));
            i.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
            Intent ch = Intent.createChooser(i, "Поделиться");
            ch.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            getContext().startActivity(ch);
            call.resolve();
        } catch (Exception e) { call.reject(e.getMessage()); }
    }

    // ===== Редактировать через стороннее приложение =====
    @PluginMethod
    public void editImage(PluginCall call) {
        String uriStr = call.getString("uri");
        String mime = call.getString("mime", "image/*");
        if (uriStr == null) { call.reject("no uri"); return; }
        try {
            File f = toFile(uriStr);
            if (!f.exists()) { call.reject("Файл не найден"); return; }
            Uri u = providerUri(f);
            Intent i = new Intent(Intent.ACTION_EDIT);
            i.setDataAndType(u, mime);
            i.setClipData(android.content.ClipData.newRawUri("", u));
            i.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION | Intent.FLAG_GRANT_WRITE_URI_PERMISSION);
            Intent ch = Intent.createChooser(i, "Изменить через");
            ch.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            getContext().startActivity(ch);
            call.resolve();
        } catch (Exception e) { call.reject(e.getMessage()); }
    }

    // ===== Установить как обои (системный выбор: экран/блокировка) =====
    @PluginMethod
    public void setWallpaper(PluginCall call) {
        String uriStr = call.getString("uri");
        if (uriStr == null) { call.reject("no uri"); return; }
        try {
            File f = toFile(uriStr);
            if (!f.exists()) { call.reject("Файл не найден"); return; }
            Uri u = providerUri(f);
            Intent i = new Intent(Intent.ACTION_ATTACH_DATA);
            i.addCategory(Intent.CATEGORY_DEFAULT);
            i.setDataAndType(u, "image/*");
            i.putExtra("mimeType", "image/*");
            i.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
            Intent ch = Intent.createChooser(i, "Установить как обои");
            ch.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            getContext().startActivity(ch);
            call.resolve();
        } catch (Exception e) { call.reject(e.getMessage()); }
    }

    private Bitmap applyExif(Bitmap b, String path) {
        if (b == null) return null;
        try {
            android.media.ExifInterface ex = new android.media.ExifInterface(path);
            int o = ex.getAttributeInt(android.media.ExifInterface.TAG_ORIENTATION, android.media.ExifInterface.ORIENTATION_NORMAL);
            int deg = 0;
            if (o == android.media.ExifInterface.ORIENTATION_ROTATE_90) deg = 90;
            else if (o == android.media.ExifInterface.ORIENTATION_ROTATE_180) deg = 180;
            else if (o == android.media.ExifInterface.ORIENTATION_ROTATE_270) deg = 270;
            if (deg != 0) {
                android.graphics.Matrix m = new android.graphics.Matrix();
                m.postRotate(deg);
                b = Bitmap.createBitmap(b, 0, 0, b.getWidth(), b.getHeight(), m, true);
            }
        } catch (Throwable ignored) {}
        return b;
    }

    private Uri providerUri(File f) {
        try { return FileProvider.getUriForFile(getContext(), getContext().getPackageName() + ".appsfp", f); }
        catch (Exception e) {
            try { StrictMode.setVmPolicy(new StrictMode.VmPolicy.Builder().build()); } catch (Exception ignored) {}
            return Uri.fromFile(f);
        }
    }

    // ===== Цвет статус-бара/навбара под тему =====
    @PluginMethod
    public void setBars(PluginCall call) {
        final String color = call.getString("color", "#000000");
        final boolean light = Boolean.TRUE.equals(call.getBoolean("light", false));
        try {
            getActivity().runOnUiThread(() -> {
                try {
                    Window w = getActivity().getWindow();
                    int c = Color.parseColor(color);
                    w.setStatusBarColor(c);
                    w.setNavigationBarColor(c);
                    View dv = w.getDecorView();
                    int flags = dv.getSystemUiVisibility();
                    if (Build.VERSION.SDK_INT >= 23) { if (light) flags |= View.SYSTEM_UI_FLAG_LIGHT_STATUS_BAR; else flags &= ~View.SYSTEM_UI_FLAG_LIGHT_STATUS_BAR; }
                    if (Build.VERSION.SDK_INT >= 26) { if (light) flags |= View.SYSTEM_UI_FLAG_LIGHT_NAVIGATION_BAR; else flags &= ~View.SYSTEM_UI_FLAG_LIGHT_NAVIGATION_BAR; }
                    dv.setSystemUiVisibility(flags);
                } catch (Exception ignored) {}
            });
        } catch (Exception ignored) {}
        call.resolve();
    }

    // ===== Доступ ко всем файлам =====
    @PluginMethod
    public void hasAllFiles(PluginCall call) {
        boolean granted = Build.VERSION.SDK_INT < 30 || Environment.isExternalStorageManager();
        JSObject ret = new JSObject(); ret.put("granted", granted); call.resolve(ret);
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
        } catch (Exception e) { call.reject(e.getMessage()); }
    }

    // ===== helpers =====
    private boolean deleteRecursive(File f) {
        if (f.isDirectory()) { File[] kids = f.listFiles(); if (kids != null) for (File k : kids) deleteRecursive(k); }
        return f.delete();
    }
    private File toFile(String u) {
        String p = u;
        if (p.startsWith("file://")) p = p.substring(7);
        if (p.indexOf('%') >= 0) { try { p = java.net.URLDecoder.decode(p, "UTF-8"); } catch (Exception ignored) {} }
        return new File(p);
    }
    private byte[] readAll(InputStream in) throws Exception {
        ByteArrayOutputStream o = new ByteArrayOutputStream();
        byte[] buf = new byte[65536]; int r;
        while ((r = in.read(buf)) > 0) o.write(buf, 0, r);
        in.close(); return o.toByteArray();
    }
}
