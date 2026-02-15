// URL del CSV en GitHub (raw) - VERSION USD
const CSV_URL = 'https://raw.githubusercontent.com/arqderman-tech/Subio-la-Nafta/main/data/historico_precios_usd.csv';

// Variables globales
let allData = [];
let chart = null;

// --- UTILIDADES ---
function formatPrice(price) {
    return new Intl.NumberFormat('en-US', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
    }).format(price);
}

function formatDate(dateString) {
    const dateOnly = dateString.split(' ')[0];
    const date = new Date(dateOnly + 'T12:00:00');
    return new Intl.DateTimeFormat('es-AR', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric'
    }).format(date);
}

function formatDateShort(dateString) {
    const dateOnly = dateString.split(' ')[0];
    const date = new Date(dateOnly + 'T12:00:00');
    return new Intl.DateTimeFormat('es-AR', {
        day: '2-digit',
        month: 'short'
    }).format(date);
}

// --- PARSEAR CSV ---
// Igual al que funciona en pesos, con un fix: reemplaza "" por " antes de parsear
// para que el geojson no rompa el conteo de columnas
function parseCSV(text) {
    // Normalizar comillas dobles escapadas dentro de campos
    // El CSV de USD tiene ""type"" en lugar de "type" dentro del geojson
    const lines = text.trim().split('\n');
    const headers = lines[0].split(',').map(h => h.trim());

    const data = [];
    for (let i = 1; i < lines.length; i++) {
        const line = lines[i];
        if (!line.trim()) continue;

        const values = [];
        let current = '';
        let inQuotes = false;

        for (let j = 0; j < line.length; j++) {
            const char = line[j];
            if (char === '"') {
                // Si el siguiente char también es ", es una comilla escapada dentro del campo
                if (inQuotes && line[j + 1] === '"') {
                    current += '"';
                    j++; // saltamos la segunda comilla
                } else {
                    inQuotes = !inQuotes;
                }
            } else if (char === ',' && !inQuotes) {
                values.push(current.trim());
                current = '';
            } else {
                current += char;
            }
        }
        values.push(current.trim());

        if (values.length < headers.length) continue;

        const row = {};
        headers.forEach((header, index) => {
            let val = values[index] || "";
            row[header] = val.replace(/^"|"$/g, '').trim();
        });

        if (row.empresa && row.empresa.includes('UNITECPROCOM')) {
            data.push(row);
        }
    }
    return data;
}

// --- FETCH DATA ---
async function fetchData() {
    try {
        const response = await fetch(CSV_URL);
        if (!response.ok) throw new Error('Error al cargar datos');
        const text = await response.text();
        const data = parseCSV(text);
        data.sort((a, b) => {
            const dateA = a.fecha_chequeo.split(' ')[0];
            const dateB = b.fecha_chequeo.split(' ')[0];
            return new Date(dateA + 'T12:00:00') - new Date(dateB + 'T12:00:00');
        });
        return data;
    } catch (error) {
        console.error('Error en fetchData:', error);
        throw error;
    }
}

// --- LÓGICA DE CÁLCULOS ---
function calculateStats(data) {
    if (!data || data.length === 0) return null;

    const currentYear = new Date().getFullYear();
    const lastIdx = data.length - 1;
    const currentData = data[lastIdx];
    const currentPrice = parseFloat(currentData.price_usd);

    const dataCurrentYear = data.filter(d => {
        const dateOnly = d.fecha_chequeo.split(' ')[0];
        return new Date(dateOnly + 'T12:00:00').getFullYear() === currentYear;
    });
    const baseDataYear = dataCurrentYear.length > 0 ? dataCurrentYear : data;

    const pricesYear = baseDataYear.map(d => parseFloat(d.price_usd));
    const maxPrice = Math.max(...pricesYear);
    const minPrice = Math.min(...pricesYear);
    const maxData = baseDataYear.find(d => parseFloat(d.price_usd) === maxPrice);
    const minData = baseDataYear.find(d => parseFloat(d.price_usd) === minPrice);
    const firstPriceYear = parseFloat(baseDataYear[0].price_usd);
    const totalChange = currentPrice - firstPriceYear;
    const totalPercent = (totalChange / firstPriceYear) * 100;

    const priceChanges = baseDataYear.filter(d => {
        const variacion = parseFloat(d['%_variacion'] || 0);
        return variacion !== 0.0;
    }).length;

    let dailyChange = 0;
    let dailyPercent = 0;
    if (data.length > 1) {
        const prevPrice = parseFloat(data[lastIdx - 1].price_usd);
        dailyChange = currentPrice - prevPrice;
        dailyPercent = (dailyChange / prevPrice) * 100;
    }

    const dateOnly = currentData.fecha_chequeo.split(' ')[0];
    const dateToday = new Date(dateOnly + 'T12:00:00');
    const targetDate = new Date(dateToday);
    targetDate.setDate(targetDate.getDate() - 30);

    let monthlyBasePrice = parseFloat(data[0].price_usd);
    for (let i = data.length - 1; i >= 0; i--) {
        const checkDateOnly = data[i].fecha_chequeo.split(' ')[0];
        const checkDate = new Date(checkDateOnly + 'T12:00:00');
        if (checkDate <= targetDate) {
            monthlyBasePrice = parseFloat(data[i].price_usd);
            break;
        }
    }
    const monthlyChange = currentPrice - monthlyBasePrice;
    const monthlyPercent = (monthlyChange / monthlyBasePrice) * 100;

    return {
        current: currentPrice,
        currentDate: currentData.fecha_chequeo,
        location: 'GRAN BUENOS AIRES',
        maxPrice,
        maxDate: maxData.fecha_chequeo,
        minPrice,
        minDate: minData.fecha_chequeo,
        totalChange,
        totalPercent,
        dailyChange,
        dailyPercent,
        monthlyChange,
        monthlyPercent,
        totalUpdates: priceChanges,
        year: currentYear
    };
}

