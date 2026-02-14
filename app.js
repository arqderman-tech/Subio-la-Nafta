// URL del CSV en GitHub (raw)
const CSV_URL = 'https://raw.githubusercontent.com/arqderman-tech/Subio-la-Nafta/main/data/historico_precios.csv';

// Variables globales
let allData = [];
let chart = null;

// Utilidades
function formatPrice(price) {
    return new Intl.NumberFormat('es-AR', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
    }).format(price);
}

function formatDate(dateString) {
    const date = new Date(dateString);
    return new Intl.DateTimeFormat('es-AR', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
    }).format(date);
}

function formatDateShort(dateString) {
    const date = new Date(dateString);
    return new Intl.DateTimeFormat('es-AR', {
        day: '2-digit',
        month: 'short'
    }).format(date);
}

// PARSER CORREGIDO: Maneja comas dentro de comillas (GeoJSON) para que no se trabe el loading
function parseCSV(text) {
    const lines = text.trim().split('\n');
    const headers = lines[0].split(',').map(h => h.trim());
    
    const data = [];
    for (let i = 1; i < lines.length; i++) {
        const line = lines[i];
        if (!line.trim()) continue;

        const values = [];
        let current = '';
        let inQuotes = false;

        // Recorre la línea caracter por caracter para ignorar comas dentro de [] o ""
        for (let j = 0; j < line.length; j++) {
            const char = line[j];
            if (char === '"') {
                inQuotes = !inQuotes;
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
            // Limpia comillas y espacios para que parseFloat funcione
            let val = values[index] || "";
            row[header] = val.replace(/^"|"$/g, '').trim();
        });
        
        // Filtro por tu estación
        if (row.empresa && row.empresa.includes('UNITECPROCOM')) {
            data.push(row);
        }
    }
    return data;
}

// Obtener datos
async function fetchData() {
    try {
        const response = await fetch(CSV_URL);
        if (!response.ok) throw new Error('Error al cargar datos');
        const text = await response.text();
        const data = parseCSV(text);
        data.sort((a, b) => new Date(a.fecha_vigencia) - new Date(b.fecha_vigencia));
        return data;
    } catch (error) {
        console.error('Error en fetchData:', error);
        throw error;
    }
}

// Calcular estadísticas
function calculateStats(data) {
    if (!data || data.length === 0) return null;
    const currentData = data[data.length - 1];
    const currentPrice = parseFloat(currentData.precio);
    
    let dailyChange = 0;
    if (data.length > 1) {
        const previousPrice = parseFloat(data[data.length - 2].precio);
        dailyChange = currentPrice - previousPrice;
    }
    
    let monthlyChange = 0;
    let monthlyPercent = 0;
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    const monthlyData = data.filter(d => new Date(d.fecha_vigencia) <= thirtyDaysAgo);
    if (monthlyData.length > 0) {
        const monthlyPrice = parseFloat(monthlyData[monthlyData.length - 1].precio);
        monthlyChange = currentPrice - monthlyPrice;
        monthlyPercent = (monthlyChange / monthlyPrice) * 100;
    }
    
    const prices = data.map(d => parseFloat(d.precio));
    const maxPrice = Math.max(...prices);
    const minPrice = Math.min(...prices);
    const maxData = data.find(d => parseFloat(d.precio) === maxPrice);
    const minData = data.find(d => parseFloat(d.precio) === minPrice);
    
    const firstPrice = parseFloat(data[0].precio);
    const totalChange = currentPrice - firstPrice;
    const totalPercent = (totalChange / firstPrice) * 100;
    
    return {
        current: currentPrice,
        currentDate: currentData.fecha_vigencia,
        location: `${currentData.localidad}, ${currentData.provincia}`,
        dailyChange,
        monthlyChange,
        monthlyPercent,
        maxPrice,
        maxDate: maxData.fecha_vigencia,
        minPrice,
        minDate: minData.fecha_vigencia,
        totalChange,
        totalPercent,
        totalUpdates: data.length
    };
}

