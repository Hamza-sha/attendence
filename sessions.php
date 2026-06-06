<?php
// ============================================================
// ملف إدارة الجلسات — قلب نظام الحضور
// GET    /sessions.php          → قائمة الجلسات
// POST   /sessions.php?action=start         → بدء جلسة
// POST   /sessions.php?action=refresh_token → تجديد الباركود
// POST   /sessions.php?action=end           → إنهاء الجلسة
// POST   /sessions.php?action=scan          → مسح الباركود (طالب)
// POST   /sessions.php?action=manual        → تسجيل يدوي (مشرف)
// ============================================================

// نجلب الدوال المساعدة
require_once __DIR__ . '/../includes/helpers.php';
setHeaders();

// نفتح الاتصال بقاعدة البيانات
$db = getDB();

// نقرأ HTTP Method من الطلب (GET, POST, PUT, DELETE)
$method = $_SERVER['REQUEST_METHOD'];

// نقرأ action من الرابط إذا وُجد
$action = $_GET['action'] ?? '';

// ============================================================
// GET بدون action: جلب قائمة كل الجلسات (للمشرف فقط)
// ============================================================
if ($method === 'GET' && !$action) {
    // نتحقق أن المستخدم مشرف
    requireInstructor();

    // نجلب الجلسات مع عدد الحاضرين في كل جلسة
    // LEFT JOIN: يدمج جدول sessions مع attendance
    // LEFT يعني أرجع كل الجلسات حتى لو ما فيها حضور
    // COUNT(a.id): يعد عدد سجلات الحضور لكل جلسة
    // GROUP BY s.id: نجمّع النتائج لكل جلسة
    // ORDER BY s.created_at DESC: الأحدث أولاً
    $rows = $db->query('
        SELECT s.id, s.session_date, s.is_active, s.token_expiry,
               COUNT(a.id) AS attended_count
        FROM sessions s
        LEFT JOIN attendance a ON a.session_id = s.id
        GROUP BY s.id
        ORDER BY s.created_at DESC
    ')->fetchAll();

    // نرسل قائمة الجلسات
    success($rows);
}

// ============================================================
// POST action=start: بدء جلسة حضور جديدة
// ============================================================
if ($method === 'POST' && $action === 'start') {
    // نتحقق أن الطالب مشرف ونحفظ بياناته
    $auth = requireInstructor();

    // ننشئ توكن فريد للباركود بثلاثة أجزاء:
    // SAS: بادئة ثابتة تعرّف النظام
    // time(): الوقت الحالي بالثواني (Unix Timestamp) — يضمن التفرد
    // strtoupper: نحول لأحرف كبيرة
    // bin2hex: نحول bytes لنص هيكساديسيمال (0-9 و a-f)
    // random_bytes(3): 3 bytes عشوائية آمنة تشفيرياً = 6 أحرف hex
    // النتيجة مثل: SAS-1734567890-A3F7KP
    $token = 'SAS-' . time() . '-' . strtoupper(bin2hex(random_bytes(3)));

    // نحدد وقت انتهاء صلاحية التوكن: الآن + 30 ثانية
    // date('Y-m-d H:i:s'): تصيغة التاريخ والوقت لقاعدة البيانات
    $expiry = date('Y-m-d H:i:s', time() + 30);

    // نحفظ الجلسة الجديدة في قاعدة البيانات
    // CURDATE(): دالة MySQL ترجع تاريخ اليوم تلقائياً
    $db->prepare('INSERT INTO sessions (instructor_id, session_date, token, token_expiry, is_active) VALUES (?,CURDATE(),?,?,1)')
       ->execute([
           $auth['id'], // id المشرف من التوكن JWT
           $token,      // التوكن الذي أنشأناه
           $expiry,     // وقت انتهاء الصلاحية
           // 1 = الجلسة نشطة (is_active=1)
       ]);

    // نرسل id الجلسة الجديدة والتوكن للفرونت إند
    // lastInsertId(): يُرجع الـ id الذي أُعطي للسجل الجديد تلقائياً
    success([
        'session_id' => $db->lastInsertId(),
        'token'      => $token,
        'expiry'     => $expiry,
    ], 'تم بدء الجلسة');
}

// ============================================================
// POST action=refresh_token: تجديد توكن الباركود (كل 30 ثانية)
// ============================================================
if ($method === 'POST' && $action === 'refresh_token') {
    // نتحقق أن المستخدم مشرف
    requireInstructor();

    // نقرأ id الجلسة من جسم الطلب
    $d = input();

    // (int) يتأكد أن القيمة رقم صحيح وليس نصاً
    // ?? 0 يعني لو غير موجود استخدم 0
    $sessionId = (int)($d['session_id'] ?? 0);

    // ننشئ توكن جديد بنفس طريقة السابق
    $token  = 'SAS-' . time() . '-' . strtoupper(bin2hex(random_bytes(3)));

    // وقت انتهاء صلاحية جديد: الآن + 30 ثانية
    $expiry = date('Y-m-d H:i:s', time() + 30);

    // نُحدّث التوكن ووقت الانتهاء في قاعدة البيانات
    // AND is_active=1: نتأكد أن الجلسة لا تزال مفتوحة
    $db->prepare('UPDATE sessions SET token=?, token_expiry=? WHERE id=? AND is_active=1')
       ->execute([$token, $expiry, $sessionId]);

    // نرسل التوكن الجديد للفرونت إند ليرسم الباركود الجديد
    success(['token' => $token, 'expiry' => $expiry]);
}

// ============================================================
// POST action=end: إنهاء الجلسة وتسجيل الغيابات تلقائياً
// ============================================================
if ($method === 'POST' && $action === 'end') {
    requireInstructor();
    $d = input();
    $sessionId = (int)($d['session_id'] ?? 0);

    // نتحقق أن id الجلسة مُرسَل
    if (!$sessionId) fail('معرف الجلسة مطلوب');

    // الخطوة 1: نغلق الجلسة بتغيير is_active لـ 0
    $db->prepare('UPDATE sessions SET is_active=0 WHERE id=?')
       ->execute([$sessionId]);

    // الخطوة 2: نجلب قائمة من سجّل حضوره في هذه الجلسة
    $attended = $db->prepare('SELECT student_id FROM attendance WHERE session_id=?');
    $attended->execute([$sessionId]);

    // fetchAll() يجلب كل الصفوف كمصفوفة من المصفوفات
    // array_column: تستخرج عمود student_id فقط من كل الصفوف
    // النتيجة: [2, 5, 8, 11] — قائمة بأرقام الحاضرين
    $attendedIds = array_column($attended->fetchAll(), 'student_id');

    // الخطوة 3: نجلب كل الطلاب
    $allStudents = $db->query('SELECT id FROM students')->fetchAll();

    // الخطوة 4: نمر على كل الطلاب ونتحقق من غياب كل واحد
    foreach ($allStudents as $stu) {
        // in_array: يتحقق إذا كان id الطالب موجوداً في قائمة الحاضرين
        // ! يعكس النتيجة: لو غير موجود = غاب
        if (!in_array($stu['id'], $attendedIds)) {
            // هذا الطالب غاب — نزيد غياباته بـ 1 ونتحقق من الحرمان
            $db->prepare('
                UPDATE students
                SET
                    -- absences + 1: نزيد عداد الغيابات بـ 1
                    absences = absences + 1,

                    -- IF(شرط, قيمة_لو_صح, قيمة_لو_خطأ)
                    -- لو الغيابات بعد الزيادة تجاوزت 6، اجعل is_banned=1
                    -- وإلا اجعله 0 (غير محروم)
                    is_banned = IF(absences + 1 > 6, 1, 0)
                WHERE id=?
            ')->execute([$stu['id']]);
        }
    }

    // نرسل تأكيد النجاح
    success(null, 'تم إنهاء الجلسة وتسجيل الغيابات');
}

// ============================================================
// POST action=scan: الطالب يمسح الباركود لتسجيل حضوره
// ============================================================
if ($method === 'POST' && $action === 'scan') {
    // requireAuth يتحقق أن المستخدم مسجل دخول (طالب أو مشرف)
    $auth = requireAuth();

    // نقرأ البيانات المُرسَلة: التوكن وموقع GPS
    $d = input();

    // trim: نحذف أي مسافات زائدة من التوكن
    $token = trim($d['token'] ?? '');

    // (float) نحول للرقم العشري — GPS يحتاج أرقاماً دقيقة
    $lat = (float)($d['lat'] ?? 0); // خط عرض الطالب
    $lng = (float)($d['lng'] ?? 0); // خط طول الطالب

    // ── خطوة 1: التحقق من موقع GPS ───────────────────────

    // نجلب إعدادات الموقع من قاعدة البيانات (موقع الجامعة + النطاق)
    $settings = $db->query('SELECT gps_lat, gps_lng, gps_radius FROM settings WHERE id=1')->fetch();

    // نتحقق فقط لو تم إعداد موقع الجامعة
    if ($settings['gps_lat'] && $settings['gps_lng']) {
        // نحسب المسافة بين الطالب والجامعة بمعادلة Haversine
        $dist = distance($lat, $lng, (float)$settings['gps_lat'], (float)$settings['gps_lng']);

        // لو المسافة أكبر من النطاق المسموح، نرفض التسجيل
        if ($dist > $settings['gps_radius'])
            fail("أنت خارج نطاق الجامعة ({$dist}م) — يجب أن تكون ضمن {$settings['gps_radius']}م");
    }

    // ── خطوة 2: التحقق من صلاحية التوكن ──────────────────

    // نبحث عن الجلسة التي لها هذا التوكن بشروط ثلاثة:
    // token=?: التوكن يطابق ما مسحه الطالب
    // is_active=1: الجلسة لا تزال مفتوحة
    // token_expiry > NOW(): التوكن لم تنتهِ صلاحيته (لم تمضِ 30 ثانية)
    $session = $db->prepare('SELECT * FROM sessions WHERE token=? AND is_active=1 AND token_expiry > NOW()');
    $session->execute([$token]);
    $sess = $session->fetch();

    // لو لم نجد جلسة مطابقة = التوكن غير صالح أو انتهى
    if (!$sess) fail('الباركود غير صالح أو منتهي الصلاحية');

    // ── خطوة 3: التحقق من وجود الطالب ────────────────────

    // نبحث عن الطالب بالرقم الجامعي المحفوظ في التوكن JWT
    $studentRow = $db->prepare('SELECT id FROM students WHERE student_id=?');
    $studentRow->execute([$auth['student_id']]);
    $stu = $studentRow->fetch();

    // لو الطالب غير موجود في قاعدة البيانات
    if (!$stu) fail('الطالب غير موجود');

    // ── خطوة 4: تسجيل الحضور ─────────────────────────────
    try {
        // نُضيف سجل حضور جديد
        // UNIQUE KEY في قاعدة البيانات يمنع تكرار نفس الطالب في نفس الجلسة
        $db->prepare('INSERT INTO attendance (session_id, student_id, scan_method) VALUES (?,?,?)')
           ->execute([
               $sess['id'], // id الجلسة من قاعدة البيانات
               $stu['id'],  // id الطالب الداخلي
               'barcode',   // طريقة التسجيل: مسح ذاتي
           ]);

        // تم التسجيل بنجاح
        success(null, 'تم تسجيل حضورك بنجاح ✅');

    } catch (PDOException $e) {
        // PDOException تُطلق عند خطأ في قاعدة البيانات
        // UNIQUE KEY رفض الإدخال يعني الطالب سجّل مسبقاً
        fail('تم تسجيل حضورك مسبقاً لهذه الجلسة');
    }
}

// ============================================================
// POST action=manual: المشرف يسجل حضور طالب يدوياً
// ============================================================
if ($method === 'POST' && $action === 'manual') {
    // هذا للمشرف فقط
    requireInstructor();
    $d = input();

    // نقرأ id الجلسة والرقم الجامعي للطالب
    $sessionId  = (int)($d['session_id'] ?? 0);
    $studentSid = trim($d['student_id'] ?? '');

    // نبحث عن الطالب بالرقم الجامعي
    $stu = $db->prepare('SELECT id, full_name FROM students WHERE student_id=?');
    $stu->execute([$studentSid]);
    $student = $stu->fetch();

    // لو الرقم الجامعي غير موجود
    if (!$student) fail('الرقم الجامعي غير موجود');

    try {
        // نُضيف سجل حضور يدوي
        // 'manual' بدل 'barcode' لتمييز طريقة التسجيل في التقارير
        $db->prepare('INSERT INTO attendance (session_id, student_id, scan_method) VALUES (?,?,?)')
           ->execute([$sessionId, $student['id'], 'manual']);

        // نُرجع اسم الطالب للفرونت ليعرضه في قائمة الحاضرين
        success(['name' => $student['full_name']], 'تم تسجيل الحضور');

    } catch (PDOException $e) {
        // الطالب سجّل مسبقاً في هذه الجلسة
        fail('مسجّل مسبقاً');
    }
}

// لو وصلنا هنا يعني الطلب لا يطابق أي حالة
// 405 = Method Not Allowed
fail('إجراء غير معروف', 405);
