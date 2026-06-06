'use strict';
// 'use strict': وضع صارم في JavaScript يمنع الأخطاء الشائعة
// مثلاً: لا يسمح باستخدام متغير بدون تعريفه بـ let أو const أو var

// ============================================================
// app.js — المنطق الأساسي للتطبيق
// هذا الملف يُحمَّل أولاً لأن instructor.js و student.js
// يعتمدان على الدوال المُعرَّفة هنا
// ============================================================

// عنوان مجلد الـ API على السيرفر (مسار نسبي من مجلد frontend)
const API = '../backend/api';

// ============================================================
// متغيرات الحالة (State) — تُخزّن بيانات التطبيق في الذاكرة
// ============================================================

// authToken: التوكن JWT المحفوظ — يُرسَل مع كل طلب للـ API
// localStorage.getItem: يقرأ قيمة محفوظة في متصفح المستخدم
// || null: لو لم يجد قيمة، استخدم null بدل undefined
let authToken   = localStorage.getItem('sas_token') || null;

// currentUser: بيانات المستخدم الحالي (name, role, student_id...)
// JSON.parse: يحول النص المحفوظ في localStorage لـ object
// || 'null': لو فارغ، حوّل النص 'null' لـ null بدون خطأ
let currentUser = JSON.parse(localStorage.getItem('sas_user') || 'null');

// todayAttended: قائمة من سجّل حضوره في الجلسة الحالية (للعرض فقط)
let todayAttended = [];

// currentSessionId: id الجلسة المفتوحة حالياً (null لو لا توجد جلسة)
let currentSessionId = null;

// bcToken: التوكن الحالي للباركود مثل SAS-1734567890-A3F7KP
let bcToken     = '';

// bcInterval: مرجع لعداد setInterval — نحتاجه لإيقافه لاحقاً
let bcInterval  = null;

// bcSec: عداد الثواني المتبقية للتجديد (يبدأ من 30)
let bcSec       = 30;

// camStream: مجرى الكاميرا — نحتاجه لإيقاف الكاميرا لاحقاً
let camStream   = null;

// camRAF: مرجع requestAnimationFrame — لإيقاف دورة المسح
let camRAF      = null;

// delCallback: الدالة التي تُنفَّذ عند تأكيد الحذف في نافذة التأكيد
let delCallback = null;

// _modalOk: الدالة التي تُنفَّذ عند الضغط OK في النافذة المنبثقة
let _modalOk    = null;

// cpType: نوع المستخدم عند تغيير الباسوورد ('student' أو 'instructor')
let cpType      = '';

// ============================================================
// دوال مساعدة للـ DOM (عناصر الصفحة)
// ============================================================

// g(id): اختصار لـ document.getElementById — يجلب عنصر HTML بـ id
const g = id => document.getElementById(id);

// gv(id): يجلب قيمة input بـ id بعد حذف المسافات
// .value: قيمة حقل الإدخال
// .trim(): يحذف المسافات من البداية والنهاية
const gv = id => g(id).value.trim();

// html(content): يضع محتوى HTML في منطقة المحتوى الرئيسية
// mainContent: هو الـ div الذي تظهر فيه كل الصفحات
// innerHTML: يضع HTML داخل العنصر (يُفسَّر كـ HTML وليس نصاً)
const html = content => g('mainContent').innerHTML = content;

// ============================================================
// دالة show(id): تُظهر شاشة واحدة وتُخفي الباقي
// ============================================================
function show(id) {
    // مصفوفة بأسماء id لكل الشاشات الأربع في index.html
    ['setupScreen', 'loginScreen', 'changePassScreen', 'appScreen']
    .forEach(s => {
        // forEach: تمر على كل عنصر في المصفوفة
        // s: اسم الشاشة في هذه الدورة

        // classList.toggle(class, condition):
        // لو condition = true: أضف الكلاس
        // لو condition = false: احذف الكلاس
        // s === id: يُرجع true فقط للشاشة المطلوبة
        g(s).classList.toggle('active', s === id);
        // CSS: .screen { display:none } و .screen.active { display:block }
    });
}

