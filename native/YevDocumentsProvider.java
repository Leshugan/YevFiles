package leshugan.fm;

import android.database.Cursor;
import android.database.MatrixCursor;
import android.os.CancellationSignal;
import android.os.Environment;
import android.os.ParcelFileDescriptor;
import android.provider.DocumentsContract.Document;
import android.provider.DocumentsContract.Root;
import android.provider.DocumentsProvider;
import android.webkit.MimeTypeMap;

import java.io.File;
import java.io.FileNotFoundException;
import java.util.LinkedList;

/**
 * Делает YevFiles доступным в системных диалогах "Сохранить в..." и "Открыть".
 * Корень — внутреннее хранилище. Полностью read/write через SAF.
 */
public class YevDocumentsProvider extends DocumentsProvider {

    private static final String[] DEFAULT_ROOT_PROJECTION = new String[]{
            Root.COLUMN_ROOT_ID, Root.COLUMN_MIME_TYPES, Root.COLUMN_FLAGS,
            Root.COLUMN_ICON, Root.COLUMN_TITLE, Root.COLUMN_SUMMARY,
            Root.COLUMN_DOCUMENT_ID, Root.COLUMN_AVAILABLE_BYTES
    };
    private static final String[] DEFAULT_DOCUMENT_PROJECTION = new String[]{
            Document.COLUMN_DOCUMENT_ID, Document.COLUMN_MIME_TYPE, Document.COLUMN_DISPLAY_NAME,
            Document.COLUMN_LAST_MODIFIED, Document.COLUMN_FLAGS, Document.COLUMN_SIZE
    };

    private File baseDir;

    @Override
    public boolean onCreate() {
        baseDir = Environment.getExternalStorageDirectory();
        return true;
    }

    @Override
    public Cursor queryRoots(String[] projection) {
        MatrixCursor result = new MatrixCursor(projection != null ? projection : DEFAULT_ROOT_PROJECTION);
        final MatrixCursor.RowBuilder row = result.newRow();
        row.add(Root.COLUMN_ROOT_ID, "yevroot");
        row.add(Root.COLUMN_SUMMARY, "YevFiles");
        row.add(Root.COLUMN_FLAGS, Root.FLAG_SUPPORTS_CREATE | Root.FLAG_SUPPORTS_IS_CHILD | Root.FLAG_LOCAL_ONLY);
        row.add(Root.COLUMN_TITLE, "YevFiles");
        row.add(Root.COLUMN_DOCUMENT_ID, docIdForFile(baseDir));
        row.add(Root.COLUMN_MIME_TYPES, "*/*");
        row.add(Root.COLUMN_AVAILABLE_BYTES, baseDir.getFreeSpace());
        row.add(Root.COLUMN_ICON, getContext().getApplicationInfo().icon);
        return result;
    }

    @Override
    public Cursor queryDocument(String documentId, String[] projection) throws FileNotFoundException {
        MatrixCursor result = new MatrixCursor(projection != null ? projection : DEFAULT_DOCUMENT_PROJECTION);
        includeFile(result, documentId, null);
        return result;
    }

    @Override
    public Cursor queryChildDocuments(String parentDocumentId, String[] projection, String sortOrder) throws FileNotFoundException {
        MatrixCursor result = new MatrixCursor(projection != null ? projection : DEFAULT_DOCUMENT_PROJECTION);
        final File parent = fileForDocId(parentDocumentId);
        File[] kids = parent.listFiles();
        if (kids != null) for (File f : kids) includeFile(result, null, f);
        return result;
    }

    @Override
    public ParcelFileDescriptor openDocument(String documentId, String mode, CancellationSignal signal) throws FileNotFoundException {
        final File file = fileForDocId(documentId);
        final int accessMode = ParcelFileDescriptor.parseMode(mode);
        return ParcelFileDescriptor.open(file, accessMode);
    }

