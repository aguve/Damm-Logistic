const APP = {};

APP.state = {
  currentTab: 'dashboard',
  currentDataTab: 'clients',
  routeResult: null,
  loadResult: null,
  map: null,
  routeLayer: null,
  markerLayer: null,
  charts: {}
};

APP.init = function() {
  APP.bindTabs();
  APP.bindDataTabs();
  APP.bindButtons();
  APP.renderDataTable('clients');
  APP.updateDashboard();
};

APP.bindTabs = function() {
  document.querySelectorAll('.tab').forEach(tab => {
    tab.addEventListener('click', function() {
      document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
      document.querySelectorAll('.panel').forEach(p => p.classList.remove('active'));
      this.classList.add('active');
      const panel = document.getElementById('panel-' + this.dataset.tab);
      if (panel) panel.classList.add('active');
      APP.state.currentTab = this.dataset.tab;
      if (this.dataset.tab === 'routes' && APP.state.map) {
        setTimeout(() => APP.state.map.invalidateSize(), 100);
      }
    });
  });
};

APP.bindDataTabs = function() {
  document.querySelectorAll('.data-tab').forEach(tab => {
    tab.addEventListener('click', function() {
      document.querySelectorAll('.data-tab').forEach(t => t.classList.remove('active'));
      this.classList.add('active');
      APP.state.currentDataTab = this.dataset.dtab;
      APP.renderDataTable(this.dataset.dtab);
    });
  });
};

APP.bindButtons = function() {
  document.getElementById('optimizeBtn').addEventListener('click', APP.runFullOptimization);
  document.getElementById('runRouteBtn').addEventListener('click', APP.runRouteOptimization);
  document.getElementById('runLoadBtn').addEventListener('click', APP.runLoadOptimization);
  document.getElementById('generateRecsBtn').addEventListener('click', APP.generateRecommendations);
  document.getElementById('loadSampleBtn').addEventListener('click', function() {
    DAMM.loadSample();
    APP.renderDataTable(APP.state.currentDataTab);
    APP.updateDashboard();
    showToast('Datos de ejemplo cargados correctamente');
  });
  document.getElementById('importBtn').addEventListener('click', function() {
    document.getElementById('csvClientInput').click();
  });
  document.getElementById('csvClientInput').addEventListener('change', function(e) {
    APP.handleCSVImport(e, 'clients');
  });
  document.getElementById('csvProductInput').addEventListener('change', function(e) {
    APP.handleCSVImport(e, 'products');
  });
  document.getElementById('modal-close').addEventListener('click', function() {
    document.getElementById('modal-overlay').classList.add('hidden');
  });
  document.getElementById('modal-overlay').addEventListener('click', function(e) {
    if (e.target === this) this.classList.add('hidden');
  });
};

APP.runFullOptimization = function() {
  APP.runRouteOptimization();
  setTimeout(() => APP.runLoadOptimization(), 300);
  setTimeout(() => APP.generateRecommendations(), 600);
  document.querySelector('.tab[data-tab="dashboard"]').click();
  showToast('Optimización completada');
};

APP.runRouteOptimization = function() {
  if (!DAMM.currentClients || DAMM.currentClients.length === 0) {
    showToast('No hay datos de clientes. Cargue datos primero.', true);
    return;
  }
  const mode = document.getElementById('route-priority').value;
  const dep = document.getElementById('route-departure').value || '06:00';
  const result = ROUTE.optimize(DAMM.currentClients, DAMM.currentOrders, DAMM.currentWarehouse, mode, dep);
  if (!result) { showToast('No hay clientes con pedidos para optimizar.', true); return; }
  APP.state.routeResult = result;
  APP.displayRouteResult(result);
  APP.initMap(result);
  showToast('Ruta optimizada: ' + result.totalStops + ' paradas, ' + result.totalDistance + ' km');
};

