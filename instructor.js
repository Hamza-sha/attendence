'use strict';
// ============================================================
// instructor.js — صفحات المشرف
// هذا الملف يُحمَّل بعد app.js ويعتمد على دواله
// ============================================================

// ── لوحة التحكم (Dashboard) ──────────────────────────────
async function dashboard() {
    // نجلب ملخص إحصائيات الغيابات من السيرفر
    const res = await api('reports.php?type=summary');

    // لو فشل الطلب، نعرض رسالة خطأ ونوقف
    if (!res.success) {
        html(`<div class="alert alert-err">${res.message}</div>`);
        return;
    }

    // نفكك الرد: stats = الإحصائيات، students = قائمة الطلاب
    // Destructuring: اختصار لكتابة const stats = res.data.stats ...
    const { stats, students } = res.data;

    // نبني HTML لوحة التحكم ونضعها في mainContent
    html(`
    <div class="page-hdr"><h2>لوحة التحكم</h2></div>

    <!-- شبكة الإحصائيات: 4 بطاقات -->
    <div class="stats-grid">
      <div class="stat">
        <div class="lbl">إجمالي الطلاب</div>
        <div class="val v-blue">${stats.total}</div>
      </div>
      <div class="stat">
        <div class="lbl">🟢 آمن (0-1)</div>
        <div class="val v-green">${stats.safe}</div>
      </div>
      <div class="stat">
        <div class="lbl">🟠 تحذير (2-3)</div>
        <div class="val v-orange">${stats.warn}</div>
      </div>
      <div class="stat">
        <div class="lbl">🔴 خطر + محروم</div>
        <!-- stats.danger + stats.banned: نجمع الخطر والمحروم في بطاقة واحدة -->
        <div class="val v-red">${stats.danger + stats.banned}</div>
      </div>
    </div>

    <!-- لو لا يوجد طلاب: نعرض رسالة ترحيبية -->
    ${stats.total === 0
        ? `<div class="info-box">
            <strong>النظام جاهز!</strong><br>
            ابدأ بإضافة الطلاب من قسم <strong>الطلاب</strong>
            ثم انتقل إلى <strong>تسجيل الحضور</strong> لبدء جلسة.
           </div>`
        : `
    <!-- لو يوجد طلاب: نعرض جدول المحرومين -->
    <div class="card">
      <div class="card-hdr">
        <h3>⛔ الطلاب المحرومون (${stats.banned})</h3>
      </div>
      ${stats.banned === 0
          ? `<div class="empty-state"><span class="ei">🎉</span>لا يوجد طلاب محرومون</div>`
          : `<table>
               <thead>
                 <tr><th>الرقم الجامعي</th><th>الاسم</th><th>الغيابات</th></tr>
               </thead>
               <tbody>
                 <!-- filter: تُصفّي الطلاب وتُبقي المحرومين فقط -->
                 <!-- map: تحول كل طالب لصف HTML -->
                 ${students.filter(s => s.is_banned).map(s => `
                     <tr>
                       <td><code style="color:var(--accent)">${s.student_id}</code></td>
                       <td>${s.full_name}</td>
                       <td><span class="badge badge-banned">⛔ ${s.absences}</span></td>
                     </tr>
                 `).join('')}
               </tbody>
             </table>`
      }
    </div>`}
    `);
}

