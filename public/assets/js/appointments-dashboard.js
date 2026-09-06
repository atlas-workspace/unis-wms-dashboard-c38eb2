'use strict';

// Read-only appointment workspace for the main dashboard. The existing WMS
// client owns authentication and token refresh; this module only reads the
// ontology-confirmed appointment search endpoint.
(function (root) {
  var state = { rows: [], total: 0, loading: false, requestId: 0 };
  var statusLabels = {
    NEW: 'Nueva',
    NOT_CONFIRMED: 'No confirmada',
    NEED_TO_EMAIL_CARRIER: 'Avisar transportista',
    WAITING_FOR_DRIVER: 'Esperando conductor',
    PRE_CHECK_IN_COMPLETE: 'Pre-registro completo',
    CHECKED_IN: 'Registrada',
    CONFIRM: 'Confirmada',
    COMPLETED: 'Completada',
    PENDING_DISPATCH: 'Pendiente de despacho',
    CANCEL: 'Cancelada'
  };
  var serviceLabels = {
    LIVE_LOAD: 'Live load',
    LIVE_DELIVERY: 'Live delivery',
    DROP_OFF_DELIVERY: 'Drop-off',
    PICKUP_PRELOAD: 'Pre-carga'
  };

  function el(id) { return document.getElementById(id); }
  function esc(value) {
    return String(value == null ? '' : value).replace(/[&<>"']/g, function (ch) {
      return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch];
    });
  }
  function localDate(offset) {
    var now = new Date();
    var parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Los_Angeles', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(now);
    var base = new Date(Number(parts.find(function (p) { return p.type === 'year'; }).value), Number(parts.find(function (p) { return p.type === 'month'; }).value) - 1, Number(parts.find(function (p) { return p.type === 'day'; }).value));
    base.setDate(base.getDate() + offset);
    return base.toISOString().slice(0, 10);
  }
  function ensureDates() {
    if (!el('appt-from').value) el('appt-from').value = localDate(0);
    if (!el('appt-to').value) el('appt-to').value = localDate(6);
  }
  function dateTimeLabel(value) {
    if (!value) return 'Sin hora';
    var date = String(value).slice(0, 10);
    var time = String(value).slice(11, 16);
    return date + (time ? ' · ' + time : '');
  }
  function statusLabel(value) { return statusLabels[value] || String(value || 'Sin estado').replaceAll('_', ' '); }
  function normalize(row) {
    var action = row && row.appointmentActions && row.appointmentActions[0] || {};
    var load = action.loads && action.loads[0] || {};
    var orders = load.orderIds || [];
    return {
      id: row.id,
      sid: row.sid || action.apptId || 'Sin SID',
      status: row.apptStatus || 'UNKNOWN',
      type: row.appointmentType || action.appointmentType || '—',
      time: row.appointmentTime || action.appointmentTime || '',
      customerNames: row.customerNames && row.customerNames.length ? row.customerNames : (load.customerName ? [load.customerName] : []),
      carrier: row.carrierName || load.carrierName || 'Sin transportista',
      service: action.serviceType || '—',
      loadNo: load.loadNo || (action.loadNos && action.loadNos[0]) || 'Sin carga',
      orders: orders.length,
      search: [row.sid, row.apptStatus, row.carrierName, load.carrierName, load.loadNo, (row.customerNames || []).join(' ')].join(' ').toLowerCase()
    };
  }
  function setState(message, kind) {
    var node = el('appointments-state');
    if (!node) return;
    node.className = 'appointments-state' + (kind ? ' ' + kind : '');
    node.textContent = message;
  }
  function currentRows() {
    var account = el('appt-account').value;
    var status = el('appt-status').value;
    var query = (el('appt-search').value || '').trim().toLowerCase();
    return state.rows.filter(function (row) {
      var accountMatch = account === 'all' || row.customerNames.indexOf(account) !== -1;
      return accountMatch && (status === 'all' || row.status === status) && (!query || row.search.indexOf(query) !== -1);
    });
  }
  function renderAccounts() {
    var select = el('appt-account');
    var current = select.value;
    var names = Array.from(new Set(state.rows.reduce(function (all, row) { return all.concat(row.customerNames); }, []))).sort();
    select.innerHTML = '<option value="all">Todas las cuentas UNIS</option>' + names.map(function (name) { return '<option value="' + esc(name) + '">' + esc(name) + '</option>'; }).join('');
    select.value = names.indexOf(current) >= 0 ? current : 'all';
  }
  function renderKpis(rows) {
    var now = Date.now();
    var next = rows.filter(function (row) { var time = new Date(row.time).getTime(); return Number.isFinite(time) && time >= now && time <= now + 86400000; }).length;
    var unconfirmed = rows.filter(function (row) { return ['NEW', 'NOT_CONFIRMED', 'NEED_TO_EMAIL_CARRIER', 'WAITING_FOR_DRIVER'].indexOf(row.status) >= 0; }).length;
    var accounts = new Set(rows.reduce(function (all, row) { return all.concat(row.customerNames); }, []));
    el('appt-kpi-total').textContent = rows.length.toLocaleString('en-US');
    el('appt-kpi-total-sub').textContent = state.total > rows.length ? state.total.toLocaleString('en-US') + ' en WISE · filtros aplicados' : 'Resultado de WISE';
    el('appt-kpi-next').textContent = next.toLocaleString('en-US');
    el('appt-kpi-unconfirmed').textContent = unconfirmed.toLocaleString('en-US');
    el('appt-kpi-accounts').textContent = accounts.size.toLocaleString('en-US');
  }
  function renderChart(rows) {
    var from = el('appt-from').value;
    var to = el('appt-to').value;
    var dates = [];
    var cursor = new Date(from + 'T00:00:00');
    var end = new Date(to + 'T00:00:00');
    if (!Number.isFinite(cursor.getTime()) || !Number.isFinite(end.getTime()) || end < cursor) {
      el('appt-day-chart').innerHTML = '<div class="appt-empty-chart">Selecciona un rango de fechas válido.</div>';
      return;
    }
    while (cursor <= end && dates.length < 14) { dates.push(cursor.toISOString().slice(0, 10)); cursor.setDate(cursor.getDate() + 1); }
    var counts = dates.map(function (date) { return rows.filter(function (row) { return row.time.slice(0, 10) === date; }).length; });
    var max = Math.max.apply(Math, counts.concat([1]));
    el('appt-day-chart').innerHTML = dates.map(function (date, i) {
      var label = date.slice(5).replace('-', '/');
      return '<div class="appt-day"><div class="appt-day-bar"><span style="height:' + Math.max(4, Math.round((counts[i] / max) * 100)) + '%"></span></div><strong>' + counts[i] + '</strong><small>' + label + '</small></div>';
    }).join('');
  }
  function renderStatus(rows) {
    var counts = {};
    rows.forEach(function (row) { counts[row.status] = (counts[row.status] || 0) + 1; });
    var keys = Object.keys(counts).sort(function (a, b) { return counts[b] - counts[a]; });
    el('appt-status-list').innerHTML = keys.length ? keys.map(function (status) {
      var percentage = Math.round((counts[status] / rows.length) * 100);
      return '<div class="appt-status-row"><span><i class="status-swatch status-' + esc(status.toLowerCase()) + '"></i>' + esc(statusLabel(status)) + '</span><strong>' + counts[status] + '</strong><em>' + percentage + '%</em></div>';
    }).join('') : '<div class="appt-empty-chart">No hay estados para estos filtros.</div>';
  }
  function renderTable(rows) {
    var body = el('appt-table-body');
    if (!rows.length) { body.innerHTML = '<tr><td colspan="8" class="appt-empty-row">WISE no devolvió citas para los filtros seleccionados.</td></tr>'; return; }
    body.innerHTML = rows.slice().sort(function (a, b) { return a.time.localeCompare(b.time); }).map(function (row) {
      var customers = row.customerNames.length ? row.customerNames.join(', ') : 'Cuenta no informada';
      return '<tr><td class="appt-time">' + esc(dateTimeLabel(row.time)) + '</td><td class="appt-sid">' + esc(row.sid) + '</td><td>' + esc(customers) + '</td><td>' + esc(row.carrier) + '</td><td>' + esc(serviceLabels[row.service] || row.service) + '</td><td>' + esc(row.loadNo) + '</td><td class="appt-orders">' + esc(row.orders || '—') + '</td><td><span class="appt-status status-' + esc(row.status.toLowerCase()) + '">' + esc(statusLabel(row.status)) + '</span></td></tr>';
    }).join('');
  }
  function render() {
    var rows = currentRows();
    renderKpis(rows);
    renderChart(rows);
    renderStatus(rows);
    renderTable(rows);
    el('appt-table-sub').textContent = 'Todas las cuentas UNIS · Buena Park · ' + rows.length.toLocaleString('en-US') + ' visibles';
  }
  async function load() {
    if (state.loading || typeof root.safeFetch !== 'function') return;
    ensureDates();
    var from = el('appt-from').value;
    var to = el('appt-to').value;
    if (!from || !to || from > to) { setState('Selecciona un rango de fechas válido.', 'error'); return; }
    state.loading = true;
    var requestId = ++state.requestId;
    var button = el('appointments-refresh');
    button.disabled = true;
    button.classList.add('is-loading');
    setState('Consultando citas reales de WISE…', 'loading');
    try {
      var result = await root.safeFetch('https://unis.item.com/api/wms-bam/appointment/search-by-paging', { method: 'POST', headers: { 'item-time-zone': 'America/Los_Angeles' }, body: JSON.stringify({ currentPage: 1, pageSize: 500, appointmentTimePeriod: [from + 'T00:00:00', to + 'T23:59:59'] }) });
      if (requestId !== state.requestId) return;
      if (!result || result._needsAuth) { state.rows = []; state.total = 0; setState('La sesión de WMS expiró. Vuelve a iniciar sesión para ver las citas.', 'error'); render(); return; }
      if (result.success === false || !result.data) { state.rows = []; state.total = 0; setState('Las citas de WISE no están disponibles en este momento.', 'error'); render(); return; }
      state.rows = (result.data.list || []).map(normalize);
      state.total = Number(result.data.totalCount || state.rows.length);
      renderAccounts();
      render();
      el('appointments-updated').textContent = 'Actualizado ' + new Intl.DateTimeFormat('es-US', { timeZone: 'America/Los_Angeles', hour: 'numeric', minute: '2-digit' }).format(new Date());
      setState(state.rows.length ? 'Datos reales de WISE cargados para Buena Park.' : 'WISE no devolvió citas para este rango.', state.rows.length ? 'success' : 'empty');
    } catch (error) {
      if (requestId === state.requestId) { state.rows = []; state.total = 0; setState('No se pudo consultar WISE. Intenta actualizar de nuevo.', 'error'); render(); }
    } finally {
      if (requestId === state.requestId) { state.loading = false; button.disabled = false; button.classList.remove('is-loading'); }
    }
  }
  function bind() {
    if (!el('appointments-dashboard') || el('appointments-dashboard').dataset.bound) return;
    el('appointments-dashboard').dataset.bound = 'true';
    ensureDates();
    ['appt-account', 'appt-status', 'appt-search'].forEach(function (id) { el(id).addEventListener('input', render); });
    el('appt-apply').addEventListener('click', load);
    el('appointments-refresh').addEventListener('click', load);
    ['appt-from', 'appt-to'].forEach(function (id) { el(id).addEventListener('change', load); });
  }
  root.loadAppointmentsDashboard = function () { bind(); return load(); };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', bind); else bind();
})(window);