APP.runLoadOptimization = function() {
  if (!APP.state.routeResult) {
    APP.runRouteOptimization();
    setTimeout(() => APP.runLoadOptimization(), 200);
    return;
  }
  const mode = document.getElementById('load-mode').value;
  const vehicle = document.getElementById('load-vehicle').value;
  const result = LOAD.optimize(APP.state.routeResult.stops, DAMM.currentOrders, DAMM.currentProducts, vehicle, mode);
  if (!result) { showToast('No se pudo calcular la carga.', true); return; }
  APP.state.loadResult = result;
  APP.displayLoadResult(result);
  APP.updateDashboard();
  showToast('Carga calculada: ' + result.totalPallets + ' palets de ' + result.totalCapacity + ' posiciones');
};

APP.displayRouteResult = function(result) {
  const list = document.getElementById('routeStopList');
  let html = '';
  result.stops.forEach((s, i) => {
    const priColor = ROUTE.getPriorityColor(s.priority);
    const twClass = s.priority <= 1 ? 'high-priority' : '';
    html += `<div class="stop-item ${twClass}">
      <span class="stop-order">${i+1}</span>
      <span class="stop-name">${s.name} <span style="font-size:.7rem;color:${priColor}">(P${s.priority})</span></span>
      <span class="stop-time">${s.arrivalTime}-${s.departureTime} <span style="font-size:.7rem;color:var(--text-light)">[${s.timeFrom}-${s.timeTo}]</span></span>
    </div>`;
  });
  list.innerHTML = html;

  document.getElementById('routeMetrics').style.display = 'block';
  document.getElementById('routeMetricsContent').innerHTML = `
    <div class="metric"><span class="val">${result.totalStops}</span><span class="lbl">Paradas</span></div>
    <div class="metric"><span class="val">${result.totalDistance} km</span><span class="lbl">Distancia Total</span></div>
    <div class="metric"><span class="val">${result.totalTime} min</span><span class="lbl">Tiempo Estimado</span></div>
    <div class="metric"><span class="val">${Math.round(result.totalDistance / result.totalStops)} km</span><span class="lbl">Media/Parada</span></div>
  `;
};

APP.displayLoadResult = function(result) {
  LOAD.renderTruck(result, 'truckTopView', 'truckLegend');
  LOAD.renderSideView(result, 'truckSideCanvas');

  let metricsHtml = `
    <div class="metric-row">
      <div class="metric"><span class="val">${result.totalPallets}/${result.totalCapacity}</span><span class="lbl">Palets usados</span></div>
      <div class="metric"><span class="val">${result.overallUtilization}%</span><span class="lbl">Ocupación global</span></div>
      <div class="metric"><span class="val">${result.weightUtilization}%</span><span class="lbl">Peso</span></div>
      <div class="metric"><span class="val">${result.volumeUtilization}%</span><span class="lbl">Volumen</span></div>
      <div class="metric"><span class="val">${(result.totalWeight/1000).toFixed(1)} t</span><span class="lbl">Peso total</span></div>
    </div>
    <h4 style="margin:12px 0 8px;font-size:.85rem">Distribución por tipo</h4>
    <div class="metric-row">`;
  Object.keys(result.byType).forEach(type => {
    const color = LOAD.productColors[type] || '#999';
    metricsHtml += `<div class="metric"><span class="val" style="color:${color}">${result.byType[type].pallets}</span><span class="lbl">${LOAD.productNames[type]}</span></div>`;
  });
  metricsHtml += `</div>`;
  document.getElementById('loadMetricsContent').innerHTML = metricsHtml;

  let detailHtml = '';
  Object.keys(result.byClient).forEach(cid => {
    const c = result.byClient[cid];
    const uo = result.unloadOrderMap[cid] || '-';
    detailHtml += `<div class="pallet-group">
      <h4>${c.name} (${c.pallets} palets, ${(c.weight/1000).toFixed(1)} t) - Ord. descarga: ${uo}</h4>
      <table><tr><th>Palet</th><th>Producto</th><th>Tipo</th><th>Uds</th><th>Peso</th></tr>`;
    result.pallets.filter(p => p.clientId === cid).forEach(p => {
      const color = LOAD.productColors[p.productType] || '#999';
      detailHtml += `<tr><td>#${p.id}</td><td style="color:${color}">${p.productName}</td><td>${p.productType}</td><td>${p.units}</td><td>${Math.round(p.weight)} kg</td></tr>`;
    });
    detailHtml += `</table></div>`;
  });
  document.getElementById('loadPalletList').innerHTML = detailHtml;
};

