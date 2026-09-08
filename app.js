// ===== FIREBASE INIT =====
const firebaseConfig = {
  apiKey: "AIzaSyAGEnT9W_RN3RUJCINnFQqSoEcBn0eYiV8",
  authDomain: "megalodonclub-3a8c1.firebaseapp.com",
  projectId: "megalodonclub-3a8c1",
  storageBucket: "megalodonclub-3a8c1.firebasestorage.app",
  messagingSenderId: "786587463822",
  appId: "1:786587463822:web:29931815975066658919df",
  measurementId: "G-C93D6TB7ZT"
};
firebase.initializeApp(firebaseConfig);
const db = firebase.firestore();

// ===== STATE =====
const APP = {
  loggedIn: false,
  atlet: [],       // { id, nama, jenisKelamin, tanggalLahir, usia }
  tesFisik: [],    // { id, atletId, tanggalTes, ...fields }
  tesCSS: [],      // { id, atletId, tanggalTes, waktu50, waktu400, css, kategoriCSS, pace100, tingkatanPace, vo2max, kategoriVO2max }
  nextId: 1
};

function genId() { return APP.nextId++; }

// ===== STATISTIK DINAMIS =====
// Mapping field tes fisik ke nama field di objek tes
const FIELD_MAP = {
  'Sit & Reach': 'sitAndReach',
  'Core Stability': 'coreStability',
  'Push': 'push',
  'Pull': 'pull',
  'Ankle Kanan': 'ankleKanan',
  'Ankle Kiri': 'ankleKiri',
  'WBR Visual': 'wbrVisual',
  'WBR Audio': 'wbrAudio',
  'SBJ': 'sbj'
};

// Item yang arahnya "lower is better"
const INVERTED_ITEMS = ['WBR Visual', 'WBR Audio'];

// Standar deviasi SAMPLE (n-1), sesuai STDEV di Google Sheets
function stdevSample(arr) {
  const n = arr.length;
  if (n < 2) return 0;
  const mean = arr.reduce((a, b) => a + b, 0) / n;
  const variance = arr.reduce((sum, x) => sum + Math.pow(x - mean, 2), 0) / (n - 1);
  return Math.sqrt(variance);
}

function rataRata(arr) {
  if (arr.length === 0) return 0;
  return arr.reduce((a, b) => a + b, 0) / arr.length;
}

// Ambil data tes fisik terbaru per atlet, lengkap dengan info jenis kelamin
function getDataTesTerbaru() {
  const grouped = {};
  APP.tesFisik.forEach(t => {
    if (!grouped[t.atletId] || new Date(t.tanggalTes) > new Date(grouped[t.atletId].tanggalTes)) {
      grouped[t.atletId] = t;
    }
  });
  return Object.values(grouped).map(tes => {
    const atlet = APP.atlet.find(a => a.id === tes.atletId);
    return atlet ? { ...tes, jenisKelamin: atlet.jenisKelamin, nama: atlet.nama } : null;
  }).filter(Boolean);
}

// Hitung kategori "higher is better" (semakin besar semakin bagus)
function hitungKategori(nilaiAtlet, jenisKelaminAtlet, semuaData, namaItemTes) {
  const fieldKey = FIELD_MAP[namaItemTes];
  const dataSejenis = semuaData
    .filter(d => d.jenisKelamin === jenisKelaminAtlet)
    .map(d => d[fieldKey])
    .filter(v => v !== null && v !== undefined && v !== "" && !isNaN(v));

  if (dataSejenis.length < 1) return { kategori: '', mean: 0, sd: 0, cukupData: false };

  const mean = rataRata(dataSejenis);
  const sd = dataSejenis.length >= 2 ? stdevSample(dataSejenis) : 0;

  let kategori;
  if (sd === 0) {
    kategori = 'Cukup';
  } else if (nilaiAtlet >= mean + 1.5 * sd) kategori = 'Baik Sekali';
  else if (nilaiAtlet >= mean + 0.5 * sd) kategori = 'Baik';
  else if (nilaiAtlet >= mean - 0.5 * sd) kategori = 'Cukup';
  else if (nilaiAtlet >= mean - 1.5 * sd) kategori = 'Kurang';
  else kategori = 'Kurang Sekali';

  const persentil = sd > 0 ? Math.round(((nilaiAtlet - mean) / sd) * 20 + 50) : 50;
  return { kategori, mean, sd, persentil: Math.max(0, Math.min(100, persentil)), cukupData: true };
}

// Hitung kategori "lower is better" (semakin kecil semakin bagus) — untuk WBR
function hitungKategoriTerbalik(nilaiAtlet, jenisKelaminAtlet, semuaData, namaItemTes) {
  const fieldKey = FIELD_MAP[namaItemTes];
  const dataSejenis = semuaData
    .filter(d => d.jenisKelamin === jenisKelaminAtlet)
    .map(d => d[fieldKey])
    .filter(v => v !== null && v !== undefined && v !== "" && !isNaN(v));

  if (dataSejenis.length < 1) return { kategori: '', mean: 0, sd: 0, cukupData: false };

  const mean = rataRata(dataSejenis);
  const sd = dataSejenis.length >= 2 ? stdevSample(dataSejenis) : 0;

  let kategori;
  if (sd === 0) {
    kategori = 'Cukup';
  } else if (nilaiAtlet <= mean - 1.5 * sd) kategori = 'Baik Sekali';
  else if (nilaiAtlet <= mean - 0.5 * sd) kategori = 'Baik';
  else if (nilaiAtlet <= mean + 0.5 * sd) kategori = 'Cukup';
  else if (nilaiAtlet <= mean + 1.5 * sd) kategori = 'Kurang';
  else kategori = 'Kurang Sekali';

  const persentil = sd > 0 ? Math.round((1 - ((nilaiAtlet - mean) / sd)) * 20 + 50) : 50;
  return { kategori, mean, sd, persentil: Math.max(0, Math.min(100, persentil)), cukupData: true };
}

// Fungsi utama: hitung kategori otomatis berdasarkan jenis kelamin
function getKategoriNorma(nilai, itemKey, jenisKelamin) {
  const semuaData = getDataTesTerbaru();
  if (INVERTED_ITEMS.includes(itemKey)) {
    return hitungKategoriTerbalik(nilai, jenisKelamin, semuaData, itemKey);
  }
  return hitungKategori(nilai, jenisKelamin, semuaData, itemKey);
}

// Hitung rata-rata untuk satu item (untuk radar chart & norma)
function getMeanSDForItem(itemKey, jenisKelamin) {
  const semuaData = getDataTesTerbaru();
  const fieldKey = FIELD_MAP[itemKey];
  const dataSejenis = semuaData
    .filter(d => d.jenisKelamin === jenisKelamin)
    .map(d => d[fieldKey])
    .filter(v => v !== null && v !== undefined && v !== "" && !isNaN(v));

  if (dataSejenis.length < 1) return { mean: 0, sd: 0, cukupData: false };
  const mean = rataRata(dataSejenis);
  const sd = dataSejenis.length >= 2 ? stdevSample(dataSejenis) : 0;
  return { mean, sd, cukupData: true };
}

// ===== DOM HELPERS =====
const $ = s => document.querySelector(s);
const $$ = s => document.querySelectorAll(s);

// ===== LOGIN =====
$('#loginForm').addEventListener('submit', e => {
  e.preventDefault();
  const u = $('#username').value.trim();
  const p = $('#password').value;
  if (u === 'admin' && p === 'password') {
    APP.loggedIn = true;
    $('#loginPage').style.display = 'none';
    $('#appContainer').style.display = 'flex';
    $('#loginError').style.display = 'none';
    // Tunggu init selesai lalu render
    function afterInit() {
      if (initDone) {
        navigateTo('dashboard');
      } else {
        setTimeout(afterInit, 100);
      }
    }
    afterInit();
  } else {
    $('#loginError').style.display = 'block';
  }
});

function doLogout() {
  APP.loggedIn = false;
  $('#appContainer').style.display = 'none';
  $('#loginPage').style.display = 'flex';
  $('#username').value = '';
  $('#password').value = '';
  $('#loginError').style.display = 'none';
}

$('#logoutBtn').addEventListener('click', doLogout);
$('#logoutBtnMobile').addEventListener('click', doLogout);

// ===== NAVIGATION =====
function navigateTo(page) {
  $$('.page').forEach(p => p.classList.remove('active'));
  $$('.nav-item').forEach(n => n.classList.remove('active'));
  const target = $(`#page-${page}`);
  if (target) target.classList.add('active');
  const navItem = $(`.nav-item[data-page="${page}"]`);
  if (navItem) navItem.classList.add('active');

  // close sidebar on mobile
  $('#sidebar').classList.remove('open');
  $('#overlay').style.display = 'none';

  // refresh page data
  if (page === 'dashboard') renderDashboard();
  if (page === 'hasilFisik') { populateFilterAtletFisik(); renderHasilFisik(); }
  if (page === 'inputCSS') populateAtletDropdowns();
  if (page === 'hasilCSS') { populateFilterAtletCSS(); renderHasilCSS(); }
  if (page === 'rekomendasi') { populateFilterAtletRek(); renderRekomendasi(); }
  if (page === 'norma') renderNorma();
}

$$('.nav-item').forEach(item => {
  item.addEventListener('click', e => {
    e.preventDefault();
    navigateTo(item.dataset.page);
  });
});

$('#menuToggle').addEventListener('click', () => {
  $('#sidebar').classList.toggle('open');
  $('#overlay').style.display = $('#sidebar').classList.contains('open') ? 'block' : 'none';
});

$('#overlay').addEventListener('click', () => {
  $('#sidebar').classList.remove('open');
  $('#overlay').style.display = 'none';
});

// ===== UTILITY =====
function hitungUsia(tglLahir) {
  const today = new Date();
  const birth = new Date(tglLahir);
  let age = today.getFullYear() - birth.getFullYear();
  const m = today.getMonth() - birth.getMonth();
  if (m < 0 || (m === 0 && today.getDate() < birth.getDate())) age--;
  return age;
}