    @Override
    public String createDocument(String parentDocumentId, String mimeType, String displayName) throws FileNotFoundException {
        File parent = fileForDocId(parentDocumentId);
        File f = new File(parent, displayName);
        try {
            if (Document.MIME_TYPE_DIR.equals(mimeType)) {
                if (!f.mkdir()) throw new FileNotFoundException("Не удалось создать папку " + f);
            } else {
                int n = 0; String base = displayName, ext = "";
                int dot = displayName.lastIndexOf('.');
                if (dot > 0) { base = displayName.substring(0, dot); ext = displayName.substring(dot); }
                while (f.exists()) { n++; f = new File(parent, base + " (" + n + ")" + ext); }
                if (!f.createNewFile()) throw new FileNotFoundException("Не удалось создать файл " + f);
            }
        } catch (Exception e) { throw new FileNotFoundException("Ошибка создания: " + e.getMessage()); }
        return docIdForFile(f);
    }

    @Override
    public void deleteDocument(String documentId) throws FileNotFoundException {
        File f = fileForDocId(documentId);
        if (!deleteRecursive(f)) throw new FileNotFoundException("Не удалось удалить " + documentId);
    }

    @Override
    public String renameDocument(String documentId, String displayName) throws FileNotFoundException {
        File f = fileForDocId(documentId);
        File target = new File(f.getParentFile(), displayName);
        if (!f.renameTo(target)) throw new FileNotFoundException("Не удалось переименовать " + documentId);
        return docIdForFile(target);
    }

    @Override
    public boolean isChildDocument(String parentDocumentId, String documentId) {
        return documentId.startsWith(parentDocumentId);
    }

    private boolean deleteRecursive(File f) {
        if (f.isDirectory()) { File[] k = f.listFiles(); if (k != null) for (File c : k) deleteRecursive(c); }
        return f.delete();
    }

    private void includeFile(MatrixCursor result, String docId, File file) throws FileNotFoundException {
        if (docId == null) docId = docIdForFile(file);
        else file = fileForDocId(docId);
        int flags = 0;
        if (file.isDirectory()) {
            if (file.canWrite()) flags |= Document.FLAG_DIR_SUPPORTS_CREATE;
        } else if (file.canWrite()) {
            flags |= Document.FLAG_SUPPORTS_WRITE;
        }
        if (file.getParentFile() != null && file.getParentFile().canWrite())
            flags |= Document.FLAG_SUPPORTS_DELETE | Document.FLAG_SUPPORTS_RENAME;

        final String displayName = file.getName();
        final String mimeType = getMimeType(file);
        if (mimeType.startsWith("image/")) flags |= Document.FLAG_SUPPORTS_THUMBNAIL;

        final MatrixCursor.RowBuilder row = result.newRow();
        row.add(Document.COLUMN_DOCUMENT_ID, docId);
        row.add(Document.COLUMN_DISPLAY_NAME, displayName.isEmpty() ? "YevFiles" : displayName);
        row.add(Document.COLUMN_SIZE, file.length());
        row.add(Document.COLUMN_MIME_TYPE, mimeType);
        row.add(Document.COLUMN_LAST_MODIFIED, file.lastModified());
        row.add(Document.COLUMN_FLAGS, flags);
    }

    private String docIdForFile(File file) {
        String path = file.getAbsolutePath();
        String root = baseDir.getAbsolutePath();
        if (path.equals(root)) return "root";
        if (path.startsWith(root)) return "root" + path.substring(root.length());
        return "root";
    }

    private File fileForDocId(String docId) throws FileNotFoundException {
        if (docId == null || docId.equals("root")) return baseDir;
        String rel = docId.startsWith("root") ? docId.substring(4) : docId;
        File f = new File(baseDir, rel);
        return f;
    }

    private static String getMimeType(File file) {
        if (file.isDirectory()) return Document.MIME_TYPE_DIR;
        String name = file.getName();
        int dot = name.lastIndexOf('.');
        if (dot >= 0) {
            String ext = name.substring(dot + 1).toLowerCase();
            String m = MimeTypeMap.getSingleton().getMimeTypeFromExtension(ext);
            if (m != null) return m;
        }
        return "application/octet-stream";
    }
}