APP.initMap = function(result) {
  const mapDiv = document.getElementById('routeMap');
  if (!mapDiv) return;
  if (!APP.state.map) {
    APP.state.map = L.map('routeMap').setView([DAMM.currentWarehouse.lat, DAMM.currentWarehouse.lng], 13);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; OpenStreetMap contributors',
      maxZoom: 19
    }).addTo(APP.state.map);
  }

  if (APP.state.routeLayer) APP.state.map.removeLayer(APP.state.routeLayer);
  if (APP.state.markerLayer) APP.state.map.removeLayer(APP.state.markerLayer);

  const wIcon = L.divIcon({ html: '<div style="background:#0051a0;color:#fff;border-radius:50%;width:24px;height:24px;display:flex;align-items:center;justify-content:center;font-weight:700;font-size:12px;border:2px solid #fff;box-shadow:0 2px 6px rgba(0,0,0,.3)">D</div>', iconSize: [24,24], iconAnchor: [12,12], className: '' });
  L.marker([DAMM.currentWarehouse.lat, DAMM.currentWarehouse.lng], { icon: wIcon }).addTo(APP.state.map).bindTooltip('DDI Mollet');

  const markers = [];
  const latlngs = [[DAMM.currentWarehouse.lat, DAMM.currentWarehouse.lng]];

  result.stops.forEach((s, i) => {
    const color = ROUTE.getPriorityColor(s.priority);
    const icon = L.divIcon({
      html: `<div style="background:${color};color:#fff;border-radius:50%;width:22px;height:22px;display:flex;align-items:center;justify-content:center;font-weight:700;font-size:11px;border:2px solid #fff;box-shadow:0 2px 6px rgba(0,0,0,.3)">${i+1}</div>`,
      iconSize: [22,22], iconAnchor: [11,11], className: ''
    });
    const marker = L.marker([s.lat, s.lng], { icon }).addTo(APP.state.map);
    marker.bindTooltip(`<b>${i+1}. ${s.name}</b><br>Llegada: ${s.arrivalTime}<br>Ventana: ${s.timeFrom}-${s.timeTo}<br>Prioridad: P${s.priority}`);
    markers.push(marker);
    latlngs.push([s.lat, s.lng]);
  });

  latlngs.push([DAMM.currentWarehouse.lat, DAMM.currentWarehouse.lng]);

  APP.state.routeLayer = L.polyline(latlngs, { color: '#0051a0', weight: 3, opacity: 0.7, dashArray: '8, 8' }).addTo(APP.state.map);
  APP.state.markerLayer = L.layerGroup(markers).addTo(APP.state.map);
  APP.state.map.fitBounds(APP.state.routeLayer.getBounds().pad(0.15));

  APP.renderRevLogistics(result);
};

