CREATE TABLE settings (
    -- العمود id: رقم ثابت قيمته 1 دائماً، وهو المفتاح الرئيسي
    -- PRIMARY KEY يعني لا يمكن تكرار هذه القيمة
    -- DEFAULT 1 يعني قيمته الافتراضية 1 بدون حاجة لتحديدها
    id            INT          PRIMARY KEY DEFAULT 1,

    -- اسم الجامعة، نص بحد أقصى 200 حرف، لا يمكن تركه فارغاً
    uni_name      VARCHAR(200) NOT NULL DEFAULT '',

    -- اسم القسم أو الكلية
    uni_dept      VARCHAR(200) NOT NULL DEFAULT '',

    -- السنة الدراسية مثل 2024/2025، بحد أقصى 20 حرف
    academic_year VARCHAR(20)  NOT NULL DEFAULT '',

    -- خط العرض للموقع الجغرافي للجامعة
    -- DECIMAL(10,7): رقم عشري، إجمالي 10 أرقام منها 7 بعد الفاصلة
    -- نحتاج هذه الدقة لأن GPS يحتاج أرقاماً دقيقة مثل 31.9539753
    -- DEFAULT NULL يعني ممكن يكون فارغاً لو لم يُحدد الموقع
    gps_lat       DECIMAL(10,7)         DEFAULT NULL,

    -- خط الطول للموقع الجغرافي
    gps_lng       DECIMAL(10,7)         DEFAULT NULL,

    -- نطاق الموقع المسموح به بالمتر، افتراضياً 200 متر
    gps_radius    INT          NOT NULL DEFAULT 200,

    -- هل تم إعداد النظام أم لا؟
    -- TINYINT(1) يُستخدم كـ Boolean: 0 = لا، 1 = نعم
    -- 0 يعني النظام لم يُعدّ بعد وسيُظهر شاشة الإعداد
    is_setup      TINYINT(1)   NOT NULL DEFAULT 0,

    -- تاريخ ووقت إنشاء السجل يُحفظ تلقائياً
    created_at    TIMESTAMP    DEFAULT CURRENT_TIMESTAMP
);

-- أدخل الصف الوحيد في جدول settings مع is_setup = 0
-- ON DUPLICATE KEY UPDATE: لو الصف موجود مسبقاً لا تضف جديداً، فقط تجاهل
INSERT INTO settings (id, is_setup) VALUES (1, 0)
  ON DUPLICATE KEY UPDATE id = 1;

-- ============================================================
-- جدول instructors: المشرفون الذين يفتحون جلسات الحضور
-- ============================================================
CREATE TABLE instructors (
    -- رقم تعريفي تلقائي يزيد بـ 1 مع كل مشرف جديد (1, 2, 3...)
    -- AUTO_INCREMENT: MySQL يضيف الرقم تلقائياً بدون حاجة لتحديده
    id          INT          AUTO_INCREMENT PRIMARY KEY,

    -- الاسم الكامل للمشرف
    full_name   VARCHAR(150) NOT NULL,

    -- اسم المستخدم للدخول مثل dr.sara
    -- UNIQUE يعني لا يمكن تكرار نفس اسم المستخدم لمشرفين مختلفين
    username    VARCHAR(60)  NOT NULL UNIQUE,

    -- كلمة المرور المشفرة بـ bcrypt
    -- VARCHAR(255) لأن bcrypt ينتج نصاً طويلاً حوالي 60 حرف
    password    VARCHAR(255) NOT NULL,

    -- هل يجب تغيير الباسوورد عند الدخول القادم؟
    -- 0 = لا (افتراضي للمشرف)، 1 = نعم
    must_change TINYINT(1)   NOT NULL DEFAULT 0,

    -- وقت إضافة المشرف يُحفظ تلقائياً
    created_at  TIMESTAMP    DEFAULT CURRENT_TIMESTAMP
);

