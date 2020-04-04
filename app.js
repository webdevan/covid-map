main();

const mapType = 'count';

function fetchCsv(url) {
  return fetch(url)
  .then(res => res.text())
  .then(res => res.split('\n'))
  .then(res => res.map(item => item.split(',')))
  .then(res => {
    const headings = res.shift();
    return res.map(values => headings.reduce((item, key, index) => {
      item[key] = isNaN(values[index]) ? values[index] : +values[index];
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
    fetchCsv('/data/areas_za.csv'),
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
    areas,
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
    if (!infections.some(item => typeof item[date] !== 'number')) date = null;
  };
  if (!date) return alert('Oops. Incomplete data set!');
  const lastDate = columns.pop();
  console.log(date);
  const dateString = new Intl.DateTimeFormat('en-ZA', { month: 'long', day: 'numeric', year: 'numeric' })
  .format(new Date(date));
  if (mapType === 'change') {
    document.querySelector('.map-title').innerHTML = `New Covid-19 infections in South Africa on ${dateString}`;
  } else if (mapType === 'count') {
    document.querySelector('.map-title').innerHTML = `All Covid-19 infections in South Africa on ${dateString}`;
  }

  areas.forEach(area => {

    // assign infections stats
    areaData = infections.find(item => item.area_id === area.area_id);
    area.count = areaData[date];
    area.change = areaData[date] - areaData[lastDate];

    // assign map polygon
    const maps = {
      map_provinces_za: provincesZa,
      map_subdistricts_za: subdistrictsZa,
      map_subdistricts_cpt: subdistrictsCpt,
    };
    if (['WC', 'CPT'].includes(area.area_id)) return;
    if (maps[area.map_file]) area.map = maps[area.map_file].geometries[area.map_index];
    if (!area.map) return;

    // draw map polygon
    // const weightedCount = area.count;
    // const weightedCount = area.count / area.population * 1000000;
    const weightedCount = Math.pow(area.count / area.area, 0.75) * 1000;
    const opacity = 0.1 * Math.sqrt(weightedCount) / 2;
    let points = [];
    if (area.map.type === 'Polygon') {
      points = area.map.coordinates[0].map(point => [point[1], point[0]]);
    } else if (area.map.type === 'MultiPolygon') {
      points = area.map.coordinates.map(coordinates => coordinates[0].map(point => [point[1], point[0]]));
    }
    const poly = L.polygon(points, {
      color: '#cccccc44',
      fillColor: '#000000ff',
      fillOpacity: opacity,
    });
    // poly.bindTooltip(`${area.count} +${area.change}`, {permanent: true, direction:"center"}).openTooltip();
    poly.addTo(map);

    // draw map marker
    let label = area.count;
    let size = 30;
    if (mapType === 'count') {
      if (area.count === 0) return;
      label = area.count;
      size += area.count / 10;
    } else if (mapType === 'change') {
      if (area.change === 0) return;
      label = `${area.change > 0 ? '+' : '-'}${area.change}`;
      size += Math.pow(area.change, 1.75) / 2;
    } else return;
    const icon = L.divIcon({
      className: 'custom-div-icon',
      html: `
      <div style='
      color: #ffffff;
      background-color: #ff000066;
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