// Actualizar UI
function updateUI(stats) {
    document.getElementById('current-price').textContent = formatPrice(stats.current);
    document.getElementById('last-update').textContent = formatDate(stats.currentDate);
    document.getElementById('location').textContent = stats.location;
    
    const dailyDiv = document.getElementById('daily-change');
    const isPosD = stats.dailyChange > 0;
    const iconD = stats.dailyChange === 0 ? '➖' : (isPosD ? '🔺' : '🔻');
    dailyDiv.innerHTML = `<div class="change-amount ${stats.dailyChange === 0 ? 'neutral' : (isPosD ? 'positive' : 'negative')}">
        <span class="trend-icon">${iconD}</span><span>$${formatPrice(Math.abs(stats.dailyChange))}</span>
    </div><div class="change-status">${stats.dailyChange === 0 ? 'Sin cambios' : (isPosD ? 'Subió' : 'Bajó')}</div>`;
    
    const monthlyDiv = document.getElementById('monthly-change');
    const isPosM = stats.monthlyChange > 0;
    monthlyDiv.innerHTML = `<div class="change-amount ${stats.monthlyChange === 0 ? 'neutral' : (isPosM ? 'positive' : 'negative')}">
        <span class="trend-icon">${stats.monthlyChange === 0 ? '➖' : (isPosM ? '🔺' : '🔻')}</span><span>$${formatPrice(Math.abs(stats.monthlyChange))}</span>
    </div><div class="change-percent">${Math.abs(stats.monthlyPercent).toFixed(2)}%</div>`;
    
    document.getElementById('max-price').textContent = `$${formatPrice(stats.maxPrice)}`;
    document.getElementById('max-date').textContent = formatDateShort(stats.maxDate);
    document.getElementById('min-price').textContent = `$${formatPrice(stats.minPrice)}`;
    document.getElementById('min-date').textContent = formatDateShort(stats.minDate);
    
    const totalChangeEl = document.getElementById('total-change');
    totalChangeEl.className = `stat-value ${stats.totalChange >= 0 ? 'positive' : 'negative'}`;
    totalChangeEl.textContent = `${stats.totalChange >= 0 ? '🔺' : '🔻'} $${formatPrice(Math.abs(stats.totalChange))}`;
    document.getElementById('total-change-percent').textContent = `${Math.abs(stats.totalPercent).toFixed(2)}%`;
    document.getElementById('total-updates').textContent = stats.totalUpdates;
}

// Crear gráfico
function createChart(data, period = 30) {
    const canvas = document.getElementById('priceChart');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    let filteredData = data;
    if (period !== 'all') {
        const cutoff = new Date();
        cutoff.setDate(cutoff.getDate() - period);
        filteredData = data.filter(d => new Date(d.fecha_vigencia) >= cutoff);
    }
    const labels = filteredData.map(d => formatDateShort(d.fecha_vigencia));
    const prices = filteredData.map(d => parseFloat(d.precio));
    if (chart) chart.destroy();
    chart = new Chart(ctx, {
        type: 'line',
        data: {
            labels: labels,
            datasets: [{
                label: 'Precio (ARS)',
                data: prices,
                borderColor: '#3b82f6',
                backgroundColor: 'rgba(59, 130, 246, 0.1)',
                borderWidth: 2,
                fill: true,
                tension: 0.4
            }]
        },
        options: { responsive: true, maintainAspectRatio: false }
    });
}

function setupChartControls() {
    document.querySelectorAll('.chart-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.chart-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            createChart(allData, btn.dataset.period === 'all' ? 'all' : parseInt(btn.dataset.period));
        });
    });
}

async function init() {
    const loading = document.getElementById('loading');
    const mainContent = document.getElementById('main-content');
    const error = document.getElementById('error');
    try {
        allData = await fetchData();
        if (allData.length === 0) throw new Error('No se encontraron datos');
        const stats = calculateStats(allData);
        updateUI(stats);
        createChart(allData, 30);
        setupChartControls();
        loading.style.display = 'none';
        mainContent.style.display = 'block';
    } catch (err) {
        loading.style.display = 'none';
        error.style.display = 'block';
        error.innerHTML = `<p>⚠️ Error: ${err.message}</p>`;
    }
}

document.addEventListener('DOMContentLoaded', init);
