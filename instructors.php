<?php
// ============================================================
// ملف إدارة المشرفين
// GET    → قائمة المشرفين
// POST   → إضافة مشرف جديد
// PUT    → إعادة تعيين كلمة مرور مشرف
// DELETE → حذف مشرف
// ============================================================

require_once __DIR__ . '/../includes/helpers.php';
setHeaders();

// كل عمليات المشرفين تحتاج صلاحية مشرف
requireInstructor();

$db     = getDB();
$method = $_SERVER['REQUEST_METHOD'];

// ── GET: قائمة المشرفين ───────────────────────────────────
if ($method === 'GET') {
    // نجلب كل المشرفين بدون كلمات المرور (لا نُرجع password أبداً)
    $rows = $db->query(
        'SELECT id, full_name, username, must_change, created_at
         FROM instructors
         ORDER BY full_name'
    )->fetchAll();
    success($rows);
}

// ── POST: إضافة مشرف جديد ────────────────────────────────
if ($method === 'POST') {
    $d    = input();
    $name = trim($d['full_name'] ?? '');

    // strtolower: نحول اسم المستخدم لأحرف صغيرة (admin = Admin = ADMIN)
    $user = strtolower(trim($d['username'] ?? ''));
    $pass = trim($d['password']  ?? '');

    if (!$name || !$user || !$pass) fail('جميع الحقول مطلوبة');

    // preg_match('/\s/', $user): يتحقق إذا كان فيه مسافات
    // \s في Regex تعني أي فراغ (مسافة، tab...)
    if (preg_match('/\s/', $user)) fail('اسم المستخدم لا يحتوي مسافات');

    // strlen: يحسب عدد الأحرف
    if (strlen($pass) < 6) fail('كلمة المرور قصيرة جداً');

    // نتحقق أن اسم المستخدم غير موجود مسبقاً
    $chk = $db->prepare('SELECT id FROM instructors WHERE username=?');
    $chk->execute([$user]);
    if ($chk->fetch()) fail('اسم المستخدم موجود مسبقاً');

    // نُضيف المشرف، must_change=1 يعني يغير الباسوورد عند أول دخول
    $db->prepare('INSERT INTO instructors (full_name, username, password, must_change) VALUES (?,?,?,1)')
       ->execute([$name, $user, hashPass($pass)]);

    success(['id' => $db->lastInsertId()], "تم إضافة $name");
}

// ── PUT: إعادة تعيين كلمة المرور ─────────────────────────
if ($method === 'PUT') {
    $d    = input();
    $id   = (int)($d['id']       ?? 0);
    $pass = trim($d['password']  ?? '');

    if (!$id || !$pass) fail('المعرف وكلمة المرور مطلوبان');
    if (strlen($pass) < 6) fail('كلمة المرور قصيرة جداً');

    // نُحدّث الباسوورد ونجعل must_change=1 ليغيره عند الدخول التالي
    $db->prepare('UPDATE instructors SET password=?, must_change=1 WHERE id=?')
       ->execute([hashPass($pass), $id]);

    success(null, 'تم إعادة تعيين كلمة المرور');
}

// ── DELETE: حذف مشرف ──────────────────────────────────────
if ($method === 'DELETE') {
    $id = (int)($_GET['id'] ?? 0);
    if (!$id) fail('المعرف مطلوب');

    // نتحقق أن عدد المشرفين أكثر من 1 قبل الحذف
    // fetchColumn(): يجلب قيمة عمود واحد من الصف الأول
    $count = $db->query('SELECT COUNT(*) FROM instructors')->fetchColumn();

    // يجب أن يبقى مشرف واحد على الأقل لإدارة النظام
    if ($count <= 1) fail('يجب أن يبقى مشرف واحد على الأقل');

    $db->prepare('DELETE FROM instructors WHERE id=?')->execute([$id]);
    success(null, 'تم الحذف');
}

fail('طريقة غير مدعومة', 405);