APP.renderRevLogistics = function(routeResult) {
  const revList = document.getElementById('revList');
  const revInt = document.getElementById('revIntegration');
  const revMet = document.getElementById('revMetrics');

  let hasReturns = false;
  let totalItems = 0;
  DAMM.currentReturns.forEach(r => {
    const client = DAMM.getClient(r.clientId);
    if (client) {
      r.items.forEach(item => {
        totalItems += item.qty;
        hasReturns = true;
      });
    }
  });

  if (!hasReturns) {
    revList.innerHTML = '<p class="hint">No hay elementos retornables configurados.</p>';
    revInt.innerHTML = '<p class="hint">No hay retornos para integrar.</p>';
    revMet.innerHTML = '<p class="hint">No hay métricas de retorno.</p>';
    return;
  }

  let html = '<table><tr><th>Cliente</th><th>Elemento</th><th>Cant.</th></tr>';
  DAMM.currentReturns.forEach(r => {
    const client = DAMM.getClient(r.clientId);
    if (!client) return;
    r.items.forEach(item => {
      html += `<tr><td>${client.name}</td><td>${item.type}</td><td>${item.qty}</td></tr>`;
    });
  });
  html += '</table>';
  revList.innerHTML = html;

  if (routeResult) {
    let intHtml = '<table><tr><th>Parada</th><th>Cliente</th><th>Recoger</th></tr>';
    routeResult.stops.forEach((s, i) => {
      const ret = DAMM.getReturnsForClient(s.id);
      if (ret && ret.items.length > 0) {
        let itemsStr = ret.items.map(it => `${it.qty}x ${it.type}`).join(', ');
        intHtml += `<tr><td>${i+1}</td><td>${s.name}</td><td>${itemsStr}</td></tr>`;
      }
    });
    intHtml += '</table>';
    revInt.innerHTML = intHtml;

    revMet.innerHTML = `
      <div class="metric-row">
        <div class="metric"><span class="val">${totalItems}</span><span class="lbl">Elementos retornables</span></div>
        <div class="metric"><span class="val">${DAMM.currentReturns.length}</span><span class="lbl">Clientes con retorno</span></div>
        <div class="metric"><span class="val">${Math.round(totalItems * 5)} kg</span><span class="lbl">Peso estimado retorno</span></div>
      </div>`;
  } else {
    revInt.innerHTML = '<p class="hint">Calcule la ruta para ver la integración.</p>';
    revMet.innerHTML = '<p class="hint">Calcule la ruta para ver métricas.</p>';
  }
};

