(function(){
'use strict';
/* Merdiven saha montajı (AGRO MER). Birleşimler kaynaklı: cıvata yok. */
const S = window.SAHA, $app = document.getElementById('app');
const esc = s => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
const GRP = {
  C:{ n:'Kolon',              css:'#1971C2' },
  Y:{ n:'Kiriş ve çapraz',    css:'#0C8599' },
  M:{ n:'Merdiven kirişi',    css:'#2B8A3E' },
  S:{ n:'Sac',                css:'#7048E8' },
  K:{ n:'Korkuluk',           css:'#862E9C' }
};
const STAGES = ['C','Y','M','S','K'];
const SEL = [0xE03131, 0xB02525, 0xFF6B6B, 0xC92A2A], NB = [0xFCC419, 0xF08C00, 0xFFE066, 0xE8A317];
const BY = {}; S.items.forEach(it => BY[it.id] = it);
const byMark = {}; S.items.forEach(it => (byMark[it.mark.toLowerCase()] = byMark[it.mark.toLowerCase()] || []).push(it));
let stage = 0;

/* renk kuralı: aynı poz = aynı renk, farklı poz = farklı renk (seçim renkleri kırmızı/sarı kullanılmaz) */
(function color(){
  STAGES.forEach(g => {
    const marks = [...new Set(S.items.filter(it => it.g === g).map(it => it.mark))]
      .sort((a,b) => a.split('/')[0].localeCompare(b.split('/')[0]) || (+a.split('/')[1]) - (+b.split('/')[1]));
    const n = marks.length, col = {};
    // ton 100°..320° (yeşil-camgöbeği-mavi-mor-pembe): kırmızı ve sarı seçim renklerine yakın tonlar kullanılmaz
    marks.forEach((m,i) => {
      const h = 100 + ((i * 0.6180339887) % 1) * 220;
      const l = [0.40, 0.56, 0.32, 0.64][i % 4];
      col[m] = new THREE.Color().setHSL(h/360, 0.65, l).getHex();
    });
    S.items.forEach(it => { if(it.g === g) it.hex = col[it.mark]; });
  });
})();

/* ---------- geometri ---------- */
function b64(s){ const bin = atob(s), u = new Uint8Array(bin.length); for(let i=0;i<bin.length;i++) u[i] = bin.charCodeAt(i); return u.buffer; }
function geomOf(it){
  if(it._g) return it._g;
  const vi = new Int32Array(b64(it.v)), fi = it.fw === 2 ? new Uint16Array(b64(it.f)) : new Uint32Array(b64(it.f));
  const pos = new Float32Array(vi.length);
  for(let i=0;i<vi.length;i+=3){ pos[i] = vi[i]+it.o[0]; pos[i+1] = vi[i+2]+it.o[2]; pos[i+2] = -(vi[i+1]+it.o[1]); }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setIndex(new THREE.BufferAttribute(fi, 1)); g.computeVertexNormals();
  it._g = g; it._e = new THREE.EdgesGeometry(g, 30); return g;
}
const P3 = (x,y,z) => new THREE.Vector3(x, z, -y);

/* ---------- malzemeler ---------- */
const MC = {};
const SHEET_OP = 0.95;   // saclar biraz şeffaf (opaklık 0,95)
function solid(hex, sheet){
  const k = hex+(sheet ? 's' : '');
  return MC[k] || (MC[k] = new THREE.MeshStandardMaterial({ color:hex, metalness:0.2, roughness:0.6, side:THREE.DoubleSide, flatShading:true,
    transparent:!!sheet, opacity:sheet ? SHEET_OP : 1, depthWrite:!sheet, polygonOffset:true, polygonOffsetFactor:1, polygonOffsetUnits:1 }));
}
function edgeOf(hex){ const k = 'e'+hex; return MC[k] || (MC[k] = new THREE.LineBasicMaterial({ color:new THREE.Color(hex).multiplyScalar(0.55) })); }
const FADE = new THREE.MeshStandardMaterial({ color:0x9DA9B4, side:THREE.DoubleSide, flatShading:true, transparent:true, opacity:0.5, depthWrite:false });
const FADE_S = new THREE.MeshStandardMaterial({ color:0xA9B2BA, side:THREE.DoubleSide, flatShading:true, transparent:true, opacity:0.35, depthWrite:false });
const EDGE_F = new THREE.LineBasicMaterial({ color:0x7F8A94, transparent:true, opacity:0.45 });
const GHOST = new THREE.MeshStandardMaterial({ color:0xB4BEC7, side:THREE.DoubleSide, flatShading:true, transparent:true, opacity:0.22, depthWrite:false });
const GHOST_S = new THREE.MeshStandardMaterial({ color:0xC2C9CF, side:THREE.DoubleSide, flatShading:true, transparent:true, opacity:0.14, depthWrite:false });
const EDGE_G = new THREE.LineBasicMaterial({ color:0x9AA5AE, transparent:true, opacity:0.25 });
const HOLE = new THREE.MeshBasicMaterial({ color:0x111518 });
const DIA = { 14:'#1E9E52', 18:'#E8590C', 16:'#1C7ED6', 22:'#AE3EC9' };
const RM = {}; const ringM = d => RM[d] || (RM[d] = new THREE.MeshBasicMaterial({ color:new THREE.Color(DIA[d] || '#495057') }));

/* ---------- 3B ---------- */
const V = { r:null, scene:null, cam:null, ctl:null, el:null, root:null, meshes:{}, sel:[], view:'iso' };
function makeLabel(text, bg, fg, h){
  const c = document.createElement('canvas'), ctx = c.getContext('2d'), fs = 64;
  const font = '700 '+fs+'px "Barlow Condensed","Arial Narrow",Arial,sans-serif';
  ctx.font = font; c.width = Math.ceil(ctx.measureText(text).width) + 32; c.height = fs + 24;
  ctx.font = font; ctx.fillStyle = bg; ctx.beginPath(); if(ctx.roundRect) ctx.roundRect(0,0,c.width,c.height,14); else ctx.rect(0,0,c.width,c.height);
  ctx.fill(); ctx.fillStyle = fg; ctx.textBaseline = 'middle'; ctx.fillText(text, 16, c.height/2+3);
  const tex = new THREE.CanvasTexture(c); tex.minFilter = THREE.LinearFilter;
  const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map:tex, depthTest:false })); sp.renderOrder = 10; sp.userData.h = h; sp.userData.asp = c.width/c.height; return sp;
}
function init(el){
  V.el = el;
  if(!V.r){
    const r = new THREE.WebGLRenderer({ antialias:true, alpha:true }); r.setPixelRatio(Math.min(window.devicePixelRatio||1, 2)); V.r = r;
    V.scene = new THREE.Scene(); V.cam = new THREE.OrthographicCamera(-1,1,1,-1,1,1e7);
    V.scene.add(new THREE.HemisphereLight(0xffffff, 0x7d8894, 0.85));
    const d1 = new THREE.DirectionalLight(0xffffff, 0.7); d1.position.set(0.4,1,0.7); V.scene.add(d1);
    const d2 = new THREE.DirectionalLight(0xffffff, 0.3); d2.position.set(-0.6,-0.4,-0.8); V.scene.add(d2);
    V.ctl = new THREE.OrbitControls(V.cam, r.domElement); V.ctl.addEventListener('change', render);
    window.addEventListener('resize', () => { resize(); fit(); });
    let down = null;
    r.domElement.addEventListener('pointerdown', e => { down = [e.clientX, e.clientY]; });
    r.domElement.addEventListener('pointerup', e => { if(down && Math.hypot(e.clientX-down[0], e.clientY-down[1]) < 6) pick(e); down = null; });
    const root = new THREE.Group(); V.root = root;
    S.items.forEach(it => {
      const m = new THREE.Mesh(geomOf(it)); m.userData.id = it.id;
      const e = new THREE.LineSegments(it._e);
      const g = new THREE.Group(); g.add(m); g.add(e); g.userData.it = it; V.meshes[it.id] = { g, m, e }; root.add(g);
    });
    V.labels = new THREE.Group(); V.holes = new THREE.Group(); root.add(V.labels); root.add(V.holes);
    V.scene.add(root);
  }
  el.appendChild(V.r.domElement); resize();
}
function stageState(it){
  const k = STAGES.indexOf(it.g);
  return k < stage ? 'done' : (k === stage ? 'now' : 'hidden');
}
/* görünüm durumu: seçim varsa sadece seçilen(ler) + bağlandıkları (sonraki aşamalar hariç) */
function viewState(it){
  const st = stageState(it);
  if(!V.sel.length) return st;
  if(V.selSet.has(it.id)) return 'sel';
  if(V.nbSet.has(it.id) && st !== 'hidden') return 'nb';
  return st === 'hidden' ? 'hidden' : 'ghost';
}
function applyStyle(){
  V.selSet = new Set(V.sel); V.nbSet = new Set();
  V.sel.forEach(id => BY[id].con.forEach(c => { if(!V.selSet.has(c)) V.nbSet.add(c); }));
  // bağlı olanlar arasında da farklı sarı tonlar
  const nbList = [...V.nbSet].map(id => BY[id]).sort((a,b) => a.bmin[0]-b.bmin[0] || a.bmin[1]-b.bmin[1]), nbCi = {};
  nbList.forEach((it,i) => nbCi[it.id] = i % NB.length);
  const selCi = {}; V.sel.forEach((id,i) => selCi[id] = i % SEL.length);
  S.items.forEach(it => {
    const o = V.meshes[it.id], vs = viewState(it), sheet = it.g === 'S';
    o.g.visible = vs !== 'hidden';
    let hex = null;
    if(vs === 'sel') hex = SEL[selCi[it.id] || 0];
    else if(vs === 'nb') hex = NB[nbCi[it.id] || 0];
    else if(vs === 'now') hex = it.hex;
    if(hex !== null){ o.m.material = solid(hex, sheet); o.e.material = edgeOf(hex); }
    else if(vs === 'ghost'){ o.m.material = sheet ? GHOST_S : GHOST; o.e.material = EDGE_G; }
    else { o.m.material = sheet ? FADE_S : FADE; o.e.material = EDGE_F; }
  });
  // isim etiketleri (tıklamadan görünür; sığmayan gizlenir, yakınlaşınca açılır)
  V.labels.clear();
  S.items.forEach(it => {
    const vs = viewState(it);
    if(V.sel.length ? !(vs === 'sel' || vs === 'nb') : vs !== 'now') return;
    const bg = vs === 'sel' ? '#E03131' : (vs === 'nb' ? '#FCC419' : '#FFFFFF'), fg = vs === 'sel' ? '#FFFFFF' : '#1A2026';
    const lb = makeLabel(it.mark, bg, fg, vs === 'sel' ? 0.05 : 0.036);
    const size = (it.bmax[0]-it.bmin[0]) + (it.bmax[1]-it.bmin[1]) + (it.bmax[2]-it.bmin[2]);
    lb.userData.prio = vs === 'sel' ? 1e9 : size;
    // etiket malzemenin üstünde: ana parçanın ekseni boyunca birkaç aday nokta (orta, %30, %70, %15, %85)
    lb.userData.anchors = (it.lp || [[(it.bmin[0]+it.bmax[0])/2, (it.bmin[1]+it.bmax[1])/2, (it.bmin[2]+it.bmax[2])/2]]).map(q => P3(q[0], q[1], q[2]));
    lb.position.copy(lb.userData.anchors[0]); V.labels.add(lb);
  });
  // delikler (görünen elemanlarda); renkli halka: renkli gösterilenlerde
  V.holes.clear();
  const holes = [], rings = {};
  S.items.forEach(it => { const vs = viewState(it); if(vs === 'hidden' || vs === 'ghost' || !it.h || !it.h.length) return;
    it.h.forEach(h => { holes.push(h); if(vs !== 'done') (rings[h[6]] = rings[h[6]] || []).push(h); }); });
  const up = new THREE.Vector3(0,1,0), zz = new THREE.Vector3(0,0,1), M4 = new THREE.Matrix4(), q = new THREE.Quaternion(), sc = new THREE.Vector3(), p = new THREE.Vector3();
  if(holes.length){
    const im = new THREE.InstancedMesh(V.cylG || (V.cylG = new THREE.CylinderGeometry(0.5,0.5,1,14)), HOLE, holes.length);
    holes.forEach((h,k) => { const n = P3(h[3],h[4],h[5]).normalize(); q.setFromUnitVectors(up, n); p.copy(P3(h[0],h[1],h[2])); sc.set(h[6], h[7]+1.5, h[6]); M4.compose(p,q,sc); im.setMatrixAt(k, M4); });
    V.holes.add(im);
  }
  Object.keys(rings).forEach(d => {
    const list = rings[d], im = new THREE.InstancedMesh(V.torG || (V.torG = new THREE.TorusGeometry(1, 0.16, 6, 20)), ringM(+d), list.length*2); let k = 0;
    list.forEach(h => { const n = P3(h[3],h[4],h[5]).normalize(); q.setFromUnitVectors(zz, n); const r = h[6]/2 + 3; sc.set(r, r, r);
      [-1,1].forEach(s => { p.copy(P3(h[0],h[1],h[2])).addScaledVector(n, s*(h[7]/2+0.8)); M4.compose(p,q,sc); im.setMatrixAt(k++, M4); }); });
    V.holes.add(im);
  });
  render();
}
function render(){
  if(V.ar) return;                      // AR açıkken çizimi XR döngüsü yapar
  if(!(V.r && V.el && V.el.isConnected)) return;
  const c = V.cam, ws = (c.top - c.bottom)/c.zoom;
  V.labels.children.forEach(o => o.scale.set(o.userData.asp*o.userData.h*ws, o.userData.h*ws, 1));
  V.cam.updateMatrixWorld(); V.root.updateMatrixWorld(true); declutter(); V.r.render(V.scene, V.cam);
}
function declutter(){
  // yazılar üst üste binmez: her etiket için malzeme üzerindeki aday noktalar sırayla denenir; hiçbiri sığmazsa gizlenir (yakınlaşınca açılır)
  const Wp = V.el.clientWidth, Hp = V.el.clientHeight, placed = [], v = new THREE.Vector3();
  const mw = V.root.matrixWorld;
  V.labels.children.slice().sort((a,b) => b.userData.prio - a.userData.prio).forEach(sp => {
    const h = sp.userData.h*Hp, w = sp.userData.asp*h;
    let ok = null;
    for(const a of (sp.userData.anchors || [sp.position.clone()])){
      v.copy(a).applyMatrix4(mw).project(V.cam);
      if(v.x < -1.02 || v.x > 1.02 || v.y < -1.02 || v.y > 1.02) continue;
      const cx = (v.x+1)/2*Wp, cy = (1-v.y)/2*Hp, r = [cx-w/2-2, cy-h/2-2, cx+w/2+2, cy+h/2+2];
      if(placed.some(q => r[0] < q[2] && r[2] > q[0] && r[1] < q[3] && r[3] > q[1])) continue;
      ok = { a, r }; break;
    }
    sp.visible = !!ok;
    if(ok){ sp.position.copy(ok.a); placed.push(ok.r); }
  });
}
function resize(){ if(V.el && V.el.isConnected){ V.r.setSize(V.el.clientWidth, V.el.clientHeight, false); render(); } }
const DIRS = { iso:[-1,1.1,1], top:[0,1,0.0001], front:[0,0.15,1], side:[1,0.15,0] };
function worldBox(){
  const lo=[1e12,1e12,1e12], hi=[-1e12,-1e12,-1e12];
  S.items.forEach(it => { for(let k=0;k<3;k++){ lo[k]=Math.min(lo[k],it.bmin[k]); hi[k]=Math.max(hi[k],it.bmax[k]); } });
  return { lo, hi };
}
function fit(){
  const box = worldBox(), c = V.cam, dir = new THREE.Vector3(...DIRS[V.view]).normalize();
  const corners = []; [box.lo[0], box.hi[0]].forEach(x => [box.lo[1], box.hi[1]].forEach(y => [box.lo[2], box.hi[2]].forEach(z => corners.push(P3(x,y,z)))));
  const t = P3((box.lo[0]+box.hi[0])/2, (box.lo[1]+box.hi[1])/2, (box.lo[2]+box.hi[2])/2), D = 2e5;
  c.position.copy(t).addScaledVector(dir, D); c.up.set(0,1,0); c.lookAt(t); c.updateMatrixWorld();
  const inv = c.matrixWorldInverse; let x0=1e12,x1=-1e12,y0=1e12,y1=-1e12;
  corners.forEach(q => { const p = q.clone().applyMatrix4(inv); x0 = Math.min(x0,p.x); x1 = Math.max(x1,p.x); y0 = Math.min(y0,p.y); y1 = Math.max(y1,p.y); });
  const asp = V.el.clientWidth / V.el.clientHeight, cx = (x0+x1)/2, cy = (y0+y1)/2;
  let w = (x1-x0)*1.12, h = (y1-y0)*1.15; if(w/h > asp) h = w/asp; else w = h*asp;
  const rt = new THREE.Vector3().setFromMatrixColumn(c.matrixWorld,0), up = new THREE.Vector3().setFromMatrixColumn(c.matrixWorld,1);
  t.addScaledVector(rt,cx).addScaledVector(up,cy); c.position.addScaledVector(rt,cx).addScaledVector(up,cy);
  c.left=-w/2; c.right=w/2; c.top=h/2; c.bottom=-h/2; c.zoom=1; c.near=1; c.far=D*3; c.updateProjectionMatrix();
  V.ctl.target.copy(t); V.ctl.update(); render();
}
function pick(e){
  const rect = V.r.domElement.getBoundingClientRect();
  const m = new THREE.Vector2(((e.clientX-rect.left)/rect.width)*2-1, -((e.clientY-rect.top)/rect.height)*2+1);
  const rc = new THREE.Raycaster(); rc.setFromCamera(m, V.cam);
  const objs = Object.values(V.meshes).filter(o => { if(!o.g.visible) return false; const vs = viewState(o.g.userData.it);
    return vs === 'now' || vs === 'sel' || vs === 'nb'; }).map(o => o.m);
  const hit = rc.intersectObjects(objs, false)[0];
  if(hit) location.hash = '#/m/'+hit.object.userData.id;
  else if(V.sel.length) location.hash = '#/';
}