// ── صفحة تسجيل الحضور (Take Attendance) ──────────────────
async function takeAtt() {
    // لو لا توجد جلسة مفتوحة، نفتح واحدة جديدة
    if (!currentSessionId) {
        // نُرسل طلب لبدء جلسة جديدة
        const res = await api('sessions.php?action=start', 'POST', {});
        if (!res.success) {
            html(`<div class="alert alert-err">${res.message}</div>`);
            return;
        }
        // نحفظ id الجلسة والتوكن في المتغيرات العالمية
        currentSessionId = res.data.session_id;
        bcToken          = res.data.token;
    }

    // نُنشئ نص التاريخ بالعربية
    // toLocaleDateString: تُنسّق التاريخ حسب اللغة والمنطقة
    const dateStr = new Date().toLocaleDateString('ar-EG', {
        weekday: 'long',   // اسم اليوم: الأحد، الاثنين...
        year:    'numeric',
        month:   'long',   // اسم الشهر: يناير، فبراير...
        day:     'numeric',
    });

    // نبني HTML صفحة الحضور
    html(`
    <div class="page-hdr">
      <h2>تسجيل الحضور <div class="live-dot"></div></h2>
      <!-- زر إنهاء الجلسة -->
      <button type="button" class="btn btn-ghost btn-sm" onclick="endSession()">⏹ إنهاء الجلسة</button>
    </div>

    <!-- بطاقة الباركود -->
    <div class="card" style="margin-bottom:16px">
      <div class="card-hdr">
        <h3>📊 باركود الجلسة</h3>
        <div class="flex-row">
          <!-- عداد الثواني: id="bcTimer" يُحدَّث كل ثانية -->
          <span style="font-size:11px;color:var(--text2)">
            يتجدد خلال <strong id="bcTimer" style="color:var(--accent)">30</strong>ث
          </span>
          <!-- زر التجديد اليدوي -->
          <button type="button" class="btn btn-ghost btn-sm" onclick="refreshToken()">🔄 تجديد</button>
        </div>
      </div>
      <div class="card-body" style="display:flex;gap:24px;align-items:flex-start;flex-wrap:wrap">
        <!-- مكان رسم الباركود: SVG يُرسم بـ JsBarcode -->
        <div class="barcode-box" id="bcBox"><svg id="bcSvg"></svg></div>
        <div style="flex:1;min-width:200px">
          <div style="font-size:13px;color:var(--text2);line-height:1.9">
            اعرض هذا الباركود على الشاشة ليمسحه الطلاب بهواتفهم.<br>
            يتجدد تلقائياً كل <strong>30 ثانية</strong> لمنع الغش.
          </div>
          <div style="margin-top:12px;display:flex;gap:8px;flex-wrap:wrap">
            <!-- التاريخ وعداد الحاضرين -->
            <div style="background:var(--bg);border:1px solid var(--border2);border-radius:8px;padding:6px 12px;font-size:11px;color:var(--text2)">
              📅 <strong>${dateStr}</strong>
            </div>
            <!-- id="attCount": يُحدَّث عند كل تسجيل حضور -->
            <div style="background:var(--bg);border:1px solid var(--border2);border-radius:8px;padding:6px 12px;font-size:11px;color:var(--text2)">
              ✅ <strong id="attCount">${todayAttended.length}</strong> حضر
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- جدولا الحاضرين والغائبين جنباً لجنب -->
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:14px;margin-bottom:14px">
      <!-- قائمة الحاضرين -->
      <div class="card">
        <div class="card-hdr"><h3 style="color:#4ade80">✅ الحاضرون (${todayAttended.length})</h3></div>
        <table>
          <thead><tr><th>الاسم</th><th>الوقت</th></tr></thead>
          <tbody id="presentList">
            ${todayAttended.length === 0
                // لو لا أحد سجّل بعد
                ? `<tr><td colspan="2" style="text-align:center;color:var(--text2);padding:16px">لا يوجد بعد</td></tr>`
                // نحول قائمة الحاضرين لصفوف HTML
                : todayAttended.map(a =>
                    `<tr><td>${a.name}</td><td style="direction:ltr;text-align:right;color:var(--text2)">${a.time}</td></tr>`
                  ).join('')
            }
          </tbody>
        </table>
      </div>
      <!-- الغائبون: يظهرون فقط بعد إنهاء الجلسة -->
      <div class="card" id="absentCard">
        <div class="card-hdr"><h3 style="color:#f87171">❌ الغائبون</h3></div>
        <div class="card-body" style="color:var(--text2);font-size:12px">سيظهر بعد إنهاء الجلسة</div>
      </div>
    </div>

    <!-- الإدخال اليدوي للحضور -->
    <div class="card">
      <div class="card-hdr">
        <h3>⌨️ إدخال يدوي</h3>
        <button type="button" class="btn btn-ghost btn-sm" onclick="markAll()">تسجيل الكل حاضر</button>
      </div>
      <div class="card-body">
        <div class="flex-row">
          <!-- حقل إدخال الرقم الجامعي يدوياً -->
          <!-- onkeydown="if(event.key==='Enter')manMark()": الضغط Enter يُرسل -->
          <input id="manIn" placeholder="أدخل الرقم الجامعي..."
            style="flex:1;padding:9px 13px;background:var(--bg);border:1px solid var(--border2);border-radius:var(--r);color:var(--text);font-size:14px;font-family:var(--font);outline:none"
            onkeydown="if(event.key==='Enter')manMark()" />
          <button type="button" class="btn btn-primary" onclick="manMark()">إضافة</button>
        </div>
        <!-- نتيجة التسجيل اليدوي تظهر هنا -->
        <div id="manRes" style="margin-top:8px"></div>
      </div>
    </div>
    `);

    // بعد بناء HTML، نرسم الباركود في عنصر SVG
    renderBarcode(bcToken);

    // نبدأ عداد التجديد التلقائي
    startBCTimer();
}

