import { firebaseConfig } from './firebase-config.js';
import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js';
import {
  getAuth, signInWithEmailAndPassword, signOut, onAuthStateChanged,
} from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js';
import {
  getFirestore, collection, addDoc, updateDoc, deleteDoc, doc,
  onSnapshot, query, orderBy, limit, serverTimestamp, Timestamp,
  writeBatch,
} from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js';

const firebaseApp = initializeApp(firebaseConfig);
const auth = getAuth(firebaseApp);
const db = getFirestore(firebaseApp);

const GUESTS_COL = collection(db, 'invitados');
const HISTORIAL_COL = collection(db, 'historial');

const VIEWER_FLAG_KEY = 'li_viewer';

// Cuentas fijas de Firebase Auth para los dos editores. La app elige cuál
// usar según el botón que se toque; la contraseña la valida Firebase, no el código.
const EDITOR_EMAILS = {
  Bruno: 'bruno@lista-invitados.local',
  Maya: 'maya@lista-invitados.local',
};

// Prioridad ordenada de menor a mayor peso.
const PRIORITIES = [
  'Invitado Prescindible',
  'Prescindible',
  'Invitado Ideal',
  'Ideal que esté',
  'Invitado Imprescindible',
  'Imprescindible',
];

const CATEGORIES = ['Familia Maya', 'Familia Bruno', 'Amigos', 'Congre', 'Niños'];
const CATEGORY_FILTERS = ['Todos', 'Familia', 'Familia Maya', 'Familia Bruno', 'Amigos', 'Congre', 'Niños'];
const PRIORITY_FILTERS = ['Todos', ...PRIORITIES];

const CATEGORY_CLASS = {
  'Familia Maya': 'cat-fam-maya',
  'Familia Bruno': 'cat-fam-bruno',
  'Amigos': 'cat-amigos',
  'Niños': 'cat-ninos',
  'Congre': 'cat-congre',
};

var state = {
  guests: [],
  log: [],
  guestsLoaded: false,
  user: null,        // 'Bruno' | 'Maya' | 'Invitad@'
  role: null,         // 'editor' | 'viewer'
  pendingUser: null,  // 'Bruno' | 'Maya' mientras se pide la contraseña
  filters: { categoria: 'Todos', prioridad: 'Todos', texto: '' },
  editingId: null,
};

var els = {}; // cache de elementos del DOM, se llena en init()

// ---------- Utils ----------
function formatDate(ts) {
  if (!ts) return 'justo ahora';
  var d = typeof ts.toDate === 'function' ? ts.toDate() : new Date(ts);
  return d.toLocaleDateString('es-BO', { day: '2-digit', month: 'short' }) +
    ' · ' + d.toLocaleTimeString('es-BO', { hour: '2-digit', minute: '2-digit' });
}

