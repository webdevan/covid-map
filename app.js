main();

var
  map,
  mapMarkers,
  mapPolygons,
  mapType,
  regions,
  provincesZa,
  subdistrictsZa,
  subdistrictsCpt,
  provincialInfections,
  westernCapeInfections,
  provincialData,
  westernCapeData,
  dataDateText;

function fetchCsv(url) {
  return fetch(url)
  .then(res => res.text())
  .then(res => res.trim())
  .then(res => res.split('\n'))
  .then(res => res.map(item => item.split(',')))
  .then(res => {
    const headings = res.shift();
    return res.map(values => headings.reduce((item, key, index) => {
      item[key] = values[index] === '' ? null : isNaN(values[index]) ? values[index] : +values[index];
      return item;
    }, {}));
  });
}

function fetchJson(url) {
  return fetch(url)
  .then(res => res.json());
}

async function fetchData() {
  return Promise.all([
    fetchCsv('/data/regions_za.csv'),
    fetchJson('/data/map_provinces_za.json'),
    fetchJson('/data/map_subdistricts_za.json'),
    fetchJson('/data/map_subdistricts_cpt.json'),
    // provinces data
    fetchCsv('https://raw.githubusercontent.com/dsfsi/covid19za/master/data/covid19za_provincial_cumulative_timeline_confirmed.csv'),
    // western capes data
    fetchCsv('https://raw.githubusercontent.com/dsfsi/covid19za/master/data/district_data/provincial_wc_cumulative.csv'),
  ])
  .then(res => {
    return [
      regions,
      provincesZa,
      subdistrictsZa,
      subdistrictsCpt,
      provincialInfections,
      westernCapeInfections,
    ] = res;
  })
  .catch(err => {
    alert('Oops! Something is wrong.');
    console.error(err);
  });
}

function createMap() {
  map = L.map('map', {
    center: [-28.806460, 24.936116],
    zoom: 6,
    minZoom: 5,
    maxZoom: 11,
    attributionControl: false,
  });
  new L.tileLayer('https://cartodb-basemaps-{s}.global.ssl.fastly.net/light_all/{z}/{x}/{y}.png').addTo(map);
}

function toRagColor(value) {
  value = Math.min(1, Math.max(0, value));
  const red = 128 + (value * (240 - 128));
  const green = 112 + ((1 - value) * (208 - 112));
  const blue = '70';
  return `rgb(${red}, ${green}, ${blue})`;
}

function bindMapControls() {
  const mapTypeSelect = document.querySelector('.map-controls select');
  mapType = mapTypeSelect.value;
  mapTypeSelect.addEventListener('input', event => {
   mapType = mapTypeSelect.value;
   changeMapType();
  }, false);
}