// ── renderBarcode(): يرسم الباركود في عنصر SVG ───────────
function renderBarcode(token) {
    // نجلب عنصر SVG من الصفحة
    const svg = g('bcSvg');

    // نتحقق أن العنصر موجود وأن مكتبة JsBarcode مُحمَّلة
    if (!svg || typeof JsBarcode === 'undefined') return;

    try {
        // JsBarcode(عنصر, نص, خيارات): ترسم الباركود في SVG
        JsBarcode(svg, token, {
            format:       'CODE128', // نوع الباركود — يدعم أحرف وأرقام
            width:        2,         // عرض الشريط الواحد بالبكسل
            height:       70,        // ارتفاع الباركود بالبكسل
            displayValue: false,     // لا نُظهر النص أسفل الباركود (أمان)
            lineColor:    '#111',    // لون الشرائط
            background:   '#ffffff', // خلفية بيضاء
            margin:       0,         // لا هامش
        });

        // نضيف تسمية تحت الباركود (آخر 10 أحرف من التوكن فقط)
        const box = g('bcBox');
        let lbl = box.querySelector('.bc-label'); // نبحث عن التسمية إذا موجودة

        // لو لا توجد تسمية، نُنشئها
        if (!lbl) {
            lbl = document.createElement('div');
            lbl.className = 'bc-label';
            box.appendChild(lbl); // نضيفها لصندوق الباركود
        }

        // نضع آخر 10 أحرف من التوكن (مثل: A3F7KP للتعرف السريع)
        lbl.textContent = token.slice(-10);
        // slice(-10): يأخذ آخر 10 عناصر من النص

    } catch(e) {
        // try/catch: لو فشل رسم الباركود، نتجاهل الخطأ هادئاً
    }
}

// ── startBCTimer(): يبدأ عداد تجديد الباركود (كل 30 ثانية) ─
function startBCTimer() {
    // لو هناك عداد قديم، نوقفه أولاً لمنع تعدد العدادات
    if (bcInterval) clearInterval(bcInterval);

    bcSec = 30; // نُعيد العداد لـ 30

    // setInterval(callback, 1000): ينفذ callback كل 1000ms (ثانية)
    // يُرجع id لحفظه في bcInterval لإمكانية الإيقاف لاحقاً
    bcInterval = setInterval(async () => {
        bcSec--; // نُقلّل الثواني بـ 1

        // نُحدّث الرقم المعروض على الشاشة
        const el = g('bcTimer');
        if (el) el.textContent = bcSec;

        // لما تنتهي الـ 30 ثانية
        if (bcSec <= 0) {
            await refreshToken(); // نطلب توكناً جديداً من السيرفر
            bcSec = 30;           // نُعيد العداد
        }
    }, 1000); // ينفذ كل ثانية
}

// refreshToken(): يطلب توكن باركود جديد من السيرفر
window.refreshToken = async function() {
    bcSec = 30; // نُعيد العداد فوراً لمنع طلبات متتالية

    const res = await api('sessions.php?action=refresh_token', 'POST', {
        session_id: currentSessionId // نُرسل id الجلسة الحالية
    });

    if (res.success) {
        bcToken = res.data.token; // نحفظ التوكن الجديد
        renderBarcode(bcToken);   // نرسم الباركود الجديد
    }
};

// endSession(): ينهي الجلسة ويسجّل الغيابات
window.endSession = async function() {
    // confirm: يُظهر نافذة تأكيد للمستخدم — لو ضغط إلغاء نوقف
    if (!confirm('إنهاء الجلسة وتسجيل الغيابات؟')) return;

    const res = await api('sessions.php?action=end', 'POST', {
        session_id: currentSessionId
    });

    if (!res.success) { toast('❌ ' + res.message); return; }

    // نوقف عداد الباركود
    if (bcInterval) { clearInterval(bcInterval); bcInterval = null; }

    toast(`✅ انتهت الجلسة. الحاضرون: ${todayAttended.length}`);

    // نمسح بيانات الجلسة من الذاكرة
    todayAttended    = [];
    currentSessionId = null;
    bcToken          = '';

    // نعود للوحة التحكم
    nav('dashboard');
};

