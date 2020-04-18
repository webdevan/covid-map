main();

var
  map,
  mapShapes,
  mapMarkers,
  mapPolygons,
  mapType,
  regions,
  countriesAfrica,
  provincesZa,
  districtsZa,
  subdistrictsZa,
  subdistrictsCpt,
  africaInfections,
  provincialInfections,
  wcInfections,
  provincialData,
  wcData,
  gpData,
  lpData,
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
  // data sources
  let promises = [
    fetchCsv('/data/regions.csv'),
    fetchJson('/data/map_countries_africa.json'),
    fetchJson('/data/map_provinces_za.json'),
    fetchJson('/data/map_districts_za.json'),
    fetchJson('/data/map_subdistricts_za.json'),
    fetchJson('/data/map_subdistricts_cpt.json'),
    fetchCsv('https://raw.githubusercontent.com/dsfsi/covid19africa/master/data/africa_daily_time_series_cases.csv'),
    fetchCsv('https://raw.githubusercontent.com/dsfsi/covid19za/master/data/covid19za_provincial_cumulative_timeline_confirmed.csv'),
    fetchCsv('https://raw.githubusercontent.com/dsfsi/covid19za/master/data/district_data/provincial_wc_cumulative.csv'),
    fetchCsv('https://raw.githubusercontent.com/dsfsi/covid19za/master/data/district_data/provincial_gp_cumulative.csv'),
    fetchCsv('https://raw.githubusercontent.com/dsfsi/covid19za/master/data/district_data/provincial_lp_cumulative.csv'),
  ];
  // loading progress indicator
  const loadingMessage = document.querySelector('.loading-message');
  let progress = 0;
  promises = promises.map(p => p.then(res => {
    progress++;
    loadingMessage.innerHTML = `Please be patient while downloading map resources... ${Math.round(100*progress/promises.length)}%`;
    return res;
  }));
  // fetch the data
  return Promise.all(promises)
  .then(res => {
    // set data variables
    [
      regions,
      countriesAfrica,
      provincesZa,
      districtsZa,
      subdistrictsZa,
      subdistrictsCpt,
      africaInfections,
      provincialInfections,
      wcInfections,
      gpInfections,
      lpInfections,
    ] = res;
    // clean the data
    countriesAfrica.geometries = countriesAfrica.features.map(item => item.geometry);
    africaInfections = Object.keys(africaInfections[0])
    .filter(field => field !== 'Country/Region')
    .map(field => {
      const row = {};
      const date = field.split('/');
      row.date = `${date[1]}-${date[0]}-20${date[2]}`;
      africaInfections.forEach(item => {
        row[item['Country/Region']] = item[field];
      });
      return row;
    });
    lpInfections = lpInfections.map(row => {
      const cleanRow = { date, capricorn, vhembe, mopani, sekhukhune, waterberg } = row;
      return cleanRow;
    });
    const cleanData = data => {
      data = data.map(item => {
        const date = item.date.split('-');
        item.date = new Date(date[2], date[1]-1, date[0], 0, 0, 0, 0);
        return item;
      });
    };
    cleanData(africaInfections);
    cleanData(provincialInfections);
    cleanData(wcInfections);
    cleanData(gpInfections);
    cleanData(lpInfections);
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
    minZoom: 3,
    maxZoom: 13,
    attributionControl: false,
  });
  new L.tileLayer('https://cartodb-basemaps-{s}.global.ssl.fastly.net/light_all/{z}/{x}/{y}.png').addTo(map);
}

function toMapColor(value) {
  value = Math.min(1, Math.max(0, value));
  let hue = ((1 - value) * 90).toString(10);
  let brightness = 40 * (1 - Math.abs(value - 0.5));
  return `hsl(${hue}, 100%, ${brightness}%)`;
}

function bindMapControls() {
  const mapTypeSelect = document.querySelector('.map-controls select');
  mapType = mapTypeSelect.value;
  mapTypeSelect.addEventListener('input', event => {
    mapType = mapTypeSelect.value;
    changeMapType();
  }, false);
}

function setMapShapes() {
  mapShapes = {
    map_countries_africa: countriesAfrica,
    map_provinces_za: provincesZa,
    map_districts_za: districtsZa,
    map_subdistricts_za: subdistrictsZa,
    map_subdistricts_cpt: subdistrictsCpt,
  };
}