APP.generateRecommendations = function() {
  const list = document.getElementById('recommendationsList');
  if (!APP.state.routeResult && !APP.state.loadResult) {
    APP.runFullOptimization();
    setTimeout(() => APP.generateRecommendations(), 400);
    return;
  }

  const recs = [];

  if (APP.state.routeResult) {
    const r = APP.state.routeResult;
    recs.push({
      title: 'Distancia total de ruta',
      desc: `La ruta optimizada cubre ${r.totalDistance} km con ${r.totalStops} paradas.`,
      explain: `Se ha utilizado un algoritmo de vecino más cercano con ventanas horarias. La distancia media por parada es de ${Math.round(r.totalDistance/r.totalStops)} km. ${r.totalStops > 12 ? 'Se recomienda evaluar la posibilidad de dividir la ruta en dos vehículos para mejorar la eficiencia.' : 'La ruta es operable con un solo vehículo.'}`,
      impact: r.totalDistance > 100 ? 'medium' : 'low',
      impactLabel: r.totalDistance > 100 ? 'Media' : 'Baja',
      priority: r.totalDistance > 100 ? 'medium' : 'low'
    });

    const earlyStops = r.stops.filter(s => ROUTE.timeToMins(s.timeFrom) < 480);
    if (earlyStops.length > 0) {
      recs.push({
        title: 'Ventanas tempranas detectadas',
        desc: `${earlyStops.length} cliente(s) tienen ventanas antes de las 08:00.`,
        explain: `Clientes como ${earlyStops.map(s=>s.name).join(', ')} requieren llegada antes de las 8am. Se recomienda salida antes de las ${ROUTE.minsToTime(ROUTE.timeToMins(document.getElementById('route-departure').value))} para cumplir con los horarios. Estos clientes de alta prioridad (P1) deben servirse primero.`,
        impact: 'high',
        impactLabel: 'Alta',
        priority: 'high'
      });
    }

    const tightWindows = r.stops.filter(s => {
      const from = ROUTE.timeToMins(s.timeFrom);
      const to = ROUTE.timeToMins(s.timeTo);
      return (to - from) <= 90;
    });
    if (tightWindows.length > 0) {
      recs.push({
        title: 'Ventanas horarias ajustadas',
        desc: `${tightWindows.length} cliente(s) tienen ventanas de 90 min o menos.`,
        explain: `${tightWindows.map(s=>s.name+' ('+s.timeFrom+'-'+s.timeTo+')').join(', ')} requieren planificación precisa. El algoritmo ha priorizado estos clientes para asegurar llegada dentro de ventana.`,
        impact: 'high',
        impactLabel: 'Alta',
        priority: 'high'
      });
    }
  }

  if (APP.state.loadResult) {
    const l = APP.state.loadResult;
    recs.push({
      title: 'Ocupación de carga',
      desc: `El camión tiene una ocupación global del ${l.overallUtilization}% (peso: ${l.weightUtilization}%, volumen: ${l.volumeUtilization}%).`,
      explain: l.overallUtilization < 70
        ? 'La ocupación es baja. Se recomienda consolidar pedidos o reducir el tamaño del vehículo para optimizar costes.'
        : l.overallUtilization > 95
        ? 'La ocupación es muy alta. Evaluar si es necesario un segundo vehículo o redistribuir la carga.'
        : 'La ocupación es adecuada. Se está utilizando eficientemente la capacidad del vehículo.',
      impact: l.overallUtilization < 70 ? 'medium' : l.overallUtilization > 95 ? 'high' : 'low',
      impactLabel: l.overallUtilization < 70 ? 'Media' : l.overallUtilization > 95 ? 'Alta' : 'Baja',
      priority: l.overallUtilization < 70 ? 'medium' : l.overallUtilization > 95 ? 'high' : 'low'
    });

    const typeKeys = Object.keys(l.byType);
    if (typeKeys.length > 1) {
      recs.push({
        title: 'Mezcla de tipos de producto',
        desc: `La carga contiene ${typeKeys.length} tipos distintos: ${typeKeys.join(', ')}.`,
        explain: 'Mezclar ZFIN (vidrio) con ZPLV (lata) y UMA (otros) requiere planificación de carga. Se recomienda agrupar por tipo dentro de cada cliente y colocar ZFIN en la parte inferior por su mayor peso. El modo híbrido balancea agrupación por referencia y por cliente.',
        impact: typeKeys.length > 2 ? 'medium' : 'low',
        impactLabel: typeKeys.length > 2 ? 'Media' : 'Baja',
        priority: 'medium'
      });
    }

    if (l.totalPallets > l.totalCapacity * 0.9) {
      recs.push({
        title: 'Capacidad de palets casi al límite',
        desc: `${l.totalPallets} de ${l.totalCapacity} posiciones de palet ocupadas (${Math.round(l.totalPallets/l.totalCapacity*100)}%).`,
        explain: 'La capacidad de palets está cerca del máximo. Verificar que hay espacio para maniobras de carga/descarga y acceso a lonas laterales.',
        impact: 'high',
        impactLabel: 'Alta',
        priority: 'high'
      });
    }

    const hasReturns = DAMM.currentReturns.some(r => {
      const client = DAMM.getClient(r.clientId);
      return client && APP.state.routeResult && APP.state.routeResult.stops.some(s => s.id === r.clientId);
    });
    if (hasReturns) {
      recs.push({
        title: 'Logística inversa integrada',
        desc: 'Hay elementos retornables en la ruta que requieren recogida.',
        explain: 'Los barriles vacíos y palets deben recogerse durante la ruta. Se ha priorizado la integración en las paradas existentes. Asegurar espacio en el vehículo para el retorno y considerar el peso adicional en la planificación de la carga.',
        impact: 'medium',
        impactLabel: 'Media',
        priority: 'medium'
      });
    }

    const hasHighWeight = l.pallets.some(p => p.weight > 800);
    if (hasHighWeight) {
      recs.push({
        title: 'Palets con peso elevado',
        desc: 'Hay palets que superan los 800 kg. Verificar estabilidad.',
        explain: 'Los palets con barriles (ZFIN GRIFO) tienen mayor peso. Deben colocarse en la parte delantera del camión (zona más estable) y no apilarse. Revisar la sujeción con flejes y esquineros.',
        impact: 'high',
        impactLabel: 'Alta',
        priority: 'high'
      });
    }
  }

  if (recs.length === 0) {
    recs.push({
      title: 'Sin recomendaciones',
      desc: 'No se detectaron incidencias. La configuración actual es adecuada.',
      explain: 'Ejecute la optimización completa para obtener recomendaciones personalizadas basadas en sus datos.',
      impact: 'low',
      impactLabel: 'Info',
      priority: 'low'
    });
  }

  let html = '';
  recs.forEach(r => {
    html += `<div class="rec-card ${r.priority}">
      <span class="rec-impact ${r.impact}">${r.impactLabel}</span>
      <div class="rec-title">${r.title}</div>
      <div class="rec-desc">${r.desc}</div>
      <div class="rec-explain"><strong>Por qué:</strong> ${r.explain}</div>
    </div>`;
  });
  list.innerHTML = html;

  const recCount = { high: recs.filter(r=>r.priority==='high').length, medium: recs.filter(r=>r.priority==='medium').length, low: recs.filter(r=>r.priority==='low').length };
  document.getElementById('dashboard-rec-summary').innerHTML = `
    <div class="metric-row">
      <div class="metric"><span class="val" style="color:var(--danger)">${recCount.high}</span><span class="lbl">Críticas</span></div>
      <div class="metric"><span class="val" style="color:var(--warning)">${recCount.medium}</span><span class="lbl">Medias</span></div>
      <div class="metric"><span class="val" style="color:var(--success)">${recCount.low}</span><span class="lbl">Mejoras</span></div>
    </div>`;

  showToast(`${recs.length} recomendaciones generadas`);
};

