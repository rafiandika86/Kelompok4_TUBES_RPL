/* =========================================================
   Apotek Online - logika aplikasi (tanpa backend, data di localStorage)
   Nama kelas & atribut mengikuti Class Diagram:
   Pengguna(idPengguna, nama, email, password, noHp) -> Admin(level), Pelanggan(alamat),
   Apoteker(noSIPA), Kurir(plat). Obat, Pesanan, DetailPesanan, Pembayaran, Resep, Pengiriman.
   Alur mengikuti Use Case, Sequence, dan Activity Diagram.
   ========================================================= */

// Kunci penyimpanan localStorage & helper biar ngetik gak panjang
const KEY = 'apotek-online-v5';
const $ = (s, r = document) => r.querySelector(s);
const rupiah = n => 'Rp' + Number(n).toLocaleString('id-ID');
const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const pad = n => String(n).padStart(4, '0');
const tgl = iso => new Date(iso).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' });

// Status pesanan & urutan langkahnya (sesuai Activity Diagram)
const STATUS = {
  bayar: 'Memvalidasi pembayaran',
  verifikasi: 'Menunggu verifikasi resep',
  disiapkan: 'Disiapkan apoteker',
  kurir: 'Menunggu kurir',
  diantar: 'Sedang diantar',
  terkirim: 'Tiba, menunggu konfirmasi pelanggan',
  selesai: 'Sudah diterima',
  ditolak: 'Resep ditolak'
};
const STEPS = ['Dibayar', 'Verifikasi', 'Disiapkan', 'Diantar', 'Diterima'];
const STEP_AT = { bayar: 0, verifikasi: 1, disiapkan: 2, kurir: 2, diantar: 3, terkirim: 3, selesai: 4, ditolak: 1 };
const PAL = [['#ff6a1a', '#3a3f46'], ['#2fa8ff', '#3a3f46'], ['#a86bff', '#3a3f46'], ['#ffffff', '#ff6a1a'], ['#2fa8ff', '#a86bff']];

// Peran & atribut khusus tiap subkelas Pengguna
const ROLES = { pelanggan: 'Pelanggan', apoteker: 'Apoteker', kurir: 'Kurir', admin: 'Admin' };
const ATTR = { pelanggan: ['alamat', 'Alamat'], apoteker: ['noSIPA', 'No. SIPA'], kurir: ['plat', 'Plat kendaraan'], admin: ['level', 'Level'] };

// Aturan siapa boleh melakukan aksi apa (tiap aktor hanya use case miliknya)
const NEED = {
  add: ['pelanggan'], inc: ['pelanggan'], dec: ['pelanggan'], checkout: ['pelanggan'], diterima: ['pelanggan'],
  valid: ['apoteker'], tolak: ['apoteker'], siap: ['apoteker'],
  stok: ['apoteker', 'admin'], baca: ['apoteker', 'kurir'],
  terima: ['kurir'], tiba: ['kurir'], selesai: ['kurir'],
  hapusObat: ['admin'], ubahObat: ['admin'], hapusUser: ['admin'], ubahUser: ['admin']
};

// Daftar akun contoh buat login cepat
const DEMO = `<div class="demo"><b>Akun contoh untuk mencoba</b>
  <span>Admin: admin@apotek.id / admin123</span>
  <span>Apoteker: bagas@apotek.id / apoteker123</span>
  <span>Kurir: doni@apotek.id / kurir123</span>
  <span>Pelanggan: budi@apotek.id / budi123</span></div>`;

