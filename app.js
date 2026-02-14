// URL del CSV en GitHub (raw)
const CSV_URL = 'https://raw.githubusercontent.com/arqderman-tech/Subio-la-Nafta/main/data/historico_precios.csv';

// Variables globales
let allData = [];
let chart = null;

// --- UTILIDADES ---
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

// --- PARSEAR CSV ---
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
        // Ordenar por fecha de chequeo
        data.sort((a, b) => new Date(a.fecha_chequeo) - new Date(b.fecha_chequeo));
        return data;
    } catch (error) {
        console.error('Error en fetchData:', error);
        throw error;
    }
}

// --- LÓGICA DE CÁLCULOS (ANUAL, DIARIO Y MENSUAL) ---
function calculateStats(data) {
    if (!data || data.length === 0) return null;

    const currentYear = new Date().getFullYear();
    const lastIdx = data.length - 1;
    const currentData = data[lastIdx];
    const currentPrice = parseFloat(currentData.precio);

    // 1. Filtrar datos del año actual para Máx/Mín/Total Anual
    const dataCurrentYear = data.filter(d => {
        const date = new Date(d.fecha_chequeo);
        return date.getFullYear() === currentYear;
    });
    const baseData = dataCurrentYear.length > 0 ? dataCurrentYear : data;

    // --- CÁLCULOS ANUALES (Lo que ya funcionaba) ---
    const prices = baseData.map(d => parseFloat(d.precio));
    const maxPrice = Math.max(...prices);
    const minPrice = Math.min(...prices);
    const maxData = baseData.find(d => parseFloat(d.precio) === maxPrice);
    const minData = baseData.find(d => parseFloat(d.precio) === minPrice);
    const firstPriceYear = parseFloat(baseData[0].precio);
    const totalChange = currentPrice - firstPriceYear;
    const totalPercent = (totalChange / firstPriceYear) * 100;

    // --- CÁLCULO VARIACIÓN DIARIA (CORRECCIÓN) ---
    let dailyChange = 0;
    let dailyPercent = 0;
    if (data.length > 1) {
        const prevPrice = parseFloat(data[lastIdx - 1].precio);
        dailyChange = currentPrice - prevPrice;
        dailyPercent = (dailyChange / prevPrice) * 100;
    }

    // --- CÁLCULO VARIACIÓN MENSUAL (CORRECCIÓN) ---
    const dateToday = new Date(currentData.fecha_chequeo);
    const thirtyDaysAgo = new Date(dateToday);
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    
    // Buscamos el precio más antiguo dentro de los últimos 30 días
    const price30DaysAgoData = data.find(d => new Date(d.fecha_chequeo) >= thirtyDaysAgo);
    let monthlyChange = 0;
    let monthlyPercent = 0;
    if (price30DaysAgoData) {
        const oldPrice = parseFloat(price30DaysAgoData.precio);
        monthlyChange = currentPrice - oldPrice;
        monthlyPercent = (monthlyChange / oldPrice) * 100;
    }

    return {
        current: currentPrice,
        currentDate: currentData.fecha_chequeo,
        location: `${currentData.localidad}, ${currentData.provincia}`,
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
        totalUpdates: baseData.length,
        year: currentYear
    };
}

// --- ACTUALIZACIÓN DE LA INTERFAZ ---
function updateUI(stats) {
    if (!stats) return;

    // Actualizar Títulos de los cuadros según el año
    const labels = document.querySelectorAll('.stat-label'); 
    if (labels.length >= 3) {
        labels[0].textContent = `VALOR MÁXIMO DEL ${stats.year}`;
        labels[1].textContent = `VALOR MÍNIMO DEL ${stats.year}`;
        labels[2].textContent = `VARIACIÓN TOTAL EN EL ${stats.year}`;
    }

    // Cuadros Principales Anuales
    document.getElementById('current-price').textContent = formatPrice(stats.current);
    document.getElementById('last-update').textContent = formatDate(stats.currentDate);
    document.getElementById('location').textContent = stats.location;
    
    document.getElementById('max-price').textContent = `$${formatPrice(stats.maxPrice)}`;
    document.getElementById('max-date').textContent = formatDateShort(stats.maxDate);
    
    document.getElementById('min-price').textContent = `$${formatPrice(stats.minPrice)}`;
    document.getElementById('min-date').textContent = formatDateShort(stats.minDate);
    
    const totalChangeEl = document.getElementById('total-change');
    const isPosT = stats.totalChange >= 0;
    totalChangeEl.className = `stat-value ${isPosT ? 'negative' : 'positive'}`;
    totalChangeEl.textContent = `${isPosT ? '🔺' : '🔻'} $${formatPrice(Math.abs(stats.totalChange))}`;
    document.getElementById('total-change-percent').textContent = `${Math.abs(stats.totalPercent).toFixed(2)}%`;
    
    document.getElementById('total-updates').textContent = stats.totalUpdates;

    // NUEVO: VARIACIÓN DIARIA
    const dailyValEl = document.getElementById('daily-val');
    const dailyPercEl = document.getElementById('daily-perc');
    if (dailyValEl) {
        const isPosD = stats.dailyChange >= 0;
        dailyValEl.className = `stat-value ${isPosD ? 'negative' : 'positive'}`;
        dailyValEl.textContent = `${isPosD ? '🔺' : '🔻'} $${formatPrice(Math.abs(stats.dailyChange))}`;
        dailyPercEl.textContent = `${Math.abs(stats.dailyPercent).toFixed(2)}%`;
    }

    // NUEVO: VARIACIÓN MENSUAL
    const monthlyValEl = document.getElementById('monthly-val');
    const monthlyPercEl = document.getElementById('monthly-perc');
    if (monthlyValEl) {
        const isPosM = stats.monthlyChange >= 0;
        monthlyValEl.className = `stat-value ${isPosM ? 'negative' : 'positive'}`;
        monthlyValEl.textContent = `${isPosM ? '🔺' : '🔻'} $${formatPrice(Math.abs(stats.monthlyChange))}`;
        monthlyPercEl.textContent = `${Math.abs(stats.monthlyPercent).toFixed(2)}%`;
    }
}

// --- GRÁFICO ---
function createChart(data, period = 30) {
    const canvas = document.getElementById('priceChart');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    
    let filteredData = data;
    if (period !== 'all') {
        const cutoff = new Date();
        cutoff.setDate(cutoff.getDate() - period);
        filteredData = data.filter(d => new Date(d.fecha_chequeo) >= cutoff);
    }
    
    const labels = filteredData.map(d => formatDateShort(d.fecha_chequeo));
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
                tension: 0.1
            }]
        },
        options: { 
            responsive: true, 
            maintainAspectRatio: false,
            scales: {
                x: { ticks: { autoSkip: true, maxTicksLimit: 10 } },
                y: { ticks: { callback: (value) => `$${formatPrice(value)}` } }
            },
            plugins: {
                legend: { display: false }
            }
        }
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

// --- INICIALIZACIÓN ---
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
        if(loading) loading.style.display = 'none';
        if(mainContent) mainContent.style.display = 'block';
    } catch (err) {
        if(loading) loading.style.display = 'none';
        if(error) {
            error.style.display = 'block';
            error.innerHTML = `<p>⚠️ Error: ${err.message}</p>`;
        }
    }
}

document.addEventListener('DOMContentLoaded', init);