/* ---------- arayüz ---------- */
function infoCard(ids){
  if(!ids.length) return '';
  const it = BY[ids[0]], n = ids.length;
  return '<div class="infocard"><h2>'+esc(it.mark)+(n > 1 ? ' <small class="muted">'+n+' adet</small>' : '')+'</h2>'+
    '<div class="row"><div><div class="k">Cıvata</div><div class="v">yok (kaynaklı)</div></div>'+
    (it.kg ? '<div><div class="k">Ağırlık'+(n > 1 ? ' (her biri)' : '')+'</div><div class="v">'+String(it.kg).replace('.', ',')+' kg</div></div>' : '')+'</div></div>';
}
function stageButtons(){ return STAGES.map((k,i) => '<button data-s="'+i+'" aria-pressed="'+(i === stage)+'"><i style="background:'+GRP[k].css+'"></i>'+(i+1)+'. '+GRP[k].n+'</button>').join(''); }
function setStage(k){ stage = k; document.querySelectorAll('#layers button').forEach(b => b.setAttribute('aria-pressed', +b.dataset.s === k)); arStageChanged(); }

/* ================= AR (kamera açık) =================
   Android (Chrome, ARCore): WebXR "immersive-ar". Sadece https'ten (GitHub Pages) açılınca çalışır.
   iPhone (Safari): AR Quick Look ile her aşama için hazır .usdz dosyası (ar/asamaN.usdz).
   Yerleştirme noktası: C/11 kolonunun (aks 1/A) taban plakası ortası. */