APP.renderDataTable = function(tab) {
  const container = document.getElementById('dataTableContainer');
  let html = '<div class="table-wrap"><table>';

  if (tab === 'clients') {
    const data = DAMM.currentClients || DAMM.clients;
    html += '<tr><th>ID</th><th>Nombre</th><th>Canal</th><th>Sector</th><th>Día</th><th>Turno</th><th>Ventana</th><th>Prioridad</th><th>Dirección</th></tr>';
    data.forEach(c => {
      html += `<tr><td>${c.id}</td><td>${c.name}</td><td>${c.channel}</td><td>${c.sector}</td><td>${c.day}</td><td>${c.shift}</td><td>${c.timeFrom}-${c.timeTo}</td><td>P${c.priority}</td><td>${c.address || ''}</td></tr>`;
    });
  } else if (tab === 'products') {
    const data = DAMM.currentProducts || DAMM.products;
    html += '<tr><th>ID</th><th>Material</th><th>Tipo</th><th>Nombre</th><th>Dimensiones</th><th>Peso</th><th>Vol.</th><th>Pal/max</th><th>Retornable</th></tr>';
    data.forEach(p => {
      html += `<tr><td>${p.id}</td><td>${p.material}</td><td><span style="color:${LOAD.productColors[p.type]}">${p.type}</span></td><td>${p.name}</td><td>${p.dims}</td><td>${p.weight} kg</td><td>${p.volume} m3</td><td>${p.palUnitsMax}</td><td>${p.returnable ? 'SÍ' : 'No'}</td></tr>`;
    });
  } else if (tab === 'orders') {
    const orders = DAMM.currentOrders || DAMM.orders;
    html += '<tr><th>Cliente</th><th>Producto</th><th>Tipo</th><th>Cantidad</th><th>Peso total</th><th>Palets</th></tr>';
    orders.forEach(o => {
      const client = DAMM.getClient(o.clientId);
      o.items.forEach(item => {
        const prod = DAMM.getProduct(item.pid);
        if (!prod) return;
        const palets = Math.ceil(item.qty / prod.palUnitsMax);
        html += `<tr><td>${client ? client.name : o.clientId}</td><td>${prod.name}</td><td style="color:${LOAD.productColors[prod.type]}">${prod.type}</td><td>${item.qty}</td><td>${(item.qty * prod.weight).toFixed(0)} kg</td><td>${palets}</td></tr>`;
      });
    });
  } else if (tab === 'returns') {
    const returns = DAMM.currentReturns || DAMM.returns;
    html += '<tr><th>Cliente</th><th>Elemento</th><th>Cantidad</th><th>En ruta</th></tr>';
    returns.forEach(r => {
      const client = DAMM.getClient(r.clientId);
      const inRoute = APP.state.routeResult ? APP.state.routeResult.stops.some(s => s.id === r.clientId) : false;
      r.items.forEach(item => {
        html += `<tr><td>${client ? client.name : r.clientId}</td><td>${item.type}</td><td>${item.qty}</td><td>${inRoute ? 'SÍ' : 'No'}</td></tr>`;
      });
    });
  }

  html += '</table></div>';
  container.innerHTML = html;

  const count = tab === 'clients' ? (DAMM.currentClients||DAMM.clients).length
    : tab === 'products' ? (DAMM.currentProducts||DAMM.products).length
    : tab === 'orders' ? (DAMM.currentOrders||DAMM.orders).reduce((s,o) => s+o.items.length, 0)
    : (DAMM.currentReturns||DAMM.returns).reduce((s,r) => s+r.items.length, 0);
};