// ============================================================
// دالة api(): ترسل طلب HTTP للسيرفر وتُرجع الرد
// async: الدالة غير متزامنة — لا توقف باقي الكود أثناء الانتظار
// ============================================================
async function api(endpoint, method = 'GET', body = null) {
    // method = 'GET': قيمة افتراضية — لو لم تُحدد استخدم GET
    // body = null: قيمة افتراضية — لو لم تُرسَل بيانات

    // opts: خيارات الطلب HTTP
    const opts = {
        method, // نوع الطلب (GET, POST, PUT, DELETE)
        headers: {
            // نُخبر السيرفر أن البيانات بصيغة JSON
            'Content-Type': 'application/json'
        },
    };

    // لو عندنا توكن JWT، نضيفه لكل الطلبات
    // Authorization header: المعيار القياسي لإرسال JWT
    // 'Bearer ' + authToken: يُرسَل هكذا: "Bearer eyJhbGci..."
    if (authToken) opts.headers['Authorization'] = 'Bearer ' + authToken;

    // لو عندنا بيانات للإرسال (POST, PUT)
    // JSON.stringify: يحول الـ object لنص JSON للإرسال
    if (body) opts.body = JSON.stringify(body);

    try {
        // fetch: دالة مدمجة في المتصفح لإرسال طلبات HTTP
        // await: انتظر حتى يصل الرد من السيرفر
        // API + '/' + endpoint: يبني الرابط الكامل
        const res  = await fetch(`${API}/${endpoint}`, opts);

        // .json(): يحول نص الرد لـ object JavaScript
        // await: انتظر حتى يكتمل التحويل
        const data = await res.json();

        // أرجع البيانات للدالة التي استدعت api()
        return data;
    } catch (e) {
        // catch: يلتقط أي خطأ (انقطاع الشبكة، خطأ في السيرفر...)
        // نُرجع object بنفس شكل ردود الـ API لمعالجة موحدة
        return { success: false, message: 'خطأ في الاتصال بالسيرفر' };
    }
}

// ============================================================
// دوال التنبيهات (Alerts)
// ============================================================

// showAlert(id, msg, type): يُظهر رسالة تنبيه في عنصر معين
// type: 'err' للأحمر (افتراضي) أو 'ok' للأخضر أو 'info' للأزرق
function showAlert(id, msg, type = 'err') {
    const el = g(id);
    // className: يُعيّن كلاسات الـ CSS (يحذف القديمة ويضع الجديدة)
    el.className = `alert alert-${type}`;
    // textContent: يضع نصاً في العنصر (أأمن من innerHTML لأنه لا يُفسّر HTML)
    el.textContent = msg;
    // style.display: يُظهر العنصر (كان مخفياً بـ display:none)
    el.style.display = 'block';
}

// hideAlert(id): يُخفي رسالة التنبيه
function hideAlert(id) { g(id).style.display = 'none'; }

// _toastT: مرجع لـ setTimeout — لإلغائه لو جاء toast جديد
let _toastT;

// toast(msg): يُظهر رسالة مؤقتة تختفي بعد 3 ثوانٍ (Toast Notification)
function toast(msg) {
    // نبحث عن عنصر الـ toast إذا كان موجوداً مسبقاً
    let t = g('_toast');

    // لو لم يُنشأ بعد، نُنشئه ديناميكياً
    if (!t) {
        t = document.createElement('div'); // ننشئ div جديد
        t.id = '_toast'; // نُعطيه id

        // cssText: نضع كل الـ CSS في سطر واحد
        // position:fixed: يبقى ثابتاً حتى عند التمرير
        // bottom:20px: 20 بكسل من الأسفل
        // left:50%; transform:translateX(-50%): يُوسّطه أفقياً
        // z-index:9999: يظهر فوق كل العناصر الأخرى
        t.style.cssText = 'position:fixed;bottom:20px;left:50%;transform:translateX(-50%);background:#1c2333;color:#e6edf3;padding:10px 20px;border-radius:9px;border:1px solid #30363d;font-family:var(--font);font-size:13px;z-index:9999;transition:opacity .3s;white-space:nowrap;box-shadow:0 8px 24px rgba(0,0,0,.4)';

        // نضيف عنصر الـ toast لنهاية الصفحة
        document.body.appendChild(t);
    }

    t.textContent = msg; // نضع نص الرسالة
    t.style.opacity = '1'; // نُظهره (opacity=1 يعني ظاهر كلياً)

    // لو هناك timer قديم، نلغيه لمنع الاختفاء المبكر
    if (_toastT) clearTimeout(_toastT);

    // بعد 3000 ميلي ثانية (3 ثوانٍ)، نُخفي الـ toast
    // opacity:0 مع transition:opacity .3s = اختفاء تدريجي
    _toastT = setTimeout(() => t.style.opacity = '0', 3000);
}

