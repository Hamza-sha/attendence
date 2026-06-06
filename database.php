<?php
// ============================================================
// ملف إعدادات قاعدة البيانات
// هذا الملف يُحمَّل في كل ملفات الـ API عبر require_once
// ============================================================

// define() تنشئ ثابتاً لا يمكن تغييره في أي مكان آخر
// 'DB_HOST' اسم الثابت، 'localhost' قيمته
// localhost يعني قاعدة البيانات على نفس الجهاز (السيرفر المحلي)
define('DB_HOST', 'sql206.infinityfree.com');
define('DB_NAME', 'if0_42110678_attendance');
define('DB_USER', 'if0_42110678');
define('DB_PASS', 'attendence2026');
define('DB_CHARSET', 'utf8mb4');

// المفتاح السري لتشفير توكنات JWT
// هذا النص هو "كلمة السر" التي يستخدمها السيرفر لتوقيع التوكنات
// غيّره لنص عشوائي طويل في بيئة الإنتاج الحقيقية
define('JWT_SECRET', 'SAS_CHANGE_THIS_SECRET_KEY_2024');

// مدة صلاحية التوكن بالثواني
// 86400 = 60 ثانية × 60 دقيقة × 24 ساعة = يوم كامل
define('JWT_EXPIRY', 86400);

// ============================================================
// دالة getDB(): تفتح الاتصال بقاعدة البيانات وتُرجعه
// ============================================================
function getDB(): PDO {
    // static: المتغير يحتفظ بقيمته بين استدعاءات الدالة
    // بدلاً من فتح اتصال جديد في كل مرة، نفتح مرة واحدة فقط
    // هذا يُسمى Singleton Pattern
    static $pdo = null;

    // إذا الاتصال مفتوح مسبقاً، أرجعه مباشرة بدون إعادة فتحه
    if ($pdo) return $pdo;

    // DSN = Data Source Name: سلسلة نصية تصف بيانات الاتصال
    // تتضمن: نوع قاعدة البيانات (mysql)، اسم الهوست، اسم القاعدة، الترميز
    $dsn = "mysql:host=" . DB_HOST . ";dbname=" . DB_NAME . ";charset=" . DB_CHARSET;

    try {
        // PDO = PHP Data Objects: طريقة آمنة وموحدة للتعامل مع قواعد البيانات
        // الأفضل من mysqli_ لأنها تدعم Prepared Statements بشكل كامل
        $pdo = new PDO($dsn, DB_USER, DB_PASS, [
            // عند حدوث خطأ في قاعدة البيانات، أطلق Exception بدل التجاهل
            PDO::ATTR_ERRMODE            => PDO::ERRMODE_EXCEPTION,

            // عند جلب البيانات، أرجع مصفوفة بمفاتيح أسماء الأعمدة
            // مثال: $row['student_id'] بدل $row[0]
            PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,

            // استخدم Prepared Statements الحقيقية في MySQL
            // false = أفضل أماناً ضد SQL Injection
            PDO::ATTR_EMULATE_PREPARES   => false,
        ]);
    } catch (PDOException $e) {
        // لو فشل الاتصال، أرسل كود HTTP 500 (خطأ في السيرفر)
        http_response_code(500);

        // أوقف التنفيذ وأرسل رسالة خطأ بصيغة JSON
        die(json_encode(['success' => false, 'message' => 'فشل الاتصال بقاعدة البيانات']));
    }

    // أرجع الاتصال المفتوح
    return $pdo;
}
