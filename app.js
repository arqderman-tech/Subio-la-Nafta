// Parsear CSV
function parseCSV(text) {
    const lines = text.trim().split('\n');
    const headers = lines[0].split(',');
    
    const data = [];
    for (let i = 1; i < lines.length; i++) {
        const line = lines[i];
        
        // Skip empty lines
        if (!line.trim()) continue;
        
        // CORRECCIÓN: Parser mejorado para manejar comillas y comas dentro de campos
        const values = [];
        let current = '';
        let inQuotes = false;
        
        for (let j = 0; j < line.length; j++) {
            const char = line[j];
            
            if (char === '"') {
                inQuotes = !inQuotes;
                current += char;
            } else if (char === ',' && !inQuotes) {
                values.push(current);
                current = '';
            } else {
                current += char;
            }
        }
        values.push(current); // Add last value
        
        if (values.length < headers.length) continue;
        
        const row = {};
        headers.forEach((header, index) => {
            row[header] = values[index];
        });
        
        // Filtrar solo datos de UNITECPROCOM SA (la estación principal)
        if (row.empresa && row.empresa.includes('UNITECPROCOM')) {
            data.push(row);
        }
    }
    
    return data;
}