// ============================================================
// دالة boot(): نقطة البداية — تُستدعى عند تحميل الصفحة
// ============================================================
async function boot() {
    // نسأل السيرفر عن إعدادات النظام وحالة الإعداد
    const settings = await api('settings.php');

    // لو فشل الطلب أو النظام لم يُعدّ بعد (is_setup = 0)
    if (!settings.success || !settings.data.is_setup) {
        show('setupScreen'); // أظهر شاشة الإعداد الأولي
        return; // أوقف تنفيذ boot هنا
    }

    // نضع اسم الجامعة في عنوان شاشة الدخول
    // || 'نظام الحضور الذكي': لو فارغ استخدم الاسم الافتراضي
    g('loginTitle').textContent = settings.data.uni_name || 'نظام الحضور الذكي';
    g('loginSub').textContent   = settings.data.uni_dept  || '';

    // تلميح للمستخدم: كيف يدخل؟
    // innerHTML لأن فيه <br> يحتاج تفسيراً كـ HTML
    g('loginHint').innerHTML = '🔑 الطالب: الرقم الجامعي + رقمه كباسوورد<br>👨‍🏫 المشرف: اسم المستخدم وكلمة المرور';

    // لو عندنا توكن وبيانات مستخدم محفوظة من جلسة سابقة
    if (authToken && currentUser) {
        launchApp(); // اذهب مباشرة للتطبيق بدون تسجيل دخول
    } else {
        show('loginScreen'); // أظهر شاشة تسجيل الدخول
    }
}

// ============================================================
// معالج إعداد النظام (Setup Wizard — 3 خطوات)
// ============================================================

// SD: كائن يخزّن بيانات خطوات الإعداد مؤقتاً
let SD = {};

// sNext(step): للانتقال للخطوة التالية بعد التحقق
// window.sNext: نضعها على window لأن HTML يستدعيها بـ onclick
window.sNext = async function(step) {
    if (step === 1) {
        // نقرأ اسم الجامعة من حقل الإدخال
        const uni = gv('s_uni');

        // لو الحقل فارغ، أظهر رسالة خطأ وأوقف
        if (!uni) { showAlert('s1err', 'اسم الجامعة مطلوب'); return; }

        // نحفظ بيانات الخطوة الأولى في SD مؤقتاً
        SD.uni  = uni;
        SD.dept = gv('s_dept');  // القسم (اختياري)
        SD.year = gv('s_year');  // السنة الدراسية (اختياري)

        hideAlert('s1err'); // نحذف أي رسالة خطأ سابقة
        goStep(2);          // ننتقل للخطوة الثانية
    }
    else if (step === 2) {
        // نقرأ إحداثيات الموقع ونحولها لأرقام عشرية
        const lat = parseFloat(g('s_lat').value);
        const lng = parseFloat(g('s_lng').value);

        // isNaN: يتحقق إذا كانت القيمة "ليست رقماً" (Not a Number)
        if (isNaN(lat) || isNaN(lng)) {
            showAlert('s2err', 'يرجى تحديد الموقع الجغرافي');
            return;
        }

        SD.lat    = lat;
        SD.lng    = lng;

        // parseInt: يحول للرقم الصحيح (بدون كسور)
        // || 200: لو فارغ أو غير صالح استخدم 200
        SD.radius = parseInt(g('s_radius').value) || 200;

        hideAlert('s2err');
        goStep(3); // ننتقل للخطوة الثالثة
    }
};

// sBack(step): للرجوع للخطوة السابقة
window.sBack = step => goStep(step - 1);

// goStep(n): تُعرض خطوة معينة وتُخفي الباقي وتُحدّث شريط التقدم
function goStep(n) {
    // [1,2,3]: مصفوفة أرقام الخطوات
    [1,2,3].forEach(i => {
        // نُظهر الخطوة المطلوبة ونُخفي الباقي
        g('sp'+i).style.display = i===n ? 'block' : 'none';

        // نُحدّث كلاس نقطة التقدم:
        // done: خطوة مكتملة (رقمها أصغر من الحالية)
        // active: الخطوة الحالية
        // بدون كلاس: خطوة لم تُكمَل بعد
        const nd = g('sn'+i);
        nd.className = 'step-node' + (i<n?' done' : i===n?' active' : '');

        // نُحدّث خط التقدم بين النقاط (إذا لم يكن الأخير)
        if (i<3) g('se'+i).className = 'step-edge' + (i<n?' done':'');
    });
}

