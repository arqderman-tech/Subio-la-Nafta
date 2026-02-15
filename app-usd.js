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
    // Extraer solo la fecha (YYYY-MM-DD) sin la hora
    const dateOnly = dateString.split(' ')[0];
    const date = new Date(dateOnly + 'T12:00:00'); // Usar mediod\u00eda para evitar problemas de timezone
    return new Intl.DateTimeFormat('es-AR', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric'
    }).format(date);
}

function formatDateShort(dateString) {
    // Extraer solo la fecha (YYYY-MM-DD) sin la hora
    const dateOnly = dateString.split(' ')[0];
    const date = new Date(dateOnly + 'T12:00:00');
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
        // Ordenar cronol\u00f3gicamente usando solo la fecha (sin hora)
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

// --- L\u00d3GICA DE C\u00c1LCULOS ---
function calculateStats(data) {
    if (!data || data.length === 0) return null;

    const currentYear = new Date().getFullYear();
    const lastIdx = data.length - 1;
    const currentData = data[lastIdx];
    const currentPrice = parseFloat(currentData.price_usd);

    // Filtrar datos del a\u00f1o actual para estad\u00edsticas anuales
    const dataCurrentYear = data.filter(d => {
        const dateOnly = d.fecha_chequeo.split(' ')[0];
        return new Date(dateOnly + 'T12:00:00').getFullYear() === currentYear;
    });
    const baseDataYear = dataCurrentYear.length > 0 ? dataCurrentYear : data;

    // --- C\u00c1LCULOS ANUALES (Cuadros de abajo) ---
    const pricesYear = baseDataYear.map(d => parseFloat(d.price_usd));
    const maxPrice = Math.max(...pricesYear);
    const minPrice = Math.min(...pricesYear);
    const maxData = baseDataYear.find(d => parseFloat(d.price_usd) === maxPrice);
    const minData = baseDataYear.find(d => parseFloat(d.price_usd) === minPrice);
    const firstPriceYear = parseFloat(baseDataYear[0].price_usd);
    const totalChange = currentPrice - firstPriceYear;
    const totalPercent = (totalChange / firstPriceYear) * 100;
    
    // Contar solo registros con variaci\u00f3n (cambios de precio EN USD)
    const priceChanges = baseDataYear.filter((d, index) => {
        if (index === 0) return false;
        const currentPriceUSD = parseFloat(d.price_usd);
        const prevPriceUSD = parseFloat(baseDataYear[index - 1].price_usd);
        return currentPriceUSD !== prevPriceUSD;
    }).length;

    // --- VARIACI\u00d3N DIARIA (Contra el registro inmediato anterior) ---
    let dailyChange = 0;
    let dailyPercent = 0;
    if (data.length > 1) {
        const prevPrice = parseFloat(data[lastIdx - 1].price_usd);
        dailyChange = currentPrice - prevPrice;
        dailyPercent = (dailyChange / prevPrice) * 100;
    }

    // --- VARIACI\u00d3N MENSUAL (30