// manMark(): يسجّل حضور طالب يدوياً بالرقم الجامعي
window.manMark = async function() {
    const val  = gv('manIn');  // الرقم الجامعي من حقل الإدخال
    const res2 = g('manRes');  // عنصر عرض نتيجة التسجيل

    const res = await api('sessions.php?action=manual', 'POST', {
        session_id: currentSessionId,
        student_id: val
    });

    if (!res.success) {
        res2.innerHTML = `<div class="scan-err">❌ ${res.message}</div>`;
        return;
    }

    // أضف الطالب لقائمة الحاضرين في الذاكرة
    todayAttended.push({
        name: res.data.name,
        // toLocaleTimeString('ar'): الوقت بالعربية مثل ١٢:٣٠ ص
        time: new Date().toLocaleTimeString('ar')
    });

    g('manIn').value = ''; // نمسح حقل الإدخال
    res2.innerHTML   = `<div class="scan-ok">✅ تم التسجيل: ${res.data.name}</div>`;

    // نُحدّث عداد الحاضرين
    if (g('attCount')) g('attCount').textContent = todayAttended.length;

    // بعد 1.2 ثانية نُعيد تحميل صفحة الحضور لتحديث القوائم
    setTimeout(() => takeAtt(), 1200);
};

// markAll(): يسجّل كل الطلاب حاضرين دفعةً واحدة
window.markAll = async function() {
    // نجلب قائمة كل الطلاب
    const stuRes = await api('students.php');
    if (!stuRes.success) return;

    // for...of: نمر على كل طالب (نستخدم for وليس forEach لأن await يعمل فيه)
    for (const s of stuRes.data) {
        // لو الطالب لم يُسجَّل بعد (لم يجده في todayAttended)
        if (!todayAttended.find(a => a.name === s.full_name)) {
            // نسجّله يدوياً
            await api('sessions.php?action=manual', 'POST', {
                session_id: currentSessionId,
                student_id: s.student_id
            });
            todayAttended.push({
                name: s.full_name,
                time: new Date().toLocaleTimeString('ar')
            });
        }
    }
    takeAtt(); // نُعيد تحميل الصفحة
};

// ── صفحة الطلاب ───────────────────────────────────────────
async function students() {
    const res = await api('students.php');
    if (!res.success) { html(`<div class="alert alert-err">${res.message}</div>`); return; }
    const list = res.data;

    html(`
    <div class="page-hdr">
      <!-- sub: نص صغير بجانب العنوان يعرض الإجمالي -->
      <h2>الطلاب <span class="sub">${list.length} إجمالي</span></h2>
      <button type="button" class="btn btn-primary" onclick="openAddStudent()">+ إضافة طالب</button>
    </div>

    <!-- حقل البحث -->
    <div class="flex-row" style="margin-bottom:14px">
      <!-- oninput: يُستدعى عند كل تغيير في النص -->
      <input id="stuQ" placeholder="🔍 بحث بالاسم أو الرقم..."
        style="flex:1;padding:9px 13px;background:var(--surface);border:1px solid var(--border2);border-radius:var(--r);color:var(--text);font-size:13px;font-family:var(--font);outline:none"
        oninput="filterStus()" />
    </div>

    <div class="card">
      <table>
        <thead>
          <tr><th>الرقم الجامعي</th><th>الاسم</th><th>الغيابات</th><th>الحالة</th><th>إجراءات</th></tr>
        </thead>
        <!-- tbody id="stuTbody": يُحدَّث عند البحث -->
        <tbody id="stuTbody">${stuRows(list)}</tbody>
      </table>
      ${list.length === 0
          ? `<div class="empty-state"><span class="ei">👥</span>لا يوجد طلاب بعد — أضف أول طالب</div>`
          : ''
      }
    </div>
    `);

    // نحفظ القائمة الكاملة للبحث لاحقاً
    window._stuList = list;
}

// _stuList: قائمة الطلاب الكاملة للبحث (عالمية)
window._stuList = [];

// stuRows(): يحول مصفوفة الطلاب لصفوف جدول HTML
function stuRows(list) {
    return list.map(s => `<tr>
      <!-- الرقم الجامعي: code لتنسيق الخط الثابت -->
      <td><code style="color:var(--accent)">${s.student_id}</code></td>
      <td style="font-weight:600">${s.full_name}</td>
      <td><strong style="font-size:15px">${s.absences}</strong></td>
      <!-- absBadge: دالة من app.js ترسم الشارة الملونة -->
      <td>${absBadge(s.absences, s.is_banned)}</td>
      <td>
        <div class="flex-row">
          <!-- s.id: id الطالب الداخلي في قاعدة البيانات -->
          <button type="button" class="btn btn-ghost btn-sm"
            onclick="editAbs(${s.id},${s.absences},'${s.full_name}')">✏️ تعديل</button>
          <button type="button" class="btn btn-ghost btn-sm"
            onclick="showStudentBC('${s.student_id}','${s.full_name}')">🔲 باركود</button>
          <button type="button" class="btn btn-del btn-sm"
            onclick="delStudent(${s.id},'${s.full_name}')">🗑️</button>
        </div>
      </td>
    </tr>`).join(''); // join بدون فاصل لدمج كل الصفوف
}

