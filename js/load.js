const LOAD = {};

LOAD.vehicleConfigs = {
  standard: { name:"Camión 13.6m", palletPositions:33, length:13.6, width:2.45, layers:3 },
  medium: { name:"Camión 10m", palletPositions:24, length:10, width:2.45, layers:3 },
  small: { name:"Camión 7m", palletPositions:16, length:7, width:2.45, layers:2 }
};

LOAD.productColors = { ZFIN:'#e74c3c', ZPLV:'#3498db', UMA:'#2ecc71' };
LOAD.productNames = { ZFIN:'Botella Vidrio', ZPLV:'Lata/Aluminio', UMA:'Otros' };

LOAD.optimize = function(routeStops, orders, products, vehicleKey, mode) {
  const vehicle = LOAD.vehicleConfigs[vehicleKey] || LOAD.vehicleConfigs.standard;
  if (!routeStops || routeStops.length === 0) return null;

  const revStops = [...routeStops].reverse();

  let allPallets = [];
  let palletId = 0;

  revStops.forEach((stop, stopIdx) => {
    const order = orders.find(o => o.clientId === stop.id);
    if (!order) return;

    const itemsByType = {};
    order.items.forEach(item => {
      const prod = products.find(p => p.id === item.pid);
      if (!prod) return;
      if (!itemsByType[prod.type]) itemsByType[prod.type] = [];
      itemsByType[prod.type].push({ prod, qty: item.qty });
    });

    const typeKeys = Object.keys(itemsByType);

    if (mode === 'reference') {
      typeKeys.forEach(type => {
        itemsByType[type].forEach(({prod, qty}) => {
          const numPallets = Math.ceil(qty / prod.palUnitsMax);
          for (let p = 0; p < numPallets; p++) {
            const onPal = Math.min(prod.palUnitsMax, qty - p * prod.palUnitsMax);
            allPallets.push({
              id: ++palletId,
              clientId: stop.id,
              clientName: stop.name,
              productId: prod.id,
              productName: prod.name,
              productType: prod.type,
              units: onPal,
              weight: onPal * prod.weight,
              volume: onPal * prod.volume,
              unloadOrder: revStops.length - stopIdx,
              stopIndex: stopIdx
            });
          }
        });
      });
    } else if (mode === 'client') {
      typeKeys.forEach(type => {
        let totalUnits = 0;
        let totalWeight = 0;
        let totalVolume = 0;
        let prodNames = [];
        itemsByType[type].forEach(({prod, qty}) => {
          totalUnits += qty;
          totalWeight += qty * prod.weight;
          totalVolume += qty * prod.volume;
          prodNames.push(prod.name);
        });
        const avgProd = itemsByType[type][0].prod;
        const numPallets = Math.ceil(totalUnits / avgProd.palUnitsMax);
        for (let p = 0; p < numPallets; p++) {
          const onPal = Math.min(avgProd.palUnitsMax, totalUnits - p * avgProd.palUnitsMax);
          allPallets.push({
            id: ++palletId,
            clientId: stop.id,
            clientName: stop.name,
            productId: 'MIX_' + type,
            productName: 'Mix ' + LOAD.productNames[type],
            productType: type,
            units: onPal,
            weight: (onPal / totalUnits) * totalWeight,
            volume: (onPal / totalUnits) * totalVolume,
            unloadOrder: revStops.length - stopIdx,
            stopIndex: stopIdx
          });
        }
      });
    } else {
      typeKeys.forEach(type => {
        let totalUnits = 0;
        let totalQtyByProd = {};
        itemsByType[type].forEach(({prod, qty}) => {
          totalUnits += qty;
          totalQtyByProd[prod.id] = { prod, qty };
        });
        const palSize = itemsByType[type][0].prod.palUnitsMax;
        const numPallets = Math.ceil(totalUnits / palSize);

        let remaining = {};
        itemsByType[type].forEach(({prod, qty}) => { remaining[prod.id] = qty; });

        for (let p = 0; p < numPallets; p++) {
          let onPal = 0;
          let palWeight = 0;
          let palVolume = 0;
          let palProds = [];
          const prodIds = Object.keys(remaining);
          for (let ri = 0; ri < prodIds.length && onPal < palSize; ri++) {
            const pid = prodIds[ri];
            if (remaining[pid] <= 0) continue;
            const take = Math.min(remaining[pid], palSize - onPal);
            const prod = totalQtyByProd[pid].prod;
            onPal += take;
            palWeight += take * prod.weight;
            palVolume += take * prod.volume;
            palProds.push(prod.name + ' x' + take);
            remaining[pid] -= take;
          }
          allPallets.push({
            id: ++palletId,
            clientId: stop.id,
            clientName: stop.name,
            productId: 'MIX',
            productName: palProds.join(', '),
            productType: type,
            units: onPal,
            weight: palWeight,
            volume: palVolume,
            unloadOrder: revStops.length - stopIdx,
            stopIndex: stopIdx
          });
        }
      });
    }
  });

  allPallets.sort((a,b) => a.stopIndex - b.stopIndex);

  const maxPallets = vehicle.palletPositions;
  const usedPallets = Math.min(allPallets.length, maxPallets);
  const assigned = allPallets.slice(0, maxPallets);

  const totalWeight = assigned.reduce((s, p) => s + p.weight, 0);
  const totalVolume = assigned.reduce((s, p) => s + p.volume, 0);
  const maxWeight = 24000;
  const maxVolume = vehicle.length * vehicle.width * 2.4;
  const weightUtil = Math.min(100, (totalWeight / maxWeight) * 100);
  const volUtil = Math.min(100, (totalVolume / maxVolume) * 100);

  const clientMap = {};
  assigned.forEach(p => {
    if (!clientMap[p.clientId]) clientMap[p.clientId] = { name: p.clientName, pallets: 0, weight: 0 };
    clientMap[p.clientId].pallets++;
    clientMap[p.clientId].weight += p.weight;
  });

  const typeMap = {};
  assigned.forEach(p => {
    if (!typeMap[p.productType]) typeMap[p.productType] = { pallets: 0, weight: 0 };
    typeMap[p.productType].pallets++;
    typeMap[p.productType].weight += p.weight;
  });

  const unloadOrderMap = {};
  assigned.forEach(p => {
    if (!unloadOrderMap[p.clientId]) unloadOrderMap[p.clientId] = p.unloadOrder;
  });

  return {
    pallets: assigned,
    totalPallets: assigned.length,
    totalCapacity: maxPallets,
    totalWeight: Math.round(totalWeight),
    maxWeight,
    totalVolume: Math.round(totalVolume * 100) / 100,
    maxVolume: Math.round(maxVolume * 100) / 100,
    weightUtilization: Math.round(weightUtil),
    volumeUtilization: Math.round(volUtil),
    overallUtilization: Math.round((weightUtil + volUtil) / 2),
    byClient: clientMap,
    byType: typeMap,
    unloadOrderMap,
    vehicle
  };
};