// detectSetupGPS(): يطلب موقع GPS من المتصفح ويضعه في الحقول
window.detectSetupGPS = function() {
    // navigator.geolocation: واجهة المتصفح للوصول للـ GPS
    if (!navigator.geolocation) {
        showAlert('s2err', 'المتصفح لا يدعم GPS');
        return;
    }

    // نُظهر رسالة أثناء التحديد
    showAlert('s2err', '⏳ جاري تحديد الموقع...', 'info');

    // getCurrentPosition: يطلب الموقع من الجهاز
    // pos: كائن يحوي إحداثيات الموقع عند النجاح
    navigator.geolocation.getCurrentPosition(pos => {
        // toFixed(6): نحتفظ بـ 6 أرقام بعد الفاصلة للدقة
        g('s_lat').value = pos.coords.latitude.toFixed(6);
        g('s_lng').value = pos.coords.longitude.toFixed(6);
        hideAlert('s2err');
        updateLocBox(); // نُحدّث عرض الموقع المحدد
    }, () => {
        // الدالة الثانية: تُستدعى عند الفشل (رفض الصلاحية أو لا GPS)
        showAlert('s2err', 'تعذر تحديد الموقع. أدخل يدوياً.');
    });
};

// updateLocBox(): يُحدّث مربع عرض الموقع المحدد
window.updateLocBox = function() {
    // نقرأ القيم من الحقول ونحولها لأرقام
    const la = parseFloat(g('s_lat').value);
    const ln = parseFloat(g('s_lng').value);
    const box = g('locBox');

    // !isNaN: يتحقق أن الرقم صالح (ليس NaN)
    if (!isNaN(la) && !isNaN(ln)) {
        // نُغير الكلاس لـ 'set' لتغيير اللون للأخضر
        box.className = 'loc-box set';
        // نعرض الإحداثيات بـ 5 أرقام بعد الفاصلة
        box.textContent = `✅ ${la.toFixed(5)}, ${ln.toFixed(5)}`;
    }
};

// setupPassBar(): يُحدّث شريط قوة كلمة المرور في الإعداد
window.setupPassBar = function() {
    const v = g('s_pass').value; // نقرأ الباسوورد المُدخَل
    // نضع كلاس مختلف حسب الطول:
    // بدون كلاس: قصيرة جداً (أقل من 6)
    // 'm': متوسطة (6-8)
    // 's': قوية (9+)
    g('spbar').className = 'pbar' + (v.length<6 ? '' : v.length<9 ? ' m' : ' s');
};

// finishSetup(): يُرسل بيانات الإعداد للسيرفر
window.finishSetup = async function() {
    // نقرأ بيانات المشرف الأول من حقول الخطوة الثالثة
    const name  = gv('s_name');
    const uname = gv('s_user').toLowerCase(); // أحرف صغيرة
    const pass  = g('s_pass').value.trim();   // الباسوورد بدون مسافات
    const pass2 = g('s_pass2').value.trim();  // تأكيد الباسوورد

    // سلسلة من التحققات — أي فشل يوقف التنفيذ
    if (!name)            { showAlert('s3err', 'الاسم الكامل مطلوب'); return; }
    if (!uname)           { showAlert('s3err', 'اسم المستخدم مطلوب'); return; }
    // /\s/.test(uname): Regex تتحقق من وجود مسافات في اسم المستخدم
    if (/\s/.test(uname)) { showAlert('s3err', 'اسم المستخدم لا يحتوي مسافات'); return; }
    if (pass.length < 6)  { showAlert('s3err', 'كلمة المرور قصيرة جداً (6 أحرف على الأقل)'); return; }
    // نتحقق أن الباسوورد وتأكيده متطابقان
    if (pass !== pass2)   { showAlert('s3err', 'كلمتا المرور غير متطابقتين'); return; }
    if (!SD.uni)          { showAlert('s3err', 'يرجى العودة وإدخال بيانات الجامعة'); return; }

    // نُعطّل الزر ونُغير نصه أثناء الإرسال لمنع الضغط المتكرر
    const btn = g('setupBtn');
    btn.disabled = true;
    btn.textContent = '⏳ جاري الإعداد...';

    // نُرسل كل البيانات لـ setup.php
    const res = await api('setup.php', 'POST', {
        uni_name:       SD.uni,     // اسم الجامعة (من الخطوة 1)
        uni_dept:       SD.dept,    // القسم
        uni_year:       SD.year,    // السنة الدراسية
        gps_lat:        SD.lat,     // خط العرض (من الخطوة 2)
        gps_lng:        SD.lng,     // خط الطول
        gps_radius:     SD.radius,  // النطاق
        admin_name:     name,       // اسم المشرف الأول
        admin_username: uname,      // اسم مستخدمه
        admin_password: pass,       // باسووردة (يُشفَّر في السيرفر)
    });

    if (!res.success) {
        // لو فشل، نُظهر الخطأ ونُعيد تفعيل الزر
        showAlert('s3err', res.message);
        btn.disabled = false;
        btn.textContent = '🚀 تشغيل النظام';
        return;
    }

    // نجح الإعداد — نُظهر رسالة ونُعيد تشغيل boot
    toast('✅ تم إعداد النظام بنجاح!');
    boot(); // boot ستجد is_setup=1 وتنتقل لشاشة الدخول
};

