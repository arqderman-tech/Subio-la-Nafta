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
        // Ordenar cronológicamente
        data.sort((a, b) => new Date(a.fecha_chequeo) - new Date(b.fecha_chequeo));
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
    const currentPrice = parseFloat(currentData.precio);

    // Filtrar datos del año actual para estadísticas anuales
    const dataCurrentYear = data.filter(d => new Date(d.fecha_chequeo).getFullYear() === currentYear);
    const baseDataYear = dataCurrentYear.length > 0 ? dataCurrentYear : data;

    // --- CÁLCULOS ANUALES (Cuadros de abajo) ---
    const pricesYear = baseDataYear.map(d => parseFloat(d.precio));
    const maxPrice = Math.max(...pricesYear);
    const minPrice = Math.min(...pricesYear);
    const maxData = baseDataYear.find(d => parseFloat(d.precio) === maxPrice);
    const minData = baseDataYear.find(d => parseFloat(d.precio) === minPrice);
    const firstPriceYear = parseFloat(baseDataYear[0].precio);
    const totalChange = currentPrice - firstPriceYear;
    const totalPercent = (totalChange / firstPriceYear) * 100;

    // --- VARIACIÓN DIARIA (Contra el registro inmediato anterior) ---
    let dailyChange = 0;
    let dailyPercent = 0;
    if (data.length > 1) {
        const prevPrice = parseFloat(data[lastIdx - 1].precio);
        dailyChange = currentPrice - prevPrice;
        dailyPercent = (dailyChange / prevPrice) * 100;
    }

    // --- VARIACIÓN MENSUAL (30 días o inmediata anterior) ---
    const dateToday = new Date(currentData.fecha_chequeo);
    const targetDate = new Date(dateToday);
    targetDate.setDate(targetDate.getDate() - 30);

    let monthlyBasePrice = parseFloat(data[0].precio); // Por defecto el primero
    // Buscamos de atrás para adelante el registro más cercano a hace 30 días
    for (let i = data.length - 1; i >= 0; i--) {
        if (new Date(data[i].fecha_chequeo) <= targetDate) {
            monthlyBasePrice = parseFloat(data[i].precio);
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
        totalUpdates: baseDataYear.length,
        year: currentYear
    };
}

// --- ACTUALIZACIÓN DE LA INTERFAZ ---
function updateUI(stats) {
    if (!stats) return;

    // 1. Precio Principal
    document.getElementById('current-price').textContent = formatPrice(stats.current);
    document.getElementById('last-update').textContent = formatDate(stats.currentDate);
    document.getElementById('location').textContent = stats.location;

    // 2. VARIACIÓN DIARIA (Mapeo preciso al HTML)
    const dailyContainer = document.getElementById('daily-change');
    if (dailyContainer) {
        const amountSpan = dailyContainer.querySelector('.change-amount span:last-child');
        const iconSpan = dailyContainer.querySelector('.trend-icon');
        const statusDiv = dailyContainer.querySelector('.change-status');
        
        const isPos = stats.dailyChange >= 0;
        iconSpan.textContent = isPos ? '🔺' : '🔻';
        amountSpan.textContent = `$${formatPrice(Math.abs(stats.dailyChange))}`;
        statusDiv.textContent = `${isPos ? '+' : '-'}${Math.abs(stats.dailyPercent).toFixed(2)}% respecto al último registro`;
        dailyContainer.className = `change-display ${isPos ? 'negative' : 'positive'}`;
    }

    // 3. VARIACIÓN MENSUAL (Mapeo preciso al HTML)
    const monthlyContainer = document.getElementById('monthly-change');
    if (monthlyContainer) {
        const amountSpan = monthlyContainer.querySelector('.change-amount span:last-child');
        const iconSpan = monthlyContainer.querySelector('.trend-icon');
        const percentDiv = monthlyContainer.querySelector('.change-percent');
        
        const isPos = stats.monthlyChange >= 0;
        iconSpan.textContent = isPos ? '🔺' : '🔻';
        amountSpan.textContent = `$${formatPrice(Math.abs(stats.monthlyChange))}`;
        percentDiv.textContent = `${isPos ? '+' : '-'}${Math.abs(stats.monthlyPercent).toFixed(2)}% en 30 días (aprox)`;
        monthlyContainer.className = `change-display ${isPos ? 'negative' : 'positive'}`;
    }

    // 4. Estadísticas de abajo
    document.getElementById('max-price').textContent = `$${formatPrice(stats.maxPrice)}`;
    document.getElementById('max-date').textContent = formatDateShort(stats.maxDate);
    document.getElementById('min-price').textContent = `$${formatPrice(stats.minPrice)}`;
    document.getElementById('min-date').textContent = formatDateShort(stats.minDate);
    
    const totalChangeEl = document.getElementById('total-change');
    totalChangeEl.textContent = `${stats.totalChange >= 0 ? '🔺' : '🔻'} $${formatPrice(Math.abs(stats.totalChange))}`;
    document.getElementById('total-change-percent').textContent = `${stats.totalPercent.toFixed(2)}% acumulado en ${stats.year}`;
    document.getElementById('total-updates').textContent = stats.totalUpdates;
}

// --- GRÁFICO ---
function createChart(data, period = 30) {
    const canvas = document.getElementById('priceChart');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    
    let filteredData = data;
    if (period !== 'all') {
        // Usar la fecha del último registro disponible en lugar de la fecha actual
        const lastDate = new Date(data[data.length - 1].fecha_chequeo);
        const cutoff = new Date(lastDate);
        cutoff.setDate(cutoff.getDate() - period);
        
        // Log para debug (podés eliminarlo después)
        console.log('Último registro:', lastDate);
        console.log('Cutoff:', cutoff);
        console.log('Total de registros antes de filtrar:', data.length);
        
        filteredData = data.filter(d => {
            const fecha = new Date(d.fecha_chequeo);
            return fecha >= cutoff;
        });
        
        console.log('Total de registros después de filtrar:', filteredData.length);
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
            plugins: { legend: { display: false } },
            scales: {
                y: { 
                    ticks: { callback: (value) => `$${value}` }
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
            const period = btn.dataset.period === 'all' ? 'all' : parseInt(btn.dataset.period);
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
        
        if(loading) loading.style.display = 'none';
        if(mainContent) mainContent.style.display = 'block';
    } catch (err) {
        console.error(err);
        if(loading) loading.style.display = 'none';
        if(error) {
            error.style.display = 'block';
            error.querySelector('p').textContent = `⚠️ Error: ${err.message}`;
        }
    }
}

document.addEventListener('DOMContentLoaded', init);