function findCurrentData() {
  // latest data
  africaData = africaInfections[africaInfections.length - 1];
  provincialData = provincialInfections[provincialInfections.length - 1];
  wcData = wcInfections[wcInfections.length - 1];
  gpData = gpInfections[gpInfections.length - 1];
  lpData = lpInfections[lpInfections.length - 1];
  // 1 day old data
  africaData.yesterday = africaInfections[africaInfections.length - 2];
  provincialData.yesterday = provincialInfections[provincialInfections.length -2];
  wcData.yesterday = wcInfections[wcInfections.length - 2];
  gpData.yesterday = gpInfections[gpInfections.length - 2];
  lpData.yesterday = lpInfections[lpInfections.length - 2];
  // check data is current enough for 1 day change
  const sanitizeOutdated = (data) => {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - 3);
    if (data.date < cutoffDate) data.yesterday = data;
  };
  sanitizeOutdated(africaData);
  sanitizeOutdated(provincialData);
  sanitizeOutdated(wcData);
  sanitizeOutdated(gpData);
  sanitizeOutdated(lpData);
}

function formatDate(date) {
  return new Intl.DateTimeFormat('en-ZA', { month: 'long', day: 'numeric', year: 'numeric' }).format(date);
}

function resetMap() {
  // remove old map markers
  if (mapMarkers) mapMarkers.forEach(marker => map.removeLayer(marker));
  mapMarkers = [];
  if (mapPolygons) mapPolygons.forEach(polygon => map.removeLayer(polygon));
  mapPolygons = [];
  // set map title
  document.querySelector('.map-title').innerHTML = `<h1>Covid-19 positive cases in Africa</h1><p class="small">Africa (${formatDate(africaData.date)}), SA Provincial (${formatDate(provincialData.date)}), Western Cape (${formatDate(wcData.date)}), Gauteng (${formatDate(gpData.date)}), Limpopo (${formatDate(lpData.date)})</p>`;
}

function getPolygonArea(points) {
  let a = 0;
  for (let i = 0, iLen = points.length - 1; i < iLen; i++) {
    a += points[i][0] * points[i + 1][1] - points[i + 1][0] * points[i][1];
  }
  return Math.abs(a/2);
}