// ============================================================
// شاشة تسجيل الدخول
// ============================================================

// setRole(r): يُغير نوع المستخدم (طالب أو مشرف) في شاشة الدخول
window.setRole = function(r) {
    // document.querySelectorAll: يجلب كل العناصر بكلاس 'tab'
    // forEach: يمر عليها جميعاً
    // classList.toggle: يضيف/يحذف كلاس 'active' حسب الشرط
    document.querySelectorAll('.tab').forEach((t, i) =>
        t.classList.toggle('active',
            (i===0 && r==='student') || (i===1 && r==='instructor')
        )
    );

    // نُظهر حقول الطالب أو المشرف حسب الاختيار
    g('studentFields').style.display    = r==='student'    ? 'block' : 'none';
    g('instructorFields').style.display = r==='instructor' ? 'block' : 'none';

    hideAlert('loginErr'); // نمسح أي خطأ سابق

    // نمسح حقول الإدخال
    ['l_sid', 'l_user', 'l_pass'].forEach(id => g(id).value = '');
};

// doLogin(): يُرسل بيانات الدخول للسيرفر
window.doLogin = async function() {
    const pass = g('l_pass').value; // نقرأ الباسوورد (بدون trim لأن الباسوورد قد يحوي مسافات)
    hideAlert('loginErr'); // نمسح أي خطأ سابق

    // نُحدد الدور بقراءة أي tab نشط
    // ?.textContent: Optional Chaining — لو null لا خطأ
    const role = document.querySelector('.tab.active')?.textContent.includes('طالب')
        ? 'student'
        : 'instructor';

    // نبني جسم الطلب حسب الدور
    const body = role === 'instructor'
        ? { role, username: gv('l_user'), password: pass }  // المشرف: username
        : { role, student_id: gv('l_sid'), password: pass }; // الطالب: student_id

    // نُرسل بيانات الدخول لـ auth.php
    const res = await api('auth.php?action=login', 'POST', body);

    if (!res.success) {
        // نُضيف تأثير اهتزاز للبطاقة عند الخطأ (تجربة مستخدم)
        g('loginScreen').querySelector('.auth-card').style.animation = 'shake .4s ease';
        // بعد 400ms نُزيل الـ animation لو أراد تكرارها
        setTimeout(() => g('loginScreen').querySelector('.auth-card').style.animation = '', 400);
        showAlert('loginErr', res.message);
        return;
    }

    // نجح الدخول — نحفظ التوكن وبيانات المستخدم
    authToken   = res.data.token;
    currentUser = res.data;

    // نحفظ في localStorage ليبقى حتى بعد إغلاق المتصفح
    localStorage.setItem('sas_token', authToken);
    // JSON.stringify: يحول الـ object لنص لحفظه
    localStorage.setItem('sas_user', JSON.stringify(currentUser));

    // لو يجب تغيير الباسوورد (must_change = true)، نُظهر شاشة التغيير
    if (res.data.must_change) { openCP(); return; }

    // وإلا انطلق للتطبيق مباشرة
    launchApp();
};

// ============================================================
// شاشة تغيير كلمة المرور (Change Password)
// ============================================================