function formatPace(detik) {
  const m = Math.floor(detik / 60);
  const s = Math.round(detik % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

function parseTime(str) {
  // format "M:SS" or "MM:SS" to seconds
  const parts = str.split(':');
  if (parts.length !== 2) return NaN;
  return parseInt(parts[0]) * 60 + parseInt(parts[1]);
}

// getKategoriNorma sudah didefinisikan di bagian STATISTIK DINAMIS di atas

// IMT special (inverted: too low or too high is bad) — dinamis per jenis kelamin
function getKategoriIMT(barat, tinggi, jenisKelamin) {
  const tm = tinggi / 100;
  const imt = barat / (tm * tm);
  const semuaData = getDataTesTerbaru();

  // Hitung Mean & SD IMT dari data atlet sejenis kelamin
  const dataSejenis = semuaData
    .filter(d => d.jenisKelamin === jenisKelamin)
    .map(d => {
      const t = d.tinggiBadan / 100;
      return d.beratBadan / (t * t);
    })
    .filter(v => !isNaN(v) && isFinite(v));

  if (dataSejenis.length < 1) {
    return { kategori: '', persentil: 0, imt: imt.toFixed(1), mean: 0, sd: 0, cukupData: false };
  }

  const mean = rataRata(dataSejenis);
  const sd = dataSejenis.length >= 2 ? stdevSample(dataSejenis) : 0;
  const persentil = Math.round(((imt - mean) / (sd || 1)) * 20 + 50);

  // Kategori IMT berdasarkan standar WHO
  let kategori;
  if (imt < 18.5) kategori = 'Underweight';
  else if (imt < 25) kategori = 'Ideal';
  else if (imt < 30) kategori = 'Overweight';
  else kategori = 'Obesitas';

  return { kategori, persentil: Math.max(0, Math.min(100, persentil)), imt: imt.toFixed(1), mean, sd, cukupData: true };
}

function kategoriBadgeClass(kat) {
  if (!kat) return 'badge-blue';
  const k = kat.toLowerCase();
  if (k.includes('baik se') || k === 'elite' || k === 'olimpiade' || k === 'nasional' || k === 'sangat baik') return 'badge-green';
  if (k.includes('baik') || k === 'klub' || k === 'bagus se' || k === 'ideal') return 'badge-green';
  if (k.includes('cukup') || k === 'rata-rata' || k.includes('bagus')) return 'badge-yellow';
  if (k.includes('kurang') || k.includes('pemula') || k.includes('bawah') || k === 'underweight') return 'badge-red';
  if (k === 'overweight' || k === 'obesitas') return 'badge-red';
  return 'badge-blue';
}

// ===== INPUT TES FISIK =====
$('#fTglLahir').addEventListener('change', function() {
  if (this.value) {
    const usia = hitungUsia(this.value);
    $('#fUsia').textContent = `Usia: ${usia} tahun`;
  }
});

$('#formFisik').addEventListener('submit', e => {
  e.preventDefault();
  const nama = $('#fNama').value.trim();
  const jk = $('#fJK').value;
  const tglLahir = $('#fTglLahir').value;

  // find or create atlet
  let atlet = APP.atlet.find(a => a.nama.toLowerCase() === nama.toLowerCase() && a.jenisKelamin === jk);
  if (!atlet) {
    atlet = {
      id: genId(),
      nama,
      jenisKelamin: jk,
      tanggalLahir: tglLahir,
      usia: hitungUsia(tglLahir)
    };
    APP.atlet.push(atlet);
    saveAtletToFirestore(atlet);
  }

  const tes = {
    id: genId(),
    atletId: atlet.id,
    tanggalTes: $('#fTglTes').value,
    tinggiBadan: parseFloat($('#fTinggi').value),
    beratBadan: parseFloat($('#fBerat').value),
    sitAndReach: parseFloat($('#fSitReach').value),
    coreStability: parseInt($('#fCore').value),
    push: parseFloat($('#fPush').value),
    pull: parseFloat($('#fPull').value),
    ankleKanan: parseFloat($('#fAnkleKanan').value),
    ankleKiri: parseFloat($('#fAnkleKiri').value),
    wbrVisual: parseFloat($('#fWBRVisual').value),
    wbrAudio: parseFloat($('#fWBRAudio').value),
    sbj: parseFloat($('#fSBJ').value)
  };

  APP.tesFisik.push(tes);
  saveTesFisikToFirestore(tes);
  saveNextIdToFirestore();
  renderDashboard();
  $('#fisikSuccess').style.display = 'block';
  setTimeout(() => { $('#fisikSuccess').style.display = 'none'; }, 3000);
  $('#formFisik').reset();
  $('#fUsia').textContent = '';
});

// ===== HASIL TES FISIK =====
function populateFilterAtletFisik() {
  const sel = $('#filterAtletFisik');
  const currentVal = sel.value;
  sel.innerHTML = '<option value="">Semua Atlet</option>';
  const namaSet = [...new Set(APP.tesFisik.map(t => {
    const a = APP.atlet.find(x => x.id === t.atletId);
    return a ? a.nama : 'Unknown';
  }))];
  namaSet.forEach(n => {
    sel.innerHTML += `<option value="${n}">${n}</option>`;
  });
  if (currentVal && namaSet.includes(currentVal)) {
    sel.value = currentVal;
  }
}

// ===== HAPUS DATA PER ATLET =====
function removeAtletIfEmpty(atletId) {
  const hasFisik = APP.tesFisik.some(t => t.atletId === atletId);
  const hasCSS = APP.tesCSS.some(t => t.atletId === atletId);
  if (!hasFisik && !hasCSS) {
    APP.atlet = APP.atlet.filter(a => a.id !== atletId);
    deleteAtletFromFirestore(atletId);
  }
}

function hapusTesFisikAtlet(atletId) {
  const a = APP.atlet.find(x => x.id === atletId);
  if (!a) return;
  if (!confirm(`Hapus SEMUA data tes fisik ${a.nama}?`)) return;
  APP.tesFisik = APP.tesFisik.filter(t => t.atletId !== atletId);
  deleteTesFisikFromFirestore(atletId);
  removeAtletIfEmpty(atletId);
  renderHasilFisik();
  renderDashboard();
}

function hapusTesCSSAtlet(atletId) {
  const a = APP.atlet.find(x => x.id === atletId);
  if (!a) return;
  if (!confirm(`Hapus SEMUA data tes CSS ${a.nama}?`)) return;
  APP.tesCSS = APP.tesCSS.filter(t => t.atletId !== atletId);
  deleteTesCSSFromFirestore(atletId);
  removeAtletIfEmpty(atletId);
  renderHasilCSS();
  renderDashboard();
}

function renderHasilFisik() {
  const filterNama = $('#filterAtletFisik').value;
  let tesList = APP.tesFisik;
  if (filterNama) {
    tesList = tesList.filter(t => {
      const a = APP.atlet.find(x => x.id === t.atletId);
      return a && a.nama === filterNama;
    });
  }

  if (tesList.length === 0) {
    $('#hasilFisikContent').innerHTML = '<div class="empty-state"><p>Belum ada data tes fisik.</p></div>';
    return;
  }

  // group by atlet
  const grouped = {};
  tesList.forEach(t => {
    if (!grouped[t.atletId]) grouped[t.atletId] = [];
    grouped[t.atletId].push(t);
  });

  function buildItems(tes, jk) {
    const imt = getKategoriIMT(tes.beratBadan, tes.tinggiBadan, jk);
    return [
      { label: 'IMT', value: imt.imt, kategori: imt.kategori, persentil: imt.persentil, key: 'IMT', cukupData: imt.cukupData },
      { label: 'Sit & Reach', value: tes.sitAndReach, satuan: 'cm', ...getKategoriNorma(tes.sitAndReach, 'Sit & Reach', jk) },
      { label: 'Core Stability', value: tes.coreStability, satuan: 'level', ...getKategoriNorma(tes.coreStability, 'Core Stability', jk) },
      { label: 'Push', value: tes.push, satuan: 'kg', ...getKategoriNorma(tes.push, 'Push', jk) },
      { label: 'Pull', value: tes.pull, satuan: 'kg', ...getKategoriNorma(tes.pull, 'Pull', jk) },
      { label: 'Ankle Kanan', value: tes.ankleKanan, satuan: 'cm', ...getKategoriNorma(tes.ankleKanan, 'Ankle Kanan', jk) },
      { label: 'Ankle Kiri', value: tes.ankleKiri, satuan: 'cm', ...getKategoriNorma(tes.ankleKiri, 'Ankle Kiri', jk) },
      { label: 'WBR Visual', value: tes.wbrVisual, satuan: 'ms', ...getKategoriNorma(tes.wbrVisual, 'WBR Visual', jk), inverted: true },
      { label: 'WBR Audio', value: tes.wbrAudio, satuan: 'ms', ...getKategoriNorma(tes.wbrAudio, 'WBR Audio', jk), inverted: true },
      { label: 'SBJ', value: tes.sbj, satuan: 'm', ...getKategoriNorma(tes.sbj, 'SBJ', jk) }
    ];
  }

  function renderTabelNormal(items) {
    let t = '<table class="data-table"><thead><tr><th style="width:30%;">Item Tes</th><th style="width:20%;">Nilai</th><th style="width:20%;">Persentil</th><th style="width:30%;">Kategori</th></tr></thead><tbody>';
    items.forEach(it => {
      const katBadge = it.cukupData === false
        ? '<span style="color:var(--text-light);">Belum cukup data</span>'
        : `<span class="badge ${kategoriBadgeClass(it.kategori)}">${it.kategori}</span>`;
      const persen = it.cukupData === false ? '-' : `${it.persentil}%`;
      const sat = it.satuan ? ` ${it.satuan}` : '';
      t += `<tr><td>${it.label}</td><td><strong>${it.value}${sat}</strong></td><td>${persen}</td><td>${katBadge}</td></tr>`;
    });
    t += '</tbody></table>';
    return t;
  }

  function renderPerubahan(lama, baru, inverted) {
    const valL = parseFloat(lama.value);
    const valB = parseFloat(baru.value);
    if (isNaN(valL) || isNaN(valB)) return { text: '-', cls: '' };
    const diff = valB - valL;
    const absDiff = Math.abs(diff);
    if (diff === 0) return { text: '0', cls: '' };
    // inverted: turun = membaik
    const isImprovement = inverted ? diff < 0 : diff > 0;
    const arrow = isImprovement ? '&#9650;' : '&#9660;';
    const cls = isImprovement ? 'color:#16a34a;font-weight:700;' : 'color:#ef4444;font-weight:700;';
    const sign = diff > 0 ? '+' : '';
    return { text: `${sign}${diff.toFixed(1)} ${arrow}`, cls };
  }

  let html = '';
  for (const [atletId, list] of Object.entries(grouped)) {
    const a = APP.atlet.find(x => x.id === parseInt(atletId));
    if (!a) continue;

    // sort by tanggal (terbaru duluan)
    list.sort((x, y) => new Date(y.tanggalTes) - new Date(x.tanggalTes));

    html += `<div class="rek-card">`;
    html += `<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;">`;
    html += `<h3 style="margin:0;">${a.nama} (${a.jenisKelamin}, Usia ${a.usia})</h3>`;
    html += `<button onclick="hapusTesFisikAtlet(${a.id})" style="background:#ef4444;color:#fff;border:none;padding:4px 10px;border-radius:6px;cursor:pointer;font-size:0.75rem;">Hapus Semua Tes Fisik</button>`;
    html += `</div>`;

    if (list.length >= 2) {
      // Ada 2+ tes → tampilkan perbandingan
      const newest = list[0];
      const oldest = list[list.length - 1];
      const itemsNew = buildItems(newest, a.jenisKelamin);
      const itemsOld = buildItems(oldest, a.jenisKelamin);

      // Info tanggal
      html += `<div style="padding:8px 12px;background:#f0f9ff;border-radius:6px;border:1px solid #bae6fd;margin-bottom:12px;font-size:0.85rem;color:#0e7490;">`;
      html += `<strong>Membandingkan:</strong> ${oldest.tanggalTes} (lama) &#8594; ${newest.tanggalTes} (baru)`;
      if (list.length > 2) {
        html += `<span style="color:var(--text-light);margin-left:8px;">(Total ${list.length} tes)</span>`;
      }
      html += `</div>`;

      // Tabel perbandingan
      html += '<table class="data-table"><thead><tr>';
      html += '<th style="width:18%;">Item Tes</th>';
      html += '<th style="width:12%;">Sebelum</th>';
      html += '<th style="width:12%;">Sesudah</th>';
      html += '<th style="width:14%;">Selisih</th>';
      html += '<th style="width:12%;">Persentil</th>';
      html += '<th style="width:16%;">Kategori</th>';
      html += '<th style="width:16%;">Perubahan</th>';
      html += '</tr></thead><tbody>';

      itemsNew.forEach((itNew, idx) => {
        const itOld = itemsOld[idx];
        const sat = itNew.satuan ? ` ${itNew.satuan}` : '';
        const diff = renderPerubahan(itOld, itNew, itNew.inverted);
        const katOld = itOld.cukupData === false ? '-' : itOld.kategori;
        const katNew = itNew.cukupData === false ? '-' : itNew.kategori;
        const katChanged = katOld !== katNew && itOld.cukupData !== false && itNew.cukupData !== false;
        const persen = itNew.cukupData === false ? '-' : `${itNew.persentil}%`;

        let perubahanKat = '';
        if (katChanged) {
          perubahanKat = `<span style="font-size:0.8rem;">${katOld} &#8594; ${katNew}</span>`;
        } else if (itNew.cukupData !== false) {
          perubahanKat = `<span style="font-size:0.8rem;color:var(--text-light);">Tidak berubah</span>`;
        } else {
          perubahanKat = '-';
        }

        html += `<tr>`;
        html += `<td><strong>${itNew.label}</strong></td>`;
        html += `<td>${itOld.value}${sat}</td>`;
        html += `<td><strong>${itNew.value}${sat}</strong></td>`;
        html += `<td style="${diff.cls}">${diff.text}</td>`;
        html += `<td>${persen}</td>`;
        html += `<td>${itNew.cukupData === false ? '<span style="color:var(--text-light)">-</span>' : `<span class="badge ${kategoriBadgeClass(itNew.kategori)}">${itNew.kategori}</span>`}</td>`;
        html += `<td>${perubahanKat}</td>`;
        html += `</tr>`;
      });
      html += '</tbody></table>';

      // Tabel detail per tes jika admin ingin lihat semua
      html += `<details style="margin-top:12px;"><summary style="cursor:pointer;color:var(--primary);font-size:0.85rem;">Lihat detail per tanggal tes</summary>`;
      list.forEach(tes => {
        const items = buildItems(tes, a.jenisKelamin);
        html += `<p style="margin:12px 0 4px;color:var(--text-light);font-size:0.85rem;">Tes: ${tes.tanggalTes}</p>`;
        html += renderTabelNormal(items);
      });
      html += '</details>';

    } else {
      // Hanya 1 tes → tampil normal
      const tes = list[0];
      const items = buildItems(tes, a.jenisKelamin);
      html += `<p style="margin:0 0 8px;color:var(--text-light);font-size:0.85rem;">Tes: ${tes.tanggalTes}</p>`;
      html += renderTabelNormal(items);
    }

    html += '</div>';
  }

  $('#hasilFisikContent').innerHTML = html;
}


// ===== INPUT CSS =====
function populateAtletDropdowns() {
  const sel = $('#cAtlet');
  const current = sel.value;
  sel.innerHTML = '<option value="">-- Pilih Atlet --</option>';
  const namaSet = [...new Set(APP.atlet.map(a => a.nama))];
  namaSet.forEach(n => {
    sel.innerHTML += `<option value="${n}">${n}</option>`;
  });
  if (current) sel.value = current;
}

function populateFilterAtletCSS() {
  const sel = $('#filterAtletCSS');
  const current = sel.value;
  sel.innerHTML = '<option value="">Semua Atlet</option>';
  const namaSet = [...new Set(APP.tesCSS.map(t => {
    const a = APP.atlet.find(x => x.id === t.atletId);
    return a ? a.nama : 'Unknown';
  }))];
  namaSet.forEach(n => {
    sel.innerHTML += `<option value="${n}">${n}</option>`;
  });
  if (current) sel.value = current;
}

function populateFilterAtletRek() {
  const sel = $('#filterAtletRek');
  const current = sel.value;
  sel.innerHTML = '<option value="">Semua Atlet</option>';
  const namaSet = [...new Set(APP.atlet.map(a => a.nama))];
  namaSet.forEach(n => {
    sel.innerHTML += `<option value="${n}">${n}</option>`;
  });
  if (current) sel.value = current;
}

$('#formCSS').addEventListener('submit', e => {
  e.preventDefault();
  const namaAtlet = $('#cAtlet').value;
  const atlet = APP.atlet.find(a => a.nama === namaAtlet);
  if (!atlet) return alert('Pilih atlet terlebih dahulu!');

  const w50 = parseTime($('#cWaktu50').value);
  const w400 = parseTime($('#cWaktu400').value);
  if (isNaN(w50) || isNaN(w400) || w400 <= w50) {
    return alert('Format waktu tidak valid atau waktu 400m harus lebih besar dari 50m!');
  }

  // CSS
  const css = 350 / (w400 - w50);
  let kategoriCSS;
  if (css > 1.6) kategoriCSS = 'Elite';
  else if (css >= 1.4) kategoriCSS = 'Bagus Sekali';
  else if (css >= 1.2) kategoriCSS = 'Bagus';
  else if (css >= 1.0) kategoriCSS = 'Rata-rata';
  else kategoriCSS = 'Di Bawah Rata-rata';

  // Pace per 100m
  const paceDetik = 100 / css;
  const paceStr = formatPace(paceDetik);
  const paceMin = paceDetik / 60;
  let tingkatanPace;
  if (paceMin > 1.4) tingkatanPace = 'Pemula';
  else if (paceMin >= 1.23) tingkatanPace = 'Rata-rata';
  else if (paceMin >= 1.11) tingkatanPace = 'Klub';
  else if (paceMin >= 1.02) tingkatanPace = 'Nasional';
  else tingkatanPace = 'Olimpiade';

  // VO2max
  const vo2max = (css * 60 * 0.2) + 3.5;
  const usia = atlet.usia;
  let kategoriVO2max;
  if (usia > 17) {
    if (vo2max >= 17) kategoriVO2max = 'Sangat Baik';
    else if (vo2max >= 16.24) kategoriVO2max = 'Baik';
    else if (vo2max >= 15.48) kategoriVO2max = 'Cukup';
    else if (vo2max >= 14.72) kategoriVO2max = 'Kurang';
    else kategoriVO2max = 'Kurang Sekali';
  } else {
    if (vo2max >= 17) kategoriVO2max = 'Sangat Baik';
    else if (vo2max >= 16.24) kategoriVO2max = 'Baik';
    else if (vo2max >= 15.48) kategoriVO2max = 'Cukup';
    else if (vo2max >= 14.72) kategoriVO2max = 'Kurang';
    else kategoriVO2max = 'Kurang Sekali';
  }

  const tes = {
    id: genId(),
    atletId: atlet.id,
    tanggalTes: $('#cTanggal').value,
    waktu50: $('#cWaktu50').value,
    waktu400: $('#cWaktu400').value,
    css: css.toFixed(3),
    kategoriCSS,
    pace100: paceStr,
    tingkatanPace,
    vo2max: vo2max.toFixed(2),
    kategoriVO2max,
    catatanMuda: usia <= 17 ? 'Nilai VO2max ini perlu dikalibrasi lebih lanjut karena atlet masih dalam masa pertumbuhan.' : ''
  };

  APP.tesCSS.push(tes);
  saveTesCSSToFirestore(tes);
  saveNextIdToFirestore();
  renderDashboard();

  // Show result
  showCSSResult(atlet, tes);
  $('#cssSuccess').style.display = 'block';
  setTimeout(() => { $('#cssSuccess').style.display = 'none'; }, 4000);
  $('#formCSS').reset();
});

function showCSSResult(atlet, tes) {
  const panel = $('#cssResult');
  panel.style.display = 'block';

  // Narasi
  let narasi = `<div class="result-narasi">`;
  narasi += `<div class="greeting">Halo, ${atlet.nama}!</div>`;
  narasi += `<p>Berikut adalah hasil tes CSS (Critical Swim Speed) Anda pada tanggal ${tes.tanggalTes}:</p>`;
  narasi += `<div class="result-grid">`;
  narasi += `<div class="result-item"><div class="ri-label">CSS</div><div class="ri-value">${tes.css} m/s</div><div class="ri-kategori"><span class="badge ${kategoriBadgeClass(tes.kategoriCSS)}">${tes.kategoriCSS}</span></div></div>`;
  narasi += `<div class="result-item"><div class="ri-label">Pace / 100m</div><div class="ri-value">${tes.pace100}</div><div class="ri-kategori"><span class="badge ${kategoriBadgeClass(tes.tingkatanPace)}">${tes.tingkatanPace}</span></div></div>`;
  narasi += `<div class="result-item"><div class="ri-label">VO2max</div><div class="ri-value">${tes.vo2max}</div><div class="ri-kategori"><span class="badge ${kategoriBadgeClass(tes.kategoriVO2max)}">${tes.kategoriVO2max}</span></div></div>`;
  narasi += `</div>`;

  // Kesimpulan & Saran
  narasi += `<p style="margin-top:12px;"><strong>Kesimpulan:</strong> `;
  if (tes.kategoriCSS === 'Elite' || tes.kategoriCSS === 'Bagus Sekali') {
    narasi += `Performa endurance Anda sangat baik. Pertahankan dengan program interval speed dan race pace training untuk mencapai level kompetisi yang lebih tinggi.`;
  } else if (tes.kategoriCSS === 'Bagus') {
    narasi += `Performa endurance Anda cukup baik. Tingkatkan volume latihan aerobik dan tambahkan interval training untuk meningkatkan CSS.`;
  } else if (tes.kategoriCSS === 'Rata-rata') {
    narasi += `Performa endurance Anda di level rata-rata. Fokus pada aerobic base building dengan long slow distance (LSD) dan progressively increase intensity.`;
  } else {
    narasi += `Performa endurance Anda masih perlu ditingkatkan. Mulai dengan program aerobic base building yang konsisten, jarak pendek dengan intensitas rendah, dan tingkatkan secara bertahap.`;
  }
  narasi += `</p>`;

  if (tes.catatanMuda) {
    narasi += `<p style="margin-top:8px;color:var(--yellow);font-style:italic;">${tes.catatanMuda}</p>`;
  }

  narasi += `</div>`;
  panel.innerHTML = narasi;
}

// ===== HASIL CSS =====
function renderHasilCSS() {
  const filterNama = $('#filterAtletCSS').value;
  let list = APP.tesCSS;
  if (filterNama) {
    list = list.filter(t => {
      const a = APP.atlet.find(x => x.id === t.atletId);
      return a && a.nama === filterNama;
    });
  }

  if (list.length === 0) {
    $('#hasilCSSContent').innerHTML = '<div class="empty-state"><p>Belum ada data tes CSS.</p></div>';
    return;
  }

  const grouped = {};
  list.forEach(t => {
    if (!grouped[t.atletId]) grouped[t.atletId] = [];
    grouped[t.atletId].push(t);
  });

  let html = '';
  for (const [atletId, tesList] of Object.entries(grouped)) {
    const a = APP.atlet.find(x => x.id === parseInt(atletId));
    if (!a) continue;

    html += `<div class="rek-card"><div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;"><h3 style="margin:0;">${a.nama} (${a.jenisKelamin}, Usia ${a.usia})</h3><button onclick="hapusTesCSSAtlet(${a.id})" style="background:#ef4444;color:#fff;border:none;padding:4px 10px;border-radius:6px;cursor:pointer;font-size:0.75rem;">Hapus Semua Tes CSS</button></div>`;
    html += '<table class="data-table"><thead><tr><th>Tanggal</th><th>CSS (m/s)</th><th>Kategori CSS</th><th>Pace/100m</th><th>Tingkatan Pace</th><th>VO2max</th><th>Kategori VO2max</th></tr></thead><tbody>';
    tesList.forEach(t => {
      html += `<tr>
        <td>${t.tanggalTes}</td>
        <td><strong>${t.css}</strong></td>
        <td><span class="badge ${kategoriBadgeClass(t.kategoriCSS)}">${t.kategoriCSS}</span></td>
        <td>${t.pace100}</td>
        <td><span class="badge ${kategoriBadgeClass(t.tingkatanPace)}">${t.tingkatanPace}</span></td>
        <td>${t.vo2max}</td>
        <td><span class="badge ${kategoriBadgeClass(t.kategoriVO2max)}">${t.kategoriVO2max}</span>${t.catatanMuda ? ' <small style="color:var(--yellow);">*</small>' : ''}</td>
      </tr>`;
    });
    html += '</tbody></table>';
    if (tesList.some(t => t.catatanMuda)) {
      html += '<p style="font-size:0.8rem;color:var(--yellow);margin-top:8px;">* VO2max atlet muda perlu dikalibrasi lebih lanjut.</p>';
    }
    html += '</div>';
  }

  $('#hasilCSSContent').innerHTML = html;
}

$('#filterAtletCSS').addEventListener('change', renderHasilCSS);

// ===== RADAR CHART =====
const RADAR_LABELS = ['Sit & Reach', 'Core Stability', 'Push', 'Pull', 'Ankle Kanan', 'Ankle Kiri', 'WBR Visual', 'WBR Audio', 'SBJ'];
const RADAR_FIELDS = ['sitAndReach', 'coreStability', 'push', 'pull', 'ankleKanan', 'ankleKiri', 'wbrVisual', 'wbrAudio', 'sbj'];

// Normalisasi radar dengan Mean & SD dinamis per jenis kelamin
function normalizeRadar(value, key, jenisKelamin) {
  const { mean, sd, cukupData } = getMeanSDForItem(key, jenisKelamin);
  if (!cukupData || sd === 0) return 50;
  // For WBR items: lower value = better. Invert normalization.
  if (key === 'WBR Visual' || key === 'WBR Audio') {
    const score = 100 - ((value - (mean - 2 * sd)) / (4 * sd)) * 100;
    return Math.max(0, Math.min(100, score));
  }
  // For others: higher = better. Map mean-2*sd -> 0, mean+2*sd -> 100
  const score = ((value - (mean - 2 * sd)) / (4 * sd)) * 100;
  return Math.max(0, Math.min(100, score));
}

function drawRadarChart(canvas, datasets, labels) {
  const ctx = canvas.getContext('2d');
  const W = canvas.width;
  const H = canvas.height;
  const cx = W / 2;
  const cy = H / 2;
  const R = Math.min(cx, cy) - 60;
  const n = labels.length;
  const angleStep = (2 * Math.PI) / n;
  const startAngle = -Math.PI / 2;

  ctx.clearRect(0, 0, W, H);

  // Draw grid circles
  for (let level = 1; level <= 5; level++) {
    const r = (R * level) / 5;
    ctx.beginPath();
    for (let i = 0; i <= n; i++) {
      const angle = startAngle + i * angleStep;
      const x = cx + r * Math.cos(angle);
      const y = cy + r * Math.sin(angle);
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.closePath();
    ctx.strokeStyle = '#e2e8f0';
    ctx.lineWidth = 1;
    ctx.stroke();

    // Level label
    ctx.fillStyle = '#94a3b8';
    ctx.font = '10px sans-serif';
    ctx.fillText(level * 20, cx + 4, cy - r + 12);
  }

  // Draw axes and labels
  for (let i = 0; i < n; i++) {
    const angle = startAngle + i * angleStep;
    const x = cx + R * Math.cos(angle);
    const y = cy + R * Math.sin(angle);

    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.lineTo(x, y);
    ctx.strokeStyle = '#cbd5e1';
    ctx.lineWidth = 1;
    ctx.stroke();

    // Label
    const labelR = R + 24;
    const lx = cx + labelR * Math.cos(angle);
    const ly = cy + labelR * Math.sin(angle);
    ctx.fillStyle = '#475569';
    ctx.font = 'bold 11px sans-serif';
    ctx.textAlign = Math.abs(angle + Math.PI / 2) < 0.01 ? 'center' : (Math.cos(angle) > 0.1 ? 'left' : (Math.cos(angle) < -0.1 ? 'right' : 'center'));
    ctx.textBaseline = 'middle';
    ctx.fillText(labels[i], lx, ly);
  }

  // Draw datasets
  const colors = [
    { fill: 'rgba(8,145,178,0.25)', stroke: '#0891b2' },
    { fill: 'rgba(234,88,12,0.2)', stroke: '#ea580c' }
  ];

  datasets.forEach((data, di) => {
    const color = colors[di % colors.length];
    ctx.beginPath();
    data.forEach((val, i) => {
      const angle = startAngle + i * angleStep;
      const r = (R * val) / 100;
      const x = cx + r * Math.cos(angle);
      const y = cy + r * Math.sin(angle);
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.closePath();
    ctx.fillStyle = color.fill;
    ctx.fill();
    ctx.strokeStyle = color.stroke;
    ctx.lineWidth = 2.5;
    ctx.stroke();

    // Draw data points
    data.forEach((val, i) => {
      const angle = startAngle + i * angleStep;
      const r = (R * val) / 100;
      const x = cx + r * Math.cos(angle);
      const y = cy + r * Math.sin(angle);
      ctx.beginPath();
      ctx.arc(x, y, 4, 0, 2 * Math.PI);
      ctx.fillStyle = color.stroke;
      ctx.fill();
      ctx.strokeStyle = '#fff';
      ctx.lineWidth = 2;
      ctx.stroke();
    });
  });
}

// ===== RADAR MODAL =====
let radarCurrentAtletId = null;

function openRadarModal(atletId) {
  radarCurrentAtletId = atletId;
  const atlet = APP.atlet.find(a => a.id === atletId);
  if (!atlet) return;

  const allFisik = APP.tesFisik.filter(t => t.atletId === atletId).sort((x, y) => new Date(y.tanggalTes) - new Date(x.tanggalTes));
  if (allFisik.length === 0) {
    alert('Atlet ini belum memiliki data tes fisik.');
    return;
  }

  $('#radarModal').style.display = 'flex';
  $('#radarModalTitle').textContent = `Profil Fisik: ${atlet.nama}`;

  const latest = allFisik[0];
  const compareCheckbox = $('#radarCompareMode');
  compareCheckbox.checked = false;
  compareCheckbox.onchange = () => renderRadarData(atlet, allFisik);

  renderRadarData(atlet, allFisik);
}

function renderRadarData(atlet, allFisik) {
  const compareMode = $('#radarCompareMode').checked;
  const latest = allFisik[0];
  const datasets = [];
  const legendHtml = [];

  // Current values — gunakan jenis kelamin atlet untuk kalkulasi dinamis
  const currentNorm = RADAR_FIELDS.map((field, i) => normalizeRadar(latest[RADAR_FIELDS[i]], RADAR_LABELS[i], atlet.jenisKelamin));
  datasets.push(currentNorm);
  legendHtml.push(`<div class="radar-legend-item"><div class="radar-legend-dot" style="background:#0891b2;"></div>Tes Terbaru (${latest.tanggalTes})</div>`);

  // Comparison
  if (compareMode && allFisik.length > 1) {
    const prev = allFisik[1];
    const prevNorm = RADAR_FIELDS.map((field, i) => normalizeRadar(prev[RADAR_FIELDS[i]], RADAR_LABELS[i], atlet.jenisKelamin));
    datasets.push(prevNorm);
    legendHtml.push(`<div class="radar-legend-item"><div class="radar-legend-dot" style="background:#ea580c;"></div>Tes Sebelumnya (${prev.tanggalTes})</div>`);
  }

  const canvas = $('#radarCanvas');
  drawRadarChart(canvas, datasets, RADAR_LABELS);

  $('#radarLegend').innerHTML = legendHtml.join('');

  // Values table
  let valHtml = '';
  RADAR_LABELS.forEach((label, i) => {
    const rawVal = latest[RADAR_FIELDS[i]];
    const normVal = Math.round(currentNorm[i]);
    let oldHtml = '';
    if (compareMode && allFisik.length > 1) {
      const prevVal = allFisik[1][RADAR_FIELDS[i]];
      const prevNorm = Math.round(normalizeRadar(prevVal, RADAR_LABELS[i], atlet.jenisKelamin));
      const diff = normVal - prevNorm;
      const diffStr = diff > 0 ? `<span style="color:var(--green)">+${diff}</span>` : (diff < 0 ? `<span style="color:var(--red)">${diff}</span>` : '<span style="color:var(--text-light)">0</span>');
      oldHtml = `<span class="rv-old">(${prevVal} / ${prevNorm}%)</span> ${diffStr}`;
    }
    valHtml += `<div class="radar-val-item"><span class="rv-label">${label}</span><span class="rv-value">${rawVal} / ${normVal}% ${oldHtml}</span></div>`;
  });
  $('#radarValues').innerHTML = valHtml;
}

$('#radarModalClose').addEventListener('click', () => { $('#radarModal').style.display = 'none'; });
$('#radarModalOverlay').addEventListener('click', () => { $('#radarModal').style.display = 'none'; });
$('#radarDownloadBtn').addEventListener('click', function() {
  if (radarCurrentAtletId) {
    downloadKartu(radarCurrentAtletId, this);
  }
});

// ===== DASHBOARD =====
function renderDashboard() {
  if (APP.atlet.length === 0) {
    $('#dashboardStats').innerHTML = '';
    $('#dashboardCards').innerHTML = '';
    $('#dashboardEmpty').style.display = 'block';
    return;
  }
  $('#dashboardEmpty').style.display = 'none';

  // Stats
  const totalAtlet = APP.atlet.length;
  const totalFisik = APP.tesFisik.length;
  const totalCSS = APP.tesCSS.length;
  $('#dashboardStats').innerHTML = `
    <div class="stat-card"><div class="stat-value">${totalAtlet}</div><div class="stat-label">Total Atlet</div></div>
    <div class="stat-card"><div class="stat-value">${totalFisik}</div><div class="stat-label">Total Tes Fisik</div></div>
    <div class="stat-card"><div class="stat-value">${totalCSS}</div><div class="stat-label">Total Tes CSS</div></div>
  `;

  // Cards per atlet
  let html = '';
  APP.atlet.forEach(a => {
    const allFisik = APP.tesFisik.filter(t => t.atletId === a.id).sort((x, y) => new Date(y.tanggalTes) - new Date(x.tanggalTes));
    const latestFisik = allFisik[0];
    const latestCSS = APP.tesCSS.filter(t => t.atletId === a.id).sort((x, y) => new Date(y.tanggalTes) - new Date(x.tanggalTes))[0];

    html += `<div class="dash-card">`;
    html += `<h3>${a.nama}</h3>`;
    html += `<div class="dash-row"><span class="dash-label">Jenis Kelamin</span><span class="dash-value">${a.jenisKelamin}</span></div>`;
    html += `<div class="dash-row"><span class="dash-label">Usia</span><span class="dash-value">${a.usia} tahun</span></div>`;

    if (latestFisik) {
      // Average kategori
      const items = ['Sit & Reach', 'Core Stability', 'Push', 'Pull', 'Ankle Kanan', 'Ankle Kiri', 'WBR Visual', 'WBR Audio', 'SBJ'];
      const values = [latestFisik.sitAndReach, latestFisik.coreStability, latestFisik.push, latestFisik.pull, latestFisik.ankleKanan, latestFisik.ankleKiri, latestFisik.wbrVisual, latestFisik.wbrAudio, latestFisik.sbj];
      const kats = values.map((v, i) => {
        const result = getKategoriNorma(v, items[i], a.jenisKelamin);
        return result.kategori || '-';
      });
      const dominant = kats.filter(k => k !== '-').sort((a, b) => {
        const order = ['Baik Sekali', 'Baik', 'Cukup', 'Kurang', 'Kurang Sekali'];
        return order.indexOf(a) - order.indexOf(b);
      })[0] || '-';

      const imt = getKategoriIMT(latestFisik.beratBadan, latestFisik.tinggiBadan, a.jenisKelamin);
      html += `<div class="dash-row"><span class="dash-label">IMT</span><span class="dash-value">${imt.imt} ${imt.cukupData ? `<span class="badge ${kategoriBadgeClass(imt.kategori)}">${imt.kategori}</span>` : '<span style="color:var(--text-light);">Belum cukup data</span>'}</span></div>`;
      html += `<div class="dash-row"><span class="dash-label">Kondisi Fisik (dominan)</span><span class="dash-value">${dominant !== '-' ? `<span class="badge ${kategoriBadgeClass(dominant)}">${dominant}</span>` : '<span style="color:var(--text-light);">Belum cukup data</span>'}</span></div>`;

      // History summary
      if (allFisik.length > 1) {
        html += `<div class="dash-row"><span class="dash-label">Riwayat Tes</span><span class="dash-value">${allFisik.length} kali tes</span></div>`;
      }
    } else {
      html += `<div class="dash-row"><span class="dash-label">Tes Fisik</span><span class="dash-value" style="color:var(--text-light)">Belum ada data</span></div>`;
    }

    if (latestCSS) {
      html += `<div class="dash-row"><span class="dash-label">CSS</span><span class="dash-value">${latestCSS.css} m/s <span class="badge ${kategoriBadgeClass(latestCSS.kategoriCSS)}">${latestCSS.kategoriCSS}</span></span></div>`;
      html += `<div class="dash-row"><span class="dash-label">VO2max</span><span class="dash-value">${latestCSS.vo2max} <span class="badge ${kategoriBadgeClass(latestCSS.kategoriVO2max)}">${latestCSS.kategoriVO2max}</span></span></div>`;
    } else {
      html += `<div class="dash-row"><span class="dash-label">Tes CSS</span><span class="dash-value" style="color:var(--text-light)">Belum ada data</span></div>`;
    }

    // Detail buttons
    if (latestFisik) {
      html += `<div style="display:flex;gap:8px;margin-top:12px;">
        <button class="btn-detail" onclick="openRadarModal(${a.id})" style="flex:1;">Lihat Detail Radar</button>
        <button class="btn-detail" onclick="downloadKartu(${a.id}, this)" style="flex:1;background:#0d9488;">Download Kartu</button>
      </div>`;
    }

    html += '</div>';
  });

  $('#dashboardCards').innerHTML = html;
}

// ===== DOWNLOAD KARTU ATLET =====

function downloadKartu(atletId, btnEl) {
  const atlet = APP.atlet.find(a => a.id === atletId);
  if (!atlet) return;

  const latestFisik = APP.tesFisik.filter(t => t.atletId === atletId).sort((x, y) => new Date(y.tanggalTes) - new Date(x.tanggalTes))[0];
  const latestCSS = APP.tesCSS.filter(t => t.atletId === atletId).sort((x, y) => new Date(y.tanggalTes) - new Date(x.tanggalTes))[0];

  // Show loading pada tombol
  const btn = btnEl;
  const origText = btn.textContent;
  btn.textContent = 'Menyiapkan file...';
  btn.disabled = true;

  // Generate radar chart dulu
  const tempCanvas = document.createElement('canvas');
  tempCanvas.width = 460;
  tempCanvas.height = 460;
  let radarImgSrc = '';

  if (latestFisik) {
    const radarData = RADAR_FIELDS.map((field, i) => normalizeRadar(latestFisik[field], RADAR_LABELS[i], atlet.jenisKelamin));
    drawRadarChart(tempCanvas, [radarData], RADAR_LABELS);
    radarImgSrc = tempCanvas.toDataURL('image/png');
  }

  // Build full HTML kartu
  const now = new Date();
  const tglUnduh = now.toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' });

  let kartuHTML = `
  <div style="width:500px;background:#fff;padding:28px;font-family:'Segoe UI',system-ui,sans-serif;color:#1e293b;">
    <div style="text-align:center;border-bottom:3px solid #0891b2;padding-bottom:14px;margin-bottom:16px;">
      <svg viewBox="0 0 100 60" width="80" height="48" style="margin-bottom:4px;">
        <path d="M10 40 Q25 20 40 40 Q55 20 70 40 Q85 20 100 40" fill="none" stroke="#0891b2" stroke-width="4" stroke-linecap="round"/>
        <path d="M0 50 Q15 30 30 50 Q45 30 60 50 Q75 30 90 50" fill="none" stroke="#06b6d4" stroke-width="3" stroke-linecap="round" opacity="0.5"/>
        <text x="50" y="28" text-anchor="middle" font-size="14" font-weight="bold" fill="#0e7490">MEGALODON</text>
      </svg>
      <div style="font-size:14px;font-weight:700;color:#0e7490;">Club Renang Megalodon Kab Tuban</div>
    </div>

    <div style="margin-bottom:14px;">
      <div style="font-size:20px;font-weight:700;color:#0e7490;margin-bottom:4px;">${atlet.nama}</div>
      <div style="font-size:12px;color:#64748b;">${atlet.jenisKelamin} | Usia ${atlet.usia} tahun</div>
    </div>`;

  if (latestFisik) {
    const imt = getKategoriIMT(latestFisik.beratBadan, latestFisik.tinggiBadan, atlet.jenisKelamin);
    kartuHTML += `
    <table style="width:100%;border-collapse:collapse;font-size:12px;margin-bottom:14px;">
      <tr style="background:#f0f9ff;">
        <td style="padding:7px 10px;font-weight:600;border:1px solid #e2e8f0;width:40%;">IMT</td>
        <td style="padding:7px 10px;border:1px solid #e2e8f0;">${imt.imt} <span style="font-weight:700;color:${imt.kategori === 'Ideal' ? '#16a34a' : '#dc2626'};">(${imt.kategori})</span></td>
      </tr>`;

    const items = [
      { label: 'Sit & Reach', val: latestFisik.sitAndReach, satuan: 'cm', key: 'Sit & Reach' },
      { label: 'Core Stability', val: latestFisik.coreStability, satuan: 'level', key: 'Core Stability' },
      { label: 'Push', val: latestFisik.push, satuan: 'kg', key: 'Push' },
      { label: 'Pull', val: latestFisik.pull, satuan: 'kg', key: 'Pull' },
      { label: 'Ankle Kanan', val: latestFisik.ankleKanan, satuan: 'cm', key: 'Ankle Kanan' },
      { label: 'Ankle Kiri', val: latestFisik.ankleKiri, satuan: 'cm', key: 'Ankle Kiri' },
      { label: 'WBR Visual', val: latestFisik.wbrVisual, satuan: 'ms', key: 'WBR Visual' },
      { label: 'WBR Audio', val: latestFisik.wbrAudio, satuan: 'ms', key: 'WBR Audio' },
      { label: 'SBJ', val: latestFisik.sbj, satuan: 'm', key: 'SBJ' }
    ];

    items.forEach(it => {
      const result = getKategoriNorma(it.val, it.key, atlet.jenisKelamin);
      const katColor = result.kategori.includes('Baik') ? '#16a34a' : (result.kategori.includes('Kurang') ? '#dc2626' : '#ca8a04');
      const bg = items.indexOf(it) % 2 === 0 ? '#fff' : '#f8fafc';
      kartuHTML += `<tr style="background:${bg};">
        <td style="padding:7px 10px;font-weight:600;border:1px solid #e2e8f0;">${it.label}</td>
        <td style="padding:7px 10px;border:1px solid #e2e8f0;">${it.val} ${it.satuan} <span style="font-weight:700;color:${katColor};">(${result.cukupData ? result.kategori : '-'})</span></td>
      </tr>`;
    });
    kartuHTML += `</table>`;
    kartuHTML += `<div style="font-size:10px;color:#94a3b8;margin-bottom:10px;">Tanggal Tes Fisik: ${latestFisik.tanggalTes}</div>`;
  } else {
    kartuHTML += `<div style="padding:14px;background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;text-align:center;color:#94a3b8;font-size:12px;margin-bottom:14px;">Belum ada data tes fisik</div>`;
  }

  if (latestCSS) {
    kartuHTML += `
    <div style="padding:10px 14px;background:#f0f9ff;border:1px solid #bae6fd;border-radius:8px;font-size:12px;margin-bottom:10px;">
      <div style="font-weight:700;color:#0e7490;margin-bottom:6px;">Hasil Tes CSS</div>
      <div><strong>CSS:</strong> ${latestCSS.css} m/s <span style="font-weight:700;color:${latestCSS.kategoriCSS.includes('Bagus') || latestCSS.kategoriCSS.includes('Elite') ? '#16a34a' : '#ca8a04'};">(${latestCSS.kategoriCSS})</span></div>
      <div><strong>Pace/100m:</strong> ${latestCSS.pace100} <span style="font-weight:600;color:#64748b;">(${latestCSS.tingkatanPace})</span></div>
      <div><strong>VO2max:</strong> ${latestCSS.vo2max} <span style="font-weight:700;color:${latestCSS.kategoriVO2max.includes('Sangat') || latestCSS.kategoriVO2max.includes('Baik') ? '#16a34a' : '#ca8a04'};">(${latestCSS.kategoriVO2max})</span></div>
    </div>
    <div style="font-size:10px;color:#94a3b8;margin-bottom:10px;">Tanggal Tes CSS: ${latestCSS.tanggalTes}</div>`;
  } else {
    kartuHTML += `<div style="padding:14px;background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;text-align:center;color:#94a3b8;font-size:12px;margin-bottom:10px;">Belum ada data CSS</div>`;
  }

  if (radarImgSrc) {
    kartuHTML += `
    <div style="text-align:center;margin-top:14px;padding-top:12px;border-top:2px solid #e2e8f0;">
      <div style="font-size:13px;font-weight:700;color:#0e7490;margin-bottom:10px;">Grafik Radar Profil Fisik</div>
      <img src="${radarImgSrc}" style="max-width:300px;border:1px solid #e2e8f0;border-radius:8px;" />
    </div>`;
  }

  kartuHTML += `
    <div style="text-align:center;margin-top:18px;padding-top:10px;border-top:1px solid #e2e8f0;font-size:10px;color:#94a3b8;">
      <div>Dicetak: ${tglUnduh}</div>
      <div style="margin-top:2px;">Club Renang Megalodon Kab Tuban — Aplikasi Manajemen Atlet</div>
    </div>
  </div>`;

  // ===== HALAMAN 2: REKOMENDASI =====
  // Array of individual HTML blocks for anti-potong rendering
  const rekBlocks = [];

  function addRekBlock(html) {
    rekBlocks.push(html);
  }

  // Header
  const rekHeaderHTML = `
  <div style="width:500px;background:#fff;padding:28px 28px 0 28px;font-family:'Segoe UI',system-ui,sans-serif;color:#1e293b;">
    <div style="text-align:center;border-bottom:3px solid #0891b2;padding-bottom:14px;margin-bottom:16px;">
      <div style="font-size:16px;font-weight:700;color:#0e7490;">Rekomendasi Program Latihan</div>
      <div style="font-size:12px;color:#64748b;">${atlet.nama} — ${atlet.jenisKelamin}, Usia ${atlet.usia}</div>
    </div>
  </div>`;

  if (latestFisik || latestCSS) {
    addRekBlock(rekHeaderHTML);

    // Fisik Recommendations
    if (latestFisik) {
      const fisikItems = [
        { label: 'Ankle Flexibility Kanan', value: latestFisik.ankleKanan, key: 'Ankle Kanan',
          saran: 'Fleksibilitas pergelangan kaki',
          protocol: 'Mobilisasi pergelangan kaki, stretching betis (gastrocnemius/soleus), latihan plantarflexion terbantu (banded ankle stretch) — dilakukan rutin sebelum & sesudah latihan renang untuk efisiensi tendangan.',
          ref: 'Kuhn & Legerlotz (2022); Sifaki et al.' },
        { label: 'Ankle Flexibility Kiri', value: latestFisik.ankleKiri, key: 'Ankle Kiri',
          saran: 'Fleksibilitas pergelangan kaki',
          protocol: 'Mobilisasi pergelangan kaki, stretching betis (gastrocnemius/soleus), latihan plantarflexion terbantu (banded ankle stretch) — dilakukan rutin sebelum & sesudah latihan renang untuk efisiensi tendangan.',
          ref: 'Kuhn & Legerlotz (2022); Sifaki et al.' },
        { label: 'Push (Expanding)', value: latestFisik.push, key: 'Push',
          saran: 'Resistance training upper body',
          protocol: 'Bench press, push press, dumbbell fly — 3-4 set x 8-12 rep, 3x/minggu selama 9 minggu.',
          ref: 'Amara et al. (2021); Science & Sports (2020)' },
        { label: 'Pull (Expanding)', value: latestFisik.pull, key: 'Pull',
          saran: 'Resistance training upper body',
          protocol: 'Lat pulldown, barbell row, pull-up — 3-4 set x 8-12 rep, 3x/minggu selama 9 minggu.',
          ref: 'Amara et al. (2021)' },
        { label: 'Core Stability', value: latestFisik.coreStability, key: 'Core Stability',
          saran: 'Core stability training',
          protocol: 'Plank, dead bug, pallof press, anti-rotation — 3 set x 30-60 detik, 3x/minggu selama 8 minggu.',
          ref: 'Liu et al. (2025) — meta-analisis 16 uji klinis' },
        { label: 'Sit & Reach', value: latestFisik.sitAndReach, key: 'Sit & Reach',
          saran: 'Fleksibilitas & stretching',
          protocol: 'Static stretching 30 detik/pose, dynamic stretching pra-latihan. Fokus pada hamstring, hip flexor, shoulders. Minimal 10-15 menit setelah setiap sesi latihan.',
          ref: 'Praktik terbaik kepelatihan renang' },
        { label: 'Standing Broad Jump', value: latestFisik.sbj, key: 'SBJ',
          saran: 'Plyometric training',
          protocol: 'Box jumps, broad jumps, squat jumps — 3 set x 6-8 rep, 2x/minggu.',
          ref: 'Wibowo et al.; Sammoud et al. (2019); Bishop et al. (2009)' },
        { label: 'WBR Visual', value: latestFisik.wbrVisual, key: 'WBR Visual',
          saran: 'Latihan reaksi visual',
          protocol: 'Start practice dengan stimulus visual (lampu/flag) — 4 sesi/minggu selama 4 minggu.',
          ref: 'Papic et al. (2018)' },
        { label: 'WBR Audio', value: latestFisik.wbrAudio, key: 'WBR Audio',
          saran: 'Latihan reaksi audio',
          protocol: 'Start practice dengan stimulus auditori kompetisi (buzzer/beep) — 4 sesi/minggu selama 4 minggu.',
          ref: 'Papic et al. (2018)' }
      ];

      const kurang = fisikItems.filter(it => {
        const result = getKategoriNorma(it.value, it.key, atlet.jenisKelamin);
        return result.cukupData && (result.kategori === 'Kurang' || result.kategori === 'Kurang Sekali');
      });
      const cukup = fisikItems.filter(it => {
        const result = getKategoriNorma(it.value, it.key, atlet.jenisKelamin);
        return result.cukupData && result.kategori === 'Cukup';
      });
      const baik = fisikItems.filter(it => {
        const result = getKategoriNorma(it.value, it.key, atlet.jenisKelamin);
        return result.cukupData && (result.kategori === 'Baik' || result.kategori === 'Baik Sekali');
      });

      if (kurang.length > 0 || cukup.length > 0) {
        const sectionTitleHTML = `<div style="width:500px;background:#fff;padding:0 28px;font-family:'Segoe UI',system-ui,sans-serif;"><div style="font-size:13px;font-weight:700;color:#0e7490;margin-bottom:8px;padding-bottom:4px;border-bottom:1px solid #e2e8f0;">Program Fisik yang Direkomendasikan</div></div>`;
        addRekBlock(sectionTitleHTML);

        [...kurang, ...cukup].forEach(it => {
          const result = getKategoriNorma(it.value, it.key, atlet.jenisKelamin);
          const dotColor = result.kategori.includes('Kurang') ? '#ef4444' : '#eab308';
          addRekBlock(`<div style="width:500px;background:#fff;padding:4px 28px;font-family:'Segoe UI',system-ui,sans-serif;">
            <div style="display:flex;gap:8px;margin-bottom:8px;padding:8px;background:#f8fafc;border-radius:6px;border-left:3px solid ${dotColor};">
              <div style="min-width:8px;padding-top:3px;"><div style="width:8px;height:8px;border-radius:50%;background:${dotColor};"></div></div>
              <div style="flex:1;">
                <div style="font-weight:700;font-size:12px;">${it.label} <span style="display:inline-block;padding:1px 6px;border-radius:4px;font-size:10px;font-weight:600;color:#fff;background:${dotColor};">${result.kategori}</span></div>
                <div style="font-size:11px;color:#64748b;margin:2px 0;">Nilai: ${it.value} | Mean: ${result.mean.toFixed(1)} | SD: ${result.sd.toFixed(1)}</div>
                <div style="font-size:11px;margin-top:4px;"><strong>${it.saran}:</strong> ${it.protocol}</div>
                <div style="font-size:10px;color:#94a3b8;margin-top:2px;">Ref: ${it.ref}</div>
              </div>
            </div>
          </div>`);
        });
      }

      if (baik.length > 0) {
        const sectionTitleHTML = `<div style="width:500px;background:#fff;padding:0 28px;font-family:'Segoe UI',system-ui,sans-serif;"><div style="font-size:13px;font-weight:700;color:#0e7490;margin-bottom:8px;padding-bottom:4px;border-top:1px solid #e2e8f0;margin-top:8px;padding-top:8px;border-bottom:none;">Komponen Fisik yang Sudah Baik</div></div>`;
        addRekBlock(sectionTitleHTML);

        baik.forEach(it => {
          const result = getKategoriNorma(it.value, it.key, atlet.jenisKelamin);
          addRekBlock(`<div style="width:500px;background:#fff;padding:4px 28px;font-family:'Segoe UI',system-ui,sans-serif;">
            <div style="display:flex;gap:8px;margin-bottom:6px;padding:6px 8px;background:#f0fdf4;border-radius:6px;border-left:3px solid #22c55e;">
              <div style="min-width:8px;padding-top:3px;"><div style="width:8px;height:8px;border-radius:50%;background:#22c55e;"></div></div>
              <div style="flex:1;font-size:11px;"><strong>${it.label}</strong> <span style="color:#16a34a;font-weight:600;">${result.kategori}</span> (Nilai: ${it.value}) — Pertahankan dengan program maintenance 2x/minggu.</div>
            </div>
          </div>`);
        });
      }
    }

    // CSS/Endurance Recommendations
    if (latestCSS) {
      const cssVal = parseFloat(latestCSS.css);
      function fmtPace(secs) {
        const m = Math.floor(secs / 60);
        const s = Math.floor(secs % 60);
        return `${m}:${s.toString().padStart(2, '0')}`;
      }

      const zones = {
        recovery: { pace: fmtPace(100 / (cssVal * 0.70)) },
        endurance: { pace: fmtPace(100 / (cssVal * 0.825)) },
        threshold: { pace: fmtPace(100 / (cssVal * 0.95)) },
        vo2max: { pace: fmtPace(100 / (cssVal * 1.05)) }
      };

      const dotCSS = (latestCSS.kategoriCSS === 'Di Bawah Rata-rata' || latestCSS.kategoriCSS === 'Rata-rata') ? '#ef4444' : (latestCSS.kategoriCSS === 'Bagus' ? '#eab308' : '#22c55e');
      const fokusCSS = (latestCSS.kategoriCSS === 'Di Bawah Rata-rata' || latestCSS.kategoriCSS === 'Rata-rata')
        ? 'Fokus utama: Aerobic Base Building — 4-5 sesi/minggu, 60-70% di zona Recovery & Endurance. Jarak total 2000-3000m per sesi.'
        : (latestCSS.kategoriCSS === 'Bagus'
          ? 'Fokus: Threshold & VO2max Development — 5-6 sesi/minggu, tambahkan 2 sesi threshold + 1 sesi VO2max.'
          : 'Fokus: Speed & Race Strategy — 6 sesi/minggu, akses ke semua zona latihan. Tambahkan race simulation 1x/minggu.');

      addRekBlock(`<div style="width:500px;background:#fff;padding:0 28px;font-family:'Segoe UI',system-ui,sans-serif;"><div style="font-size:13px;font-weight:700;color:#0e7490;margin-bottom:8px;padding-bottom:4px;border-top:1px solid #e2e8f0;margin-top:8px;padding-top:8px;border-bottom:1px solid #e2e8f0;">Program Renang & Endurance</div></div>`);

      addRekBlock(`<div style="width:500px;background:#fff;padding:4px 28px;font-family:'Segoe UI',system-ui,sans-serif;">
        <div style="padding:8px;background:#f8fafc;border-radius:6px;border-left:3px solid ${dotCSS};margin-bottom:8px;">
          <div style="font-weight:700;font-size:12px;">CSS ${latestCSS.css} m/s — ${latestCSS.kategoriCSS}</div>
          <div style="font-size:11px;margin-top:4px;">${fokusCSS}</div>
          <div style="font-size:11px;margin-top:6px;background:#fff;padding:6px 8px;border-radius:4px;">
            <strong>Zona latihan CSS Anda:</strong><br>
            Recovery: ${zones.recovery.pace}/100m (65-75% CSS) | Endurance: ${zones.endurance.pace}/100m (75-90% CSS)<br>
            Threshold: ${zones.threshold.pace}/100m (90-100% CSS) | VO2max: ${zones.vo2max.pace}/100m (100-110% CSS)
          </div>
        </div>
      </div>`);

      if (latestCSS.kategoriVO2max === 'Kurang' || latestCSS.kategoriVO2max === 'Kurang Sekali') {
        addRekBlock(`<div style="width:500px;background:#fff;padding:4px 28px;font-family:'Segoe UI',system-ui,sans-serif;">
          <div style="padding:8px;background:#fef2f2;border-radius:6px;border-left:3px solid #ef4444;margin-bottom:8px;">
            <div style="font-weight:700;font-size:12px;">VO2max ${latestCSS.vo2max} — ${latestCSS.kategoriVO2max}</div>
            <div style="font-size:11px;margin-top:4px;">Tambahkan 2 sesi long slow distance (LSD) per minggu — 30-40 menit continuous swimming di zona recovery. Campurkan dengan threshold training untuk meningkatkan VO2max secara progresif.</div>
          </div>
        </div>`);
      }

      if (atlet.usia <= 17) {
        addRekBlock(`<div style="width:500px;background:#fff;padding:4px 28px;font-family:'Segoe UI',system-ui,sans-serif;">
          <div style="padding:8px;background:#fffbeb;border-radius:6px;border-left:3px solid #eab308;margin-bottom:8px;">
            <div style="font-weight:700;font-size:12px;">Catatan Atlet Muda</div>
            <div style="font-size:11px;margin-top:4px;">VO2max perlu dikalibrasi ulang karena atlet masih dalam masa pertumbuhan. Fokus pada teknik dan aerobic base, hindari overtraining di zona intensitas tinggi.</div>
          </div>
        </div>`);
      }
    }

    // Rekomendasi Pola Makan
    if (latestFisik) {
      const imt = getKategoriIMT(latestFisik.beratBadan, latestFisik.tinggiBadan, atlet.jenisKelamin);
      const imtVal = parseFloat(imt.imt);

      let kategoriIMT, arahRekomendasi, refIMT, dotIMT;
      if (imtVal < 18.5) {
        kategoriIMT = 'Underweight';
        arahRekomendasi = 'Tingkatkan asupan energi total (surplus kalori bertahap) dengan porsi karbohidrat kompleks & protein lebih tinggi untuk mendukung pemulihan otot dan penambahan massa tubuh tanpa lemak; makan lebih sering dengan porsi kecil (5-6x/hari).';
        refIMT = 'Delany et al. (2025); Kasmad et al. (2020)';
        dotIMT = '#ef4444';
      } else if (imtVal < 25) {
        kategoriIMT = 'Ideal';
        arahRekomendasi = 'Pertahankan pola makan seimbang: karbohidrat sebagai sumber energi utama latihan, protein cukup untuk pemulihan otot, lemak sehat, serta hidrasi yang memadai selama sesi latihan renang.';
        refIMT = 'Larasati & Yuliana (2020)';
        dotIMT = '#22c55e';
      } else if (imtVal < 30) {
        kategoriIMT = 'Overweight';
        arahRekomendasi = 'Evaluasi asupan kalori berlebih (terutama gula & lemak jenuh), pertahankan protein cukup untuk menjaga massa otot saat kalori dikurangi bertahap.';
        refIMT = 'Jonnalagadda, Skinner & Moore (2006)';
        dotIMT = '#eab308';
      } else {
        kategoriIMT = 'Obesitas';
        arahRekomendasi = 'Perlu evaluasi lebih lanjut oleh ahli gizi/tenaga medis olahraga untuk penurunan berat badan yang aman & bertahap tanpa mengorbankan performa dan kesehatan.';
        refIMT = 'Delany et al. (2025)';
        dotIMT = '#ef4444';
      }

      addRekBlock(`<div style="width:500px;background:#fff;padding:0 28px;font-family:'Segoe UI',system-ui,sans-serif;"><div style="font-size:13px;font-weight:700;color:#0e7490;margin-bottom:8px;padding-bottom:4px;border-top:1px solid #e2e8f0;margin-top:8px;padding-top:8px;border-bottom:1px solid #e2e8f0;">Rekomendasi Pola Makan</div></div>`);

      addRekBlock(`<div style="width:500px;background:#fff;padding:4px 28px;font-family:'Segoe UI',system-ui,sans-serif;">
        <div style="padding:8px;background:#f8fafc;border-radius:6px;border-left:3px solid ${dotIMT};margin-bottom:8px;">
          <div style="font-weight:700;font-size:12px;">IMT: ${imtVal} — ${kategoriIMT}</div>
          <div style="font-size:11px;margin-top:4px;">${arahRekomendasi}</div>
          <div style="font-size:10px;color:#94a3b8;margin-top:4px;">Ref: ${refIMT}</div>
        </div>
        <div style="font-size:10px;color:#94a3b8;font-style:italic;margin-top:4px;padding-bottom:4px;">Catatan: Rekomendasi pola makan bersifat panduan umum berbasis literatur gizi olahraga, bukan pengganti konsultasi ahli gizi/dokter olahraga.</div>
      </div>`);
    }

    // Referensi + footer
    let refHTML = `<div style="width:500px;background:#fff;padding:12px 28px 28px 28px;font-family:'Segoe UI',system-ui,sans-serif;border-top:1px solid #e2e8f0;margin-top:8px;">`;
    refHTML += `<div style="font-size:12px;font-weight:700;color:#0e7490;margin-bottom:6px;">Sumber Referensi</div>`;
    const refs = [
      'Amara et al. (2021) — Concurrent Resistance Training on Upper Body Strength & Sprint Swimming.',
      'Science & Sports (2020) — Effects of dry-land strength training on competitive sprinter swimmers.',
      'Liu et al. (2025) — Core stability training effects on swimming performance: meta-analysis.',
      'Wibowo et al. — Pengaruh Latihan Plyometric terhadap Jarak Lompatan Start Renang.',
      'Sammoud et al. (2019) & Bishop et al. (2009) — Plyometric training on swimming block start.',
      'Papic et al. (2018) — Effect of auditory stimulus training on swimming start reaction time.',
      'Kuhn & Legerlotz (2022) — Ankle joint flexibility and dolphin kick.',
      'Sifaki et al. — Fleksibilitas ankle dan performa freestyle kick.',
      'Wakayoshi et al. (1992) & Ginn (1993) — CSS calculation model & training zones.',
      'Delany et al. (2025) — Manipulasi berat/komposisi tubuh atlet.',
      'Jonnalagadda et al. (2006) — BMI limitations in athletes.',
      'Larasati & Yuliana (2020) — Pola makan seimbang pada atlet renang.',
      'Kasmad et al. (2020) — Pola makan atlet renang putri Indonesia.'
    ];
    refs.forEach(r => { refHTML += `<div style="font-size:9px;color:#64748b;margin-bottom:2px;">• ${r}</div>`; });
    refHTML += `
      <div style="text-align:center;margin-top:18px;padding-top:10px;border-top:1px solid #e2e8f0;font-size:10px;color:#94a3b8;">
        <div>Dicetak: ${tglUnduh}</div>
        <div style="margin-top:2px;">Club Renang Megalodon Kab Tuban — Rekomendasi berbasis evidence-based</div>
      </div>
    </div>`;
    addRekBlock(refHTML);
  }

  // Helper: render HTML string to canvas
  function renderToCanvas(html) {
    return new Promise((resolve, reject) => {
      const div = document.createElement('div');
      div.style.cssText = 'position:fixed;left:0;top:0;z-index:99999;background:#fff;width:500px;';
      div.innerHTML = html;
      document.body.appendChild(div);
      setTimeout(() => {
        html2canvas(div, {
          scale: 2,
          useCORS: true,
          backgroundColor: '#ffffff',
          width: 500,
          windowWidth: 500
        }).then(canvas => {
          document.body.removeChild(div);
          resolve(canvas);
        }).catch(err => {
          document.body.removeChild(div);
          reject(err);
        });
      }, 200);
    });
  }

  // Main flow (async IIFE)
  (async () => {
    try {
      const page1Canvas = await renderToCanvas(kartuHTML);

      const { jsPDF } = window.jspdf;
      const pdf = new jsPDF('p', 'mm', 'a4');
      const pdfWidth = pdf.internal.pageSize.getWidth();
      const pdfHeight = pdf.internal.pageSize.getHeight();
      const MARGIN_BOTTOM = 15;

      // Halaman 1: Kartu (bisa multi-page jika panjang)
      const imgH1 = (page1Canvas.height * pdfWidth) / page1Canvas.width;
      const imgData1 = page1Canvas.toDataURL('image/png');
      if (imgH1 > pdfHeight) {
        let y = 0;
        while (y < imgH1) {
          if (y > 0) pdf.addPage();
          pdf.addImage(imgData1, 'PNG', 0, -y, pdfWidth, imgH1);
          y += pdfHeight;
        }
      } else {
        pdf.addImage(imgData1, 'PNG', 0, 0, pdfWidth, imgH1);
      }

      // Halaman 2+: Rekomendasi — render tiap block terpisah, anti-potong
      if (rekBlocks.length > 0) {
        let curY = 0;
        let isFirstRekPage = true;

        for (const blockHTML of rekBlocks) {
          const canvas = await renderToCanvas(blockHTML);
          const imgH = (canvas.height * pdfWidth) / canvas.width;
          const imgData = canvas.toDataURL('image/png');

          // Cek apakah muat di sisa halaman
          if (curY + imgH > pdfHeight - MARGIN_BOTTOM) {
            // Tidak muat → halaman baru
            pdf.addPage();
            curY = 0;
            isFirstRekPage = false;
          }

          pdf.addImage(imgData, 'PNG', 0, curY, pdfWidth, imgH);
          curY += imgH;
        }
      }

      const namaFile = atlet.nama.replace(/\s+/g, '_');
      const tglFile = now.toISOString().slice(0, 10);
      pdf.save(`Kartu_${namaFile}_${tglFile}.pdf`);

      btn.textContent = origText;
      btn.disabled = false;
    } catch (err) {
      console.error('Error generating PDF:', err);
      btn.textContent = origText;
      btn.disabled = false;
      alert('Gagal membuat PDF. Silakan coba lagi.');
    }
  })();
}

// ===== REKOMENDASI (Evidence-Based) =====
const REFERENSI = [
  'Amara et al. (2021) — Concurrent Resistance Training on Upper Body Strength & Sprint Swimming. IJERPH, 18(19), 10261.',
  'Science & Sports (2020) — Effects of dry-land strength training on competitive sprinter swimmers.',
  'Liu et al. (2025) — Core stability training effects on swimming performance: systematic review & meta-analysis. BMC Sports Sci Med Rehabil.',
  'Wibowo et al. — Pengaruh Latihan Plyometric terhadap Jarak Lompatan Start Renang. UPI.',
  'Sammoud et al. (2019) & Bishop et al. (2009) — Plyometric training on swimming block start performance. JSCR, 23(7), 2137-2143.',
  'Papic et al. (2018) — Effect of auditory stimulus training on swimming start reaction time. Sports Biomechanics.',
  'Kuhn & Legerlotz (2022) — Ankle joint flexibility and its effect on dolphin kick & undulatory underwater swimming. Frontiers in Sports and Active Living.',
  'Sifaki et al. — Hubungan fleksibilitas ankle dan performa freestyle kick pada perenang usia muda. Aristotle University of Thessaloniki.',
  'Wakayoshi et al. (1992) & Ginn (1993) — CSS calculation model & training zones (USMS, MyProCoach, TopEndSports).',
  'Delany et al. (2025) — Scoping review konsensus internasional tentang manipulasi berat/komposisi tubuh atlet.',
  'Jonnalagadda, Skinner & Moore (2006) — BMI limitations in athletes. Current Sports Medicine Reports.',
  'Larasati & Yuliana (2020) — Pola makan seimbang & status gizi pada atlet renang. Jurnal Riset Gizi.',
  'Kasmad et al. (2020) — Pola makan atlet renang putri Indonesia.'
];

function renderRekomendasi() {
  const filterNama = $('#filterAtletRek').value;
  let atletList = APP.atlet;
  if (filterNama) {
    atletList = atletList.filter(a => a.nama === filterNama);
  }

  if (atletList.length === 0) {
    $('#rekomendasiContent').innerHTML = '<div class="empty-state"><p>Belum ada data atlet untuk direkomendasikan.</p></div>';
    return;
  }

  let html = '';
  atletList.forEach(a => {
    const latestFisik = APP.tesFisik.filter(t => t.atletId === a.id).sort((x, y) => new Date(y.tanggalTes) - new Date(x.tanggalTes))[0];
    const latestCSS = APP.tesCSS.filter(t => t.atletId === a.id).sort((x, y) => new Date(y.tanggalTes) - new Date(x.tanggalTes))[0];

    if (!latestFisik && !latestCSS) {
      html += `<div class="rek-card"><h3>${a.nama}</h3><p style="color:var(--text-light)">Belum ada data tes.</p></div>`;
      return;
    }

    html += `<div class="rek-card"><h3>${a.nama} (${a.jenisKelamin}, Usia ${a.usia})</h3>`;

    // ===== FISIK RECOMMENDATIONS (Evidence-Based) =====
    if (latestFisik) {
      const fisikItems = [
        { label: 'Ankle Flexibility Kanan', value: latestFisik.ankleKanan, key: 'Ankle Kanan',
          saran: 'Fleksibilitas pergelangan kaki',
          protocol: 'Mobilisasi pergelangan kaki, stretching betis (gastrocnemius/soleus), latihan plantarflexion terbantu (banded ankle stretch) — dilakukan rutin sebelum & sesudah latihan renang untuk efisiensi tendangan.',
          ref: 'Kuhn & Legerlotz (2022) — Frontiers in Sports and Active Living; Sifaki et al. — Aristotle University of Thessaloniki' },
        { label: 'Ankle Flexibility Kiri', value: latestFisik.ankleKiri, key: 'Ankle Kiri',
          saran: 'Fleksibilitas pergelangan kaki',
          protocol: 'Mobilisasi pergelangan kaki, stretching betis (gastrocnemius/soleus), latihan plantarflexion terbantu (banded ankle stretch) — dilakukan rutin sebelum & sesudah latihan renang untuk efisiensi tendangan.',
          ref: 'Kuhn & Legerlotz (2022) — Frontiers in Sports and Active Living; Sifaki et al. — Aristotle University of Thessaloniki' },
        { label: 'Push (Expanding)', value: latestFisik.push, key: 'Push',
          saran: 'Resistance training upper body',
          protocol: 'Bench press, push press, dumbbell fly — 3-4 set x 8-12 rep, 3x/minggu selama 9 minggu. Program gabungan darat-air terbukti meningkatkan kekuatan upper body dan sprint swimming pada perenang remaja.',
          ref: 'Amara et al. (2021); Science & Sports (2020)' },
        { label: 'Pull (Expanding)', value: latestFisik.pull, key: 'Pull',
          saran: 'Resistance training upper body',
          protocol: 'Lat pulldown, barbell row, pull-up — 3-4 set x 8-12 rep, 3x/minggu selama 9 minggu. Program gabungan darat-air terbukti meningkatkan kekuatan dan kinematika sprint.',
          ref: 'Amara et al. (2021)' },
        { label: 'Core Stability', value: latestFisik.coreStability, key: 'Core Stability',
          saran: 'Core stability training',
          protocol: 'Plank, dead bug, pallof press, anti-rotation — 3 set x 30-60 detik, 3x/minggu selama 8 minggu. Paling efektif untuk sprint 50m dan gaya punggung.',
          ref: 'Liu et al. (2025) — meta-analisis 16 uji klinis' },
        { label: 'Sit & Reach', value: latestFisik.sitAndReach, key: 'Sit & Reach',
          saran: 'Fleksibilitas & stretching',
          protocol: 'Static stretching 30 detik/pose, dynamic stretching pra-latihan. Fokus pada hamstring, hip flexor, shoulders. Minimal 10-15 menit setelah setiap sesi latihan.',
          ref: 'Praktik terbaik kepelatihan renang' },
        { label: 'Standing Broad Jump', value: latestFisik.sbj, key: 'SBJ',
          saran: 'Plyometric training',
          protocol: 'Box jumps, broad jumps, squat jumps — 3 set x 6-8 rep, 2x/minggu. Plyometric terbukti meningkatkan standing long jump hampir 2x lipat dibanding vertical jump, sejalan dengan perbaikan waktu sprint 15-50m.',
          ref: 'Wibowo et al.; Sammoud et al. (2019); Bishop et al. (2009)' },
        { label: 'WBR Visual', value: latestFisik.wbrVisual, key: 'WBR Visual',
          saran: 'Latihan reaksi visual',
          protocol: 'Start practice dengan stimulus visual (lampu/flag) — 4 sesi/minggu selama 4 minggu. Variasi warna dan intensitas stimulus untuk mengurangi reaction time.',
          ref: 'Papic et al. (2018)' },
        { label: 'WBR Audio', value: latestFisik.wbrAudio, key: 'WBR Audio',
          saran: 'Latihan reaksi audio',
          protocol: 'Start practice dengan stimulus auditori kompetisi (buzzer/beep) — 4 sesi/minggu selama 4 minggu. Terbukti mengurangi reaction time secara signifikan pada start renang.',
          ref: 'Papic et al. (2018)' }
      ];

      const kurang = fisikItems.filter(it => {
        const result = getKategoriNorma(it.value, it.key, a.jenisKelamin);
        return result.cukupData && (result.kategori === 'Kurang' || result.kategori === 'Kurang Sekali');
      });

      const cukup = fisikItems.filter(it => {
        const result = getKategoriNorma(it.value, it.key, a.jenisKelamin);
        return result.cukupData && result.kategori === 'Cukup';
      });

      const baik = fisikItems.filter(it => {
        const result = getKategoriNorma(it.value, it.key, a.jenisKelamin);
        return result.cukupData && (result.kategori === 'Baik' || result.kategori === 'Baik Sekali');
      });

      const belumCukupData = fisikItems.filter(it => {
        const result = getKategoriNorma(it.value, it.key, a.jenisKelamin);
        return !result.cukupData;
      });

      if (kurang.length > 0 || cukup.length > 0) {
        html += '<div class="rek-section"><h4>Program Fisik yang Direkomendasikan</h4>';
        kurang.forEach(it => {
          const result = getKategoriNorma(it.value, it.key, a.jenisKelamin);
          html += `<div class="rek-item"><div class="rek-dot red"></div><div>
            <strong>${it.label}</strong> <span class="badge badge-red">${result.kategori}</span>
            <div class="rek-nilai">Nilai Anda: <strong>${it.value}</strong> | Mean: ${result.mean.toFixed(1)} | SD: ${result.sd.toFixed(1)}</div>
            <div class="rek-protocol">
              <strong>${it.saran}:</strong> ${it.protocol}<br>
              <small style="color:var(--text-light);">Ref: ${it.ref}</small>
            </div>
          </div></div>`;
        });
        cukup.forEach(it => {
          const result = getKategoriNorma(it.value, it.key, a.jenisKelamin);
          html += `<div class="rek-item"><div class="rek-dot yellow"></div><div>
            <strong>${it.label}</strong> <span class="badge badge-yellow">${result.kategori}</span>
            <div class="rek-nilai">Nilai Anda: <strong>${it.value}</strong></div>
            <div class="rek-protocol">
              <strong>Pertahankan & tingkatkan:</strong> Lanjutkan latihan dengan peningkatan intensitas progresif (tambah beban/reps setiap 2 minggu).<br>
              <small style="color:var(--text-light);">Ref: ${it.ref}</small>
            </div>
          </div></div>`;
        });
        html += '</div>';
      }

      if (belumCukupData.length > 0 && kurang.length === 0 && cukup.length === 0 && baik.length === 0) {
        html += '<div class="rek-section"><h4>Program Fisik yang Direkomendasikan</h4>';
        belumCukupData.forEach(it => {
          html += `<div class="rek-item"><div class="rek-dot" style="background:var(--text-light);"></div><div>
            <strong>${it.label}</strong> <span style="color:var(--text-light);font-size:0.85rem;">Belum cukup data</span>
            <div class="rek-protocol">
              <strong>${it.saran}:</strong> ${it.protocol}<br>
              <small style="color:var(--text-light);">Ref: ${it.ref}</small>
            </div>
          </div></div>`;
        });
        html += '</div>';
      } else if (belumCukupData.length > 0) {
        html += '<div class="rek-section"><h4>Item Belum Cukup Data</h4>';
        belumCukupData.forEach(it => {
          html += `<div class="rek-item"><div class="rek-dot" style="background:var(--text-light);"></div><div><strong>${it.label}</strong> — Belum cukup data (minimal 2 atlet sejenis kelamin diperlukan)</div></div>`;
        });
        html += '</div>';
      }

      if (baik.length > 0 && kurang.length === 0 && cukup.length === 0) {
        html += '<div class="rek-section"><h4>Kondisi Fisik</h4><div class="rek-item"><div class="rek-dot green"></div><div>Semua komponen fisik dalam kategori baik. Pertahankan dengan periodisasi latihan yang terstruktur.</div></div></div>';
      } else if (baik.length > 0) {
        html += '<div class="rek-section"><h4>Komponen Fisik yang Sudah Baik</h4>';
        baik.forEach(it => {
          const result = getKategoriNorma(it.value, it.key, a.jenisKelamin);
          html += `<div class="rek-item"><div class="rek-dot green"></div><div><strong>${it.label}</strong> <span class="badge badge-green">${result.kategori}</span> <span style="color:var(--text-light);font-size:0.85rem;">(Nilai: ${it.value} | Mean: ${result.mean.toFixed(1)} | SD: ${result.sd.toFixed(1)})</span> — Pertahankan dengan program maintenance 2x/minggu.</div></div>`;
        });
        html += '</div>';
      }
    }

    // ===== CSS/ENDURANCE RECOMMENDATIONS (Evidence-Based with Zones) =====
    if (latestCSS) {
      const cssVal = parseFloat(latestCSS.css);
      const paceDetik = 100 / cssVal;

      // Training zones based on CSS percentage
      const zones = {
        recovery: { min: cssVal * 0.65, max: cssVal * 0.75, label: 'Recovery (65-75% CSS)', pace: formatPace(100 / (cssVal * 0.70)) },
        endurance: { min: cssVal * 0.75, max: cssVal * 0.90, label: 'Endurance (75-90% CSS)', pace: formatPace(100 / (cssVal * 0.825)) },
        threshold: { min: cssVal * 0.90, max: cssVal * 1.00, label: 'Threshold (90-100% CSS)', pace: formatPace(100 / (cssVal * 0.95)) },
        vo2max: { min: cssVal * 1.00, max: cssVal * 1.10, label: 'VO2max (100-110% CSS)', pace: formatPace(100 / (cssVal * 1.05)) }
      };

      html += '<div class="rek-section"><h4>Program Renang & Endurance</h4>';

      // CSS level assessment
      if (latestCSS.kategoriCSS === 'Di Bawah Rata-rata' || latestCSS.kategoriCSS === 'Rata-rata') {
        html += `<div class="rek-item"><div class="rek-dot red"></div><div>
          <strong>CSS ${latestCSS.css} m/s — ${latestCSS.kategoriCSS}</strong>
          <div class="rek-protocol">
            <strong>Fokus utama: Aerobic Base Building</strong><br>
            4-5 sesi/minggu, 60-70% di zona Recovery & Endurance. Jarak total 2000-3000m per sesi.<br>
            <strong>Zona latihan CSS Anda:</strong><br>
            Recovery: ${zones.recovery.pace}/100m (65-75% CSS)<br>
            Endurance: ${zones.endurance.pace}/100m (75-90% CSS)<br><br>
            <strong>Contoh mingguan:</strong><br>
            Senin: 4x200m Recovery @ ${zones.recovery.pace} (istirahat 30 detik)<br>
            Rabu: 5x100m Endurance @ ${zones.endurance.pace} (istirahat 20 detik)<br>
            Jumat: 3x300m Endurance @ ${zones.endurance.pace} (istirahat 40 detik)<br>
            Sabtu: 2000m continuous swim @ zone recovery
          </div>
        </div></div>`;
      } else if (latestCSS.kategoriCSS === 'Bagus') {
        html += `<div class="rek-item"><div class="rek-dot yellow"></div><div>
          <strong>CSS ${latestCSS.css} m/s — ${latestCSS.kategoriCSS}</strong>
          <div class="rek-protocol">
            <strong>Fokus: Threshold & VO2max Development</strong><br>
            5-6 sesi/minggu, tambahkan 2 sesi threshold + 1 sesi VO2max.<br>
            <strong>Zona latihan CSS Anda:</strong><br>
            Threshold: ${zones.threshold.pace}/100m (90-100% CSS)<br>
            VO2max: ${zones.vo2max.pace}/100m (100-110% CSS)<br><br>
            <strong>Contoh mingguan:</strong><br>
            Selasa: 8x50m Threshold @ ${zones.threshold.pace} (istirahat 15 detik)<br>
            Kamis: 5x100m VO2max @ ${zones.vo2max.pace} (istirahat 30 detik)<br>
            Sabtu: Race pace training — 3x200m @ target pace kompetisi
          </div>
        </div></div>`;
      } else {
        html += `<div class="rek-item"><div class="rek-dot green"></div><div>
          <strong>CSS ${latestCSS.css} m/s — ${latestCSS.kategoriCSS}</strong>
          <div class="rek-protocol">
            <strong>Fokus: Speed & Race Strategy</strong><br>
            6 sesi/minggu, akses ke semua zona latihan.<br>
            <strong>Zona latihan CSS Anda:</strong><br>
            Recovery: ${zones.recovery.pace}/100m | Endurance: ${zones.endurance.pace}/100m<br>
            Threshold: ${zones.threshold.pace}/100m | VO2max: ${zones.vo2max.pace}/100m<br><br>
            <strong>Contoh mingguan:</strong><br>
            2x VO2max intervals, 2x Threshold, 1x Speed (sprint jarak pendek), 1x Recovery/technique<br>
            Tambahkan race simulation 1x/minggu untuk kompetisi.
          </div>
        </div></div>`;
      }

      // VO2max specific recommendation
      if (latestCSS.kategoriVO2max === 'Kurang' || latestCSS.kategoriVO2max === 'Kurang Sekali') {
        html += `<div class="rek-item"><div class="rek-dot red"></div><div>
          <strong>VO2max ${latestCSS.vo2max} — ${latestCSS.kategoriVO2max}</strong>
          <div class="rek-protocol">
            Tambahkan 2 sesi long slow distance (LSD) per minggu — 30-40 menit continuous swimming di zona recovery. 
            Campurkan dengan threshold training untuk meningkatkan VO2max secara progresif.
          </div>
        </div></div>`;
      }

      // Young athlete note
      if (a.usia <= 17) {
        html += `<div class="rek-item"><div class="rek-dot yellow"></div><div>
          <strong>Catatan Atlet Muda:</strong> VO2max perlu dikalibrasi ulang karena atlet masih dalam masa pertumbuhan. 
          Fokus pada teknik dan aerobic base, hindari overtraining di zona intensitas tinggi.
        </div></div>`;
      }

      html += '</div>';
    }

    // ===== REKOMENDASI POLA MAKAN BERBASIS IMT =====
    if (latestFisik) {
      const imt = getKategoriIMT(latestFisik.beratBadan, latestFisik.tinggiBadan, a.jenisKelamin);
      const imtVal = parseFloat(imt.imt);
      const tm = latestFisik.tinggiBadan / 100;

      // Klasifikasi IMT WHO (disesuaikan untuk atlet remaja)
      let kategoriIMT, arahRekomendasi;
      if (imtVal < 18.5) {
        kategoriIMT = 'Underweight';
        arahRekomendasi = 'Tingkatkan asupan energi total (surplus kalori bertahap) dengan porsi karbohidrat kompleks & protein lebih tinggi untuk mendukung pemulihan otot dan penambahan massa tubuh tanpa lemak; makan lebih sering dengan porsi kecil (5-6x/hari).';
      } else if (imtVal < 25) {
        kategoriIMT = 'Ideal';
        arahRekomendasi = 'Pertahankan pola makan seimbang: karbohidrat sebagai sumber energi utama latihan, protein cukup untuk pemulihan otot, lemak sehat, serta hidrasi yang memadai selama sesi latihan renang.';
      } else if (imtVal < 30) {
        kategoriIMT = 'Overweight';
        arahRekomendasi = 'Evaluasi asupan kalori berlebih (terutama gula & lemak jenuh), pertahankan protein cukup untuk menjaga massa otot saat kalori dikurangi bertahap. Catatan: BMI/IMT pada atlet bisa bias karena massa otot tinggi, sebaiknya dikonfirmasi dengan pengukuran komposisi tubuh.';
      } else {
        kategoriIMT = 'Obesitas';
        arahRekomendasi = 'Perlu evaluasi lebih lanjut oleh ahli gizi/tenaga medis olahraga untuk penurunan berat badan yang aman & bertahap tanpa mengorbankan performa dan kesehatan (risiko RED-S bila dilakukan sembarangan).';
      }

      let refIMT;
      if (imtVal < 18.5) {
        refIMT = 'Delany et al. (2025) — scoping review konsensus internasional tentang manipulasi berat/komposisi tubuh atlet; Kasmad et al. (2020) — pola makan atlet renang putri Indonesia';
      } else if (imtVal < 25) {
        refIMT = 'Larasati & Yuliana (2020) — pola makan seimbang & status gizi normal berkaitan dengan ketahanan kardiorespirasi yang baik pada atlet renang. Jurnal Riset Gizi';
      } else if (imtVal < 30) {
        refIMT = 'Jonnalagadda, Skinner & Moore (2006) — BMI dapat salah mengklasifikasikan atlet berotot sebagai kelebihan berat badan. Current Sports Medicine Reports';
      } else {
        refIMT = 'Delany et al. (2025) — pendekatan individual & aman dalam manipulasi berat badan atlet untuk menghindari risiko kesehatan';
      }

      html += '<div class="rek-section"><h4>Rekomendasi Pola Makan</h4>';
      html += `<div class="rek-item"><div class="rek-dot ${(imtVal < 18.5 || imtVal >= 25) ? 'red' : 'green'}"></div><div>
        <strong>IMT: ${imtVal} — ${kategoriIMT}</strong>
        <div class="rek-protocol">
          <strong>Arah Pola Makan:</strong> ${arahRekomendasi}<br>
          <small style="color:var(--text-light);">Ref: ${refIMT}</small>
        </div>
      </div></div>`;
      html += `<p style="font-size:0.75rem;color:var(--text-light);margin-top:8px;font-style:italic;">
        Catatan: Rekomendasi pola makan ini bersifat panduan umum berbasis literatur gizi olahraga, bukan pengganti konsultasi ahli gizi/dokter olahraga untuk kebutuhan individual (apalagi untuk atlet remaja yang masih dalam masa pertumbuhan).
      </p>`;
      html += '</div>';
    }

    html += '</div>';
  });

  // Add references section
  html += `<div class="rek-card referensi-section">
    <h4>Sumber Referensi Ilmiah</h4>
    <ul class="referensi-list">
      ${REFERENSI.map(r => `<li>${r}</li>`).join('')}
    </ul>
    <p style="font-size:0.75rem;color:var(--text-light);margin-top:10px;font-style:italic;">
      Catatan: Rekomendasi bersifat generalisasi berdasarkan literatur. Untuk program spesifik, sesuaikan dengan kondisi individual atlet dan konsultasi pelatih bersertifikat.
    </p>
  </div>`;

  $('#rekomendasiContent').innerHTML = html;
}

$('#filterAtletRek').addEventListener('change', renderRekomendasi);

// ===== NORMA SETTINGS (DINAMIS) =====
function renderNorma() {
  const fields = [
    { key: 'Sit & Reach', label: 'Sit & Reach (cm)' },
    { key: 'Core Stability', label: 'Core Stability (Level)' },
    { key: 'Push', label: 'Expanding - Push (Kg)' },
    { key: 'Pull', label: 'Expanding - Pull (Kg)' },
    { key: 'Ankle Kanan', label: 'Ankle Flexibility - Kanan (cm)' },
    { key: 'Ankle Kiri', label: 'Ankle Flexibility - Kiri (cm)' },
    { key: 'WBR Visual', label: 'Wall Body Reaction - Visual (ms) ⚠ Lower = Better' },
    { key: 'WBR Audio', label: 'Wall Body Reaction - Audio (ms) ⚠ Lower = Better' },
    { key: 'SBJ', label: 'Standing Broad Jump (m)' }
  ];

  const semuaData = getDataTesTerbaru();
  const lakiData = semuaData.filter(d => d.jenisKelamin === 'Laki-laki');
  const perempuanData = semuaData.filter(d => d.jenisKelamin === 'Perempuan');

  let html = '';

  // Info jumlah data
  html += `<div style="background:#dbeafe;border-left:4px solid #2563eb;padding:10px 14px;border-radius:6px;margin-bottom:16px;font-size:0.85rem;">
    <strong>Info:</strong> Mean & SD dihitung otomatis dari data atlet yang sudah diinput. Minimal 2 atlet per jenis kelamin diperlukan agar perhitungan valid.<br>
    <strong>Jumlah data:</strong> Laki-laki: ${lakiData.length} atlet | Perempuan: ${perempuanData.length} atlet
  </div>`;

  // Tabel untuk Laki-laki
  html += '<h4 style="margin:16px 0 8px;color:var(--primary-dark);">Laki-laki</h4>';
  html += '<table class="norma-table"><thead><tr><th>Item Tes</th><th>Mean</th><th>SD</th><th>Status</th></tr></thead><tbody>';
  fields.forEach(f => {
    const { mean, sd, cukupData } = getMeanSDForItem(f.key, 'Laki-laki');
    const status = cukupData
      ? `<span class="badge badge-green">Valid</span>`
      : `<span class="badge badge-red">Belum cukup data</span>`;
    html += `<tr>
      <td><strong>${f.label}</strong></td>
      <td>${cukupData ? mean.toFixed(2) : '-'}</td>
      <td>${cukupData ? sd.toFixed(2) : '-'}</td>
      <td>${status}</td>
    </tr>`;
  });
  html += '</tbody></table>';

  // Tabel untuk Perempuan
  html += '<h4 style="margin:24px 0 8px;color:var(--primary-dark);">Perempuan</h4>';
  html += '<table class="norma-table"><thead><tr><th>Item Tes</th><th>Mean</th><th>SD</th><th>Status</th></tr></thead><tbody>';
  fields.forEach(f => {
    const { mean, sd, cukupData } = getMeanSDForItem(f.key, 'Perempuan');
    const status = cukupData
      ? `<span class="badge badge-green">Valid</span>`
      : `<span class="badge badge-red">Belum cukup data</span>`;
    html += `<tr>
      <td><strong>${f.label}</strong></td>
      <td>${cukupData ? mean.toFixed(2) : '-'}</td>
      <td>${cukupData ? sd.toFixed(2) : '-'}</td>
      <td>${status}</td>
    </tr>`;
  });
  html += '</tbody></table>';

  html += `<div style="background:#fef9c3;border-left:4px solid #ca8a04;padding:10px 14px;border-radius:6px;margin-top:16px;font-size:0.85rem;">
    <strong>Catatan:</strong> Mean & SD bersifat dinamis dan akan berubah setiap kali ada data atlet baru. Kategori setiap atlet dihitung berdasarkan Mean & SD dari kelompok jenis kelamin yang sama.
  </div>`;

  $('#normaFields').innerHTML = html;
}

// ===== DEMO DATA =====
function loadDemoData() {
  APP.atlet = [
    // 5 Laki-laki
    { id: 1, nama: 'Budi Santoso', jenisKelamin: 'Laki-laki', tanggalLahir: '2005-03-15', usia: hitungUsia('2005-03-15') },
    { id: 2, nama: 'Andi Pratama', jenisKelamin: 'Laki-laki', tanggalLahir: '2004-11-10', usia: hitungUsia('2004-11-10') },
    { id: 3, nama: 'Rizki Ramadhan', jenisKelamin: 'Laki-laki', tanggalLahir: '2006-01-20', usia: hitungUsia('2006-01-20') },
    { id: 4, nama: 'Dimas Putra', jenisKelamin: 'Laki-laki', tanggalLahir: '2005-07-05', usia: hitungUsia('2005-07-05') },
    { id: 5, nama: 'Fajar Nugroho', jenisKelamin: 'Laki-laki', tanggalLahir: '2004-09-12', usia: hitungUsia('2004-09-12') },
    // 5 Perempuan
    { id: 6, nama: 'Sari Dewi', jenisKelamin: 'Perempuan', tanggalLahir: '2006-07-22', usia: hitungUsia('2006-07-22') },
    { id: 7, nama: 'Rina Wati', jenisKelamin: 'Perempuan', tanggalLahir: '2005-12-03', usia: hitungUsia('2005-12-03') },
    { id: 8, nama: 'Putri Amelia', jenisKelamin: 'Perempuan', tanggalLahir: '2006-04-18', usia: hitungUsia('2006-04-18') },
    { id: 9, nama: 'Dewi Lestari', jenisKelamin: 'Perempuan', tanggalLahir: '2005-08-25', usia: hitungUsia('2005-08-25') },
    { id: 10, nama: 'Maya Sari', jenisKelamin: 'Perempuan', tanggalLahir: '2004-06-30', usia: hitungUsia('2004-06-30') }
  ];

  APP.tesFisik = [
    // ===== LAKI-LAKI (5 atlet) =====
    // Budi — nilai rata-rata
    { id: 1, atletId: 1, tanggalTes: '2026-08-01', tinggiBadan: 170, beratBadan: 63, sitAndReach: 28, coreStability: 7, push: 35, pull: 30, ankleKanan: 12, ankleKiri: 11, wbrVisual: 0.320, wbrAudio: 0.260, sbj: 1.95 },
    // Andi — nilai bagus
    { id: 2, atletId: 2, tanggalTes: '2026-08-02', tinggiBadan: 175, beratBadan: 68, sitAndReach: 35, coreStability: 9, push: 45, pull: 40, ankleKanan: 15, ankleKiri: 14, wbrVisual: 0.250, wbrAudio: 0.200, sbj: 2.30 },
    // Rizki — nilai kurang
    { id: 3, atletId: 3, tanggalTes: '2026-08-03', tinggiBadan: 165, beratBadan: 55, sitAndReach: 20, coreStability: 4, push: 25, pull: 22, ankleKanan: 9, ankleKiri: 8, wbrVisual: 0.420, wbrAudio: 0.350, sbj: 1.60 },
    // Dimas — nilai sangat bagus
    { id: 4, atletId: 4, tanggalTes: '2026-08-04', tinggiBadan: 178, beratBadan: 72, sitAndReach: 38, coreStability: 10, push: 50, pull: 45, ankleKanan: 16, ankleKiri: 15, wbrVisual: 0.220, wbrAudio: 0.180, sbj: 2.50 },
    // Fajar — nilai cukup
    { id: 5, atletId: 5, tanggalTes: '2026-08-05', tinggiBadan: 168, beratBadan: 60, sitAndReach: 25, coreStability: 6, push: 32, pull: 28, ankleKanan: 11, ankleKiri: 10, wbrVisual: 0.350, wbrAudio: 0.290, sbj: 1.80 },

    // ===== PEREMPUAN (5 atlet) =====
    // Sari — nilai bagus
    { id: 6, atletId: 6, tanggalTes: '2026-08-06', tinggiBadan: 158, beratBadan: 50, sitAndReach: 35, coreStability: 8, push: 25, pull: 22, ankleKanan: 14, ankleKiri: 13, wbrVisual: 0.280, wbrAudio: 0.230, sbj: 1.70 },
    // Rina — nilai rata-rata
    { id: 7, atletId: 7, tanggalTes: '2026-08-07', tinggiBadan: 155, beratBadan: 48, sitAndReach: 30, coreStability: 6, push: 20, pull: 18, ankleKanan: 12, ankleKiri: 11, wbrVisual: 0.330, wbrAudio: 0.270, sbj: 1.50 },
    // Putri — nilai kurang
    { id: 8, atletId: 8, tanggalTes: '2026-08-08', tinggiBadan: 152, beratBadan: 45, sitAndReach: 22, coreStability: 4, push: 15, pull: 13, ankleKanan: 9, ankleKiri: 8, wbrVisual: 0.450, wbrAudio: 0.380, sbj: 1.25 },
    // Dewi — nilai sangat bagus
    { id: 9, atletId: 9, tanggalTes: '2026-08-09', tinggiBadan: 162, beratBadan: 53, sitAndReach: 40, coreStability: 10, push: 30, pull: 27, ankleKanan: 16, ankleKiri: 15, wbrVisual: 0.240, wbrAudio: 0.190, sbj: 1.90 },
    // Maya — nilai cukup
    { id: 10, atletId: 10, tanggalTes: '2026-08-10', tinggiBadan: 160, beratBadan: 52, sitAndReach: 28, coreStability: 5, push: 18, pull: 16, ankleKanan: 11, ankleKiri: 10, wbrVisual: 0.370, wbrAudio: 0.310, sbj: 1.45 }
  ];

  APP.tesCSS = [
    // Laki-laki
    { id: 1, atletId: 1, tanggalTes: '2026-08-01', waktu50: '0:35', waktu400: '5:20', css: '1.273', kategoriCSS: 'Bagus', pace100: '1:18', tingkatanPace: 'Klub', vo2max: '18.77', kategoriVO2max: 'Sangat Baik', catatanMuda: '' },
    { id: 2, atletId: 2, tanggalTes: '2026-08-02', waktu50: '0:32', waktu400: '4:50', css: '1.400', kategoriCSS: 'Bagus Sekali', pace100: '1:09', tingkatanPace: 'Nasional', vo2max: '20.30', kategoriVO2max: 'Sangat Baik', catatanMuda: '' },
    { id: 3, atletId: 3, tanggalTes: '2026-08-03', waktu50: '0:40', waktu400: '6:20', css: '1.017', kategoriCSS: 'Rata-rata', pace100: '1:38', tingkatanPace: 'Pemula', vo2max: '15.70', kategoriVO2max: 'Cukup', catatanMuda: '' },
    { id: 4, atletId: 4, tanggalTes: '2026-08-04', waktu50: '0:30', waktu400: '4:30', css: '1.556', kategoriCSS: 'Elite', pace100: '1:04', tingkatanPace: 'Nasional', vo2max: '22.17', kategoriVO2max: 'Sangat Baik', catatanMuda: '' },
    { id: 5, atletId: 5, tanggalTes: '2026-08-05', waktu50: '0:37', waktu400: '5:40', css: '1.187', kategoriCSS: 'Rata-rata', pace100: '1:24', tingkatanPace: 'Rata-rata', vo2max: '17.74', kategoriVO2max: 'Sangat Baik', catatanMuda: '' },
    // Perempuan
    { id: 6, atletId: 6, tanggalTes: '2026-08-06', waktu50: '0:38', waktu400: '6:00', css: '1.094', kategoriCSS: 'Rata-rata', pace100: '1:31', tingkatanPace: 'Pemula', vo2max: '16.63', kategoriVO2max: 'Baik', catatanMuda: '' },
    { id: 7, atletId: 7, tanggalTes: '2026-08-07', waktu50: '0:42', waktu400: '6:40', css: '0.952', kategoriCSS: 'Di Bawah Rata-rata', pace100: '1:45', tingkatanPace: 'Pemula', vo2max: '14.91', kategoriVO2max: 'Kurang', catatanMuda: '' },
    { id: 8, atletId: 8, tanggalTes: '2026-08-08', waktu50: '0:45', waktu400: '7:10', css: '0.878', kategoriCSS: 'Di Bawah Rata-rata', pace100: '1:54', tingkatanPace: 'Pemula', vo2max: '14.03', kategoriVO2max: 'Kurang Sekali', catatanMuda: '' },
    { id: 9, atletId: 9, tanggalTes: '2026-08-09', waktu50: '0:36', waktu400: '5:40', css: '1.167', kategoriCSS: 'Rata-rata', pace100: '1:26', tingkatanPace: 'Rata-rata', vo2max: '17.50', kategoriVO2max: 'Sangat Baik', catatanMuda: '' },
    { id: 10, atletId: 10, tanggalTes: '2026-08-10', waktu50: '0:41', waktu400: '6:30', css: '0.972', kategoriCSS: 'Rata-rata', pace100: '1:43', tingkatanPace: 'Pemula', vo2max: '15.15', kategoriVO2max: 'Cukup', catatanMuda: '' }
  ];

  APP.nextId = 100;
}

// ===== FIRESTORE SYNC =====
const COL = {
  atlet: db.collection('atlet'),
  tesFisik: db.collection('tesFisik'),
  tesCSS: db.collection('tesCSS')
};

function saveAtletToFirestore(a) {
  COL.atlet.doc(String(a.id)).set({
    id: a.id, nama: a.nama, jenisKelamin: a.jenisKelamin,
    tanggalLahir: a.tanggalLahir, usia: a.usia
  });
}

function saveTesFisikToFirestore(t) {
  COL.tesFisik.doc(String(t.id)).set(t);
}

function saveTesCSSToFirestore(t) {
  COL.tesCSS.doc(String(t.id)).set(t);
}

function deleteAtletFromFirestore(id) {
  COL.atlet.doc(String(id)).delete();
}

function deleteTesFisikFromFirestore(atletId) {
  COL.tesFisik.where('atletId', '==', atletId).get().then(snap => {
    const batch = db.batch();
    snap.forEach(doc => batch.delete(doc.ref));
    batch.commit();
  });
}

function deleteTesCSSFromFirestore(atletId) {
  COL.tesCSS.where('atletId', '==', atletId).get().then(snap => {
    const batch = db.batch();
    snap.forEach(doc => batch.delete(doc.ref));
    batch.commit();
  });
}

function saveNextIdToFirestore() {
  db.collection('meta').doc('counter').set({ nextId: APP.nextId });
}

async function loadFromFirestore() {
  try {
    const [atletSnap, fisikSnap, cssSnap, metaSnap] = await Promise.all([
      COL.atlet.get(),
      COL.tesFisik.get(),
      COL.tesCSS.get(),
      db.collection('meta').doc('counter').get()
    ]);

    if (!atletSnap.empty) {
      APP.atlet = atletSnap.docs.map(d => d.data());
      APP.tesFisik = fisikSnap.docs.map(d => d.data());
      APP.tesCSS = cssSnap.docs.map(d => d.data());
      if (metaSnap.exists) APP.nextId = metaSnap.data().nextId;
      return true;
    }
    return false;
  } catch (err) {
    console.warn('Firestore load error, using demo data:', err);
    return false;
  }
}

// ===== INIT: Load Firestore or Demo =====
let initDone = false;
(async function initApp() {
  const loaded = await loadFromFirestore();
  if (!loaded) {
    loadDemoData();
    // Sync demo data to Firestore
    APP.atlet.forEach(a => saveAtletToFirestore(a));
    APP.tesFisik.forEach(t => saveTesFisikToFirestore(t));
    APP.tesCSS.forEach(t => saveTesCSSToFirestore(t));
    saveNextIdToFirestore();
  }
  initDone = true;
  // Jika user sudah login, re-render dashboard
  if (APP.loggedIn) {
    renderDashboard();
  }
})();


