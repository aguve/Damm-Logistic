# Damm-Logistic

Hackathon project — logistics optimization for Estrella Damm (DDI Mollet).

## Estado

App funcional construida. SPA de estática HTML/CSS/JS con:
- **Dashboard** con KPIs y gráficos (Chart.js)
- **Rutas** optimizadas (TSP heurístico + ventanas horarias) sobre mapa Leaflet
- **Carga** con visualización 2D de palets en camión (vista superior + lateral)
- **Logística inversa** integrada en ruta
- **Recomendaciones** automáticas con explicabilidad (por qué, impacto)
- **Datos** con tablas de clientes, productos, pedidos, retornos + importación CSV

## Archivos

| Archivo | Líneas | Propósito |
|---|---|---|
| `index.html` | 195 | Estructura SPA, tabs, CDN Leaflet/Chart.js |
| `css/style.css` | 146 | Tema azul corporativo, cards, grid, truck viz |
| `js/data.js` | 134 | Datos de ejemplo (15 clientes, 20 productos), parser CSV |
| `js/route.js` | 144 | Algoritmo ruta: haversine, nearest-neighbor, time windows |
| `js/load.js` | 280 | Algoritmo carga: paletizado, disposición en camión, vistas |
| `js/app.js` | 610 | Controlador: tabs, eventos, renderizado, recomendaciones |

## Funcionalidades

1. **Rutas**: nearest-neighbor con 4 modos (distancia, horarios, prioridad, balanceado). Mapa con marcadores numerados y polyline. Ventanas horarias validadas.
2. **Carga**: 3 modos (por referencia, por cliente, híbrido). 3 configs de vehículo. Renderizado de palets coloreados por tipo (ZFIN rojo, ZPLV azul, UMA verde). Números de orden de descarga.
3. **Retornos**: barriles vacíos y palets integrados en paradas de ruta.
4. **Recomendaciones**: 8+ reglas con nivel de impacto y explicación textual.
5. **Importación CSV**: parseo de clientes y productos desde archivo.

## Stack

- Cliente: HTML5, CSS3, JavaScript (vanilla, sin framework)
- Mapas: Leaflet + OpenStreetMap tiles (gratuito, sin API key)
- Gráficos: Chart.js 4.x
- No requiere backend, ni build step, ni API key

## Cómo ejecutar

Abrir `index.html` en navegador (necesita internet para CDN). O servir con:
```
npx serve .
npx http-server .
python3 -m http.server 8080
```

## Datos de ejemplo

- **DDI Mollet** (almacén origen): 41.543, 2.215
- **15 clientes** en Mollet, Parets, Granollers, Montmeló con ventanas 07:00-17:00
- **20 productos**: ZFIN (vidrio), ZPLV (lata), UMA (otros). Incluye retornables (barril 30L)
- Pedidos generados: cada cliente solicita 2-6 productos
- Coordenadas realistas para demo; importar CSV propio con coordenadas reales para producción

## Decisiones técnicas

- Sin módulos ES6 (compatibilidad file://). Script tags con globales (DAMM, ROUTE, LOAD, APP).
- Haversine para distancias (sin API externa de routing). Velocidad media 40 km/h.
- Algoritmo de carga: agrupa por cliente en orden inverso de ruta (LIFO), luego por tipo. Asigna a palets según capacidad del producto.
- Las coordenadas de clientes importados por CSV sin lat/lng se generan aleatoriamente alrededor de Mollet.
