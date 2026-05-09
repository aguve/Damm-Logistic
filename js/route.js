const ROUTE = {};

ROUTE.earthRadius = 6371;

ROUTE.toRad = function(deg) { return deg * Math.PI / 180; };

ROUTE.haversine = function(lat1, lng1, lat2, lng2) {
  const dLat = ROUTE.toRad(lat2 - lat1);
  const dLng = ROUTE.toRad(lng2 - lng1);
  const a = Math.sin(dLat/2)**2 + Math.cos(ROUTE.toRad(lat1)) * Math.cos(ROUTE.toRad(lat2)) * Math.sin(dLng/2)**2;
  return ROUTE.earthRadius * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
};

ROUTE.timeToMins = function(t) {
  const p = t.split(':');
  return parseInt(p[0])*60 + parseInt(p[1]);
};

ROUTE.minsToTime = function(m) {
  m = Math.round(m);
  const h = Math.floor(m / 60);
  const min = m % 60;
  return String(h).padStart(2,'0') + ':' + String(min).padStart(2,'0');
};

ROUTE.serviceTime = 15;

ROUTE.avgSpeed = 40;

ROUTE.calcTravelTime = function(km) {
  return (km / ROUTE.avgSpeed) * 60;
};

ROUTE.optimize = function(clients, orders, warehouse, mode, departureTime) {
  const depMins = ROUTE.timeToMins(departureTime);
  const routeClients = clients.filter(c => {
    const order = orders.find(o => o.clientId === c.id);
    return order && order.items && order.items.length > 0;
  });

  if (routeClients.length === 0) return null;

  let ordered = [];
  const unvisited = [...routeClients];

  let current = { lat: warehouse.lat, lng: warehouse.lng, id: 'WAREHOUSE' };
  let currentTime = depMins;

  if (mode === 'priority') {
    unvisited.sort((a,b) => (a.priority || 3) - (b.priority || 3));
  } else if (mode === 'time') {
    unvisited.sort((a,b) => ROUTE.timeToMins(a.timeFrom) - ROUTE.timeToMins(b.timeFrom));
  }

  while (unvisited.length > 0) {
    let bestIdx = -1;
    let bestDist = Infinity;
    let bestArrival = Infinity;

    for (let i = 0; i < unvisited.length; i++) {
      const c = unvisited[i];
      const dist = ROUTE.haversine(current.lat, current.lng, c.lat, c.lng);
      const travel = ROUTE.calcTravelTime(dist);
      let arrival = currentTime + travel;
      const winFrom = ROUTE.timeToMins(c.timeFrom);
      const winTo = ROUTE.timeToMins(c.timeTo);

      if (arrival < winFrom) arrival = winFrom;
      if (arrival > winTo + 30) continue;

      let score = dist;
      if (mode === 'time') score = arrival;
      else if (mode === 'balanced') score = dist * 0.6 + (arrival - depMins) * 0.004;
      else if (mode === 'priority') score = dist - (c.priority === 1 ? 3 : c.priority === 2 ? 1 : 0) * 0.5;

      if (score < bestDist) {
        bestDist = score;
        bestIdx = i;
        bestArrival = arrival;
      }
    }

    if (bestIdx === -1) {
      if (mode === 'time') {
        unvisited.sort((a,b) => ROUTE.timeToMins(a.timeFrom) - ROUTE.timeToMins(b.timeFrom));
        bestIdx = 0;
        const c = unvisited[0];
        const dist = ROUTE.haversine(current.lat, current.lng, c.lat, c.lng);
        const travel = ROUTE.calcTravelTime(dist);
        bestArrival = Math.max(currentTime + travel, ROUTE.timeToMins(c.timeFrom));
      } else {
        bestIdx = 0;
        const c = unvisited[0];
        const dist = ROUTE.haversine(current.lat, current.lng, c.lat, c.lng);
        const travel = ROUTE.calcTravelTime(dist);
        bestArrival = Math.max(currentTime + travel, ROUTE.timeToMins(c.timeFrom));
      }
    }

    const chosen = unvisited.splice(bestIdx, 1)[0];
    chosen._arrivalTime = bestArrival;
    chosen._departureTime = bestArrival + ROUTE.serviceTime;
    const dist = ROUTE.haversine(current.lat, current.lng, chosen.lat, chosen.lng);
    chosen._distFromPrev = dist;
    ordered.push(chosen);
    current = chosen;
    currentTime = chosen._departureTime;
  }

  const totalDist = ordered.reduce((sum, c) => sum + c._distFromPrev, 0);
  const returnDist = ROUTE.haversine(current.lat, current.lng, warehouse.lat, warehouse.lng);
  const totalDistWithReturn = totalDist + returnDist;

  const scheduleTimes = ordered.map(c => ({
    ...c,
    arrivalTime: ROUTE.minsToTime(c._arrivalTime),
    departureTime: ROUTE.minsToTime(c._departureTime),
    distFromPrev: Math.round(c._distFromPrev * 10) / 10
  }));

  let totalTime = 0;
  let prevLat = warehouse.lat, prevLng = warehouse.lng;
  scheduleTimes.forEach(s => {
    totalTime += ROUTE.calcTravelTime(ROUTE.haversine(prevLat, prevLng, s.lat, s.lng));
    totalTime += ROUTE.serviceTime;
    prevLat = s.lat; prevLng = s.lng;
  });
  totalTime += ROUTE.calcTravelTime(returnDist);

  return {
    stops: scheduleTimes,
    totalDistance: Math.round(totalDistWithReturn * 10) / 10,
    totalDistanceNoReturn: Math.round(totalDist * 10) / 10,
    totalTime: Math.round(totalTime),
    totalStops: scheduleTimes.length,
    returnDistance: Math.round(returnDist * 10) / 10
  };
};

ROUTE.getPriorityColor = function(p) {
  if (p <= 1) return '#dc3545';
  if (p <= 2) return '#ffc107';
  return '#28a745';
};
