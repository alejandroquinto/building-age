const mapboxAccessToken = 'pk.eyJ1IjoiYWxlamFuZHJvcXVpbnRvIiwiYSI6ImNseDZxbGFpcjE1ZHMyanNjZWg1eDIzejkifQ.VYiLvOBYgX5WwchhqO0I8w';

// Get the selected city from URL parameters
const urlParams = new URLSearchParams(window.location.search);
const city = urlParams.get('city') || 'gandia'; // Default to Gandia if no city is provided

// Initialize the map and set its view to the selected city
const cityCoordinates = {
    'gandia': [38.9673, -0.1819],
    'crevillente': [38.2496, -0.8127],
    'valencia': [39.4699, -0.3763],
    'benidorm': [38.5411, -0.1225],
    'elche': [38.2669, -0.6984],
    'alcoy': [38.7054, -0.4743],
    'coruna': [43.3623, -8.4115]  // Coordinates for A Coruña
};

const cityDataFiles = {
    'gandia': 'building-gandia.geojson',
    'crevillente': 'building-crevillente.geojson',
    'valencia': 'building-valencia.geojson',
    'benidorm': 'building-benidorm.geojson',
    'elche': 'building-elche.geojson',
    'alcoy': 'building-alcoy.geojson',
    'coruna': 'building-coruna.geojson'  // Add the A Coruña GeoJSON file reference
};

const map = L.map('map').setView(cityCoordinates[city], 14);

// Add a darker Mapbox tile layer to the map
L.tileLayer('https://api.mapbox.com/styles/v1/mapbox/dark-v10/tiles/{z}/{x}/{y}?access_token=' + mapboxAccessToken, {
    maxZoom: 19,
    attribution: '&copy; <a href="https://www.mapbox.com/">Mapbox</a> contributors',
    tileSize: 512,
    zoomOffset: -1
}).addTo(map);

let buildingLayer;

function extractYear(beginning) {
    const yearMatch = beginning.match(/\b(19|20)\d{2}\b/);
    return yearMatch ? parseInt(yearMatch[0]) : null;
}

function getColor(year) {
    if (year >= 2000) return '#A3D69A';
    else if (year >= 1980) return '#A7BC8A';
    else if (year >= 1960) return '#ABA27B';
    else if (year >= 1940) return '#AE876B';
    else return '#B26D5B';
}

const ctx = document.getElementById('buildingsChart').getContext('2d');
const buildingsChart = new Chart(ctx, {
    type: 'bar',
    data: {
        labels: [],
        datasets: [{
            data: [],
            backgroundColor: [], // Initialize with empty, to be updated dynamically
            borderColor: '#808080',
            borderWidth: 1
        }]
    },
    options: {
        indexAxis: 'y',  // Horizontal bars
        plugins: {
            legend: { display: false }
        },
        scales: {
            x: {
                beginAtZero: true,
                title: { display: true, text: 'Number of Buildings', color: '#ffffff' },
                grid: { display: false },
                ticks: {
                    font: { family: 'Inter', weight: '600' },
                    color: '#ffffff'
                }
            },
            y: {
                beginAtZero: true,
                title: { display: true, text: 'Years', padding: { top: 0, bottom: 30 }, color: '#ffffff' },
                grid: { display: false },
                ticks: {
                    font: { family: 'Inter', weight: '600' },
                    color: '#ffffff'
                }
            }
        },
        animation: { duration: 800 }
    }
});

function updateChart(buildingCounts) {
    const years = Object.keys(buildingCounts).sort((a, b) => a - b);
    const counts = years.map(year => buildingCounts[year]);
    const colors = years.map(year => getColor(parseInt(year)));

    buildingsChart.data.labels = years;
    buildingsChart.data.datasets[0].data = counts;
    buildingsChart.data.datasets[0].backgroundColor = colors;
    buildingsChart.update();

    const totalBuildings = counts.reduce((sum, count) => sum + count, 0);
    document.getElementById('total-buildings').innerText = `Total Buildings: ${totalBuildings}`;

    const totalYears = years.reduce((sum, year, index) => sum + (year * counts[index]), 0);
    const averageYear = (totalBuildings > 0) ? Math.round(totalYears / totalBuildings) : 0;
    document.getElementById('average-year').innerText = `Average Year: ${averageYear}`;
}

function loadBuildingsByYearRange(minYear, maxYear) {
    const dataFile = cityDataFiles[city];

    fetch(dataFile)
        .then(response => response.json())
        .then(data => {
            if (!data.features || data.features.length === 0) return;

            if (buildingLayer) {
                map.removeLayer(buildingLayer);
            }

            const buildingCounts = {};

            const filteredData = {
                ...data,
                features: data.features.filter(feature => {
                    const constructionYear = extractYear(feature.properties.beginning);
                    if (constructionYear >= minYear && constructionYear <= maxYear) {
                        buildingCounts[constructionYear] = (buildingCounts[constructionYear] || 0) + 1;
                        return true;
                    }
                    return false;
                })
            };

            buildingLayer = L.geoJSON(filteredData, {
                style: function(feature) {
                    const year = extractYear(feature.properties.beginning);
                    return {
                        color: getColor(year),
                        weight: 1,
                        fillOpacity: 0.5
                    };
                },
                onEachFeature: function(feature, layer) {
                    const year = extractYear(feature.properties.beginning);
                    layer.bindPopup(`Building Age: ${year}`);
                }
            }).addTo(map);

            updateChart(buildingCounts);
        })
        .catch(error => console.error('Error loading GeoJSON data:', error));
}

loadBuildingsByYearRange(1900, 2024);

const yearSliderMin = document.getElementById('year-slider-min');
const yearSliderMax = document.getElementById('year-slider-max');
const yearRangeDisplay = document.getElementById('year-range');

function updateYearRange() {
    const minYear = parseInt(yearSliderMin.value);
    const maxYear = parseInt(yearSliderMax.value);
    yearRangeDisplay.innerText = `${minYear} - ${maxYear}`;
    loadBuildingsByYearRange(minYear, maxYear);
}

yearSliderMin.addEventListener('input', updateYearRange);
yearSliderMax.addEventListener('input', updateYearRange);