// openCP(): تفتح شاشة تغيير الباسوورد
function openCP() {
    cpType = currentUser.role; // نحفظ الدور للاستخدام في التحقق

    // رسالة ترحيب مختلفة حسب الدور
    g('cpSub').textContent = cpType === 'student'
        ? `مرحباً ${currentUser.name}! كلمة المرور الافتراضية هي رقمك الجامعي.`
        : `مرحباً ${currentUser.name}! يرجى تغيير كلمة المرور المؤقتة.`;

    // نمسح حقول الإدخال
    ['cp1', 'cp2'].forEach(id => g(id).value = '');

    // نُعيد شريط القوة للبداية
    g('cpBarEl').className = 'pbar';

    hideAlert('cpErr');
    show('changePassScreen'); // نُظهر شاشة التغيير
}

// cpBar(): يُحدّث مؤشرات قوة الباسوورد أثناء الكتابة
window.cpBar = function() {
    const v   = g('cp1').value;
    // def: الباسوورد الافتراضي (رقم الطالب أو فارغ للمشرف)
    const def = cpType === 'student' ? (currentUser.student_id || '') : '';

    // قاعدة 1: طول 6 أحرف على الأقل
    g('cpr1').className   = 'prule' + (v.length >= 6 ? ' ok' : '');
    g('cpr1').textContent = (v.length >= 6 ? '✓' : '○') + ' 6 أحرف على الأقل';

    // قاعدة 2: مختلف عن الباسوورد الافتراضي
    g('cpr2').className   = 'prule' + (v !== def && v.length > 0 ? ' ok' : '');
    g('cpr2').textContent = (v !== def && v.length > 0 ? '✓' : '○') + ' مختلفة عن كلمة المرور الافتراضية';

    // شريط القوة المرئي
    g('cpBarEl').className = 'pbar' + (v.length<6 ? '' : v.length<9 ? ' m' : ' s');

    cpMatch(); // نتحقق من التطابق
};

// cpMatch(): يتحقق أن الباسوورد وتأكيده متطابقان
window.cpMatch = function() {
    const v1 = g('cp1').value; // الباسوورد الجديد
    const v2 = g('cp2').value; // التأكيد
    const msg = g('cpMatchMsg');

    if (!v2) { msg.textContent = ''; return; } // لو التأكيد فارغ، لا نُظهر شيء

    // نُغير اللون والرسالة حسب التطابق
    msg.style.color = v1 === v2 ? '#4ade80' : '#f87171'; // أخضر أو أحمر
    msg.textContent = v1 === v2 ? '✓ كلمتا المرور متطابقتان' : '✗ كلمتا المرور غير متطابقتين';
};

// submitCP(): يُرسل الباسوورد الجديد للسيرفر
window.submitCP = async function() {
    const v1  = g('cp1').value;
    const v2  = g('cp2').value;
    const def = cpType === 'student' ? (currentUser.student_id || '') : '';

    if (v1.length < 6) { showAlert('cpErr', 'كلمة المرور قصيرة جداً'); return; }
    // لا يُسمح بالباسوورد الافتراضي (رقم الطالب)
    if (v1 === def)    { showAlert('cpErr', 'لا يمكن استخدام كلمة المرور الافتراضية'); return; }
    if (v1 !== v2)     { showAlert('cpErr', 'كلمتا المرور غير متطابقتين'); return; }

    // نُرسل الباسوورد الجديد لـ auth.php
    const res = await api('auth.php?action=change_password', 'POST', { new_password: v1 });
    if (!res.success) { showAlert('cpErr', res.message); return; }

    // نُحدّث must_change في الذاكرة والـ localStorage
    currentUser.must_change = false;
    localStorage.setItem('sas_user', JSON.stringify(currentUser));

    toast('✅ تم تغيير كلمة المرور بنجاح!');
    launchApp(); // نُطلق التطبيق
};

// ============================================================
// تشغيل التطبيق الرئيسي
// ============================================================

// launchApp(): تُعدّ واجهة التطبيق وتُظهرها
function launchApp() {
    // نضع عنوان الموقع في الـ topbar
    g('topTitle').textContent = document.title;
    // نضع اسم المستخدم في الزاوية العلوية
    g('userPill').textContent = currentUser.name;

    buildSidebar(); // نبني القائمة الجانبية
    show('appScreen'); // نُظهر شاشة التطبيق

    // ننتقل للصفحة الافتراضية حسب الدور
    nav(currentUser.role === 'instructor' ? 'dashboard' : 'myAbsences');
}