function changeMapType() {
  // remove old map
  if (mapMarkers) mapMarkers.forEach(marker => map.removeLayer(marker));
  mapMarkers = [];
  if (mapPolygons) mapPolygons.forEach(polygon => map.removeLayer(polygon));
  mapPolygons = [];

  // set map title
  if (mapType === 'count') {
    document.querySelector('.map-title').innerHTML = `Confirmed cases, ${dataDateText} | Source: <a href="https://github.com/dsfsi/covid19za" target="_blank">https://github.com/dsfsi/covid19za</a>`;
  } else if (mapType === 'change') {
    document.querySelector('.map-title').innerHTML = `New cases, ${dataDateText} | Source: <a href="https://github.com/dsfsi/covid19za" target="_blank">https://github.com/dsfsi/covid19za</a>`;
  } else if (mapType === 'changePercent') {
    document.querySelector('.map-title').innerHTML = `New cases (%), ${dataDateText} | Source: <a href="https://github.com/dsfsi/covid19za" target="_blank">https://github.com/dsfsi/covid19za</a>`;
  }

  const provincialDataYesterday = provincialInfections[provincialInfections.indexOf(provincialData) - 1];
  const westernCapeDataYesterday = westernCapeInfections[westernCapeInfections.indexOf(westernCapeData) - 1];
  regions.forEach(region => {

    // assign infections stats
    region.count = provincialData[region.region_id] || westernCapeData[region.region_id];
    region.countYesterday = provincialDataYesterday[region.region_id] || westernCapeDataYesterday[region.region_id];
    region.change = region.count - region.countYesterday;
    
    // assign map polygon
    const maps = {
      map_provinces_za: provincesZa,
      map_subdistricts_za: subdistrictsZa,
      map_subdistricts_cpt: subdistrictsCpt,
    };
    if (['WC', 'CT'].includes(region.region_id)) return;
    if (maps[region.map_file]) region.map = maps[region.map_file].geometries[region.map_index];
    if (!region.map) return;

    // draw map polygon
    const weightedValue = region.count / region.population * 10000;
    // const weightedValue = region.count / region.area * 100;
    let points = [];
    if (region.map.type === 'Polygon') {
      points = region.map.coordinates[0].map(point => [point[1], point[0]]);
    } else if (region.map.type === 'MultiPolygon') {
      points = region.map.coordinates.map(coordinates => coordinates[0].map(point => [point[1], point[0]]));
    }
    const poly = L.polygon(points, {
      color: `rgba(255, 255, 255, 0.25)`,
      fillColor: toRagColor(weightedValue),
      fillOpacity: 0.5,
    });
    // poly.bindTooltip(`${region.count} +${region.change}`, {permanent: true, direction:"center"}).openTooltip();
    poly.addTo(map);
    mapPolygons.push(poly);

    // draw map marker
    let size = 22;
    let color = '#dd000066';
    let label = region.count;
    if (mapType === 'count') {
      if (region.count === 0) return;
      size = 22 + region.count / 10;
      color = `#00000020`;
      label = region.count;
    } else if (mapType === 'change') {
      if (region.change === 0) return;
      size = 30 + Math.pow(Math.abs(region.change), 1.5) / 3;
      if (region.change < 0) color = '#00dd0077';
      label = `${region.change > 0 ? '+' : ''}${region.change}`;
    } else if (mapType === 'changePercent') {
      if (region.change === 0) return;
      const percent = region.change / (region.count - region.change) * 100;
      size = 48 + Math.pow(Math.abs(percent), 1.5) / 3;
      if (region.change < 0) color = '#00dd0077';
      label = `${percent > 0 ? '+' : ''}${Math.round(percent)}%`;
    } else return;
    const icon = L.divIcon({
      className: 'region-marker',
      html: `
      <div style='
      background-color: ${color};
      color: #ffffff;
      text-shadow: 0px 0px 3px black, 0px 0px 2px black;
      border-radius: 50%;
      text-align: center;
      font-size: 1em;
      font-weight: bold;
      line-height: ${size}px;
      min-width: ${size}px;
      height: ${size}px;
      transform: translate(-${size/2}px, -${size/2}px);
      '>${label}</div>     
      `,
    });
    const position = poly.getCenter();
    const marker = L.marker(position, { icon }).addTo(map);
    mapMarkers.push(marker);
  });  
}

function determineDataDates() {
  // determine latest data dates
  let date;
  for (let i = provincialInfections.length; i > 0; i--) {
    provincialData = provincialInfections[i - 1];
    if (Object.values(provincialData).some(item => item === null)) continue;
    date = provincialData.date;
    westernCapeData = westernCapeInfections.find(item => item.date === date);
    if (!westernCapeData) continue;
    if (Object.values(westernCapeData).some(item => item === null)) continue;
    break;
  };
  if (!date) return alert('Oops. Invalid data set!');
  dateArray = date.split('-');
  const dataDate = new Date(`${dateArray[2]}-${dateArray[1]}-${dateArray[0]}`);
  dataDateText = new Intl.DateTimeFormat('en-ZA', { month: 'long', day: 'numeric', year: 'numeric' }).format(dataDate);
}

async function main () {
  bindMapControls();
  createMap();
  await fetchData();
  determineDataDates();
  changeMapType();
}