LOAD.renderTruck = function(loadResult, containerId, legendId) {
  const container = document.getElementById(containerId);
  const legend = document.getElementById(legendId);
  if (!container) return;

  if (!loadResult || loadResult.pallets.length === 0) {
    container.innerHTML = '<p class="hint">No hay carga para mostrar.</p>';
    return;
  }

  const pallets = loadResult.pallets;
  const cols = 4;
  const rows = Math.ceil(pallets.length / cols);

  let html = '';
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const idx = r * cols + c;
      if (idx < pallets.length) {
        const p = pallets[idx];
        const color = LOAD.productColors[p.productType] || '#999';
        html += `<div class="pallet-cell" style="background:${color}22;border-color:${color}" title="${p.clientName}: ${p.productName} (${p.units} uds - Ord.${p.unloadOrder})">
          <span class="unload-order">${p.unloadOrder}</span>
          <span class="pallet-qty" style="color:${color}">${p.units}</span>
          <span class="pallet-label">${p.clientName.substring(0,10)}</span>
        </div>`;
      } else {
        html += `<div class="pallet-cell" style="border-color:#ddd;background:#fafafa"><span style="color:#ccc;font-size:.7rem">VACÍO</span></div>`;
      }
    }
  }

  container.innerHTML = html;

  if (legend) {
    let legendHtml = '';
    Object.keys(LOAD.productColors).forEach(type => {
      legendHtml += `<span class="legend-item"><span class="legend-color" style="background:${LOAD.productColors[type]}"></span>${LOAD.productNames[type]}</span>`;
    });
    legendHtml += `<span class="legend-item"><span class="legend-color" style="background:#666"></span>Ord. Descarga</span>`;
    legend.innerHTML = legendHtml;
  }
};

LOAD.renderSideView = function(loadResult, canvasId) {
  const canvas = document.getElementById(canvasId);
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  if (!loadResult || loadResult.pallets.length === 0) return;

  ctx.strokeStyle = '#333';
  ctx.lineWidth = 2;
  ctx.strokeRect(20, 20, 560, 140);

  ctx.fillStyle = '#666';
  ctx.fillRect(20, 20, 40, 140);
  ctx.fillStyle = '#fff';
  ctx.font = '10px sans-serif';
  ctx.fillText('CABINA', 25, 90);

  const pallets = loadResult.pallets;
  const cols = 8;
  const rows = Math.ceil(pallets.length / cols);
  const pw = 520 / cols;
  const ph = Math.min(120 / Math.max(rows, 1), 40);

  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const idx = r * cols + c;
      if (idx < pallets.length) {
        const p = pallets[idx];
        const color = LOAD.productColors[p.productType] || '#999';
        const x = 60 + c * pw;
        const y = 30 + r * ph;
        ctx.fillStyle = color + '44';
        ctx.fillRect(x, y, pw - 1, ph - 1);
        ctx.strokeStyle = color;
        ctx.lineWidth = 1;
        ctx.strokeRect(x, y, pw - 1, ph - 1);
        ctx.fillStyle = color;
        ctx.font = '8px sans-serif';
        ctx.fillText(p.unloadOrder, x + 2, y + 10);
      }
    }
  }

  ctx.fillStyle = '#666';
  ctx.fillRect(565, 20, 15, 140);
  ctx.fillStyle = '#fff';
  ctx.font = '10px sans-serif';
  ctx.fillText('PTA', 568, 90);
};