// --- ACTUALIZACIÓN DE LA INTERFAZ ---
function updateUI(stats) {
    if (!stats) return;

    document.getElementById('current-price').textContent = formatPrice(stats.current);
    document.getElementById('last-update').textContent = formatDate(stats.currentDate);
    document.getElementById('location').textContent = stats.location;

    const dailyContainer = document.getElementById('daily-change');
    if (dailyContainer) {
        const amountSpan = dailyContainer.querySelector('.change-amount span:last-child');
        const iconSpan = dailyContainer.querySelector('.trend-icon');
        const statusDiv = dailyContainer.querySelector('.change-status');

        const isPos = stats.dailyChange >= 0;
        iconSpan.textContent = isPos ? '🔺' : '🔻';
        amountSpan.textContent = `USD ${formatPrice(Math.abs(stats.dailyChange))}`;
        statusDiv.textContent = `${isPos ? '+' : '-'}${Math.abs(stats.dailyPercent).toFixed(2)}% respecto al último registro`;
        dailyContainer.className = `change-display ${isPos ? 'negative' : 'positive'}`;
    }

    const monthlyContainer = document.getElementById('monthly-change');
    if (monthlyContainer) {
        const amountSpan = monthlyContainer.querySelector('.change-amount span:last-child');
        const iconSpan = monthlyContainer.querySelector('.trend-icon');
        const percentDiv = monthlyContainer.querySelector('.change-percent');

        const isPos = stats.monthlyChange >= 0;
        iconSpan.textContent = isPos ? '🔺' : '🔻';
        amountSpan.textContent = `USD ${formatPrice(Math.abs(stats.monthlyChange))}`;
        percentDiv.textContent = `${isPos ? '+' : '-'}${Math.abs(stats.monthlyPercent).toFixed(2)}% en 30 días (aprox)`;
        monthlyContainer.className = `change-display ${isPos ? 'negative' : 'positive'}`;
    }

    document.getElementById('max-price').textContent = `USD ${formatPrice(stats.maxPrice)}`;
    document.getElementById('max-date').textContent = formatDateShort(stats.maxDate);
    document.getElementById('min-price').textContent = `USD ${formatPrice(stats.minPrice)}`;
    document.getElementById('min-date').textContent = formatDateShort(stats.minDate);

    const totalChangeEl = document.getElementById('total-change');
    totalChangeEl.textContent = `${stats.totalChange >= 0 ? '🔺' : '🔻'} USD ${formatPrice(Math.abs(stats.totalChange))}`;
    document.getElementById('total-change-percent').textContent = `${stats.totalPercent.toFixed(2)}% acumulado en ${stats.year}`;
    document.getElementById('total-updates').textContent = stats.totalUpdates;
}

// --- GRÁFICO ---
function filterDataByPeriod(data, period) {
    if (period === 'all') {
        return data;
    }
    if (period === 'year') {
        const currentYear = new Date().getFullYear();
        return data.filter(d => {
            const dateOnly = d.fecha_chequeo.split(' ')[0];
            return new Date(dateOnly + 'T12:00:00').getFullYear() === currentYear;
        });
    }
    if (period === 30) {
        const lastDateOnly = data[data.length - 1].fecha_chequeo.split(' ')[0];
        const lastDate = new Date(lastDateOnly + 'T12:00:00');
        const cutoff = new Date(lastDate);
        cutoff.setDate(cutoff.getDate() - 30);
        return data.filter(d => {
            const dateOnly = d.fecha_chequeo.split(' ')[0];
            return new Date(dateOnly + 'T12:00:00') >= cutoff;
        });
    }
    return data;
}

function createChart(data, period = 30) {
    const canvas = document.getElementById('priceChart');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');

    const filteredData = filterDataByPeriod(data, period);
    const labels = filteredData.map(d => formatDateShort(d.fecha_chequeo));
    const prices = filteredData.map(d => parseFloat(d.price_usd));

    if (chart) chart.destroy();
    chart = new Chart(ctx, {
        type: 'line',
        data: {
            labels: labels,
            datasets: [{
                label: 'Precio (USD)',
                data: prices,
                borderColor: '#3b82f6',
                backgroundColor: 'rgba(59, 130, 246, 0.1)',
                borderWidth: 2,
                fill: true,
                tension: 0.1
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: { legend: { display: false } },
            scales: {
                y: {
                    ticks: { callback: (value) => `USD ${value.toFixed(2)}` }
                }
            }
        }
    });
}

function setupChartControls() {
    document.querySelectorAll('.chart-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.chart-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');

            const raw = btn.dataset.period;
            let period;
            if (raw === 'all')       period = 'all';
            else if (raw === 'year') period = 'year';
            else                     period = parseInt(raw);

            createChart(allData, period);
        });
    });
}

// --- INICIALIZACIÓN ---
async function init() {
    const loading = document.getElementById('loading');
    const mainContent = document.getElementById('main-content');
    const error = document.getElementById('error');

    try {
        allData = await fetchData();
        if (allData.length === 0) throw new Error('No se encontraron datos de la empresa');

        const stats = calculateStats(allData);
        updateUI(stats);
        createChart(allData, 30);
        setupChartControls();

        if (loading) loading.style.display = 'none';
        if (mainContent) mainContent.style.display = 'block';
    } catch (err) {
        console.error(err);
        if (loading) loading.style.display = 'none';
        if (error) {
            error.style.display = 'block';
            error.querySelector('p').textContent = `⚠️ Error: ${err.message}`;
        }
    }
}

document.addEventListener('DOMContentLoaded', init);