const AR_ANCHOR = [60, -40, 0];          // mm, IFC koordinatı
const AR = { session:null, ref:null, hts:null, group:null, reticle:null, mark1:null, step:0, p1:null, anchor:null, anchorPose:null, offset:null, scale:1, yaw:0, ui:null, frame:0, lost:false, msg:'' };
function arSupportedIOS(){ const a = document.createElement('a'); return !!(a.relList && a.relList.supports && a.relList.supports('ar')); }
function arButtonImg(text){
  const c = document.createElement('canvas'), ctx = c.getContext('2d'), fs = 34;
  ctx.font = '700 '+fs+'px "Barlow Condensed","Arial Narrow",Arial,sans-serif';
  c.width = Math.ceil(ctx.measureText(text).width) + 40; c.height = fs + 30;
  ctx.fillStyle = '#1F2D3A'; ctx.beginPath(); if(ctx.roundRect) ctx.roundRect(0,0,c.width,c.height,10); else ctx.rect(0,0,c.width,c.height); ctx.fill();
  ctx.font = '700 '+fs+'px "Barlow Condensed","Arial Narrow",Arial,sans-serif'; ctx.fillStyle = '#fff'; ctx.textBaseline = 'middle'; ctx.fillText(text, 20, c.height/2+2);
  return c.toDataURL('image/png');
}
function arSetup(){
  const row = document.getElementById('arrow'); if(!row) return;
  const ios = arSupportedIOS(), single = !!window.SAHA_SINGLE;
  let html = '<h3>Kamerada gör (AR)</h3>';
  if(ios && !single) html += '<a rel="ar" id="arIos" href="ar/asama'+(stage+1)+'.usdz"><img id="arIosImg" alt="AR"></a>'+
    '<p class="muted small">iPhone: model yere oturur; parmakla kaydır, iki parmakla döndür. Seçme ve isimler bu görüntüleyicide yok.</p>';
  html += '<button id="arBtn" class="arbtn" hidden>Kamerada gör (Android)</button><p id="arNote" class="muted small"></p>';
  row.innerHTML = html;
  arStageChanged();
  const note = document.getElementById('arNote');
  if(single){ note.textContent = 'AR, tek dosya sürümünde çalışmaz. Siteyi GitHub adresinden aç; iPhone için ar klasöründeki .usdz dosyaları Dosyalar uygulamasından da açılır.'; return; }
  if(navigator.xr && navigator.xr.isSessionSupported){
    navigator.xr.isSessionSupported('immersive-ar').then(ok => {
      if(ok){ const b = document.getElementById('arBtn'); b.hidden = false; b.onclick = arStart; note.textContent = 'İki noktayla yerleştirilir: önce C/11 tabanı (aks 1/A), sonra C/16 tabanı (aks 1). Model gerçek dünyaya sabitlenir.'; }
      else if(!ios) note.textContent = 'Bu telefonda/tarayıcıda AR yok. Android’de Chrome ve “Google Play Hizmetleri (AR)” gerekir.';
    }).catch(() => {});
  } else if(!ios) note.textContent = 'Bu tarayıcıda AR yok. Android’de Chrome, iPhone’da Safari kullan.';
}
function arStageChanged(){
  const a = document.getElementById('arIos'), im = document.getElementById('arIosImg');
  if(a){ a.href = 'ar/asama'+(stage+1)+'.usdz'; im.src = arButtonImg('Kamerada gör (iPhone) · '+(stage+1)+'. '+GRP[STAGES[stage]].n); }
  if(AR.ui) arUi();
}
function arUi(){
  const u = AR.ui, it = V.sel.length ? BY[V.sel[0]] : null;
  u.querySelector('.arstage').textContent = (stage+1)+'. '+GRP[STAGES[stage]].n;
  u.querySelector('.arscale').textContent = AR.scale === 1 ? 'Ölçek 1:1' : 'Ölçek 1:20';
  u.querySelector('.arskip').hidden = AR.step !== 1;
  let hint = '';
  if(AR.lost) hint = 'Konum takibi kayboldu: model şu an seninle birlikte kayar. Yavaş yürü, kamerayı desenli zemine / kolonlara tut, ışık yeterli olsun.';
  else if(AR.step === 0) hint = AR.scale === 1 ? '1. nokta: halkayı C/11 tabanına (aks 1/A, ankraj grubunun ortası) getir ve dokun.' : 'Halkayı masaya / yere getir ve dokun.';
  else if(AR.step === 1) hint = '2. nokta: halkayı C/16 tabanına getir (aynı aks 1 üzerinde, 3,16 m ileride) ve dokun.';
  else if(AR.msg) hint = AR.msg;
  else if(!it) hint = 'Elemana dokun: seç. Boş yere dokun: seçimi kaldır.';
  u.querySelector('.arhint').textContent = hint;
  u.querySelector('.arcard').innerHTML = it ? '<b>'+esc(it.mark)+'</b> · Cıvata: yok (kaynaklı) · '+String(it.kg).replace('.', ',')+' kg' : '';
  u.querySelector('.arcard').hidden = !it;
}
function arBuildUi(){
  const u = document.createElement('div'); u.id = 'arui';
  u.innerHTML = '<div class="artop"><button data-a="prev">‹</button><span class="arstage"></span><button data-a="next">›</button><button data-a="exit" class="arexit">Çık</button></div>'+
    '<div class="arhint"></div><button data-a="skip" class="arskip" hidden>Tek nokta yeter (yönü elle çevireceğim)</button><div class="arcard" hidden></div>'+
    '<div class="arbot"><button data-a="rl">⟲ 2,5°</button><button data-a="rr">⟳ 2,5°</button><button data-a="scale" class="arscale"></button><button data-a="re">Yeniden yerleştir</button></div>';
  // butonlara dokunmak sahnede "seç" sayılmasın
  u.addEventListener('beforexrselect', e => { if(e.target.closest('button')) e.preventDefault(); });
  u.addEventListener('click', e => {
    const b = e.target.closest('button'); if(!b) return;
    const a = b.dataset.a;
    if(a === 'exit') AR.session && AR.session.end();
    else if(a === 'prev' || a === 'next'){ setStage(Math.max(0, Math.min(STAGES.length-1, stage + (a === 'next' ? 1 : -1)))); V.sel = []; applyStyle(); arUi(); }
    else if(a === 'rl' || a === 'rr'){ if(AR.step === 2){ AR.yaw += (a === 'rl' ? 1 : -1) * Math.PI/72; AR.msg = 'Yön elle düzeltildi (2,5°).'; arPose(); arUi(); } }
    else if(a === 'scale'){ AR.scale = AR.scale === 1 ? 1/20 : 1; arReset(); }
    else if(a === 're') arReset();
    else if(a === 'skip'){ AR.step = 2; AR.msg = 'Tek nokta: yönü ⟲ ⟳ ile kolonlara göre çevir.'; arPose(); AR.group.visible = true; arUi(); }
  });
  document.body.appendChild(u); return u;
}
function arReset(){
  if(AR.anchor && AR.anchor.delete) try{ AR.anchor.delete(); }catch(e){}
  AR.anchor = null; AR.anchorFirst = null; AR.anchorPose = null; AR.offset = null; AR.p1 = null; AR.step = 0; AR.msg = ''; AR.yaw = 0;
  if(AR.group) AR.group.visible = false; V.sel = []; applyStyle(); arUi();
}
/* modelin istenen dünya konumu: T(1. nokta) · Ry(yön) · ölçek; çapa noktası (C/11 tabanı) orijinde.
   Sabit referans: 1. noktada bir WebXR "anchor" oluşturulur. ARCore gerçek dünyadaki izleri tanıyıp
   kaymayı düzelttikçe anchor da düzelir; model her karede anchor'a göre yeniden konumlanır. */