APP.updateDashboard = function() {
  const clients = DAMM.currentClients || DAMM.clients;
  const products = DAMM.currentProducts || DAMM.products;
  document.getElementById('kpi-clients').textContent = clients.length;
  document.getElementById('kpi-products').textContent = products.length;

  if (APP.state.routeResult) {
    document.getElementById('kpi-stops').textContent = APP.state.routeResult.totalStops;
    document.getElementById('kpi-distance').textContent = APP.state.routeResult.totalDistance + ' km';
  }

  if (APP.state.loadResult) {
    document.getElementById('kpi-pallets').textContent = APP.state.loadResult.totalPallets;
    document.getElementById('kpi-load').textContent = APP.state.loadResult.overallUtilization + '%';
  }

  APP.renderCharts();
};

APP.renderCharts = function() {
  if (APP.state.charts.channel) APP.state.charts.channel.destroy();
  if (APP.state.charts.productMix) APP.state.charts.productMix.destroy();
  if (APP.state.charts.timewins) APP.state.charts.timewins.destroy();

  const clients = DAMM.currentClients || DAMM.clients;
  const channelCount = {};
  clients.forEach(c => { channelCount[c.channel] = (channelCount[c.channel] || 0) + 1; });
  const channelCtx = document.getElementById('chart-channel');
  if (channelCtx) {
    APP.state.charts.channel = new Chart(channelCtx, {
      type: 'doughnut',
      data: {
        labels: Object.keys(channelCount),
        datasets: [{ data: Object.values(channelCount), backgroundColor: ['#0051a0','#f5a623','#28a745','#dc3545','#6f42c1'] }]
      },
      options: { responsive: true, plugins: { legend: { position: 'bottom', labels: { font: { size: 10 } } } } }
    });
  }

  const products = DAMM.currentProducts || DAMM.products;
  const typeCount = {};
  products.forEach(p => { typeCount[p.type] = (typeCount[p.type] || 0) + 1; });
  const pmCtx = document.getElementById('chart-product-mix');
  if (pmCtx) {
    APP.state.charts.productMix = new Chart(pmCtx, {
      type: 'doughnut',
      data: {
        labels: Object.keys(typeCount),
        datasets: [{ data: Object.values(typeCount), backgroundColor: ['#e74c3c','#3498db','#2ecc71'] }]
      },
      options: { responsive: true, plugins: { legend: { position: 'bottom', labels: { font: { size: 10 } } } } }
    });
  }

  const shiftCount = { MAÑANA: 0, TARDE: 0, NOCHE: 0 };
  clients.forEach(c => { if (shiftCount[c.shift] !== undefined) shiftCount[c.shift]++; });
  const twCtx = document.getElementById('chart-timewindows');
  if (twCtx) {
    APP.state.charts.timewins = new Chart(twCtx, {
      type: 'bar',
      data: {
        labels: Object.keys(shiftCount),
        datasets: [{ label: 'Clientes por turno', data: Object.values(shiftCount), backgroundColor: ['#0051a0','#f5a623','#6f42c1'] }]
      },
      options: { responsive: true, plugins: { legend: { display: false } }, scales: { y: { beginAtZero: true, ticks: { stepSize: 1 } } } }
    });
  }
};

