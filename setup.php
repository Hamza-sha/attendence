<?php
// ============================================================
// ملف الإعداد الأولي للنظام — يُستدعى مرة واحدة فقط
// POST /backend/api/setup.php
// ============================================================

require_once __DIR__ . '/../includes/helpers.php';
setHeaders();

$db = getDB();

// نقرأ الصف الوحيد من settings للتحقق هل النظام مُعدّ مسبقاً
$row = $db->query('SELECT is_setup FROM settings WHERE id=1')->fetch();

// لو is_setup = 1 يعني النظام أُعدّ من قبل — نرفض الطلب
if ($row && $row['is_setup']) fail('النظام مُعدَّ مسبقاً');

// نقرأ بيانات الإعداد من جسم الطلب (JSON)
$d = input();

// نتحقق من الحقول المطلوبة — أي حقل فارغ يوقف التنفيذ
foreach (['uni_name','gps_lat','gps_lng','admin_name','admin_username','admin_password'] as $f)
    if (empty($d[$f])) fail("الحقل $f مطلوب");

// trim: نحذف المسافات من باسوورد المشرف
$pass = trim($d['admin_password']);

// strtolower: نحول اسم المستخدم لأحرف صغيرة
$user = strtolower(trim($d['admin_username']));

// strlen: نتحقق من طول الباسوورد (6 أحرف على الأقل)
if (strlen($pass) < 6) fail('كلمة المرور قصيرة جداً');

// preg_match('/\s/', $user): يتحقق إذا كان اسم المستخدم فيه مسافات
// \s في Regex تعني أي فراغ (مسافة أو tab)
if (preg_match('/\s/', $user)) fail('اسم المستخدم لا يحتوي مسافات');

// نتحقق أن اسم المستخدم غير موجود مسبقاً
if ($db->prepare('SELECT id FROM instructors WHERE username=?')->execute([$user]) &&
    $db->query("SELECT COUNT(*) FROM instructors WHERE username='$user'")->fetchColumn())
    fail('اسم المستخدم موجود مسبقاً');

// نُحدّث إعدادات النظام في الصف الوحيد (id=1)
// is_setup=1 يعني النظام أصبح جاهزاً
$db->prepare(
    'UPDATE settings
     SET uni_name=?, uni_dept=?, academic_year=?, gps_lat=?, gps_lng=?, gps_radius=?, is_setup=1
     WHERE id=1'
)->execute([
    trim($d['uni_name']),    // اسم الجامعة
    $d['uni_dept'] ?? '',    // القسم (اختياري)
    $d['uni_year']  ?? '',   // السنة الدراسية (اختياري)
    (float)$d['gps_lat'],   // خط العرض — (float) يحول النص لرقم عشري
    (float)$d['gps_lng'],   // خط الطول
    (int)($d['gps_radius'] ?? 200), // النطاق بالمتر، افتراضي 200
]);

// نُنشئ حساب المشرف الأول (الأدمن)
// must_change=0 لأنه هو من اختار الباسوورد
$stmt = $db->prepare(
    'INSERT INTO instructors (full_name, username, password, must_change) VALUES (?,?,?,0)'
);
$stmt->execute([
    trim($d['admin_name']), // الاسم الكامل للمشرف
    $user,                  // اسم المستخدم (مُحوَّل لصغير)
    hashPass($pass),        // الباسوورد مُشفَّراً بـ bcrypt
]);

// تم الإعداد بنجاح — الفرونت سيُعيد توجيه المستخدم لشاشة الدخول
success(null, 'تم إعداد النظام بنجاح');
