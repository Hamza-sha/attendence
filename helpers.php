<?php
// ============================================================
// ملف الدوال المساعدة (Helper Functions)
// هذا الملف يُجمع كل الدوال المشتركة بين ملفات الـ API
// ============================================================

// نجلب ملف إعدادات قاعدة البيانات
// __DIR__ يعني مجلد الملف الحالي (includes/)
// '/../config/database.php' ارجع للمجلد الأب ثم ادخل config/
require_once __DIR__ . '/../config/database.php';

// ============================================================
// دالة setHeaders(): تضع ترويسات HTTP المطلوبة في كل رد
// ============================================================
function setHeaders(): void {
    // أخبر المتصفح أن الرد بصيغة JSON وليس HTML
    // بدون هذا السطر قد لا يفهم الفرونت إند الرد بشكل صحيح
    header('Content-Type: application/json; charset=utf-8');

    // السماح لأي موقع بالوصول لهذه الـ API (CORS)
    // * تعني أي نطاق مسموح
    // في الإنتاج الحقيقي نضع عنوان الموقع المحدد بدل *
    header('Access-Control-Allow-Origin: *');

    // HTTP Methods المسموح بها
    header('Access-Control-Allow-Methods: GET, POST, PUT, DELETE, OPTIONS');

    // Headers المسموح للمتصفح بإرسالها
    // Content-Type للبيانات، Authorization للتوكن JWT
    header('Access-Control-Allow-Headers: Content-Type, Authorization');

    // المتصفح أحياناً يرسل طلب OPTIONS قبل الطلب الحقيقي (Preflight)
    // ليتحقق من صلاحيات CORS
    // نرد بـ 200 ونخرج فوراً بدون معالجة
    if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') { http_response_code(200); exit; }
}

// ============================================================
// دالة success(): ترسل رداً ناجحاً بصيغة JSON
// ============================================================
// mixed $data: البيانات المُرجَعة (أي نوع أو null)
// string $msg: رسالة النجاح الافتراضية 'OK'
// int $code: كود HTTP (200 = نجاح)
// : never تعني الدالة لا تُكمل — تنهي التنفيذ دائماً بـ exit
function success(mixed $data = null, string $msg = 'OK', int $code = 200): never {
    // حدد كود HTTP في الرد
    http_response_code($code);

    // حول المصفوفة لنص JSON واطبعه في الرد
    // كل ردودنا دائماً فيها success، message، data
    echo json_encode(['success' => true, 'message' => $msg, 'data' => $data]);

    // أنهِ تنفيذ البرنامج فوراً — لا يوجد كود بعد هذا السطر
    exit;
}

// ============================================================
// دالة fail(): ترسل رداً بخطأ بصيغة JSON
// ============================================================
// string $msg: رسالة الخطأ الواضحة للمستخدم
// int $code: كود HTTP للخطأ (400 = خطأ في الطلب، 401 = غير مصرح)
function fail(string $msg, int $code = 400): never {
    http_response_code($code);
    echo json_encode(['success' => false, 'message' => $msg, 'data' => null]);
    exit;
}

// ============================================================
// دالة input(): تقرأ بيانات JSON من جسم الطلب (Request Body)
// ============================================================
function input(): array {
    // php://input: مجرى بيانات خاص يحوي جسم الطلب الخام
    // file_get_contents: يقرأ المحتوى كاملاً كنص
    $d = json_decode(file_get_contents('php://input'), true);

    // json_decode مع true يُرجع مصفوفة PHP وليس object
    // is_array: تتحقق إذا كانت النتيجة مصفوفة
    // لو كانت null أو خطأ، أرجع مصفوفة فارغة [] لمنع الأخطاء
    return is_array($d) ? $d : [];
}

// ============================================================
// دوال تشفير كلمات المرور بـ bcrypt
// ============================================================

// hashPass(): تشفير الباسوورد — لا يمكن عكسه أبداً
// النتيجة نص طويل مثل: $2y$10$N9qo8uLOickgx2ZMRZoMyeI...
function hashPass(string $p): string {
    return password_hash($p, PASSWORD_BCRYPT);
}

// checkPass(): التحقق من الباسوورد المُدخَل مقابل المُشفَّر
// لا تفك التشفير — تُشفر المُدخَل وتقارن النتيجة
// ترجع true لو متطابق، false لو مختلف
function checkPass(string $p, string $h): bool {
    return password_verify($p, $h);
}

// ============================================================
// دوال JWT (JSON Web Token): نظام المصادقة
// ============================================================

// b64e(): تحويل نص لـ Base64 بشكل آمن للـ URL
// Base64 العادي فيه + و / وهي رموز غير آمنة في الروابط
// نستبدلها بـ - و _ ونحذف = من الآخر
function b64e(string $d): string {
    return rtrim(strtr(base64_encode($d), '+/', '-_'), '=');
}

// b64d(): عكس العملية — فك تشفير Base64 URL-safe
function b64d(string $d): string {
    // نعيد + و / ونضيف = في الآخر حسب طول النص
    return base64_decode(strtr($d, '-_', '+/') . str_repeat('=', 3-(3+strlen($d))%4));
}