// doLogout(): تسجيل الخروج
window.doLogout = function() {
    if (bcInterval) clearInterval(bcInterval); // نوقف عداد الباركود
    stopCam(); // نوقف الكاميرا

    // نمسح كل المتغيرات
    authToken = null;
    currentUser = null;
    todayAttended = [];
    currentSessionId = null;

    // نحذف التوكن وبيانات المستخدم من المتصفح
    localStorage.removeItem('sas_token');
    localStorage.removeItem('sas_user');

    show('loginScreen'); // نعود لشاشة الدخول
    setRole('student');  // نُعيد التبويب للطالب (الافتراضي)
};

// buildSidebar(): ينشئ القائمة الجانبية حسب دور المستخدم
function buildSidebar() {
    const isIns = currentUser.role === 'instructor'; // هل هو مشرف؟

    // قائمة روابط المشرف — أو الطالب
    const links = isIns ? [
        { sec: 'القائمة الرئيسية' }, // عنوان قسم (ليس رابطاً)
        { id: 'dashboard',   icon: '📊', label: 'لوحة التحكم' },
        { id: 'takeAtt',     icon: '📷', label: 'تسجيل الحضور' },
        { sec: 'السجلات' },
        { id: 'students',    icon: '👥', label: 'الطلاب' },
        { id: 'sessions',    icon: '📅', label: 'الجلسات' },
        { id: 'reports',     icon: '📄', label: 'التقارير' },
        { sec: 'الإدارة' },
        { id: 'instructors', icon: '👨‍🏫', label: 'المشرفون' },
        { id: 'settings',    icon: '⚙️',  label: 'الإعدادات' },
    ] : [
        { id: 'myAbsences',  icon: '📈', label: 'غياباتي' },
        { id: 'myHistory',   icon: '📅', label: 'سجل الحضور' },
        { id: 'scanBarcode', icon: '📷', label: 'مسح الباركود' },
        { id: 'myBarcode',   icon: '🔲', label: 'باركودي' },
    ];

    // نبني HTML القائمة ديناميكياً
    // map: يحول كل عنصر في القائمة لنص HTML
    // l.sec: عنوان قسم بدون onclick
    // l.id: رابط قابل للضغط بـ onclick="nav('...')"
    g('sidebar').innerHTML = links.map(l => l.sec
        ? `<div class="nav-section">${l.sec}</div>`
        : `<div class="nav-item" id="ni_${l.id}" onclick="nav('${l.id}')"><span class="icon">${l.icon}</span>${l.label}</div>`
    ).join(''); // join: يدمج مصفوفة HTML strings بدون فاصل
}

// nav(page): ينتقل لصفحة معينة في التطبيق
window.nav = function(page) {
    // نزيل كلاس 'active' من كل روابط القائمة
    document.querySelectorAll('.nav-item').forEach(el => el.classList.remove('active'));

    // نضيف 'active' للرابط المختار
    const ni = g('ni_' + page);
    if (ni) ni.classList.add('active');

    // لو غادرنا صفحة الحضور، نوقف عداد الباركود
    if (bcInterval && page !== 'takeAtt') {
        clearInterval(bcInterval);
        bcInterval = null;
    }

    // لو غادرنا صفحة المسح، نوقف الكاميرا
    if (page !== 'scanBarcode') stopCam();

    renderPage(page); // نعرض الصفحة
};

// renderPage(page): يستدعي دالة الصفحة المطلوبة
function renderPage(page) {
    // كائن يربط اسم الصفحة بدالتها
    const pages = {
        dashboard, takeAtt, students, sessions, reports,
        instructors, settings, myAbsences, myHistory, scanBarcode, myBarcode
    };

    g('mainContent').innerHTML = ''; // نمسح المحتوى القديم

    // نستدعي دالة الصفحة إذا وجدت، وإلا نعرض "قريباً"
    // || (() => ...): لو الصفحة غير موجودة، استخدم دالة افتراضية
    (pages[page] || (() => html('<p style="color:var(--text2)">قريباً</p>')))();
}

// ============================================================
// النافذة المنبثقة العامة (Modal)
// ============================================================

// openModal(): يفتح نافذة منبثقة
window.openModal = function(title, body, hasOk, onOk) {
    g('mTitle').textContent = title;  // عنوان النافذة
    g('mBody').innerHTML    = body;   // محتواها (HTML)
    // نُظهر أو نُخفي زر OK
    g('mOkBtn').style.display = hasOk ? 'inline-flex' : 'none';
    _modalOk = onOk; // نحفظ الدالة التي تُنفَّذ عند الضغط OK
    g('modalOv').classList.add('open'); // نُظهر النافذة
};

