(function () {
  'use strict';

  var STORAGE_KEYS = {
    guests: 'li_guests',
    log: 'li_log',
    user: 'li_user',
  };

  var PRIORITY_CLASS = {
    'Prescindible': 'tag-pri-Prescindible',
    'Ideal que esté': 'tag-pri-Ideal',
    'Imprescindible': 'tag-pri-Imprescindible',
  };

  var state = {
    guests: [],
    log: [],
    user: null,
    filters: { categoria: 'Todos', prioridad: 'Todos', texto: '' },
    editingId: null,
  };

  // ---------- Storage ----------
  function loadState() {
    try {
      state.guests = JSON.parse(localStorage.getItem(STORAGE_KEYS.guests)) || [];
    } catch (e) { state.guests = []; }
    try {
      state.log = JSON.parse(localStorage.getItem(STORAGE_KEYS.log)) || [];
    } catch (e) { state.log = []; }
    state.user = localStorage.getItem(STORAGE_KEYS.user) || null;
  }

  function saveGuests() {
    localStorage.setItem(STORAGE_KEYS.guests, JSON.stringify(state.guests));
  }

  function saveLog() {
    localStorage.setItem(STORAGE_KEYS.log, JSON.stringify(state.log));
  }

  // ---------- Utils ----------
  function uid() {
    if (window.crypto && crypto.randomUUID) return crypto.randomUUID();
    return 'id-' + Date.now() + '-' + Math.random().toString(16).slice(2);
  }

  function nowISO() { return new Date().toISOString(); }

  function formatDate(iso) {
    var d = new Date(iso);
    return d.toLocaleDateString('es-BO', { day: '2-digit', month: 'short' }) +
      ' · ' + d.toLocaleTimeString('es-BO', { hour: '2-digit', minute: '2-digit' });
  }

  function escapeHtml(str) {
    var div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  function addLog(entry) {
    entry.id = uid();
    entry.fecha = nowISO();
    state.log.unshift(entry);
    saveLog();
  }

  // ---------- Rendering ----------
  function render() {
    renderStats();
    renderGuestList();
    renderHistorial();
  }

  function renderStats() {
    var stats = document.getElementById('stats');
    var total = state.guests.length;
    var imprescindibles = state.guests.filter(function (g) { return g.prioridad === 'Imprescindible'; }).length;
    var familia = state.guests.filter(function (g) { return g.categoria === 'Familia'; }).length;
    var amigos = state.guests.filter(function (g) { return g.categoria === 'Amigos'; }).length;
    var congre = state.guests.filter(function (g) { return g.categoria === 'Congre'; }).length;

    stats.innerHTML =
      pill(total, 'Total') +
      pill(imprescindibles, 'Imprescindibles') +
      pill(familia, 'Familia') +
      pill(amigos, 'Amigos') +
      pill(congre, 'Congre');
  }

  function pill(value, label) {
    return '<div class="stat-pill"><span class="stat-value">' + value +
      '</span><span class="stat-label">' + label + '</span></div>';
  }

  function getFilteredGuests() {
    return state.guests.filter(function (g) {
      if (state.filters.categoria !== 'Todos' && g.categoria !== state.filters.categoria) return false;
      if (state.filters.prioridad !== 'Todos' && g.prioridad !== state.filters.prioridad) return false;
      if (state.filters.texto && g.nombre.toLowerCase().indexOf(state.filters.texto.toLowerCase()) === -1) return false;
      return true;
    }).sort(function (a, b) { return a.nombre.localeCompare(b.nombre, 'es'); });
  }

  function renderGuestList() {
    var list = document.getElementById('guest-list');
    var emptyState = document.getElementById('empty-state');
    var filtered = getFilteredGuests();

    document.getElementById('list-count').textContent = filtered.length;

    if (filtered.length === 0) {
      list.innerHTML = '';
      emptyState.classList.remove('hidden');
      return;
    }
    emptyState.classList.add('hidden');

    list.innerHTML = filtered.map(function (g) {
      var meta = 'Añadido por ' + g.addedBy + ' · ' + formatDate(g.addedAt);
      if (g.editedBy) meta += ' &nbsp;·&nbsp; Editado por ' + g.editedBy + ' · ' + formatDate(g.editedAt);

      return '<li class="guest-item" data-id="' + g.id + '">' +
        '<div class="guest-main">' +
          '<span class="guest-name">' + escapeHtml(g.nombre) + '</span>' +
          '<div class="guest-tags">' +
            '<span class="tag tag-cat-' + g.categoria + '">' + g.categoria + '</span>' +
            '<span class="tag ' + PRIORITY_CLASS[g.prioridad] + '">' + g.prioridad + '</span>' +
          '</div>' +
          '<span class="guest-meta">' + meta + '</span>' +
        '</div>' +
        '<div class="guest-actions">' +
          '<button class="icon-btn edit-btn" title="Editar" data-id="' + g.id + '">✎</button>' +
          '<button class="icon-btn delete delete-btn" title="Eliminar" data-id="' + g.id + '">🗑</button>' +
        '</div>' +
      '</li>';
    }).join('');
  }

  function renderHistorial() {
    var list = document.getElementById('historial-list');
    if (state.log.length === 0) {
      list.innerHTML = '<li class="historial-empty">Todavía no hay acciones registradas.</li>';
      return;
    }
    list.innerHTML = state.log.map(function (entry) {
      var verbo = { add: 'añadió a', edit: 'editó a', delete: 'eliminó a' }[entry.action];
      var text = '<strong>' + entry.user + '</strong> ' + verbo + ' <strong>' + escapeHtml(entry.nombre) + '</strong>';
      if (entry.action === 'edit' && entry.cambios) text += ' (' + entry.cambios + ')';
      return '<li class="historial-item">' + text + ' — ' + formatDate(entry.fecha) + '</li>';
    }).join('');
  }

  // ---------- Actions ----------
  function addGuest(nombre, categoria, prioridad) {
    var guest = {
      id: uid(),
      nombre: nombre.trim(),
      categoria: categoria,
      prioridad: prioridad,
      addedBy: state.user,
      addedAt: nowISO(),
      editedBy: null,
      editedAt: null,
    };
    state.guests.push(guest);
    saveGuests();
    addLog({ action: 'add', nombre: guest.nombre, user: state.user });
    render();
  }

  function updateGuest(id, nombre, categoria, prioridad) {
    var guest = state.guests.find(function (g) { return g.id === id; });
    if (!guest) return;

    var cambios = [];
    if (guest.nombre !== nombre) cambios.push('nombre');
    if (guest.categoria !== categoria) cambios.push('categoría');
    if (guest.prioridad !== prioridad) cambios.push('prioridad');

    guest.nombre = nombre.trim();
    guest.categoria = categoria;
    guest.prioridad = prioridad;
    guest.editedBy = state.user;
    guest.editedAt = nowISO();

    saveGuests();
    if (cambios.length) {
      addLog({ action: 'edit', nombre: guest.nombre, user: state.user, cambios: cambios.join(', ') });
    }
    render();
  }

  function deleteGuest(id) {
    var idx = state.guests.findIndex(function (g) { return g.id === id; });
    if (idx === -1) return;
    var guest = state.guests[idx];
    if (!confirm('¿Eliminar a "' + guest.nombre + '" de la lista?')) return;

    state.guests.splice(idx, 1);
    saveGuests();
    addLog({ action: 'delete', nombre: guest.nombre, user: state.user });
    render();
  }

  // ---------- Login ----------
  function selectUser(user) {
    state.user = user;
    localStorage.setItem(STORAGE_KEYS.user, user);
    showApp();
  }

  function showApp() {
    document.getElementById('login-screen').classList.add('hidden');
    document.getElementById('app').classList.remove('hidden');
    document.getElementById('current-user-name').textContent = state.user;
    render();
  }

  function showLogin() {
    document.getElementById('app').classList.add('hidden');
    document.getElementById('login-screen').classList.remove('hidden');
  }

  // ---------- Edit modal ----------
  function openEditModal(id) {
    var guest = state.guests.find(function (g) { return g.id === id; });
    if (!guest) return;
    state.editingId = id;
    document.getElementById('edit-nombre-input').value = guest.nombre;
    document.getElementById('edit-categoria-input').value = guest.categoria;
    document.getElementById('edit-prioridad-input').value = guest.prioridad;
    document.getElementById('edit-modal').classList.remove('hidden');
  }

  function closeEditModal() {
    state.editingId = null;
    document.getElementById('edit-modal').classList.add('hidden');
  }

  // ---------- Export / Import ----------
  function exportData() {
    var payload = { guests: state.guests, log: state.log, exportedAt: nowISO() };
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

  function importData(file) {
    var reader = new FileReader();
    reader.onload = function () {
      try {
        var data = JSON.parse(reader.result);
        if (!Array.isArray(data.guests)) throw new Error('formato inválido');
        if (!confirm('Esto reemplazará los datos actuales de este dispositivo con los del archivo importado. ¿Continuar?')) return;
        state.guests = data.guests;
        state.log = Array.isArray(data.log) ? data.log : [];
        saveGuests();
        saveLog();
        render();
      } catch (e) {
        alert('No se pudo leer el archivo. Asegúrate de que sea un respaldo exportado desde esta misma app.');
      }
    };
    reader.readAsText(file);
  }

  // ---------- Event wiring ----------
  function init() {
    loadState();

    document.querySelectorAll('.user-btn').forEach(function (btn) {
      btn.addEventListener('click', function () { selectUser(btn.dataset.user); });
    });

    document.getElementById('switch-user-btn').addEventListener('click', showLogin);

    if (state.user) showApp();

    document.getElementById('add-form').addEventListener('submit', function (e) {
      e.preventDefault();
      var nombre = document.getElementById('nombre-input').value.trim();
      var categoria = document.getElementById('categoria-input').value;
      var prioridad = document.getElementById('prioridad-input').value;
      if (!nombre || !categoria || !prioridad) return;
      addGuest(nombre, categoria, prioridad);
      e.target.reset();
      document.getElementById('nombre-input').focus();
    });

    document.getElementById('search-input').addEventListener('input', function (e) {
      state.filters.texto = e.target.value;
      renderGuestList();
    });

    document.getElementById('categoria-filters').addEventListener('click', function (e) {
      var btn = e.target.closest('.chip');
      if (!btn) return;
      state.filters.categoria = btn.dataset.value;
      updateActiveChip('categoria-filters', btn);
      renderGuestList();
    });

    document.getElementById('prioridad-filters').addEventListener('click', function (e) {
      var btn = e.target.closest('.chip');
      if (!btn) return;
      state.filters.prioridad = btn.dataset.value;
      updateActiveChip('prioridad-filters', btn);
      renderGuestList();
    });

    document.getElementById('guest-list').addEventListener('click', function (e) {
      var editBtn = e.target.closest('.edit-btn');
      var delBtn = e.target.closest('.delete-btn');
      if (editBtn) openEditModal(editBtn.dataset.id);
      if (delBtn) deleteGuest(delBtn.dataset.id);
    });

    document.getElementById('edit-form').addEventListener('submit', function (e) {
      e.preventDefault();
      var nombre = document.getElementById('edit-nombre-input').value.trim();
      var categoria = document.getElementById('edit-categoria-input').value;
      var prioridad = document.getElementById('edit-prioridad-input').value;
      if (!nombre) return;
      updateGuest(state.editingId, nombre, categoria, prioridad);
      closeEditModal();
    });

    document.getElementById('edit-cancel-btn').addEventListener('click', closeEditModal);
    document.getElementById('edit-modal').addEventListener('click', function (e) {
      if (e.target.id === 'edit-modal') closeEditModal();
    });

    document.getElementById('toggle-historial').addEventListener('click', function () {
      var list = document.getElementById('historial-list');
      var arrow = document.getElementById('historial-arrow');
      list.classList.toggle('hidden');
      arrow.textContent = list.classList.contains('hidden') ? '▾' : '▴';
    });

    document.getElementById('export-btn').addEventListener('click', exportData);
    document.getElementById('import-input').addEventListener('change', function (e) {
      if (e.target.files[0]) importData(e.target.files[0]);
      e.target.value = '';
    });
  }

  function updateActiveChip(containerId, activeBtn) {
    document.querySelectorAll('#' + containerId + ' .chip').forEach(function (c) {
      c.classList.remove('active');
    });
    activeBtn.classList.add('active');
  }

  document.addEventListener('DOMContentLoaded', init);
})();