-- ============================================================
-- جدول students: الطلاب المسجلون في النظام
-- ============================================================
CREATE TABLE students (
    -- رقم داخلي تلقائي يستخدمه النظام في العلاقات بين الجداول
    id          INT          AUTO_INCREMENT PRIMARY KEY,

    -- الرقم الجامعي الحقيقي مثل 2020901164
    -- UNIQUE يمنع تسجيل نفس الرقم الجامعي لطالبين مختلفين
    student_id  VARCHAR(30)  NOT NULL UNIQUE,

    -- الاسم الكامل للطالب
    full_name   VARCHAR(150) NOT NULL,

    -- كلمة المرور المشفرة، في البداية = الرقم الجامعي مشفراً
    password    VARCHAR(255) NOT NULL,

    -- هل يجب على الطالب تغيير باسووردة؟
    -- 1 = نعم (افتراضي) لأن باسوورده الأولي هو رقمه الجامعي
    -- بعد تغييره يصبح 0
    must_change TINYINT(1)   NOT NULL DEFAULT 1,

    -- عدد الغيابات، يبدأ من 0 ويزيد تلقائياً
    absences    INT          NOT NULL DEFAULT 0,

    -- هل الطالب محروم من الامتحانات؟
    -- 0 = لا (افتراضي)، 1 = نعم (يُصبح 1 تلقائياً عند تجاوز 6 غيابات)
    is_banned   TINYINT(1)   NOT NULL DEFAULT 0,

    -- وقت تسجيل الطالب يُحفظ تلقائياً
    created_at  TIMESTAMP    DEFAULT CURRENT_TIMESTAMP
);

-- ============================================================
-- جدول sessions: كل جلسة حضور يفتحها المشرف
-- ============================================================
CREATE TABLE sessions (
    -- رقم الجلسة التلقائي
    id            INT         AUTO_INCREMENT PRIMARY KEY,

    -- رقم المشرف الذي فتح هذه الجلسة (مرتبط بجدول instructors)
    instructor_id INT         NOT NULL,

    -- تاريخ الجلسة بصيغة YYYY-MM-DD مثل 2024-12-15
    -- DATE يحفظ التاريخ فقط بدون الوقت
    session_date  DATE        NOT NULL,

    -- التوكن الحالي للباركود مثل SAS-1734567890-A3F7KP
    token         VARCHAR(60) NOT NULL,

    -- تاريخ ووقت انتهاء صلاحية التوكن
    -- DATETIME يحفظ التاريخ والوقت معاً
    -- بعد هذا الوقت لا يقبل السيرفر هذا التوكن
    token_expiry  DATETIME    NOT NULL,

    -- هل الجلسة لا تزال مفتوحة؟
    -- 1 = مفتوحة (افتراضي)، 0 = انتهت
    is_active     TINYINT(1)  NOT NULL DEFAULT 1,

    -- وقت إنشاء الجلسة
    created_at    TIMESTAMP   DEFAULT CURRENT_TIMESTAMP,

    -- علاقة: instructor_id مرتبط بحقل id في جدول instructors
    -- ON DELETE CASCADE: لو حُذف المشرف تُحذف كل جلساته تلقائياً
    FOREIGN KEY (instructor_id) REFERENCES instructors(id) ON DELETE CASCADE
);

-- ============================================================
-- جدول attendance: سجل حضور الطلاب في كل جلسة
-- ============================================================
CREATE TABLE attendance (
    -- رقم السجل التلقائي
    id          INT       AUTO_INCREMENT PRIMARY KEY,

    -- رقم الجلسة التي سُجّل فيها هذا الحضور
    session_id  INT       NOT NULL,

    -- رقم الطالب الذي سُجّل حضوره (id الداخلي وليس student_id)
    student_id  INT       NOT NULL,

    -- وقت تسجيل الحضور يُحفظ تلقائياً بالثانية
    scan_time   TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

    -- طريقة التسجيل: barcode = مسح ذاتي، manual = المشرف سجّله يدوياً
    -- ENUM يعني القيمة لازم تكون واحدة من هذه الخيارات فقط
    scan_method ENUM('barcode','manual') NOT NULL DEFAULT 'barcode',

    -- هذا السطر هو الحماية الأساسية ضد الغش!
    -- يمنع تسجيل نفس الطالب في نفس الجلسة أكثر من مرة
    -- حتى لو حاول الطالب المسح 10 مرات، سيُرفض من الثانية
    UNIQUE KEY unique_att (session_id, student_id),

    -- علاقة: لو حُذفت الجلسة تُحذف كل سجلات حضورها
    FOREIGN KEY (session_id) REFERENCES sessions(id)  ON DELETE CASCADE,

    -- علاقة: لو حُذف الطالب تُحذف كل سجلات حضوره
    FOREIGN KEY (student_id) REFERENCES students(id)  ON DELETE CASCADE
);

-- فهرس لتسريع البحث عن الجلسات النشطة (is_active=1)
-- الفهرس يعمل كفهرس الكتاب: يسرّع البحث بدل المرور على كل الصفوف
CREATE INDEX idx_sessions_active    ON sessions(is_active);

-- فهرس لتسريع البحث عن سجلات حضور جلسة معينة
CREATE INDEX idx_attendance_session ON attendance(session_id);