// mOkAction(): يُنفَّذ عند الضغط OK في النافذة
window.mOkAction = function() {
    // لو _modalOk موجودة وإرجاعها ليس false، نُغلق النافذة
    if (_modalOk && _modalOk() !== false) closeModal();
};

// closeModal(): يُغلق النافذة المنبثقة
window.closeModal = function() { g('modalOv').classList.remove('open'); };

// openDel(): يفتح نافذة تأكيد الحذف
window.openDel = function(cb, title, body) {
    g('delTitle').textContent = title; // عنوان تأكيد الحذف
    g('delBody').innerHTML    = body;  // نص السؤال
    delCallback = cb; // نحفظ الدالة التي تُنفَّذ عند التأكيد
    g('delOv').classList.add('open');
};

// confirmDel(): يُنفَّذ عند الضغط "نعم، احذف"
window.confirmDel = function() { if (delCallback) delCallback(); };

// closeDel(): يُغلق نافذة تأكيد الحذف
window.closeDel = function() {
    g('delOv').classList.remove('open');
    delCallback = null; // نُعيد تعيين الـ callback
};

// ============================================================
// دوال الكاميرا
// ============================================================

// stopCam(): توقف الكاميرا تماماً وتُطفئ ضوء الكاميرا
function stopCam() {
    // cancelAnimationFrame: يوقف دورة المسح
    if (camRAF) { cancelAnimationFrame(camRAF); camRAF = null; }

    if (camStream) {
        // getTracks(): يُرجع كل مسارات الكاميرا (فيديو وأحياناً صوت)
        // forEach t.stop(): يوقف كل مسار ويُطفئ ضوء الكاميرا
        camStream.getTracks().forEach(t => t.stop());
        camStream = null;
    }
}

// ============================================================
// دوال مساعدة للغيابات
// ============================================================

// absBadge(): يُنشئ شارة HTML ملونة حسب عدد الغيابات وحالة الحرمان
window.absBadge = function(abs, banned) {
    // محروم: الغيابات أكثر من 6 أو is_banned = 1
    if (banned || abs > 6)
        return '<span class="badge badge-banned">⛔ محروم</span>';

    // خطر: 4 غيابات أو أكثر
    if (abs >= 4)
        return `<span class="badge badge-danger">🔴 ${abs}</span>`;

    // تحذير: غيابان أو ثلاثة
    if (abs >= 2)
        return `<span class="badge badge-warn">🟠 ${abs}</span>`;

    // آمن: 0 أو 1 غياب
    return `<span class="badge badge-safe">🔵 ${abs}</span>`;
};

// absCol(): يُرجع لون CSS حسب عدد الغيابات (للرسوم البيانية)
window.absCol = function(abs, banned) {
    if (banned || abs > 6) return '#6b7280'; // رمادي: محروم
    if (abs >= 4)          return '#f87171'; // أحمر: خطر
    if (abs >= 2)          return '#fdba74'; // برتقالي: تحذير
    return '#93c5fd';                        // أزرق: آمن
};

// haversine(): نسخة JavaScript من معادلة الـ GPS للفرونت إند
// تُستخدم لمعاينة المسافة قبل إرسالها للسيرفر
window.haversine = function(la1, lo1, la2, lo2) {
    // لو لا يوجد موقع للجامعة، أرجع 0 (لا تحقق من GPS)
    if (!la2 || !lo2) return 0;

    const R = 6371000; // نصف قطر الأرض بالمتر

    // Math.PI / 180: تحويل الدرجات لـ radians (Math.PI = 3.14159...)
    // ** 2: تربيع العدد
    const a = Math.sin((la2-la1)*Math.PI/360)**2
            + Math.cos(la1*Math.PI/180)
            * Math.cos(la2*Math.PI/180)
            * Math.sin((lo2-lo1)*Math.PI/360)**2;

    // Math.atan2 و Math.sqrt: دوال رياضية مدمجة في JavaScript
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
};

// ============================================================
// نقطة البداية — تُستدعى عند اكتمال تحميل HTML
// ============================================================

// DOMContentLoaded: حدث يُطلق عندما يكتمل تحميل HTML
// لا ينتظر الصور أو CSS أو JS الخارجي
// boot: الدالة التي ستُستدعى عند الحدث
document.addEventListener('DOMContentLoaded', boot);
