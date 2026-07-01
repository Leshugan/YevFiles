package leshugan.fm;

import androidx.core.content.FileProvider;

// Отдельный подкласс, чтобы НЕ конфликтовать с FileProvider, который регистрирует Capacitor
// (иначе authority leshugan.fm.appsfp «слипается» с провайдером Capacitor и редактор падает с SecurityException).
public class AppsFileProvider extends FileProvider {
}
