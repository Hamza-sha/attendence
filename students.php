<?php
// ============================================================
// ملف إدارة الطلاب
// GET    → جلب قائمة كل الطلاب
// POST   → إضافة طالب جديد
// PUT    → تعديل عدد غياباته
// DELETE → حذف طالب
// ============================================================

require_once __DIR__ . '/../includes/helpers.php';
setHeaders();

// requireInstructor: كل عمليات الطلاب للمشرف فقط
requireInstructor();

$db     = getDB();

// نقرأ HTTP Method لنعرف العملية المطلوبة
$method = $_SERVER['REQUEST_METHOD'];

// ── GET: جلب قائمة كل الطلاب ─────────────────────────────
if ($method === 'GET') {
    // نجلب كل الطلاب مرتبين أبجدياً بالاسم
    // نحدد الأعمدة المطلوبة فقط (ليس password لأسباب أمنية)
    $rows = $db->query(
        'SELECT id, student_id, full_name, absences, is_banned, must_change, created_at
         FROM students
         ORDER BY full_name'
    )->fetchAll();

    success($rows);
}

// ── POST: إضافة طالب جديد ────────────────────────────────
if ($method === 'POST') {
    $d = input();

    // trim: نحذف المسافات من البداية والنهاية
    // ?? '': لو الحقل غير موجود استخدم نص فارغ
    $sid  = trim($d['student_id'] ?? '');
    $name = trim($d['full_name']  ?? '');

    // نتحقق أن الرقم الجامعي والاسم مُرسَلَان
    // ! تعني "لو فارغ"
    if (!$sid || !$name) fail('الرقم الجامعي والاسم مطلوبان');

    // نتحقق أن الرقم الجامعي غير موجود مسبقاً
    $check = $db->prepare('SELECT id FROM students WHERE student_id=?');
    $check->execute([$sid]);

    // fetch() يُرجع false لو لم يجد نتيجة
    if ($check->fetch()) fail('الرقم الجامعي موجود مسبقاً');

    // نُضيف الطالب:
    // hashPass($sid): الباسوورد الافتراضي = الرقم الجامعي مُشفَّراً
    // must_change=1: يُجبره على تغيير الباسوورد عند أول دخول
    $db->prepare('INSERT INTO students (student_id, full_name, password, must_change) VALUES (?,?,?,1)')
       ->execute([$sid, $name, hashPass($sid)]);

    // lastInsertId(): الـ id التلقائي الذي أُعطي للطالب الجديد
    success(['id' => $db->lastInsertId()], "تم إضافة $name");
}

// ── PUT: تعديل عدد غيابات طالب يدوياً ───────────────────
if ($method === 'PUT') {
    $d        = input();
    $id       = (int)($d['id']       ?? 0); // id الطالب الداخلي
    $absences = (int)($d['absences'] ?? 0); // العدد الجديد للغيابات

    if (!$id) fail('معرف الطالب مطلوب');

    // نحسب is_banned: لو الغيابات أكبر من 6 = محروم (1)، وإلا (0)
    $banned = $absences > 6 ? 1 : 0;

    // نُحدّث الغيابات وحالة الحرمان معاً
    $db->prepare('UPDATE students SET absences=?, is_banned=? WHERE id=?')
       ->execute([$absences, $banned, $id]);

    success(null, 'تم التحديث');
}

// ── DELETE: حذف طالب ──────────────────────────────────────
if ($method === 'DELETE') {
    // id الطالب يأتي في الرابط: ?id=5
    // $_GET يقرأ معاملات الرابط
    $id = (int)($_GET['id'] ?? 0);

    if (!$id) fail('معرف الطالب مطلوب');

    // لما يُحذف الطالب، FOREIGN KEY CASCADE يحذف سجلات حضوره تلقائياً
    $db->prepare('DELETE FROM students WHERE id=?')->execute([$id]);

    success(null, 'تم الحذف');
}

// إذا لم يطابق أي Method
fail('طريقة غير مدعومة', 405);