function arPose(){
  if(!AR.group || !AR.p1) return;
  const rs = new THREE.Matrix4().compose(new THREE.Vector3(), new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0,1,0), AR.yaw), new THREE.Vector3().setScalar(0.001*AR.scale));
  const T1 = new THREE.Matrix4().makeTranslation(AR.p1.x, AR.p1.y, AR.p1.z);
  if(AR.anchorFirst){
    // model = anchor(şimdi) · anchor(ilk)⁻¹ · T(1. nokta) · Ry · ölçek
    AR.offset = new THREE.Matrix4().copy(AR.anchorFirst).invert().multiply(T1).multiply(rs);
    AR.group.matrix.multiplyMatrices(AR.anchorPose, AR.offset);
  } else { AR.offset = null; AR.group.matrix.multiplyMatrices(T1, rs); }
  AR.group.matrixWorldNeedsUpdate = true;
}
async function arStart(){
  if(AR.session) return;
  AR.ui = AR.ui || arBuildUi(); AR.ui.style.display = 'flex';
  let session;
  try{
    session = await navigator.xr.requestSession('immersive-ar', { requiredFeatures:['hit-test'], optionalFeatures:['dom-overlay','anchors'], domOverlay:{ root:AR.ui } });
  }catch(err){ AR.ui.style.display = 'none'; document.getElementById('arNote').textContent = 'AR açılamadı: '+err.message; return; }
  AR.cam = AR.cam || new THREE.PerspectiveCamera(60, 1, 0.02, 200);
  AR.session = session; V.ar = true; AR.scale = 1; AR.lost = false; V.sel = [];
  const r = V.r; r.xr.enabled = true; r.xr.setReferenceSpaceType('local');
  await r.xr.setSession(session);
  AR.ref = await session.requestReferenceSpace('local');
  const viewer = await session.requestReferenceSpace('viewer');
  AR.hts = await session.requestHitTestSource({ space:viewer });
  if(!AR.group){ AR.group = new THREE.Group(); AR.group.matrixAutoUpdate = false; }
  V.scene.remove(V.root); AR.group.add(V.root); V.scene.add(AR.group);
  V.root.position.copy(P3(AR_ANCHOR[0], AR_ANCHOR[1], AR_ANCHOR[2])).multiplyScalar(-1);
  if(!AR.reticle){
    AR.reticle = new THREE.Mesh(new THREE.RingGeometry(0.09, 0.12, 32).rotateX(-Math.PI/2), new THREE.MeshBasicMaterial({ color:0xFFD43B }));
    AR.reticle.matrixAutoUpdate = false;
  }
  if(!AR.mark1){
    AR.mark1 = new THREE.Mesh(new THREE.RingGeometry(0.05, 0.12, 32).rotateX(-Math.PI/2), new THREE.MeshBasicMaterial({ color:0xE03131 }));
  }
  AR.reticle.visible = false; AR.mark1.visible = false; V.scene.add(AR.reticle); V.scene.add(AR.mark1);
  session.addEventListener('select', arSelect);
  session.addEventListener('end', arEnd);
  arReset();
  r.setAnimationLoop(arLoop);
}
function arLoop(t, frame){
  if(!frame) return;
  // takip durumu: konum takibi yoksa (emulatedPosition) model kullanıcıyla birlikte kayar
  const vp = frame.getViewerPose(AR.ref), lost = !vp || !!vp.emulatedPosition;
  if(lost !== AR.lost){ AR.lost = lost; arUi(); }
  AR.lastHit = null;
  if(AR.step < 2){
    const res = frame.getHitTestResults(AR.hts);
    if(res.length){ const pose = res[0].getPose(AR.ref); AR.reticle.visible = true; AR.reticle.matrix.fromArray(pose.transform.matrix); AR.lastHit = res[0]; }
    else AR.reticle.visible = false;
  } else AR.reticle.visible = false;
  // anchor ile sabitle: ARCore düzeltmelerini modele uygula
  if(AR.anchor && frame.trackedAnchors && frame.trackedAnchors.has(AR.anchor)){
    const ap = frame.getPose(AR.anchor.anchorSpace, AR.ref);
    if(ap){
      const A = new THREE.Matrix4().fromArray(ap.transform.matrix);
      AR.anchorPose = A;
      if(!AR.anchorFirst){ AR.anchorFirst = A.clone(); arPose(); }
      if(AR.offset){ AR.group.matrix.multiplyMatrices(A, AR.offset); AR.group.matrixWorldNeedsUpdate = true; }
      if(AR.mark1.visible){ AR.mark1.position.setFromMatrixPosition(A); }
    }
  }
  // isimler: gerçek boyutta okunur yükseklik (1:1'de 15 cm, 1:20'de 2 cm)
  const hmm = AR.scale === 1 ? 150 : 400;
  V.labels.children.forEach(o => o.scale.set(o.userData.asp*hmm, hmm, 1));
  if((AR.frame++ % 10) === 0 && AR.step === 2){
    const xc = V.r.xr.getCamera(AR.cam); const cam = (xc.cameras && xc.cameras[0]) || xc;
    declutterWith(cam, window.innerWidth, window.innerHeight, hmm);
  }
  // XR için ayrı perspektif kamera: ortografik kameranın yakın düzlemi (1 m) masa ölçeğinde modeli keserdi
  V.r.render(V.scene, AR.cam);
}
function arSelect(e){
  if(AR.step < 2){
    if(!AR.reticle.visible || !AR.lastHit) return;
    const p = new THREE.Vector3().setFromMatrixPosition(AR.reticle.matrix);
    if(AR.step === 0){
      AR.p1 = p; AR.anchorFirst = null; AR.anchorPose = null; AR.offset = null;
      AR.mark1.position.copy(p); AR.mark1.visible = true;
      if(AR.lastHit.createAnchor) AR.lastHit.createAnchor().then(a => { AR.anchor = a; }).catch(() => { AR.anchor = null; });
      if(AR.scale !== 1){ AR.step = 2; AR.group.visible = true; arPose(); AR.msg = ''; }
      else AR.step = 1;
      arUi(); return;
    }
    // 2. nokta: model yönü = 1. noktadan 2. noktaya (C/11 -> C/16) doğrultu
    const dw = p.clone().sub(AR.p1); dw.y = 0;
    const m1 = P3(60, -40, 0), m2 = P3(60, 3120, 0), dm = m2.clone().sub(m1);
    AR.yaw = -(Math.atan2(dw.z, dw.x) - Math.atan2(dm.z, dm.x));
    const meas = dw.length(), mod = dm.length()/1000;
    AR.msg = 'Ölçülen aralık '+meas.toFixed(2).replace('.', ',')+' m (modelde '+mod.toFixed(2).replace('.', ',')+' m)'+
      (Math.abs(meas - mod) > 0.15 ? ' — fark büyük, yeniden yerleştir.' : '.');
    AR.step = 2; AR.group.visible = true; arPose(); arUi(); return;
  }
  const pose = e.frame.getPose(e.inputSource.targetRaySpace, AR.ref); if(!pose) return;
  const m = new THREE.Matrix4().fromArray(pose.transform.matrix);
  const o = new THREE.Vector3().setFromMatrixPosition(m), d = new THREE.Vector3(0,0,-1).transformDirection(m);
  const rc = new THREE.Raycaster(o, d);
  AR.group.updateMatrixWorld(true);
  const objs = Object.values(V.meshes).filter(x => { if(!x.g.visible) return false; const vs = viewState(x.g.userData.it); return vs === 'now' || vs === 'sel' || vs === 'nb'; }).map(x => x.m);
  const hit = rc.intersectObjects(objs, false)[0];
  V.sel = hit ? [hit.object.userData.id] : []; AR.msg = '';
  applyStyle(); arUi();
}
function arEnd(){
  const r = V.r; r.setAnimationLoop(null); r.xr.enabled = false;
  AR.session = null; AR.hts = null; AR.anchor = null; AR.anchorFirst = null; AR.anchorPose = null; AR.offset = null; V.ar = false;
  V.scene.remove(AR.reticle); V.scene.remove(AR.mark1); AR.group.remove(V.root); V.scene.remove(AR.group); V.root.position.set(0,0,0); V.scene.add(V.root);
  if(AR.ui) AR.ui.style.display = 'none';
  V.sel = []; if(location.hash !== '#/' && location.hash) location.hash = '#/'; else { document.getElementById('info').innerHTML = ''; applyStyle(); }
  resize(); fit();
}
function declutterWith(cam, Wp, Hp, hmm){
  // AR'da yazılar üst üste binmesin: ekrandaki boyutu kameradan hesaplanır
  const placed = [], v = new THREE.Vector3(), mw = V.root.matrixWorld, sc = AR.scale;
  V.labels.children.slice().sort((a,b) => b.userData.prio - a.userData.prio).forEach(sp => {
    let ok = null;
    for(const a of (sp.userData.anchors || [sp.position.clone()])){
      const wp = a.clone().applyMatrix4(mw); v.copy(wp).project(cam);
      if(v.z > 1 || v.x < -1.02 || v.x > 1.02 || v.y < -1.02 || v.y > 1.02) continue;
      const v2 = wp.clone().add(new THREE.Vector3(0, hmm*sc*0.001, 0)).project(cam);   // etiket yüksekliğinin ekrandaki karşılığı
      const h = Math.min(80, Math.abs(v2.y - v.y)/2*Hp), w = sp.userData.asp*h;
      const cx = (v.x+1)/2*Wp, cy = (1-v.y)/2*Hp, r = [cx-w/2-2, cy-h/2-2, cx+w/2+2, cy+h/2+2];
      if(placed.some(q => r[0] < q[2] && r[2] > q[0] && r[1] < q[3] && r[3] > q[1])) continue;
      ok = { a, r }; break;
    }
    sp.visible = !!ok; if(ok){ sp.position.copy(ok.a); placed.push(ok.r); }
  });
}
let built = false;
function page(){
  if(built) return; built = true;
  $app.innerHTML = '<div class="intro"><h1>Merdiven saha montajı</h1><p class="lead muted">Aşamayı seç, elemana dokun veya numarasını yaz.</p></div>'+
    '<div class="layers" id="layers">'+stageButtons()+'</div>'+
    '<div class="viewer big" id="viewer"><span class="vhint">Dokun: seç · boş yere dokun: seçimi kaldır · iki parmak: yakınlaş</span></div>'+
    '<div class="vbtns" id="vbtns"><button data-v="iso" aria-pressed="true">İzometrik</button><button data-v="top">Üstten (plan)</button><button data-v="front">Önden</button><button data-v="side">Yandan</button></div>'+
    '<div class="arrow" id="arrow"></div>'+
    '<div id="info"></div>';
  init(document.getElementById('viewer'));
  arSetup();
  document.querySelectorAll('#vbtns button').forEach(b => b.onclick = () => { V.view = b.dataset.v; document.querySelectorAll('#vbtns button').forEach(x => x.setAttribute('aria-pressed', x === b)); fit(); });
  document.querySelectorAll('#layers button').forEach(b => b.onclick = () => { setStage(+b.dataset.s); if(V.sel.length) location.hash = '#/'; else applyStyle(); });
  fit();
}
function route(){
  page();
  const h = decodeURIComponent(location.hash); let m, ids = [];
  if((m = h.match(/^#\/m\/(\d+)$/)) && BY[+m[1]]) ids = [+m[1]];
  else if((m = h.match(/^#\/k\/(.+)$/)) && byMark[m[1].toLowerCase()]) ids = byMark[m[1].toLowerCase()].map(it => it.id);
  if(ids.length) setStage(STAGES.indexOf(BY[ids[0]].g));
  V.sel = ids;
  document.getElementById('info').innerHTML = infoCard(ids);
  applyStyle();
}
document.getElementById('searchForm').addEventListener('submit', e => {
  e.preventDefault();
  const q = document.getElementById('q').value.trim().toLowerCase().replace(/\s+/g,'').replace(/^([a-z]+)[-\/]?(\d+)$/, '$1/$2');
  if(byMark[q]){ const t = '#/k/'+byMark[q][0].mark; if(decodeURIComponent(location.hash) === t) route(); else location.hash = t; }
  else document.getElementById('info').innerHTML = '<p class="warn">"'+esc(q)+'" bulunamadı. Örnek: C/9, B/1, K/7, p/4, s/1.</p>';
  document.getElementById('q').blur();
});
window.addEventListener('hashchange', route);
route();
})();
