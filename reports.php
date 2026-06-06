<?php
// ============================================================
// ملف التقارير
// GET /reports.php?type=summary  → ملخص الغيابات لكل الطلاب
// GET /reports.php?type=session  → تفاصيل جلسة معينة (حاضرون + غائبون)
// ============================================================

require_once __DIR__ . '/../includes/helpers.php';
setHeaders();

// التقارير للمشرف فقط
requireInstructor();

$db = getDB();

// نقرأ نوع التقرير من الرابط: ?type=summary أو ?type=session
// الافتراضي 'summary' لو لم يُحدد
$type = $_GET['type'] ?? 'summary';

// ── ملخص الغيابات لكل الطلاب ─────────────────────────────
if ($type === 'summary') {
    // نجلب كل الطلاب مرتبين أبجدياً
    $students = $db->query(
        'SELECT student_id, full_name, absences, is_banned FROM students ORDER BY full_name'
    )->fetchAll();

    // count($students): يحسب إجمالي عدد الطلاب
    $total = count($students);

    // array_filter: تُصفّي المصفوفة وتُرجع العناصر التي يُعيد لها الـ callback true
    // fn($s) => ... : Arrow Function مختصرة
    // $s['is_banned']: يُرجع true لو قيمته 1

    // عدد المحرومين
    $banned = count(array_filter($students, fn($s) => $s['is_banned']));

    // عدد في منطقة الخطر (4+ غيابات وليس محروماً بعد)
    $danger = count(array_filter($students, fn($s) => !$s['is_banned'] && $s['absences'] >= 4));

    // عدد في التحذير (2-3 غيابات)
    $warn   = count(array_filter($students, fn($s) => !$s['is_banned'] && $s['absences'] >= 2 && $s['absences'] < 4));

    // عدد الآمنين (0-1 غياب)
    $safe   = count(array_filter($students, fn($s) => !$s['is_banned'] && $s['absences'] < 2));

    // compact: ينشئ مصفوفة من المتغيرات بنفس أسمائها
    // compact('total','banned') = ['total'=>$total, 'banned'=>$banned]
    success([
        'stats'    => compact('total', 'banned', 'danger', 'warn', 'safe'),
        'students' => $students,
    ]);
}

// ── تفاصيل جلسة معينة ────────────────────────────────────
if ($type === 'session') {
    // نقرأ id الجلسة من الرابط: ?type=session&session_id=5
    $sid = (int)($_GET['session_id'] ?? 0);
    if (!$sid) fail('معرف الجلسة مطلوب');

    // نجلب الحاضرين في هذه الجلسة مع اسم كل طالب ووقت مسحه
    // JOIN: يدمج جدولين — attendance مع students
    // ON s.id = a.student_id: شرط الربط
    // ORDER BY a.scan_time: مرتب بالوقت من الأقدم للأحدث
    $present = $db->prepare('
        SELECT s.student_id, s.full_name, a.scan_time, a.scan_method
        FROM attendance a
        JOIN students s ON s.id = a.student_id
        WHERE a.session_id = ?
        ORDER BY a.scan_time
    ');
    $present->execute([$sid]);

    // نجلب الغائبين: الطلاب الذين id غير موجود في attendance لهذه الجلسة
    // NOT IN (SELECT ...): Subquery — يُرجع الطلاب الغائبين
    $absent = $db->prepare('
        SELECT s.student_id, s.full_name, s.absences
        FROM students s
        WHERE s.id NOT IN (
            SELECT student_id FROM attendance WHERE session_id=?
        )
        ORDER BY s.full_name
    ');
    $absent->execute([$sid]);

    // نرسل قائمتين: الحاضرون والغائبون
    success(['present' => $present->fetchAll(), 'absent' => $absent->fetchAll()]);
}

fail('نوع التقرير غير معروف');
