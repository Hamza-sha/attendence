<?php
// ============================================================
// ملف الإعدادات
// GET → قراءة إعدادات النظام (مفتوح — يستخدمه boot للتحقق)
// PUT → تحديث الإعدادات (للمشرف فقط)
// ============================================================

require_once __DIR__ . '/../includes/helpers.php';
setHeaders();

$db     = getDB();
$method = $_SERVER['REQUEST_METHOD'];

// ── GET: قراءة الإعدادات ─────────────────────────────────
if ($method === 'GET') {
    // هذا المسار مفتوح بدون JWT لأن boot() يستدعيه لمعرفة
    // هل النظام مُعدّ (is_setup=1) أم لا قبل تسجيل الدخول

    // نجلب إعدادات النظام من الصف الوحيد في جدول settings
    $row = $db->query(
        'SELECT uni_name, uni_dept, academic_year, gps_lat, gps_lng, gps_radius, is_setup
         FROM settings WHERE id=1'
    )->fetch();

    success($row);
}

// ── PUT: تحديث الإعدادات (المشرف فقط) ───────────────────
if ($method === 'PUT') {
    // نتحقق أن المستخدم مشرف قبل السماح بالتعديل
    requireInstructor();
    $d = input();

    // نُحدّث كل الحقول في نفس الوقت
    $db->prepare(
        'UPDATE settings
         SET uni_name=?, uni_dept=?, academic_year=?, gps_lat=?, gps_lng=?, gps_radius=?
         WHERE id=1'
    )->execute([
        trim($d['uni_name']      ?? ''),  // اسم الجامعة
        trim($d['uni_dept']      ?? ''),  // القسم
        trim($d['academic_year'] ?? ''),  // السنة الدراسية

        // ?: المشغّل Elvis: لو gps_lat له قيمة حقيقية حوّلها لـ float
        // وإلا استخدم null (الموقع غير محدد)
        $d['gps_lat'] ? (float)$d['gps_lat'] : null,
        $d['gps_lng'] ? (float)$d['gps_lng'] : null,

        // النطاق بالمتر، افتراضياً 200 لو لم يُرسَل
        (int)($d['gps_radius'] ?? 200),
    ]);

    success(null, 'تم حفظ الإعدادات');
}

fail('طريقة غير مدعومة', 405);
