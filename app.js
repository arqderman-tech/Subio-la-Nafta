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

// Parsear CSV - CORREGIDO PARA SOPORTAR GEOJSON Y COMILLAS
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

        // Lógica para no romper el CSV con las comas del GeoJSON
        for (let j = 0; j < line.length; j++) {
            const char = line[j];
            if (char === '"') {
                if (inQuotes && line[j+1] === '"') {
                    current += '"';
                    j++;
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
            // Limpiamos comillas sobrantes para que parseFloat no de NaN
            let val = values[index] || "";
            row[header] = val.replace(/^"|"$/g, '').trim();
        });
        
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
        
        // Ordenar por fecha
        data.sort((a, b) => new Date(a.fecha_vigencia) - new Date(b.fecha_vigencia));
        
        return data;
    } catch (error) {
        console.error('Error:', error);
        throw error;
    }
}

// Calcular estadísticas
function calculateStats(data) {
    if (!data || data.length === 0) return null;
    
    const currentData = data[data.length - 1];
    const currentPrice = parseFloat(currentData.precio);
    
    // Variación diaria
    let dailyChange = null;
    if (data.length > 1) {
        const previousPrice = parseFloat(data[data.length - 2].precio);
        dailyChange = currentPrice - previousPrice;
    }
    
    // Variación mensual (30 días atrás)
    let monthlyChange = null;
    let monthlyPercent = null;
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    
    const monthlyData = data.filter(d => new Date(d.fecha_vigencia) <= thirtyDaysAgo);
    if (monthlyData.length > 0) {
        const monthlyPrice = parseFloat(monthlyData[monthlyData.length - 1].precio);
        monthlyChange = currentPrice - monthlyPrice;
        monthlyPercent = (monthlyChange / monthlyPrice) * 100;
    }
    
    // Máximo y mínimo
    const prices = data.map(d => parseFloat(d.precio));
    const maxPrice = Math.max(...prices);
    const minPrice = Math.min(...prices);
    
    const maxData = data.find(d => parseFloat(d.precio) === maxPrice);
    const minData = data.find(d => parseFloat(d.precio) === minPrice);
    
    // Variación total
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
    if (stats.dailyChange !== null) {
        const isPositive = stats.dailyChange > 0;
        const isNeutral = stats.dailyChange === 0;
        const className = isNeutral ? 'neutral' : (isPositive ? 'positive' : 'negative');
        const icon = isNeutral ? '➖' : (isPositive ? '🔺' : '🔻');
        const status = isNeutral ? 'Sin cambios' : (isPositive ? 'Subió' : 'Bajó');
        
        dailyDiv.innerHTML = `
            <div class="change-amount ${className}">
                <span class="trend-icon">${icon}</span>
                <span>$${formatPrice(Math.abs(stats.dailyChange))}</span>
            </div>
            <div class="change-status">${status}</div>
        `;
    }
    
    const monthlyDiv = document.getElementById('monthly-change');
    if (stats.monthlyChange !== null) {
        const isPositive = stats.monthlyChange > 0;
        const isNeutral = stats.monthlyChange === 0;
        const className = isNeutral ? 'neutral' : (isPositive ? 'positive' : 'negative');
        const icon = isNeutral ? '➖' : (isPositive ? '🔺' : '🔻');
        
        monthlyDiv.innerHTML = `
            <div class="change-amount ${className}">
                <span class="trend-icon">${icon}</span>
                <span>$${formatPrice(Math.abs(stats.monthlyChange))}</span>
            </div>
            <div class="change-percent">${icon} ${Math.abs(stats.monthlyPercent).toFixed(2)}%</div>
        `;
    }
    
    document.getElementById('max-price').textContent = `$${formatPrice(stats.maxPrice)}`;
    document.getElementById('max-date').textContent = formatDateShort(stats.maxDate);
    document.getElementById('min-price').textContent = `$${formatPrice(stats.minPrice)}`;
    document.getElementById('min-date').textContent = formatDateShort(stats.minDate);
    
    const totalChangeEl = document.getElementById('total-change');
    const isPositiveTotal = stats.totalChange > 0;
    const iconTotal = isPositiveTotal ? '🔺' : '🔻';
    const classTotal = isPositiveTotal ? 'positive' : 'negative';
    totalChangeEl.className = `stat-value ${classTotal}`;
    totalChangeEl.textContent = `${iconTotal} $${formatPrice(Math.abs(stats.totalChange))}`;
    document.getElementById('total-change-percent').textContent = `${iconTotal} ${Math.abs(stats.totalPercent).toFixed(2)}%`;
    
    document.getElementById('total-updates').textContent = stats.totalUpdates;
}

// Crear gráfico
function createChart(data, period = 30) {
    const ctx = document.getElementById('priceChart').getContext('2d');
    
    let filteredData = data;
    if (period !== 'all') {
        const cutoffDate = new Date();
        cutoffDate.setDate(cutoffDate.getDate() - period);
        filteredData = data.filter(d => new Date(d.fecha_vigencia) >= cutoffDate);
    }
    
    const labels = filteredData.map(d => formatDateShort(d.fecha_vigencia));
    const prices = filteredData.map(d => parseFloat(d.precio));
    
    if (chart) {
        chart.destroy();
    }
    
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
                tension: 0.4,
                pointRadius: 3,
                pointHoverRadius: 5,
                pointBackgroundColor: '#3b82f6',
                pointBorderColor: '#fff',
                pointBorderWidth: 2
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { display: false },
                tooltip: {
                    mode: 'index',
                    intersect: false,
                    callbacks: {
                        label: function(context) {
                            return `$${formatPrice(context.parsed.y)}`;
                        }
                    }
                }
            },
            scales: {
                y: {
                    beginAtZero: false,
                    ticks: {
                        callback: function(value) { return `$${formatPrice(value)}`; }
                    }
                }
            }
        }
    });
}

// Controles de período
function setupChartControls() {
    const buttons = document.querySelectorAll('.chart-btn');
    buttons.forEach(btn => {
        btn.addEventListener('click', () => {
            buttons.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            const period = btn.dataset.period;
            createChart(allData, period === 'all' ? 'all' : parseInt(period));
        });
    });
}

// Inicializar
async function init() {
    const loading = document.getElementById('loading');
    const error = document.getElementById('error');
    const mainContent = document.getElementById('main-content');
    
    try {
        loading.style.display = 'block';
        error.style.display = 'none';
        mainContent.style.display = 'none';
        
        allData = await fetchData();
        
        if (allData.length === 0) throw new Error('No hay datos disponibles');
        
        const stats = calculateStats(allData);
        updateUI(stats);
        createChart(allData, 30);
        setupChartControls();
        
        loading.style.display = 'none';
        mainContent.style.display = 'block';
        
    } catch (err) {
        console.error('Error:', err);
        loading.style.display = 'none';
        error.style.display = 'block';
        error.innerHTML = `<p>⚠️ Error al cargar los datos: ${err.message}</p>`;
    }
}

// Ejecutar
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
} else {
    init();
}

// Recargar cada 5 minutos
setInterval(init, 5 * 60 * 1000);
