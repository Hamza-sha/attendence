<?php
// ============================================================
// ملف المصادقة: تسجيل الدخول وتغيير كلمة المرور
// POST /backend/api/auth.php?action=login
// POST /backend/api/auth.php?action=change_password
// ============================================================

// نجلب ملف الدوال المساعدة (يحوي getDB, success, fail, input, JWT...)
require_once __DIR__ . '/../includes/helpers.php';

// نضع ترويسات JSON وCORS لكل الردود
setHeaders();

// نقرأ قيمة action من رابط الطلب: ?action=login أو ?action=change_password
// ?? '' يعني لو لم تُرسَل قيمة action، استخدم نص فارغ بدل خطأ
$action = $_GET['action'] ?? '';

// نفتح الاتصال بقاعدة البيانات
$db = getDB();

// ============================================================
// action=login: تسجيل الدخول للمشرف أو الطالب
// ============================================================
if ($action === 'login') {
    // نقرأ البيانات المُرسَلة في جسم الطلب (JSON)
    $d = input();

    // نقرأ دور المستخدم: 'instructor' أو 'student'
    // ?? '' لمنع خطأ لو الحقل غير موجود
    $role = $d['role'] ?? '';

    // ── تسجيل دخول المشرف ─────────────────────────────────
    if ($role === 'instructor') {
        // نحضر استعلاماً آمناً للبحث بـ username
        // ? هو عنصر نائب (placeholder) يمنع SQL Injection
        $stmt = $db->prepare('SELECT * FROM instructors WHERE username=?');

        // ننفذ الاستعلام مع القيمة الحقيقية:
        // strtolower: نحول لأحرف صغيرة (admin = ADMIN)
        // trim: نحذف المسافات من البداية والنهاية
        $stmt->execute([strtolower(trim($d['username'] ?? ''))]);

        // fetch() يجلب الصف الأول — لو المشرف موجود يُرجع مصفوفته، لو لا يُرجع false
        $row = $stmt->fetch();

        // نتحقق من شرطين:
        // !$row = المشرف غير موجود في قاعدة البيانات
        // !checkPass = الباسوورد غلط (يقارن المُدخَل بالمشفر)
        // نعمدًا نرسل رسالة واحدة للحالتين لأسباب أمنية
        if (!$row || !checkPass($d['password'] ?? '', $row['password']))
            fail('اسم المستخدم أو كلمة المرور غير صحيحة');

        // ننشئ JWT Token يحمل بيانات المشرف
        // هذا التوكن سيُرسَل مع كل طلب لاحق لإثبات الهوية
        $token = jwtMake([
            'id'   => $row['id'],       // رقم المشرف الداخلي
            'role' => 'instructor',      // دوره: مشرف
            'name' => $row['full_name'], // اسمه للعرض
        ]);

        // نرسل رداً ناجحاً مع التوكن وبيانات المشرف
        success([
            'token'       => $token,               // التوكن لحفظه في localStorage
            'role'        => 'instructor',
            'name'        => $row['full_name'],
            'must_change' => (bool)$row['must_change'], // هل يجب تغيير الباسوورد؟
            // (bool) تحول 0/1 من قاعدة البيانات لـ false/true في JSON
        ], 'تم تسجيل الدخول');
    }

    // ── تسجيل دخول الطالب ─────────────────────────────────
    elseif ($role === 'student') {
        // نبحث بالرقم الجامعي في جدول students
        $stmt = $db->prepare('SELECT * FROM students WHERE student_id=?');

        // trim يحذف أي مسافات زائدة من الرقم الجامعي
        $stmt->execute([trim($d['student_id'] ?? '')]);
        $row = $stmt->fetch();

        // نتحقق من وجود الطالب وصحة الباسوورد
        if (!$row || !checkPass($d['password'] ?? '', $row['password']))
            fail('الرقم الجامعي أو كلمة المرور غير صحيحة');

        // ننشئ JWT Token يحمل بيانات الطالب
        $token = jwtMake([
            'id'         => $row['id'],         // الرقم الداخلي
            'role'       => 'student',           // دوره: طالب
            'name'       => $row['full_name'],
            'student_id' => $row['student_id'],  // الرقم الجامعي الحقيقي
        ]);

        // نرسل رداً ناجحاً مع بيانات الطالب الكاملة
        success([
            'token'       => $token,
            'role'        => 'student',
            'name'        => $row['full_name'],
            'student_id'  => $row['student_id'],
            'absences'    => (int)$row['absences'],      // (int) يحول للرقم
            'is_banned'   => (bool)$row['is_banned'],    // محروم؟
            'must_change' => (bool)$row['must_change'],  // يجب تغيير الباسوورد؟
        ], 'تم تسجيل الدخول');
    }

    // لو role غير محدد أو غير معروف
    else {
        fail('نوع المستخدم غير محدد');
    }
}

// ============================================================
// action=change_password: تغيير كلمة المرور
// ============================================================
if ($action === 'change_password') {
    // requireAuth: يتحقق أن المستخدم مسجل دخول ويُرجع بياناته من التوكن
    $auth = requireAuth();

    // نقرأ كلمة المرور الجديدة من جسم الطلب
    $d   = input();
    $new = trim($d['new_password'] ?? '');

    // نتحقق من الحد الأدنى للطول (6 أحرف)
    if (strlen($new) < 6) fail('كلمة المرور قصيرة جداً');

    // نحدد الجدول المناسب حسب دور المستخدم
    if ($auth['role'] === 'instructor') {
        // نُحدّث كلمة مرور المشرف وننبئ أنه لم يعد يحتاج لتغييرها (must_change=0)
        $db->prepare('UPDATE instructors SET password=?, must_change=0 WHERE id=?')
           ->execute([hashPass($new), $auth['id']]);
    } else {
        // نُحدّث كلمة مرور الطالب
        $db->prepare('UPDATE students SET password=?, must_change=0 WHERE id=?')
           ->execute([hashPass($new), $auth['id']]);
    }

    // نرسل تأكيد النجاح
    success(null, 'تم تغيير كلمة المرور');
}

// لو وصلنا هنا يعني action غير معروف
fail('إجراء غير معروف');