// filterStus(): يُصفّي جدول الطلاب بالبحث
window.filterStus = function() {
    const q = g('stuQ').value.toLowerCase(); // نص البحث بأحرف صغيرة

    // filter: نُبقي فقط الطلاب الذين يطابق اسمهم أو رقمهم نص البحث
    // includes: يتحقق أن النص يحوي نص البحث
    const f = window._stuList.filter(s =>
        s.full_name.toLowerCase().includes(q) || // بحث بالاسم
        s.student_id.includes(q)                  // أو بالرقم الجامعي
    );

    // نُحدّث الجدول بالنتائج المُصفّاة
    g('stuTbody').innerHTML = stuRows(f);
};

// openAddStudent(): يفتح نافذة إضافة طالب جديد
window.openAddStudent = function() {
    openModal('إضافة طالب جديد', `
      <div class="fg"><label>الرقم الجامعي *</label>
        <input id="m_sid" placeholder="مثال: 2020901164" /></div>
      <div class="fg"><label>الاسم الكامل *</label>
        <input id="m_sname" placeholder="مثال: سجى ناصر قصراوي" /></div>
      <div class="info-box" style="margin-top:8px">
        🔑 كلمة المرور الافتراضية = الرقم الجامعي<br>
        🔄 سيُطلب من الطالب تغييرها عند أول دخول
      </div>
    `, true, async () => {
        // الدالة تُستدعى عند الضغط OK في النافذة
        const id   = gv('m_sid');
        const name = gv('m_sname');

        if (!id || !name) { toast('❌ الرقم والاسم مطلوبان'); return false; }
        // return false: يمنع إغلاق النافذة عند الفشل

        const res = await api('students.php', 'POST', { student_id: id, full_name: name });
        if (!res.success) { toast('❌ ' + res.message); return false; }

        toast(`✅ تم الإضافة: ${name}`);
        students(); // نُعيد تحميل قائمة الطلاب
    });
};

// editAbs(): يفتح نافذة تعديل غيابات طالب
window.editAbs = function(id, current, name) {
    openModal(`تعديل الغيابات — ${name}`, `
      <div class="fg">
        <label>الغيابات (الحالية: ${current})</label>
        <!-- type="number": يقبل أرقاماً فقط -->
        <!-- min="0" max="30": الحد الأدنى 0 والأعلى 30 -->
        <input type="number" id="m_abs" value="${current}" min="0" max="30" />
      </div>
    `, true, async () => {
        // parseInt: تحويل النص لرقم صحيح
        const v = parseInt(g('m_abs').value);

        // isNaN: يتحقق إذا كانت القيمة غير رقمية
        if (isNaN(v) || v < 0) { toast('❌ قيمة غير صحيحة'); return false; }

        const res = await api('students.php', 'PUT', { id, absences: v });
        if (!res.success) { toast('❌ ' + res.message); return false; }

        toast('✅ تم التحديث');
        students(); // نُعيد تحميل القائمة
    });
};

// showStudentBC(): يعرض باركود الطالب (رقمه الجامعي) في نافذة
window.showStudentBC = function(sid, name) {
    openModal(`باركود — ${name}`, `
      <div style="text-align:center">
        <div class="barcode-box" style="display:inline-block">
          <!-- stuBcSvg: SVG يُرسم فيه الباركود بعد فتح النافذة -->
          <svg id="stuBcSvg"></svg>
          <div class="bc-label">${sid}</div>
        </div>
        <p style="margin-top:12px;font-size:12px;color:var(--text2)">
          اطبع أو اعرض هذا الباركود للطالب.
        </p>
      </div>
    `, false, null); // false = لا زر OK

    // setTimeout(50ms): ننتظر قليلاً حتى يظهر SVG في الصفحة قبل الرسم
    setTimeout(() => {
        try {
            JsBarcode(g('stuBcSvg'), sid, {
                format:       'CODE128',
                width:        2,
                height:       60,
                displayValue: false,
                lineColor:    '#111',
                background:   '#fff',
                margin:       0,
            });
        } catch(e) {}
    }, 50);
};

// delStudent(): يفتح نافذة تأكيد حذف طالب
window.delStudent = function(id, name) {
    openDel(async () => {
        // الدالة تُستدعى عند تأكيد الحذف
        // api DELETE: نُرسل id في الرابط ?id=5
        const res = await api(`students.php?id=${id}`, 'DELETE');
        if (!res.success) { toast('❌ ' + res.message); return; }
        closeDel();
        toast(`🗑️ تم الحذف: ${name}`);
        students(); // نُعيد تحميل القائمة
    }, 'حذف طالب',
       `هل أنت متأكد من حذف <strong>${name}</strong>؟<br>
        <small style="color:var(--text2)">لا يمكن التراجع عن هذا الإجراء.</small>`);
};