// ============================================================
// jwtMake(): إنشاء توكن JWT جديد
// ============================================================
// $payload: مصفوفة البيانات التي سيحملها التوكن (id, role, name...)
function jwtMake(array $payload): string {
    // الجزء الأول (Header): يصف نوع التوكن وخوارزمية التشفير
    // HS256 = HMAC-SHA256 خوارزمية التوقيع
    // JWT = نوع التوكن
    $h = b64e(json_encode(['alg'=>'HS256','typ'=>'JWT']));

    // نضيف وقت الانتهاء للـ payload
    // time() = الوقت الحالي بالثواني (Unix Timestamp)
    // + JWT_EXPIRY = نضيف 86400 ثانية (24 ساعة)
    $payload['exp'] = time() + JWT_EXPIRY;

    // الجزء الثاني (Payload): البيانات مشفرة بـ Base64
    $p = b64e(json_encode($payload));

    // الجزء الثالث (Signature): التوقيع الرقمي
    // hash_hmac: ينشئ توقيعاً باستخدام sha256 والمفتاح السري
    // true = ارجع bytes خام وليس hex
    $s = b64e(hash_hmac('sha256', "$h.$p", JWT_SECRET, true));

    // النتيجة: header.payload.signature مفصولة بنقاط
    return "$h.$p.$s";
}

// ============================================================
// jwtRead(): قراءة والتحقق من توكن JWT
// ============================================================
// ترجع مصفوفة البيانات لو التوكن صالح، أو null لو غير صالح
function jwtRead(string $token): ?array {
    // نقسم التوكن على النقاط — لازم يكون 3 أجزاء
    $parts = explode('.', $token);
    if (count($parts) !== 3) return null; // توكن مشوه

    // نأخذ الأجزاء الثلاثة
    [$h, $p, $s] = $parts;

    // نعيد حساب التوقيع ونقارنه بالتوقيع في التوكن
    // hash_equals: مقارنة آمنة تأخذ نفس الوقت دائماً (تمنع Timing Attack)
    if (!hash_equals(b64e(hash_hmac('sha256', "$h.$p", JWT_SECRET, true)), $s)) {
        return null; // التوقيع غلط: التوكن مزور أو عُدّل
    }

    // نفك تشفير البيانات (Payload)
    $data = json_decode(b64d($p), true);

    // نتحقق من أن التوكن لم تنتهِ صلاحيته
    // $data['exp'] = وقت الانتهاء في التوكن
    // time() = الوقت الحالي
    // لو وقت الانتهاء أقل من الآن = التوكن انتهى
    if (!$data || ($data['exp'] ?? 0) < time()) return null;

    // التوكن صالح: ارجع البيانات
    return $data;
}

// ============================================================
// requireAuth(): يتحقق أن المستخدم مسجل دخول وله توكن صالح
// ============================================================
function requireAuth(): array {
    // نقرأ Authorization header من الطلب
    // ?? '' يعني لو غير موجود أرجع نص فارغ
    $hdr = $_SERVER['HTTP_AUTHORIZATION'] ?? '';

    // التوكن لازم يبدأ بـ 'Bearer ' (بمسافة في الآخر)
    // هذا هو المعيار القياسي لإرسال JWT في HTTP headers
    if (!str_starts_with($hdr, 'Bearer ')) fail('غير مصرح', 401);

    // نقطع 'Bearer ' (7 أحرف مع المسافة) ونأخذ التوكن فقط
    // substr($hdr, 7) = كل النص من الحرف 7 للنهاية
    $d = jwtRead(substr($hdr, 7));

    // لو التوكن غير صالح أو منتهٍ
    if (!$d) fail('التوكن غير صالح', 401);

    // ارجع بيانات المستخدم المخزنة في التوكن
    return $d;
}

// ============================================================
// requireInstructor(): يتحقق أن المستخدم مشرف وليس طالباً
// ============================================================
function requireInstructor(): array {
    // أولاً تحقق أنه مسجل دخول (requireAuth يتحقق من JWT)
    $d = requireAuth();

    // ثم تحقق أن دوره instructor وليس student
    // ?? '' لمنع خطأ لو حقل role غير موجود
    if (($d['role'] ?? '') !== 'instructor') fail('للمشرفين فقط', 403);

    // ارجع بيانات المشرف
    return $d;
}

// ============================================================
// دالة distance(): تحسب المسافة بين نقطتين جغرافيتين بالمتر
// باستخدام معادلة Haversine التي تأخذ انحناء الأرض بالحسبان
// ============================================================
// $la1, $lo1: خط عرض وطول موقع الطالب
// $la2, $lo2: خط عرض وطول موقع الجامعة
function distance(float $la1, float $lo1, float $la2, float $lo2): float {
    // نصف قطر الأرض بالمتر
    $R = 6371000;

    // معادلة Haversine — تحسب المسافة على سطح كرة
    // deg2rad: تحول الدرجات لـ radians (الوحدة الرياضية للزوايا)
    // sin و cos: دوال مثلثية
    // ** 2 يعني تربيع العدد (رفعه للقوة 2)
    $a = sin(deg2rad(($la2-$la1)/2))**2
       + cos(deg2rad($la1)) * cos(deg2rad($la2)) * sin(deg2rad(($lo2-$lo1)/2))**2;

    // atan2 و sqrt: دوال رياضية لإكمال المعادلة
    // النتيجة النهائية: المسافة بالمتر
    return $R * 2 * atan2(sqrt($a), sqrt(1-$a));
}
