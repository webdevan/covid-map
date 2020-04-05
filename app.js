main();

// const mapType = 'count';
// const mapType = 'change';
const mapType = 'percentageChange';

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
    fetchCsv('/data/infections_timeline_za.csv'),
    fetchJson('/data/map_provinces_za.json'),
    fetchJson('/data/map_subdistricts_za.json'),
    fetchJson('/data/map_subdistricts_cpt.json'),
  ])
  .catch(err => {
    alert('Oops! Something is wrong.');
    console.error(err);
  });
}

function createMap() {
  const map = L.map('map', {
    center: [-28.806460, 24.936116],
    zoom: 6,
    minZoom: 5,
    maxZoom: 11,
    attributionControl: false,
  });
  const tiles = new L.tileLayer('https://cartodb-basemaps-{s}.global.ssl.fastly.net/light_all/{z}/{x}/{y}.png').addTo(map);
  return map;
}

async function main () {
  const map = createMap();

  const data = await fetchData();

  // processData
  const [
    regions,
    infections,
    provincesZa,
    subdistrictsZa,
    subdistrictsCpt,
  ] = data;

  // determine latest data dates
  const columns = Object.keys(infections[0]);
  let date;
  while (!date && columns.length) {
    date = columns.pop();
    if (infections.some(item => typeof item[date] !== 'number')) date = null;
  };
  if (!date) return alert('Oops. Invalid data set!');
  const lastDate = columns.pop();
  const dateString = new Intl.DateTimeFormat('en-ZA', { month: 'long', day: 'numeric', year: 'numeric' }).format(new Date(date));
  if (mapType === 'count') {
    document.querySelector('.map-title').innerHTML = `All cases in South Africa (${dateString})`;
  } else if (mapType === 'change') {
    document.querySelector('.map-title').innerHTML = `Increase in cases in South Africa (${dateString})`;
  } else if (mapType === 'percentageChange') {
    document.querySelector('.map-title').innerHTML = `Increase in cases in South Africa (${dateString})`;
  }

  regions.forEach(region => {

    // assign infections stats
    regionData = infections.find(item => item.region_id === region.region_id);
    region.count = regionData[date];
    region.change = regionData[date] - regionData[lastDate];

    // assign map polygon
    const maps = {
      map_provinces_za: provincesZa,
      map_subdistricts_za: subdistrictsZa,
      map_subdistricts_cpt: subdistrictsCpt,
    };
    if (['WC', 'CPT'].includes(region.region_id)) return;
    if (maps[region.map_file]) region.map = maps[region.map_file].geometries[region.map_index];
    if (!region.map) return;

    // draw map polygon
    // const weightedCount = region.count;
    const weightedCount = region.count / region.population * 1000000;
    // const weightedCount = region.count / region.area * 1000;
    // const weightedCount = Math.pow(region.count / region.area, 0.75) * 1000;
    const opacity = 0.1 * Math.sqrt(weightedCount) / 2;
    let points = [];
    if (region.map.type === 'Polygon') {
      points = region.map.coordinates[0].map(point => [point[1], point[0]]);
    } else if (region.map.type === 'MultiPolygon') {
      points = region.map.coordinates.map(coordinates => coordinates[0].map(point => [point[1], point[0]]));
    }
    const poly = L.polygon(points, {
      color: '#cccccc44',
      fillColor: '#000000ff',
      fillOpacity: opacity,
    });
    // poly.bindTooltip(`${region.count} +${region.change}`, {permanent: true, direction:"center"}).openTooltip();
    poly.addTo(map);

    // draw map marker
    let size = 22;
    let color = '#ff000066';
    let label = region.count;
    if (mapType === 'count') {
      if (region.count === 0) return;
      size = 30 + region.count / 10;
      label = region.count;
    } else if (mapType === 'change') {
      if (region.change === 0) return;
      size = 30 + Math.pow(Math.abs(region.change), 1.5) / 3;
      if (region.change < 0) color = '#00ff0066';
      label = `${region.change > 0 ? '+' : ''}${region.change}`;
    } else if (mapType === 'percentageChange') {
      if (region.change === 0) return;
      size = 50 + Math.pow(Math.abs(region.change), 1.5) / 3;
      if (region.change < 0) color = '#00ff0066';
      const percent = region.change / (region.count - region.change) * 100;
      label = `${region.change > 0 ? '+' : ''}${Math.round(percent)}%`;
    } else return;
    const icon = L.divIcon({
      className: 'custom-div-icon',
      html: `
      <div style='
      color: #ffffff;
      background-color: ${color};
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
  });
}