// Data bawaan pas web pertama kali dibuka
function seed() {
  return {
    seq: 1, uid: 5, oid: 11, userId: null, cart: [], pesanan: [], notif: [],
    users: [
      { idPengguna: 1, nama: 'Rina Admin', email: 'admin@apotek.id', password: 'admin123', noHp: '081200000001', role: 'admin', level: 'Admin utama' },
      { idPengguna: 2, nama: 'apt. Bagas', email: 'bagas@apotek.id', password: 'apoteker123', noHp: '081200000002', role: 'apoteker', noSIPA: 'SIPA-2210/BKL' },
      { idPengguna: 3, nama: 'Doni Kurir', email: 'doni@apotek.id', password: 'kurir123', noHp: '081200000003', role: 'kurir', plat: 'BD 4521 XY' },
      { idPengguna: 4, nama: 'Budi Pelanggan', email: 'budi@apotek.id', password: 'budi123', noHp: '081200000004', role: 'pelanggan', alamat: 'Jl. Merpati No. 5, Bengkulu' }
    ],
    // Ini stock obat awal yh (atribut Obat: idObat, nama, harga, stok)
    obat: [
      { idObat: 1, nama: 'Paracetamol 500 mg', harga: 5000, stok: 40 },
      { idObat: 2, nama: 'Amoxicillin 500 mg', harga: 12000, stok: 25 },
      { idObat: 3, nama: 'Vitamin C 1000 mg', harga: 25000, stok: 18 },
      { idObat: 4, nama: 'Antasida Doen', harga: 4500, stok: 50 },
      { idObat: 5, nama: 'Cetirizine 10 mg', harga: 8000, stok: 30 },
      { idObat: 6, nama: 'Omeprazole 20 mg', harga: 15000, stok: 8 },
      { idObat: 7, nama: 'Masker medis', harga: 15000, stok: 60 },
      { idObat: 8, nama: 'Oralit', harga: 2500, stok: 70 },
      { idObat: 9, nama: 'Ibuprofen 400 mg', harga: 7000, stok: 35 },
      { idObat: 10, nama: 'Metformin 500 mg', harga: 9000, stok: 22 }
    ]
  };
}

// State aplikasi & fungsi bantu
let S = JSON.parse(localStorage.getItem(KEY) || 'null') || seed();
let ui = { q: '', resep: null, metode: 'QRIS', mode: 'login' };
const save = () => localStorage.setItem(KEY, JSON.stringify(S));
const me = () => S.users.find(u => u.idPengguna === S.userId);
const ob = id => S.obat.find(o => o.idObat == id);
const pes = id => S.pesanan.find(p => p.idPesanan == id);
const kode = p => 'RX-' + pad(p.idPesanan);
const namaObat = id => (ob(id) || { nama: 'Obat (sudah dihapus)' }).nama;
const ringkas = p => p.detail.map(d => esc(namaObat(d.idObat)) + ' x' + d.jumlah).join(', ');
const pelanggan = p => S.users.find(u => u.idPengguna === p.idPelanggan) || { nama: 'Pelanggan', alamat: '-' };
const ubahStatus = (p, st) => { p.status = st; };                       // Pesanan.ubahStatus()
const notif = (untuk, teks) => S.notif.push({ untuk, teks, baca: false });   // notifikasi()
const unread = r => S.notif.filter(n => n.untuk === r && !n.baca).length;
const fotoUrl = {};
const notifBox = r => {
  const l = S.notif.filter(n => n.untuk === r && !n.baca);
  return l.length ? `<div class="notif">${l.map(n => `<p>${esc(n.teks)}</p>`).join('')}<button class="pill ghost sm" data-act="baca" data-id="${r}">Tandai dibaca</button></div>` : '';
};