function changeMapType() {
  resetMap();
  regions.forEach(region => {
    // assign map polygon
    if ([
      'South Africa', 
      'WC', 'LP', 'GP', 
      'CT',
      // 'capricorn', 'vhembe', 'mopani', 'sekhukhune', 'waterberg',
      'polokwane', 'blouberg', 'molemole', 'Lepelle-nkumpi',
      'musina', 'makhado', 'thulamela', 'collins chabane',
      'Ba-phalaborwa', 'greater giyani', 'greater letaba', 'greater tzaneen', 'maruleng',
      'elias motsoaledi', 'ephraim mogale', 'fetakgomo tubatse', 'makhuduthamaga',
      'Bela-bela', 'lephalale', 'Modimolle-mookgophong', 'mogalakwena', 'thabazimbi',
    ].includes(region.region_id)) return;
    if (mapShapes[region.map_file]) region.map = mapShapes[region.map_file].geometries[region.map_index];
    if (!region.map) return;

    // assign infections stats
    region.count = africaData[region.region_id] || provincialData[region.region_id] || wcData[region.region_id] || gpData[region.region_id] || lpData[region.region_id] || 0;
    region.yesterday = africaData.yesterday[region.region_id] || provincialData.yesterday[region.region_id] || wcData.yesterday[region.region_id] || gpData.yesterday[region.region_id] || lpData.yesterday[region.region_id] || 0;
    region.change = region.count - region.yesterday;
    // draw map polygon
    const weightedValue = region.count / region.population * 3000;
    let points = [];
    if (region.map.type === 'Polygon') {
      points = region.map.coordinates[0].map(point => [point[1], point[0]]);
    } else if (region.map.type === 'MultiPolygon') {
      points = region.map.coordinates.map(coordinates => coordinates[0].map(point => [point[1], point[0]]));
    }
    const poly = L.polygon(points, {
      color: `rgba(255, 255, 255, 0.25)`,
      fillColor: toMapColor(weightedValue),
      fillOpacity: 0.7,
    });
    // poly.bindTooltip(`${region.count} +${region.change}`, {permanent: true, direction:"center"}).openTooltip();
    poly.addTo(map);
    mapPolygons.push(poly);

    // draw map marker
    let size = 22;
    let color = '#dd000077';
    let label = region.count;
    if (mapType === 'count') {
      if (region.count === 0) return;
      size = Math.min(100, 22 + region.count / 30);
      color = `#00000020`;
      label = region.count;
    } else if (mapType === 'countPerCapita') {
      if (region.count === 0) return;
      region.perCapita = region.count / region.population * 100000;
      size = Math.min(100, 22 + region.perCapita / 1.5);
      color = `#00000020`;
      label = Math.round(region.perCapita * 10) / 10;
    } else if (mapType === 'change') {
      if (region.change === 0) return;
      size = Math.min(100, 22 + Math.abs(region.change / 2));
      if (region.change < 0) color = '#00dd0066';
      label = region.change;
    } else if (mapType === 'changePercent') {
      if (region.change === 0) return;
      const percent = Math.min(999, region.change / (region.count - region.change) * 100);
      size = Math.min(100, 22 + Math.pow(Math.abs(percent), 0.5) * 5);
      if (region.change < 0) color = '#00dd0066';
      label = `${Math.round(percent)}<span class="small">%</span>`;
    } else if (mapType === 'forecast') {
      if (region.count === 0) return;
      const history = provincialData[region.region_id] ? provincialDataHistory : wcDataHistory;
      const values = history.map(item => item[region.region_id]);
      if (values[0] === values[2] || values[1] === values[3]) return;
      const multiplier = (values[0]-values[2])/(values[1]-values[3])/2;
      const next = values[0] + ((values[0]-values[2]) * multiplier);
      const percent = (next/values[0]-1) * 100;
      if (Math.round(percent) === 0) return;
      size = Math.min(100, 30 + Math.pow(Math.abs(percent), 1.5) / 3);
      if (percent < 0) color = '#00dd0066';
      label = `${Math.round(percent)}<span class="small">%</span>`;
    } else return;
    size = Math.round(size);
    const icon = L.divIcon({
      iconSize: [0, 0],
      className: 'region-marker',
      html: `
      <div style='
      background-color: ${color};
      line-height: ${size}px;
      min-width: ${size}px;
      height: ${size}px;
      font-size: ${Math.min(150, 30+size*3)}%;
      '>${label}</div>     
      `,
    });

    // find the center of each region
    let polyPoints = [points];
    if (region.map.type === 'MultiPolygon') {
      let largestArea = 0;
      points.forEach(item => {
        const area = getPolygonArea(item);
        if (area > largestArea) {
          largestArea = area;
          polyPoints = [item];
        }
      });
    }
    const position = polylabel(polyPoints);
    
    // place marker
    const marker = L.marker(position, { icon }).addTo(map);
    mapMarkers.push(marker);
  });  
}

function debugMap() {
  console.log('countriesAfrica', countriesAfrica.geometries.length);
  console.log('provincesZa', provincesZa.geometries.length);
  console.log('districtsZa', districtsZa.geometries.length);
  console.log('subdistrictsZa', subdistrictsZa.geometries.length);
  console.log('subdistrictsCpt', subdistrictsCpt.geometries.length);
  countriesAfrica.geometries.forEach((item, index) => {
    let points = [];
    if (item.type === 'Polygon') {
      points = item.coordinates[0].map(point => [point[1], point[0]]);
    } else if (item.type === 'MultiPolygon') {
      points = item.coordinates.map(coordinates => coordinates[0].map(point => [point[1], point[0]]));
    }
    const poly = L.polygon(points, {
      color: `rgba(255, 255, 255, 0.25)`,
      fillColor: 'black',
      fillOpacity: 0.5,
    });
    poly.bindTooltip(`${index}`, {permanent: true, direction:"center"}).openTooltip();
    poly.addTo(map);
  });
}

async function main () {
  bindMapControls();
  createMap();
  await fetchData();
  setMapShapes();
  findCurrentData();
  changeMapType();
  // debugMap();
}