// ── صفحة الجلسات ──────────────────────────────────────────
async function sessions() {
    const res = await api('sessions.php');
    if (!res.success) { html(`<div class="alert alert-err">${res.message}</div>`); return; }
    const list = res.data;

    html(`
    <div class="page-hdr">
      <h2>الجلسات <span class="sub">${list.length} إجمالي</span></h2>
    </div>
    ${list.length === 0
        ? `<div class="empty-state"><span class="ei">📅</span>لا توجد جلسات مسجلة بعد</div>`
        : `<div class="card"><table>
            <thead><tr><th>#</th><th>التاريخ</th><th>الحاضرون</th><th>الحالة</th></tr></thead>
            <tbody>
              ${list.map((s, i) => `
                <tr>
                  <td style="color:var(--text2)">${i + 1}</td>
                  <td>${s.session_date}</td>
                  <!-- attended_count: عدد الحاضرين من JOIN في SQL -->
                  <td><strong style="color:#4ade80">${s.attended_count}</strong></td>
                  <td>
                    ${s.is_active
                        ? '<span class="badge badge-ok">🟢 نشطة</span>'
                        : '<span class="badge badge-safe">✅ منتهية</span>'
                    }
                  </td>
                </tr>
              `).join('')}
            </tbody>
           </table></div>`
    }
    `);
}

// ── صفحة التقارير ─────────────────────────────────────────
async function reports() {
    const res = await api('reports.php?type=summary');
    if (!res.success) { html(`<div class="alert alert-err">${res.message}</div>`); return; }

    // نفكك البيانات
    const { stats, students: list } = res.data;

    html(`
    <div class="page-hdr"><h2>التقارير</h2></div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:18px">
      <!-- بطاقة تصدير PDF — cursor:pointer يُغير شكل المؤشر -->
      <div class="stat" style="cursor:pointer" onclick="exportPDF()">
        <div style="font-size:26px">📄</div>
        <div style="font-weight:700;margin-top:6px">تصدير PDF</div>
        <div class="lbl">كشف الحضور الكامل</div>
      </div>
    </div>

    <div class="card">
      <div class="card-hdr"><h3>إحصائيات الغياب</h3></div>
      <div class="card-body">
        ${list.length === 0
            ? `<div class="empty-state" style="padding:16px"><span class="ei">📊</span>لا توجد بيانات بعد</div>`
            : list.map(s => `
                <div style="display:flex;align-items:center;gap:10px;margin-bottom:9px">
                  <!-- اسم الطالب: overflow:hidden يمنع الخروج عن الحدود -->
                  <div style="width:140px;font-size:12px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">
                    ${s.full_name}
                  </div>

                  <!-- شريط التقدم المرئي -->
                  <div class="prog-bg" style="flex:1">
                    <!-- العرض بالنسبة المئوية: min(غيابات/7*100, 100) -->
                    <!-- Math.min تضمن عدم تجاوز 100% -->
                    <div class="prog-fill"
                      style="width:${Math.min(s.absences/7*100, 100)}%;background:${absCol(s.absences, s.is_banned)}">
                    </div>
                  </div>

                  <!-- رقم الغيابات -->
                  <div style="width:24px;text-align:center;font-weight:700;font-size:12px;color:${absCol(s.absences,s.is_banned)}">
                    ${s.absences}
                  </div>

                  <!-- الشارة الملونة -->
                  ${absBadge(s.absences, s.is_banned)}
                </div>
              `).join('')
        }
      </div>
    </div>
    `);
}