function toast(msg) {
  const t = $('#toast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(toast.t);
  toast.t = setTimeout(() => t.classList.remove('show'), 2600);
}

// Kartu obat & tampilan lacak pesanan
const blister = stok => {
  const n = Math.min(10, Math.ceil(stok / 5));
  return '<span class="blister" title="Stok ' + stok + '">' + Array.from({ length: 10 }, (_, i) => `<i class="${i < n ? 'on' : ''}"></i>`).join('') + '</span>';
};
const capsule = id => {
  const p = PAL[id % PAL.length];
  return `<span class="capsule" style="--a:${p[0]};--b:${p[1]}"></span>`;
};

const pocket = o => `<div class="pocket">
  ${capsule(o.idObat)}
  <h3>${esc(o.nama)}</h3>
  <b>${rupiah(o.harga)}</b>${blister(o.stok)}
  <button class="pill blue sm" data-act="add" data-id="${o.idObat}" ${o.stok < 1 ? 'disabled' : ''}>${o.stok < 1 ? 'Stok habis' : 'Tambah ke nota'}</button>
</div>`;

const track = p => {
  const at = STEP_AT[p.status], pb = p.pembayaran, pg = p.pengiriman;
  return `<article class="order">
    <div class="oh"><div><h3>${kode(p)}</h3><small>${tgl(p.tanggal)}, ${rupiah(p.total)}</small></div>
    <span class="badge ${p.status}">${STATUS[p.status]}</span></div>
    <div class="steps">${STEPS.map((s, i) => `<div class="st ${i <= at ? 'done' : ''} ${p.status === 'ditolak' && i === at ? 'bad' : ''}"><i></i><span>${s}</span></div>`).join('')}</div>
    <p class="items">${ringkas(p)}</p>
    <p class="bukti">Pembayaran PAY-${pad(pb.idBayar)}: ${esc(pb.metode)}, ${pb.status}</p>
    ${p.resep ? `<p class="bukti">Resep RSP-${pad(p.resep.idResep)}: ${p.resep.status}</p>` : ''}
    <p class="bukti">Pengiriman KRM-${pad(pg.idKirim)}: ${pg.status}${pg.tglKirim ? ', ' + tgl(pg.tglKirim) : ''}</p>
    ${pg.bukti ? `<p class="bukti">Bukti: ${esc(pg.bukti)}</p>${fotoUrl[p.idPesanan] ? `<img class="foto" src="${fotoUrl[p.idPesanan]}" alt="Bukti pengiriman">` : ''}` : ''}
    ${p.status === 'terkirim' && me().role === 'pelanggan' ? `<div class="actions"><button class="pill blue" data-act="diterima" data-id="${p.idPesanan}">Terima pesanan</button></div>` : ''}
  </article>`;
};

// Tampilan sebelum login (Activity Diagram dimulai dari Login)
function vGate() {
  return `<section class="hero"><div><h1>Masuk dulu untuk memulai.</h1>
    <p>Semua peran (Pelanggan, Apoteker, Kurir, Admin) masuk lewat akun masing-masing. Pelanggan baru bisa mendaftar sendiri.</p>
    <div class="actions"><button class="pill blue" data-act="login">Masuk</button><button class="pill ghost" data-act="daftar">Daftar sebagai pelanggan</button></div></div>
    <div class="bigcap"><span class="capsule"></span><span class="rx">Rx</span></div></section>`;
}

// Halaman Pelanggan: lihat katalog, kelola keranjang, upload resep, checkout, lacak pesanan
function vPelanggan() {
  const mine = S.pesanan.filter(p => p.idPelanggan === S.userId).slice().reverse();
  return `<section class="hero">
    <div><h1>Setiap dosis diperiksa tim medis Doctor, diantar cepat oleh divisi logistik.</h1>
    <p>Pilih obat, unggah resep jika diperlukan, bayar, lalu pantau kurir sampai pesananmu diterima.</p></div>
    <div class="bigcap"><span class="capsule"></span><span class="rx">Rx</span></div>
  </section>
  <section class="shop">
    <div><div class="bar"><h2>Katalog obat</h2><input id="q" placeholder="Cari nama obat" value="${esc(ui.q)}" aria-label="Cari obat"></div>
    <div class="sheet"><div class="grid" id="grid"></div></div></div>
    <aside class="nota" id="nota"></aside>
  </section>
  <section><div class="bar"><h2>Lacak pesanan</h2></div>
  ${mine.length ? mine.map(track).join('') : '<p class="empty">Belum ada pesanan. Pilih obat dari katalog untuk memulai.</p>'}</section>`;
}

// Halaman Apoteker: proses pesanan (include verifikasi resep) dan update stok obat
function vApoteker() {
  const antre = S.pesanan.filter(p => p.status === 'verifikasi' || p.status === 'disiapkan');
  return `<div class="head"><h1>Meja apoteker</h1><p>Proses pesanan yang sudah dibayar. Pesanan yang membawa resep wajib melewati verifikasi resep lebih dulu.</p></div>
  ${notifBox('apoteker')}<div class="bar"><h2>Proses pesanan</h2></div>
  ${antre.length ? antre.map(p => `<article class="order">
    <div class="oh"><div><h3>${kode(p)}</h3><small>${esc(pelanggan(p).nama)}, ${tgl(p.tanggal)}, ${rupiah(p.total)}</small></div><span class="badge ${p.status}">${STATUS[p.status]}</span></div>
    <p class="items">${ringkas(p)}</p>
    ${p.status === 'verifikasi'
      ? `<p class="items">Verifikasi resep RSP-${pad(p.resep.idResep)}: <span class="tag">${esc(p.resep.foto)}</span></p>
         <div class="actions"><button class="pill blue" data-act="valid" data-id="${p.idPesanan}">Resep valid</button><button class="pill red" data-act="tolak" data-id="${p.idPesanan}">Resep tidak valid, tolak</button></div>`
      : `<div class="actions"><button class="pill lemon" data-act="siap" data-id="${p.idPesanan}">Siapkan pesanan dan buat tugas kurir</button></div>`}
  </article>`).join('') : '<p class="empty">Tidak ada pesanan yang menunggu. Antrean terisi setelah pembayaran pelanggan tervalidasi.</p>'}
  <div class="bar" style="margin-top:36px"><h2>Update stok obat</h2></div>${tabelStok()}`;
}

// Halaman Kurir: terima tugas, update status, bukti pengiriman
function vKurir() {
  const baru = S.pesanan.filter(p => p.status === 'kurir');
  const jalan = S.pesanan.filter(p => p.status === 'diantar' && p.pengiriman.idKurir === S.userId);
  const done = S.pesanan.filter(p => ['terkirim', 'selesai'].includes(p.status) && p.pengiriman.idKurir === S.userId);
  return `<div class="head"><h1>Tugas kurir</h1><p>Terima tugas, perbarui status pengantaran, lalu unggah bukti pengiriman.</p></div>
  ${notifBox('kurir')}<div class="bar"><h2>Tugas baru</h2></div>
  ${baru.length ? baru.map(p => `<article class="order"><div class="oh"><div><h3>${kode(p)}</h3><small>Untuk ${esc(pelanggan(p).nama)}, ${esc(pelanggan(p).alamat || '-')}</small></div><span class="badge kurir">${STATUS.kurir}</span></div>
    <p class="items">${ringkas(p)}</p>
    <div class="actions"><button class="pill blue" data-act="terima" data-id="${p.idPesanan}">Terima tugas</button></div></article>`).join('') : '<p class="empty">Belum ada tugas baru. Tugas muncul setelah apoteker menyiapkan pesanan.</p>'}
  <div class="bar" style="margin-top:36px"><h2>Sedang diantar</h2></div>
  ${jalan.length ? jalan.map(p => `<article class="order"><div class="oh"><div><h3>${kode(p)}</h3><small>Untuk ${esc(pelanggan(p).nama)}, ${esc(pelanggan(p).alamat || '-')}</small></div><span class="badge diantar">${STATUS.diantar}</span></div>
    <p class="items">Status pengiriman: ${p.pengiriman.status}</p>
    ${p.pengiriman.status === 'Tiba di tujuan'
      ? `<div class="actions"><input type="file" id="b${p.idPesanan}" accept="image/*" aria-label="Foto bukti"><button class="pill lemon" data-act="selesai" data-id="${p.idPesanan}">Upload bukti pengiriman</button></div>`
      : `<div class="actions"><button class="pill lemon" data-act="tiba" data-id="${p.idPesanan}">Update status: tiba di tujuan</button></div>`}
  </article>`).join('') : '<p class="empty">Tidak ada pesanan yang sedang kamu antar.</p>'}
  ${done.length ? `<div class="bar" style="margin-top:36px"><h2>Riwayat selesai</h2></div>${done.map(track).join('')}` : ''}`;
}

// Tabel stok (dipakai Apoteker & Admin) dan tabel data obat (Admin)
function tabelStok() {
  return `<div class="tblwrap"><table class="tbl"><thead><tr><th>ID</th><th>Obat</th><th>Stok</th><th>Ubah stok</th></tr></thead><tbody>
  ${S.obat.map(o => `<tr><td>${o.idObat}</td><td>${esc(o.nama)}</td><td>${o.stok}</td>
    <td><button class="pill ghost sm" data-act="stok" data-id="${o.idObat}" data-d="-5">-5</button> <button class="pill ghost sm" data-act="stok" data-id="${o.idObat}" data-d="5">+5</button></td></tr>`).join('')}
  </tbody></table></div>`;
}
function tabelObat() {
  return `<div class="tblwrap"><table class="tbl"><thead><tr><th>ID</th><th>Nama</th><th>Harga</th><th>Aksi</th></tr></thead><tbody>
  ${S.obat.map(o => `<tr><td>${o.idObat}</td><td>${esc(o.nama)}</td><td>${rupiah(o.harga)}</td>
    <td><button class="pill ghost sm" data-act="ubahObat" data-id="${o.idObat}">Ubah</button> <button class="pill red sm" data-act="hapusObat" data-id="${o.idObat}">Hapus</button></td></tr>`).join('')}
  </tbody></table></div>`;
}

// Halaman Admin: laporan, kelola data obat, kelola stok obat, kelola pengguna
function vAdmin() {
  const omzet = S.pesanan.filter(p => p.pembayaran.status === 'Lunas').reduce((s, p) => s + p.total, 0);
  const tipis = S.obat.filter(o => o.stok < 10);
  const jumlah = k => S.pesanan.filter(p => p.status === k).length;
  const maks = Math.max(1, ...Object.keys(STATUS).map(jumlah));
  return `<div class="head"><h1>Ruang admin</h1><p>Kelola data obat, stok, pengguna, dan lihat laporan.</p></div>
  <div class="bar"><h2>Laporan</h2></div>
  <div class="stats">
    <div class="stat"><b>${S.pesanan.length}</b>pesanan masuk</div>
    <div class="stat"><b>${rupiah(omzet)}</b>pendapatan (lunas)</div>
    <div class="stat"><b>${S.obat.length}</b>jenis obat</div>
    <div class="stat"><b>${tipis.length}</b>obat stok menipis</div>
  </div>
  <div class="cols">${Object.keys(STATUS).map(k => `<div><small>${STATUS[k]}: ${jumlah(k)}</small><div class="bar-h" style="width:${jumlah(k) / maks * 100}%;min-width:14px"></div></div>`).join('')}</div>
  ${tipis.length ? `<p class="empty" style="margin-bottom:30px">Stok menipis: ${tipis.map(o => esc(o.nama) + ' (' + o.stok + ')').join(', ')}.</p>` : ''}
  <div class="bar"><h2>Kelola data obat</h2></div>
  <form class="addform" id="adminForm">
    <label>Nama obat<input name="nama" required></label>
    <label>Harga (Rp)<input name="harga" type="number" min="100" required></label>
    <label>Stok awal<input name="stok" type="number" min="0" required></label>
    <button class="pill blue">Simpan obat</button>
  </form>
  ${tabelObat()}
  <div class="bar"><h2>Kelola stok obat</h2></div>${tabelStok()}
  <div class="bar"><h2>Kelola pengguna</h2></div>
  <form class="addform" id="userForm">
    <label>Nama<input name="nama" required></label>
    <label>Email<input name="email" type="email" required></label>
    <label>No. HP<input name="noHp" required></label>
    <label>Password<input name="password" type="password" minlength="4" required></label>
    <label>Peran<select name="role" id="roleSel">${Object.keys(ROLES).map(r => `<option value="${r}">${ROLES[r]}</option>`).join('')}</select></label>
    <label><span id="attrLbl">${ATTR.pelanggan[1]}</span><input name="attr" required></label>
    <button class="pill blue">Buat akun</button>
  </form>
  <div class="tblwrap"><table class="tbl"><thead><tr><th>ID</th><th>Nama</th><th>Email</th><th>No. HP</th><th>Peran</th><th>Atribut khusus</th><th>Aksi</th></tr></thead><tbody>
  ${S.users.map(u => `<tr><td>${u.idPengguna}</td><td>${esc(u.nama)}</td><td>${esc(u.email)}</td><td>${esc(u.noHp || '-')}</td><td>${ROLES[u.role]}</td><td>${ATTR[u.role][1]}: ${esc(u[ATTR[u.role][0]] || '-')}</td>
    <td><button class="pill ghost sm" data-act="ubahUser" data-id="${u.idPengguna}">Ubah</button> ${u.idPengguna === S.userId ? '' : `<button class="pill red sm" data-act="hapusUser" data-id="${u.idPengguna}">Hapus</button>`}</td></tr>`).join('')}
  </tbody></table></div>`;
}

// Render katalog & nota belanja (keranjang)
function grid() {
  const el = $('#grid'); if (!el) return;
  const q = ui.q.toLowerCase();
  const l = S.obat.filter(o => o.nama.toLowerCase().includes(q));
  el.innerHTML = l.length ? l.map(pocket).join('') : '<p class="empty">Tidak ada obat yang cocok. Coba kata kunci lain.</p>';
}

function nota() {
  const el = $('#nota'); if (!el) return;
  S.cart = S.cart.filter(c => ob(c.idObat));
  const items = S.cart.map(c => ({ ...ob(c.idObat), jumlah: c.jumlah }));
  const total = items.reduce((s, i) => s + i.harga * i.jumlah, 0);
  el.innerHTML = `<h3>Nota belanja</h3>
  ${items.length ? items.map(i => `<div class="line"><span>${esc(i.nama)}</span>
    <span class="qty"><button data-act="dec" data-id="${i.idObat}" aria-label="Kurangi">-</button>${i.jumlah}<button data-act="inc" data-id="${i.idObat}" aria-label="Tambah">+</button></span>
    <b>${rupiah(i.harga * i.jumlah)}</b></div>`).join('') : '<p class="empty">Nota masih kosong. Tambahkan obat dari katalog.</p>'}
  <div class="resep-box"><label>Punya resep dokter? Unggah di sini (opsional)<input type="file" id="resepFile" accept="image/*"></label>
    ${ui.resep ? `<small>${esc(ui.resep.nama)}</small><img src="${ui.resep.url}" alt="Pratinjau resep">` : '<small>Jika resep diunggah, apoteker memverifikasinya sebelum obat disiapkan.</small>'}</div>
  <div class="total"><span>Total</span><span>${rupiah(total)}</span></div>
  <label>Metode pembayaran<select id="metode">${['QRIS', 'Transfer bank', 'E-wallet', 'Bayar di tempat'].map(m => `<option ${m === ui.metode ? 'selected' : ''}>${m}</option>`).join('')}</select></label>
  <button class="pill blue" data-act="checkout" ${items.length ? '' : 'disabled'}>Checkout dan bayar</button>`;
  save();
}

function render() {
  const u = me();
  $('#roles').innerHTML = u
    ? `<small class="who">Masuk sebagai ${esc(u.nama)}</small><button class="on" data-act="noop">${ROLES[u.role]}${unread(u.role) ? ` <span class="dot">${unread(u.role)}</span>` : ''}</button>`
    : '<small class="who">Belum login</small>';
  $('#authBtn').textContent = u ? 'Keluar (' + u.nama.split(' ')[0] + ')' : 'Masuk atau daftar';
  $('#app').innerHTML = u ? { pelanggan: vPelanggan, apoteker: vApoteker, kurir: vKurir, admin: vAdmin }[u.role]() : vGate();
  if (u && u.role === 'pelanggan') { grid(); nota(); }
  save();
}

// Registrasi & login (popup)
function openAuth() {
  const reg = ui.mode === 'reg', dlg = $('#authDlg');
  dlg.innerHTML = `<form id="authForm"><h2>${reg ? 'Registrasi pelanggan' : 'Login'}</h2>
    ${reg ? '<label>Nama lengkap<input name="nama" required></label><label>No. HP<input name="noHp" required></label><label>Alamat pengiriman<input name="alamat" required></label>' : ''}
    <label>Email<input name="email" type="email" required></label>
    <label>Password<input name="password" type="password" minlength="4" required></label>
    <div class="row"><button class="pill blue">${reg ? 'Daftar' : 'Masuk'}</button>
    <button type="button" class="pill ghost" data-act="mode">${reg ? 'Sudah punya akun' : 'Daftar sebagai pelanggan'}</button>
    <button type="button" class="pill ghost" data-act="close">Tutup</button></div>${reg ? '' : DEMO}</form>`;
  if (!dlg.open) dlg.showModal();
}

// Semua aksi tombol (event delegation)
const ACT = {
  login: () => { ui.mode = 'login'; openAuth(); },
  daftar: () => { ui.mode = 'reg'; openAuth(); },
  mode: () => { ui.mode = ui.mode === 'reg' ? 'login' : 'reg'; openAuth(); },
  close: () => $('#authDlg').close(),

  /* Pelanggan: pilihObat() + cekStok() ke keranjang */
  add: id => {
    const o = ob(id), c = S.cart.find(c => c.idObat == id), n = (c ? c.jumlah : 0) + 1;
    if (n > o.stok) return toast('Stok ' + o.nama + ' tidak cukup');
    c ? c.jumlah = n : S.cart.push({ idObat: o.idObat, jumlah: 1 });
    nota();
  },
  inc: id => ACT.add(id),
  dec: id => { const c = S.cart.find(c => c.idObat == id); c.jumlah--; if (c.jumlah < 1) S.cart = S.cart.filter(x => x !== c); nota(); },

  /* Pelanggan: checkout() -> simpanPesanan() -> notifikasi() ke apoteker */
  checkout: () => {
    if (S.cart.some(c => c.jumlah > ob(c.idObat).stok)) return toast('Ada obat yang stoknya berubah, cek kembali nota');
    const detail = S.cart.map(c => ({ idObat: c.idObat, jumlah: c.jumlah, subtotal: ob(c.idObat).harga * c.jumlah }));   // DetailPesanan.hitungTotal()
    const total = detail.reduce((t, d) => t + d.subtotal, 0);                                                           // Pesanan.hitungTotal()
    detail.forEach(d => ob(d.idObat).stok -= d.jumlah);                                                                 // Obat.updateStok()
    const id = S.seq++;
    const p = {
      idPesanan: id, tanggal: new Date().toISOString(), status: 'bayar', total, idPelanggan: S.userId, detail,
      pembayaran: { idBayar: id, metode: ui.metode, jumlah: total, status: 'Menunggu' },
      resep: ui.resep ? { idResep: id, foto: ui.resep.nama, status: 'Menunggu' } : null,                                 // Pesanan 1 - 0..1 Resep
      pengiriman: { idKirim: id, status: 'Belum ditugaskan', tglKirim: null, bukti: null, idKurir: null }
    };
    S.pesanan.push(p); S.cart = []; ui.resep = null;
    notif('apoteker', 'Pesanan baru ' + kode(p) + ' masuk' + (p.resep ? ', membawa resep' : ''));
    toast('Pesanan disimpan, sistem memvalidasi pembayaran');
    render();
    setTimeout(() => ACT.konfirmasi(id), 1800);
  },

  /* Sistem: Validasi bayar -> Pembayaran.konfirmasi(); "Perlu resep?" ditentukan dari ada tidaknya resep */
  konfirmasi: id => {
    const p = pes(id); if (!p || p.status !== 'bayar') return;
    p.pembayaran.status = 'Lunas';
    ubahStatus(p, p.resep ? 'verifikasi' : 'disiapkan');
    toast('Pembayaran ' + kode(p) + ' tervalidasi'); render();
  },

  /* Apoteker: verifikasi() -> Resep.validasi(); alt [resep valid] / [resep tidak valid] */
  valid: id => { const p = pes(id); p.resep.status = 'Valid'; ubahStatus(p, 'disiapkan'); toast('Resep valid, pesanan dilanjutkan'); render(); },
  tolak: id => {
    const p = pes(id); p.resep.status = 'Tidak valid'; p.pembayaran.status = 'Dikembalikan'; ubahStatus(p, 'ditolak');
    p.detail.forEach(d => { const o = ob(d.idObat); if (o) o.stok += d.jumlah; });
    toast('Pesanan ditolak, stok dikembalikan'); render();
  },
  siap: id => {
    const p = pes(id); p.pengiriman.status = 'Ditugaskan'; ubahStatus(p, 'kurir');
    notif('kurir', 'Tugas baru ' + kode(p) + ' ke ' + (pelanggan(p).alamat || '-'));
    toast('Tugas pengantaran dibuat untuk kurir'); render();
  },

  /* Kurir: terimaTugas(), updateStatus(), unggah bukti */
  terima: id => { const p = pes(id); p.pengiriman.idKurir = S.userId; p.pengiriman.status = 'Dalam perjalanan'; ubahStatus(p, 'diantar'); toast('Tugas diterima, selamat mengantar'); render(); },
  tiba: id => { pes(id).pengiriman.status = 'Tiba di tujuan'; toast('Status diperbarui, silakan upload bukti'); render(); },
  selesai: id => {
    const f = $('#b' + id).files[0];
    if (!f) return toast('Pilih foto bukti pengiriman dulu');
    const p = pes(id); p.pengiriman.bukti = f.name; p.pengiriman.tglKirim = new Date().toISOString(); p.pengiriman.status = 'Terkirim';
    fotoUrl[id] = URL.createObjectURL(f); ubahStatus(p, 'terkirim');
    toast('Bukti terunggah, menunggu pelanggan menerima pesanan'); render();
  },
  diterima: id => { ubahStatus(pes(id), 'selesai'); toast('Pesanan diterima, terima kasih'); render(); },
  baca: r => { S.notif.forEach(n => { if (n.untuk === r) n.baca = true; }); render(); },

  /* Apoteker dan Admin: stok obat */
  stok: (id, b) => { const o = ob(id); o.stok = Math.max(0, o.stok + Number(b.dataset.d)); render(); },

  /* Admin: kelola data obat */
  ubahObat: id => {
    const o = ob(id), n = prompt('Nama obat', o.nama); if (n === null) return;
    const h = Number(prompt('Harga (Rp)', o.harga));
    o.nama = n.trim() || o.nama; if (h > 0) o.harga = h;
    toast('Data obat diubah'); render();
  },
  hapusObat: id => { S.obat = S.obat.filter(o => o.idObat != id); toast('Data obat dihapus'); render(); },

  /* Admin: kelola pengguna */
  ubahUser: id => {
    const u = S.users.find(u => u.idPengguna == id), key = ATTR[u.role][0];
    const n = prompt('Nama pengguna', u.nama); if (n === null) return;
    const hp = prompt('No. HP', u.noHp || ''); const a = prompt(ATTR[u.role][1], u[key] || '');
    u.nama = n.trim() || u.nama; if (hp !== null) u.noHp = hp.trim(); if (a !== null) u[key] = a.trim();
    toast('Data pengguna diubah'); render();
  },
  hapusUser: id => {
    if (id == S.userId) return toast('Akun yang sedang dipakai tidak bisa dihapus');
    S.users = S.users.filter(x => x.idPengguna != id); toast('Pengguna dihapus'); render();
  }
};

document.addEventListener('click', e => {
  const b = e.target.closest('[data-act]');
  if (!b || !ACT[b.dataset.act]) return;
  const need = NEED[b.dataset.act], u = me();
  if (need && !(u && need.includes(u.role))) return toast('Akunmu tidak punya izin untuk aksi ini');
  ACT[b.dataset.act](b.dataset.id, b);
});

// Tombol login / logout
$('#authBtn').addEventListener('click', () => {
  if (me()) { S.userId = null; ui.q = ''; toast('Kamu sudah keluar'); render(); }
  else { ui.mode = 'login'; openAuth(); }
});

document.addEventListener('input', e => {
  if (e.target.id === 'q') { ui.q = e.target.value; grid(); }
});

document.addEventListener('change', e => {
  if (e.target.id === 'metode') ui.metode = e.target.value;
  if (e.target.id === 'roleSel') $('#attrLbl').textContent = ATTR[e.target.value][1];
  if (e.target.id === 'resepFile' && e.target.files[0]) {
    const f = e.target.files[0];                                  // Pelanggan.uploadResep()
    ui.resep = { nama: f.name, url: URL.createObjectURL(f) }; nota();
  }
});

// Form: login/registrasi, tambah obat, buat akun
document.addEventListener('submit', e => {
  e.preventDefault();
  const f = Object.fromEntries(new FormData(e.target));
  const u = me(), email = (f.email || '').trim().toLowerCase();

  if (e.target.id === 'authForm') {
    if (ui.mode === 'reg') {                                       // Pelanggan.registrasi()
      if (S.users.some(x => x.email === email)) return toast('Email sudah terdaftar, silakan masuk');
      const baru = { idPengguna: S.uid++, nama: f.nama, email, password: f.password, noHp: f.noHp, role: 'pelanggan', alamat: f.alamat };
      S.users.push(baru); S.userId = baru.idPengguna; toast('Registrasi berhasil, selamat datang ' + baru.nama.split(' ')[0]);
    } else {                                                       // Pengguna.login() -> cekAkun()
      const x = S.users.find(x => x.email === email && x.password === f.password);
      if (!x) return toast('Email atau password salah');
      S.userId = x.idPengguna; toast('Berhasil masuk sebagai ' + ROLES[x.role]);
    }
    $('#authDlg').close(); render();
  }

  if (e.target.id === 'adminForm') {                               // Admin.kelolaObat()
    if (!u || u.role !== 'admin') return toast('Akunmu tidak punya izin untuk aksi ini');
    S.obat.push({ idObat: S.oid++, nama: f.nama, harga: +f.harga, stok: +f.stok });
    toast('Obat baru disimpan'); render();
  }

  if (e.target.id === 'userForm') {
    if (!u || u.role !== 'admin') return toast('Akunmu tidak punya izin untuk aksi ini');
    if (S.users.some(x => x.email === email)) return toast('Email sudah terdaftar');
    S.users.push({ idPengguna: S.uid++, nama: f.nama, email, password: f.password, noHp: f.noHp, role: f.role, [ATTR[f.role][0]]: f.attr.trim() });
    toast('Akun ' + ROLES[f.role] + ' dibuat'); render();
  }
});

// Pembayaran yang masih diproses waktu halaman dibuka ulang langsung dilunasi
S.pesanan.filter(p => p.status === 'bayar').forEach(p => ACT.konfirmasi(p.idPesanan));
render();