APP.handleCSVImport = function(e, type) {
  const file = e.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = function(event) {
    try {
      const parsed = DAMM.parseCSV(event.target.result);
      if (parsed.length === 0) { showToast('El archivo CSV está vacío o tiene formato incorrecto.', true); return; }
      if (type === 'clients') {
        DAMM.currentClients = parsed.map((row, i) => ({
          id: row.Deudor || row.id || 'C' + String(i+1).padStart(3,'0'),
          name: row.Nombre || row.name || 'Cliente ' + (i+1),
          channel: row['Canal Distribución'] || row.channel || '',
          sector: row.Sector || row.sector || '',
          day: row['Día Semana'] || row.day || 'LUNES',
          shift: row.Turno || row.shift || 'MAÑANA',
          timeFrom: row['Hora Desde'] || row.timeFrom || '08:00',
          timeTo: row['Hora Hasta'] || row.timeTo || '10:00',
          lat: parseFloat(row.lat) || (41.53 + Math.random() * 0.04),
          lng: parseFloat(row.lng) || (2.21 + Math.random() * 0.06),
          priority: parseInt(row.priority) || 2,
          address: row.Dirección || row.address || ''
        }));
      } else if (type === 'products') {
        DAMM.currentProducts = parsed.map((row, i) => ({
          id: row.Material || row.id || 'P' + String(i+1).padStart(3,'0'),
          material: row.Material || row.material || '',
          type: row.TpMt || row.type || row['Tipo Material'] || 'ZFIN',
          name: row.Denominación || row.name || row.denominacion || 'Producto ' + (i+1),
          dims: row.Dimensiones || row.dims || '400x300x200',
          weight: parseFloat(row['Peso Bruto'] || row['Peso Neto'] || row.weight) || 15,
          volume: parseFloat(row.Volumen || row.volume) || 0.024,
          uom: row['Unidad Medida'] || row.uom || 'CAJ',
          palHeight: parseFloat(row['PAL. ALTURA'] || row.palHeight) || 120,
          palWeightMax: parseFloat(row['PAL. PESO MAX'] || row.palWeightMax) || 500,
          palUnitsMax: parseInt(row['PAL. UNI. MAX'] || row.palUnitsMax) || 80,
          palType: row['PAL. TIPO'] || row.palType || 'EURO',
          ean: row['Código EAN'] || row.ean || '',
          returnable: (row.Retornable || '').toUpperCase() === 'SÍ' || (row.Retornable || '').toUpperCase() === 'SI' || false
        }));
      }
      APP.renderDataTable(APP.state.currentDataTab);
      APP.updateDashboard();
      showToast(`${parsed.length} ${type === 'clients' ? 'clientes' : 'productos'} importados correctamente.`);
    } catch(err) {
      showToast('Error al procesar el CSV: ' + err.message, true);
    }
  };
  reader.readAsText(file);
  e.target.value = '';
};

function showToast(msg, isError) {
  let toast = document.getElementById('toast');
  if (!toast) {
    toast = document.createElement('div');
    toast.id = 'toast';
    toast.style.cssText = 'position:fixed;bottom:30px;right:30px;background:#333;color:#fff;padding:12px 20px;border-radius:8px;font-size:.85rem;z-index:9999;opacity:0;transition:opacity .3s;max-width:400px;box-shadow:0 4px 12px rgba(0,0,0,.2)';
    document.body.appendChild(toast);
  }
  toast.textContent = msg;
  toast.style.background = isError ? '#dc3545' : '#333';
  toast.style.opacity = '1';
  clearTimeout(toast._hide);
  toast._hide = setTimeout(() => { toast.style.opacity = '0'; }, 3500);
}

document.addEventListener('DOMContentLoaded', APP.init);