// exportPDF(): يُنشئ كشف حضور ويفتحه في نافذة للطباعة
window.exportPDF = async function() {
    const res = await api('reports.php?type=summary');
    if (!res.success) return;
    const { students: list } = res.data;

    // window.open: يفتح نافذة جديدة في المتصفح
    const w = window.open('', '_blank'); // '_blank' = نافذة جديدة

    // w.document.write: يكتب HTML مباشرةً في النافذة الجديدة
    w.document.write(`
      <html dir="rtl">
      <head>
        <meta charset="UTF-8">
        <title>كشف الحضور</title>
        <style>
          body{font-family:Arial,sans-serif;padding:28px}
          h1{color:#1d4ed8}
          table{width:100%;border-collapse:collapse;margin-top:16px}
          th{background:#1d4ed8;color:#fff;padding:9px;text-align:right}
          td{padding:8px;border-bottom:1px solid #e5e7eb}
        </style>
      </head>
      <body>
        <h1>كشف الحضور</h1>
        <!-- toLocaleDateString('ar-EG'): تاريخ اليوم بالعربية -->
        <p>${new Date().toLocaleDateString('ar-EG')}</p>
        <table>
          <thead>
            <tr><th>الرقم الجامعي</th><th>الاسم</th><th>الغيابات</th><th>الحالة</th></tr>
          </thead>
          <tbody>
            ${list.map(s => `
              <tr>
                <td>${s.student_id}</td>
                <td>${s.full_name}</td>
                <td>${s.absences}</td>
                <td>${s.is_banned ? 'محروم' : s.absences>=4 ? 'خطر' : s.absences>=2 ? 'تحذير' : 'آمن'}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </body>
      </html>
    `);

    w.document.close(); // نُنهي الكتابة في الوثيقة

    // بعد 400ms نفتح نافذة الطباعة (setTimeout لإعطاء وقت للتحميل)
    setTimeout(() => w.print(), 400);
};

// ── صفحة المشرفون ──────────────────────────────────────────
async function instructors() {
    const res = await api('instructors.php');
    if (!res.success) { html(`<div class="alert alert-err">${res.message}</div>`); return; }
    const list = res.data;

    html(`
    <div class="page-hdr">
      <h2>المشرفون <span class="sub">${list.length} إجمالي</span></h2>
      <button type="button" class="btn btn-primary" onclick="openAddInstructor()">+ إضافة مشرف</button>
    </div>
    <div class="card"><table>
      <thead><tr><th>الاسم</th><th>اسم المستخدم</th><th>الحالة</th><th>إجراءات</th></tr></thead>
      <tbody>
        ${list.map((d, i) => `
          <tr>
            <td style="font-weight:600">${d.full_name}</td>
            <!-- direction:ltr: اسم المستخدم الإنجليزي من اليسار -->
            <td><code style="color:var(--accent);direction:ltr">${d.username}</code></td>
            <td>
              ${d.must_change
                  ? '<span class="badge badge-warn">🔄 يجب تغيير الباسوورد</span>'
                  : '<span class="badge badge-ok">✅ نشط</span>'
              }
            </td>
            <td>
              <div class="flex-row">
                <button type="button" class="btn btn-ghost btn-sm"
                  onclick="resetPass(${d.id},'${d.full_name}')">🔑 إعادة تعيين</button>
                <!-- نُظهر زر الحذف فقط لو يوجد أكثر من مشرف -->
                ${list.length > 1
                    ? `<button type="button" class="btn btn-del btn-sm"
                        onclick="delInstructor(${d.id},'${d.full_name}')">🗑️</button>`
                    : ''
                }
              </div>
            </td>
          </tr>
        `).join('')}
      </tbody>
    </table></div>
    `);
}

// openAddInstructor(): نافذة إضافة مشرف
window.openAddInstructor = function() {
    openModal('إضافة مشرف', `
      <div class="fg"><label>الاسم الكامل *</label>
        <input id="m_iname" placeholder="د. سارة المنصور" /></div>
      <div class="fg"><label>اسم المستخدم *</label>
        <!-- direction:ltr: الكتابة من اليسار للإنجليزية -->
        <input id="m_iuser" placeholder="dr.sara" style="direction:ltr" />
        <div class="sub">بالإنجليزية، بدون مسافات</div></div>
      <div class="fg"><label>كلمة المرور المؤقتة *</label>
        <!-- type="password": يُخفي ما يُكتب -->
        <input type="password" id="m_ipass" placeholder="ستُغيَّر عند أول دخول" /></div>
      <div class="info-box">🔄 سيُطلب من المشرف تغيير كلمة المرور عند أول دخول</div>
    `, true, async () => {
        const name  = gv('m_iname');
        const uname = gv('m_iuser').toLowerCase();
        const pass  = g('m_ipass').value; // لا نستخدم gv لأن الباسوورد قد يحوي مسافات

        if (!name || !uname || !pass) { toast('❌ جميع الحقول مطلوبة'); return false; }

        const res = await api('instructors.php', 'POST', { full_name: name, username: uname, password: pass });
        if (!res.success) { toast('❌ ' + res.message); return false; }

        toast(`✅ تم الإضافة: ${name}`);
        instructors();
    });
};

// resetPass(): يفتح نافذة إعادة تعيين باسوورد مشرف
window.resetPass = function(id, name) {
    openModal(`إعادة تعيين كلمة مرور — ${name}`, `
      <div class="fg"><label>كلمة المرور المؤقتة الجديدة</label>
        <input type="password" id="m_rpass" placeholder="6 أحرف على الأقل" /></div>
      <div class="info-box">🔄 سيُطلب من المشرف تغييرها عند الدخول التالي</div>
    `, true, async () => {
        const p = g('m_rpass').value;
        if (!p || p.length < 6) { toast('❌ كلمة المرور قصيرة جداً'); return false; }

        const res = await api('instructors.php', 'PUT', { id, password: p });
        if (!res.success) { toast('❌ ' + res.message); return false; }

        toast('✅ تم إعادة التعيين');
        instructors();
    });
};

// delInstructor(): يحذف مشرفاً بعد تأكيد
window.delInstructor = function(id, name) {
    openDel(async () => {
        const res = await api(`instructors.php?id=${id}`, 'DELETE');
        if (!res.success) { toast('❌ ' + res.message); return; }
        closeDel();
        toast(`🗑️ تم الحذف: ${name}`);
        instructors();
    }, 'حذف مشرف', `هل أنت متأكد من حذف <strong>${name}</strong>؟`);
};

// ── صفحة الإعدادات ────────────────────────────────────────
async function settings() {
    const res = await api('settings.php');
    if (!res.success) { html(`<div class="alert alert-err">${res.message}</div>`); return; }
    const s = res.data; // بيانات الإعدادات الحالية

    html(`
    <div class="page-hdr"><h2>إعدادات النظام</h2></div>
    <div class="card" style="margin-bottom:14px">
      <div class="card-hdr"><h3>🏛️ بيانات المؤسسة</h3></div>
      <div class="card-body">
        <div class="row2">
          <div class="fg"><label>اسم الجامعة</label>
            <!-- value="${s.uni_name||''}": نضع القيمة الحالية في الحقل -->
            <input id="s_un" value="${s.uni_name || ''}" /></div>
          <div class="fg"><label>القسم</label>
            <input id="s_ud" value="${s.uni_dept || ''}" /></div>
        </div>
        <div class="row2">
          <div class="fg"><label>خط العرض</label>
            <!-- type="number" step="any": يقبل أرقاماً عشرية -->
            <input type="number" id="s_la" value="${s.gps_lat || ''}" step="any" /></div>
          <div class="fg"><label>خط الطول</label>
            <input type="number" id="s_lo" value="${s.gps_lng || ''}" step="any" /></div>
        </div>
        <div class="fg">
          <!-- id="rLabel": يُحدَّث بـ JavaScript عند تحريك المنزلق -->
          <label>نطاق GPS: <strong style="color:var(--accent)" id="rLabel">${s.gps_radius}</strong>م</label>
          <!-- type="range": منزلق (slider) -->
          <!-- oninput: يُحدّث التسمية أثناء السحب -->
          <input type="range" id="s_rad" min="50" max="1000" step="50" value="${s.gps_radius}"
            oninput="g('rLabel').textContent=this.value"
            style="width:100%;margin-top:6px;accent-color:var(--accent)" />
          <div style="display:flex;justify-content:space-between;font-size:10px;color:var(--text2);margin-top:2px">
            <span>50م</span><span>1000م</span>
          </div>
        </div>
        <div class="flex-row">
          <button type="button" class="btn btn-primary" onclick="saveSettings()">💾 حفظ</button>
          <button type="button" class="btn btn-ghost" onclick="detectSettingsGPS()">📡 استخدم موقعي</button>
        </div>
      </div>
    </div>
    `);
}

// saveSettings(): يحفظ الإعدادات في السيرفر
window.saveSettings = async function() {
    const res = await api('settings.php', 'PUT', {
        uni_name:   gv('s_un'),                       // اسم الجامعة
        uni_dept:   gv('s_ud'),                       // القسم
        gps_lat:    parseFloat(g('s_la').value) || null, // خط العرض أو null
        gps_lng:    parseFloat(g('s_lo').value) || null,
        gps_radius: parseInt(g('s_rad').value),        // النطاق
    });
    toast(res.success ? '✅ تم حفظ الإعدادات' : '❌ ' + res.message);
};

// detectSettingsGPS(): يكتشف الموقع ويضعه في حقول الإعدادات
window.detectSettingsGPS = function() {
    navigator.geolocation.getCurrentPosition(pos => {
        g('s_la').value = pos.coords.latitude.toFixed(6);
        g('s_lo').value = pos.coords.longitude.toFixed(6);
        toast('✅ تم تحديد الموقع');
    }, () => toast('❌ تعذر تحديد الموقع'));
};