function escapeHtml(str) {
  var div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

function priorityClass(p) {
  var idx = PRIORITIES.indexOf(p);
  return 'pri-' + (idx === -1 ? 0 : idx);
}

function categoryClass(c) {
  return CATEGORY_CLASS[c] || 'cat-otro';
}

// ---------- Chips reutilizables (selects y filtros) ----------
function renderChips(container, values, opts) {
  opts = opts || {};
  container.innerHTML = values.map(function (v) {
    var cls = opts.classFn ? ' ' + opts.classFn(v) : '';
    return '<button type="button" class="chip' + cls + '" data-value="' + escapeHtml(v) + '">' + escapeHtml(v) + '</button>';
  }).join('');
}

function setChipSelection(container, value) {
  container.querySelectorAll('.chip').forEach(function (c) {
    c.classList.toggle('active', c.dataset.value === value);
  });
  container.dataset.selected = value || '';
}

function getChipSelection(container) {
  return container.dataset.selected || '';
}

// ---------- Rendering ----------
function render() {
  renderStats();
  renderGuestList();
  renderHistorial();
}

function renderStats() {
  var total = state.guests.length;
  var imprescindibles = state.guests.filter(function (g) {
    return g.prioridad === 'Imprescindible' || g.prioridad === 'Invitado Imprescindible';
  }).length;

  var html = pill(total, 'Total') + pill(imprescindibles, 'Imprescindibles');
  CATEGORIES.forEach(function (cat) {
    var count = state.guests.filter(function (g) { return g.categoria === cat; }).length;
    html += pill(count, cat);
  });
  els.stats.innerHTML = html;
}

function pill(value, label) {
  return '<div class="stat-pill"><span class="stat-value">' + value +
    '</span><span class="stat-label">' + label + '</span></div>';
}

function matchesCategoriaFilter(categoria, filtro) {
  if (filtro === 'Todos') return true;
  if (filtro === 'Familia') return categoria.indexOf('Familia') === 0;
  return categoria === filtro;
}

function getFilteredGuests() {
  return state.guests.filter(function (g) {
    if (!matchesCategoriaFilter(g.categoria, state.filters.categoria)) return false;
    if (state.filters.prioridad !== 'Todos' && g.prioridad !== state.filters.prioridad) return false;
    if (state.filters.texto && g.nombre.toLowerCase().indexOf(state.filters.texto.toLowerCase()) === -1) return false;
    return true;
  }).sort(function (a, b) { return a.nombre.localeCompare(b.nombre, 'es'); });
}

function renderGuestList() {
  var filtered = getFilteredGuests();
  els.listCount.textContent = filtered.length;

  if (filtered.length === 0) {
    els.guestList.innerHTML = '';
    els.emptyState.textContent = state.guestsLoaded
      ? 'No hay invitados que coincidan con el filtro.'
      : 'Cargando invitados...';
    els.emptyState.classList.remove('hidden');
    return;
  }
  els.emptyState.classList.add('hidden');

  els.guestList.innerHTML = filtered.map(function (g) {
    var meta = 'Añadido por ' + g.addedBy + ' · ' + formatDate(g.addedAt);
    if (g.editedBy) meta += ' &nbsp;·&nbsp; Editado por ' + g.editedBy + ' · ' + formatDate(g.editedAt);

    return '<li class="guest-item" data-id="' + g.id + '">' +
      '<div class="guest-main">' +
        '<span class="guest-name">' + escapeHtml(g.nombre) + '</span>' +
        '<div class="guest-tags">' +
          '<span class="tag ' + categoryClass(g.categoria) + '">' + g.categoria + '</span>' +
          '<span class="tag ' + priorityClass(g.prioridad) + '">' + g.prioridad + '</span>' +
        '</div>' +
        '<span class="guest-meta">' + meta + '</span>' +
      '</div>' +
      '<div class="guest-actions editor-only">' +
        '<button class="icon-btn edit-btn" title="Editar" data-id="' + g.id + '">✎</button>' +
        '<button class="icon-btn delete delete-btn" title="Eliminar" data-id="' + g.id + '">🗑</button>' +
      '</div>' +
    '</li>';
  }).join('');
}

function renderHistorial() {
  if (state.log.length === 0) {
    els.historialList.innerHTML = '<li class="historial-empty">Todavía no hay acciones registradas.</li>';
    return;
  }
  var verbos = { add: 'añadió a', edit: 'editó a', delete: 'eliminó a', import: 'importó' };
  els.historialList.innerHTML = state.log.map(function (entry) {
    var verbo = verbos[entry.action] || entry.action;
    var text = '<strong>' + entry.user + '</strong> ' + verbo + ' <strong>' + escapeHtml(entry.nombre) + '</strong>';
    if (entry.action === 'edit' && entry.cambios) text += ' (' + entry.cambios + ')';
    return '<li class="historial-item">' + text + ' — ' + formatDate(entry.fecha) + '</li>';
  }).join('');
}

// ---------- Acciones (Firestore) ----------
function logAction(payload) {
  payload.fecha = serverTimestamp();
  return addDoc(HISTORIAL_COL, payload);
}

function addGuest(nombre, categoria, prioridad) {
  return addDoc(GUESTS_COL, {
    nombre: nombre.trim(),
    categoria: categoria,
    prioridad: prioridad,
    addedBy: state.user,
    addedAt: serverTimestamp(),
    editedBy: null,
    editedAt: null,
  }).then(function () {
    return logAction({ action: 'add', nombre: nombre.trim(), user: state.user });
  });
}

function updateGuest(id, nombre, categoria, prioridad) {
  var guest = state.guests.find(function (g) { return g.id === id; });
  if (!guest) return;

  var cambios = [];
  if (guest.nombre !== nombre) cambios.push('nombre');
  if (guest.categoria !== categoria) cambios.push('categoría');
  if (guest.prioridad !== prioridad) cambios.push('prioridad');

  return updateDoc(doc(db, 'invitados', id), {
    nombre: nombre.trim(),
    categoria: categoria,
    prioridad: prioridad,
    editedBy: state.user,
    editedAt: serverTimestamp(),
  }).then(function () {
    if (cambios.length) {
      return logAction({ action: 'edit', nombre: nombre.trim(), user: state.user, cambios: cambios.join(', ') });
    }
  });
}

function deleteGuest(id) {
  var guest = state.guests.find(function (g) { return g.id === id; });
  if (!guest) return;
  if (!confirm('¿Eliminar a "' + guest.nombre + '" de la lista?')) return;

  return deleteDoc(doc(db, 'invitados', id)).then(function () {
    return logAction({ action: 'delete', nombre: guest.nombre, user: state.user });
  });
}

// ---------- Login / roles ----------
function applyRoleUI() {
  els.app.classList.toggle('viewer-mode', state.role === 'viewer');
  els.currentUserName.textContent = state.user;
}

function enterAsEditor(user) {
  state.user = user;
  state.role = 'editor';
  localStorage.removeItem(VIEWER_FLAG_KEY);
  showApp();
}

function enterAsViewer() {
  state.user = 'Invitad@';
  state.role = 'viewer';
  localStorage.setItem(VIEWER_FLAG_KEY, '1');
  showApp();
}

function showApp() {
  els.loginScreen.classList.add('hidden');
  els.app.classList.remove('hidden');
  applyRoleUI();
}

function showLogin() {
  els.app.classList.add('hidden');
  els.loginScreen.classList.remove('hidden');
  els.loginStepPassword.classList.add('hidden');
  els.loginStepWho.classList.remove('hidden');
}

function handleUserPick(user) {
  if (user === 'Invitad@') {
    enterAsViewer();
    return;
  }
  state.pendingUser = user;
  els.loginStepWho.classList.add('hidden');
  els.loginStepPassword.classList.remove('hidden');
  els.passwordWhoName.textContent = user;
  els.passwordError.classList.add('hidden');
  els.passwordInput.value = '';
  els.passwordInput.focus();
}

function handlePasswordSubmit(e) {
  e.preventDefault();
  var email = EDITOR_EMAILS[state.pendingUser];
  var pass = els.passwordInput.value;
  els.passwordError.classList.add('hidden');

  signInWithEmailAndPassword(auth, email, pass).catch(function () {
    els.passwordError.textContent = 'Contraseña incorrecta.';
    els.passwordError.classList.remove('hidden');
  });
}

function handleSwitchUser() {
  localStorage.removeItem(VIEWER_FLAG_KEY);
  if (auth.currentUser) signOut(auth);
  showLogin();
}

function emailToUser(email) {
  for (var name in EDITOR_EMAILS) {
    if (EDITOR_EMAILS[name] === email) return name;
  }
  return null;
}

// ---------- Edit modal ----------
function openEditModal(id) {
  var guest = state.guests.find(function (g) { return g.id === id; });
  if (!guest) return;
  state.editingId = id;
  els.editNombreInput.value = guest.nombre;
  setChipSelection(els.editCategoriaSelect, guest.categoria);
  setChipSelection(els.editPrioridadSelect, guest.prioridad);
  els.editModal.classList.remove('hidden');
}

function closeEditModal() {
  state.editingId = null;
  els.editModal.classList.add('hidden');
}

// ---------- Export / Import ----------
function serializeGuest(g) {
  return {
    nombre: g.nombre,
    categoria: g.categoria,
    prioridad: g.prioridad,
    addedBy: g.addedBy,
    addedAt: g.addedAt && g.addedAt.toDate ? g.addedAt.toDate().toISOString() : null,
    editedBy: g.editedBy || null,
    editedAt: g.editedAt && g.editedAt.toDate ? g.editedAt.toDate().toISOString() : null,
  };
}

function exportData() {
  var payload = { guests: state.guests.map(serializeGuest), exportedAt: new Date().toISOString() };
  var blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
  var url = URL.createObjectURL(blob);
  var a = document.createElement('a');
  a.href = url;
  a.download = 'lista-invitados-' + new Date().toISOString().slice(0, 10) + '.json';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function parseDateSafe(value) {
  if (!value) return null;
  var d = new Date(value);
  return isNaN(d.getTime()) ? null : Timestamp.fromDate(d);
}

function importData(file) {
  var reader = new FileReader();
  reader.onload = function () {
    try {
      var data = JSON.parse(reader.result);
      if (!Array.isArray(data.guests)) throw new Error('formato inválido');
      if (!confirm('Se agregarán ' + data.guests.length + ' invitado(s) del archivo a la lista actual (no se borra nada). ¿Continuar?')) return;

      var batch = writeBatch(db);
      data.guests.forEach(function (g) {
        if (!g || !g.nombre) return;
        var ref = doc(GUESTS_COL);
        batch.set(ref, {
          nombre: String(g.nombre).trim(),
          categoria: CATEGORIES.indexOf(g.categoria) !== -1 ? g.categoria : CATEGORIES[0],
          prioridad: PRIORITIES.indexOf(g.prioridad) !== -1 ? g.prioridad : PRIORITIES[1],
          addedBy: g.addedBy || state.user,
          addedAt: parseDateSafe(g.addedAt) || serverTimestamp(),
          editedBy: g.editedBy || null,
          editedAt: parseDateSafe(g.editedAt),
        });
      });
      batch.commit().then(function () {
        return logAction({ action: 'import', nombre: data.guests.length + ' invitados', user: state.user });
      });
    } catch (e) {
      alert('No se pudo leer el archivo. Asegúrate de que sea un respaldo exportado desde esta misma app.');
    }
  };
  reader.readAsText(file);
}

// ---------- Firestore listeners (lectura pública, no depende del login) ----------
function attachListeners() {
  onSnapshot(GUESTS_COL, function (snap) {
    state.guests = snap.docs.map(function (d) { return Object.assign({ id: d.id }, d.data()); });
    state.guestsLoaded = true;
    els.syncDot.classList.add('online');
    els.syncDot.title = 'Conectado';
    render();
  }, function (err) {
    console.error('Error leyendo invitados:', err);
    els.syncDot.classList.add('offline');
    els.syncDot.title = 'Sin conexión';
  });

  var historialQuery = query(HISTORIAL_COL, orderBy('fecha', 'desc'), limit(200));
  onSnapshot(historialQuery, function (snap) {
    state.log = snap.docs.map(function (d) { return Object.assign({ id: d.id }, d.data()); });
    renderHistorial();
  }, function (err) {
    console.error('Error leyendo historial:', err);
  });
}

// ---------- Event wiring ----------
function init() {
  els = {
    loginScreen: document.getElementById('login-screen'),
    loginStepWho: document.getElementById('login-step-who'),
    loginStepPassword: document.getElementById('login-step-password'),
    passwordWhoName: document.getElementById('password-who-name'),
    passwordForm: document.getElementById('password-form'),
    passwordInput: document.getElementById('password-input'),
    passwordError: document.getElementById('password-error'),
    passwordBackBtn: document.getElementById('password-back-btn'),
    app: document.getElementById('app'),
    syncDot: document.getElementById('sync-dot'),
    currentUserName: document.getElementById('current-user-name'),
    stats: document.getElementById('stats'),
    addForm: document.getElementById('add-form'),
    nombreInput: document.getElementById('nombre-input'),
    categoriaSelect: document.getElementById('categoria-select'),
    prioridadSelect: document.getElementById('prioridad-select'),
    searchInput: document.getElementById('search-input'),
    categoriaFilters: document.getElementById('categoria-filters'),
    prioridadFilters: document.getElementById('prioridad-filters'),
    guestList: document.getElementById('guest-list'),
    emptyState: document.getElementById('empty-state'),
    listCount: document.getElementById('list-count'),
    historialList: document.getElementById('historial-list'),
    toggleHistorial: document.getElementById('toggle-historial'),
    historialArrow: document.getElementById('historial-arrow'),
    exportBtn: document.getElementById('export-btn'),
    importInput: document.getElementById('import-input'),
    editModal: document.getElementById('edit-modal'),
    editForm: document.getElementById('edit-form'),
    editNombreInput: document.getElementById('edit-nombre-input'),
    editCategoriaSelect: document.getElementById('edit-categoria-select'),
    editPrioridadSelect: document.getElementById('edit-prioridad-select'),
    editCancelBtn: document.getElementById('edit-cancel-btn'),
  };

  renderChips(els.categoriaSelect, CATEGORIES, { classFn: categoryClass });
  renderChips(els.prioridadSelect, PRIORITIES, { classFn: priorityClass });
  renderChips(els.editCategoriaSelect, CATEGORIES, { classFn: categoryClass });
  renderChips(els.editPrioridadSelect, PRIORITIES, { classFn: priorityClass });
  renderChips(els.categoriaFilters, CATEGORY_FILTERS);
  renderChips(els.prioridadFilters, PRIORITY_FILTERS);
  setChipSelection(els.categoriaFilters, 'Todos');
  setChipSelection(els.prioridadFilters, 'Todos');

  document.querySelectorAll('.user-btn').forEach(function (btn) {
    btn.addEventListener('click', function () { handleUserPick(btn.dataset.user); });
  });
  els.passwordForm.addEventListener('submit', handlePasswordSubmit);
  els.passwordBackBtn.addEventListener('click', function () {
    els.loginStepPassword.classList.add('hidden');
    els.loginStepWho.classList.remove('hidden');
  });
  document.getElementById('switch-user-btn').addEventListener('click', handleSwitchUser);

  els.categoriaSelect.addEventListener('click', function (e) {
    var btn = e.target.closest('.chip');
    if (btn) setChipSelection(els.categoriaSelect, btn.dataset.value);
  });
  els.prioridadSelect.addEventListener('click', function (e) {
    var btn = e.target.closest('.chip');
    if (btn) setChipSelection(els.prioridadSelect, btn.dataset.value);
  });

  els.addForm.addEventListener('submit', function (e) {
    e.preventDefault();
    var nombre = els.nombreInput.value.trim();
    var categoria = getChipSelection(els.categoriaSelect);
    var prioridad = getChipSelection(els.prioridadSelect);
    if (!nombre) return;
    if (!categoria || !prioridad) {
      alert('Elige una categoría y una prioridad.');
      return;
    }
    addGuest(nombre, categoria, prioridad);
    els.addForm.reset();
    setChipSelection(els.categoriaSelect, '');
    setChipSelection(els.prioridadSelect, '');
    els.nombreInput.focus();
  });

  els.searchInput.addEventListener('input', function (e) {
    state.filters.texto = e.target.value;
    renderGuestList();
  });

  els.categoriaFilters.addEventListener('click', function (e) {
    var btn = e.target.closest('.chip');
    if (!btn) return;
    state.filters.categoria = btn.dataset.value;
    setChipSelection(els.categoriaFilters, btn.dataset.value);
    renderGuestList();
  });

  els.prioridadFilters.addEventListener('click', function (e) {
    var btn = e.target.closest('.chip');
    if (!btn) return;
    state.filters.prioridad = btn.dataset.value;
    setChipSelection(els.prioridadFilters, btn.dataset.value);
    renderGuestList();
  });

  els.guestList.addEventListener('click', function (e) {
    var editBtn = e.target.closest('.edit-btn');
    var delBtn = e.target.closest('.delete-btn');
    if (editBtn) openEditModal(editBtn.dataset.id);
    if (delBtn) deleteGuest(delBtn.dataset.id);
  });

  els.editCategoriaSelect.addEventListener('click', function (e) {
    var btn = e.target.closest('.chip');
    if (btn) setChipSelection(els.editCategoriaSelect, btn.dataset.value);
  });
  els.editPrioridadSelect.addEventListener('click', function (e) {
    var btn = e.target.closest('.chip');
    if (btn) setChipSelection(els.editPrioridadSelect, btn.dataset.value);
  });

  els.editForm.addEventListener('submit', function (e) {
    e.preventDefault();
    var nombre = els.editNombreInput.value.trim();
    var categoria = getChipSelection(els.editCategoriaSelect);
    var prioridad = getChipSelection(els.editPrioridadSelect);
    if (!nombre || !categoria || !prioridad) return;
    updateGuest(state.editingId, nombre, categoria, prioridad);
    closeEditModal();
  });

  els.editCancelBtn.addEventListener('click', closeEditModal);
  els.editModal.addEventListener('click', function (e) {
    if (e.target.id === 'edit-modal') closeEditModal();
  });

  els.toggleHistorial.addEventListener('click', function () {
    els.historialList.classList.toggle('hidden');
    els.historialArrow.textContent = els.historialList.classList.contains('hidden') ? '▾' : '▴';
  });

  els.exportBtn.addEventListener('click', exportData);
  els.importInput.addEventListener('change', function (e) {
    if (e.target.files[0]) importData(e.target.files[0]);
    e.target.value = '';
  });

  onAuthStateChanged(auth, function (fbUser) {
    if (fbUser) {
      var user = emailToUser(fbUser.email);
      if (user) enterAsEditor(user);
    } else if (localStorage.getItem(VIEWER_FLAG_KEY) === '1') {
      enterAsViewer();
    }
  });

  attachListeners();
}

document.addEventListener('DOMContentLoaded', init);
