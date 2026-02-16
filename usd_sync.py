"""
usd_sync.py
===========
Sincroniza data/historico_precios_usd.csv a partir de:
  - data/historico_precios.csv   (generado por nafta_tracker.py)
  - Tipo de cambio A3500 (descargado automáticamente)

Fuentes de datos (en orden de prioridad):
  1. Matba Rofex (scraping HTML - más rápido y confiable)
  2. XLS BCRA (backup - últimos 2 meses)

Lógica:
  price_usd = precio / dolar_a3500_del_dia
  Si el día exacto no está en la tabla A3500, usa el último día hábil anterior.

Se puede ejecutar manualmente o agregar al cron junto con nafta_tracker.py.
"""

import pandas as pd
import requests
import io
import os
import warnings
from datetime import datetime
from bs4 import BeautifulSoup

# Suprimir advertencias de SSL
warnings.filterwarnings('ignore', message='Unverified HTTPS request')

# ── RUTAS ─────────────────────────────────────────────────────────────────────
DIR_DATA           = "data"
ARCHIVO_PRECIOS    = os.path.join(DIR_DATA, "historico_precios.csv")
ARCHIVO_USD        = os.path.join(DIR_DATA, "historico_precios_usd.csv")

# ── FUENTES DEL DÓLAR A3500 ───────────────────────────────────────────────────
# Matba Rofex - Fuente principal (más simple y confiable)
URL_MATBA_ROFEX = "https://matbarofex.com.ar/DolarA3500/BuscarCotizacion"

# El BCRA publica el XLS histórico completo en este endpoint (backup)
URL_XLS_BCRA = "https://www.bcra.gob.ar/archivos/Pdfs/PublicacionesEstadisticas/com3500.xls"


def descargar_dolar_matbarofex() -> pd.DataFrame:
    """
    Scrapea la tabla de cotizaciones A3500 desde Matba Rofex.
    Devuelve DataFrame con columnas [fecha, tc_vendedor].
    """
    print(f"  Scrapeando Matba Rofex: {URL_MATBA_ROFEX} ...")
    
    resp = requests.get(URL_MATBA_ROFEX, timeout=20, 
                       headers={"User-Agent": "Mozilla/5.0"})
    resp.raise_for_status()
    
    # Usar BeautifulSoup directamente para mayor control
    soup = BeautifulSoup(resp.text, 'html.parser')
    
    # Buscar la tabla (usualmente tiene clase o id específico)
    table = soup.find('table')
    if not table:
        raise ValueError("No se encontró tabla en la página de Matba Rofex")
    
    # Extraer filas
    rows = table.find_all('tr')
    if len(rows) < 2:
        raise ValueError("La tabla de Matba Rofex no tiene suficientes filas")
    
    # Parsear datos
    data = []
    for row in rows[1:]:  # Saltar header
        cols = row.find_all('td')
        if len(cols) >= 2:
            fecha_str = cols[0].get_text(strip=True)
            tc_str = cols[1].get_text(strip=True)
            data.append({'fecha': fecha_str, 'tc_vendedor': tc_str})
    
    if not data:
        raise ValueError("No se pudieron extraer datos de la tabla")
    
    df = pd.DataFrame(data)
    
    # Parsear fecha (formato dd/mm/yyyy)
    df['fecha'] = pd.to_datetime(df['fecha'], format='%d/%m/%Y', errors='coerce')
    
    # Parsear cotización (formato: 1.395,4205 - punto como separador de miles, coma decimal)
    df['tc_vendedor'] = df['tc_vendedor'].astype(str).str.replace('.', '', regex=False)
    df['tc_vendedor'] = df['tc_vendedor'].str.replace(',', '.', regex=False)
    df['tc_vendedor'] = pd.to_numeric(df['tc_vendedor'], errors='coerce')
    
    df = df.dropna(subset=['fecha', 'tc_vendedor'])
    df = df.sort_values('fecha').reset_index(drop=True)
    
    print(f"  Matba Rofex OK: {len(df)} filas, desde {df['fecha'].min().date()} hasta {df['fecha'].max().date()}")
    return df


def descargar_dolar_xls() -> pd.DataFrame:
    """
    Descarga el XLS histórico del BCRA y devuelve un DataFrame con columnas [fecha, tc_vendedor].
    Filtra solo datos desde 2026-01-01 hasta hoy para reducir el tamaño.
    """
    print(f"  Descargando XLS BCRA A3500 desde {URL_XLS_BCRA} ...")
    resp = requests.get(URL_XLS_BCRA, timeout=30, verify=False,
                        headers={"User-Agent": "Mozilla/5.0"})
    resp.raise_for_status()

    # Leer el XLS saltando las primeras 3 filas (headers/descripción)
    xls = pd.read_excel(io.BytesIO(resp.content), sheet_name=0, 
                       skiprows=3, engine="xlrd")

    # Normalizar nombres de columna a minúsculas sin espacios
    xls.columns = [str(c).strip().lower().replace(" ", "_") for c in xls.columns]
    print(f"  Columnas XLS: {list(xls.columns)}")

    # Detectar columna de fecha y columna de TC vendedor automáticamente
    col_fecha = _detectar_columna(xls, ["fecha", "date", "día"])
    col_tc    = _detectar_columna(xls, ["venta", "vendedor", "tc_vendedor",
                                         "tipo_de_cambio_de_referencia",
                                         "tipo_de_cambio",
                                         "tc_ref_venta", "valor"])

    if col_fecha is None or col_tc is None:
        raise ValueError(f"No se pudo identificar columnas de fecha/TC. Columnas disponibles: {list(xls.columns)}")

    df = xls[[col_fecha, col_tc]].copy()
    df.columns = ["fecha", "tc_vendedor"]
    df["fecha"] = pd.to_datetime(df["fecha"], errors="coerce", dayfirst=True)
    df["tc_vendedor"] = pd.to_numeric(df["tc_vendedor"], errors="coerce")
    df = df.dropna(subset=["fecha", "tc_vendedor"])
    
    # Filtrar solo desde 2026-01-01 hasta hoy
    fecha_inicio = pd.Timestamp('2026-01-01')
    fecha_hoy = pd.Timestamp(datetime.now().date())
    df = df[(df["fecha"] >= fecha_inicio) & (df["fecha"] <= fecha_hoy)]
    
    df = df.sort_values("fecha").reset_index(drop=True)
    print(f"  XLS OK: {len(df)} filas, desde {df['fecha'].min().date()} hasta {df['fecha'].max().date()}")
    return df


def obtener_dolar_a3500() -> pd.DataFrame:
    """
    Intenta obtener el tipo de cambio A3500 de múltiples fuentes.
    Orden de prioridad: Matba Rofex → XLS BCRA
    """
    try:
        return descargar_dolar_matbarofex()
    except Exception as e_matba:
        print(f"  Matba Rofex falló ({e_matba}), probando XLS ...")
        try:
            return descargar_dolar_xls()
        except Exception as e_xls:
            raise RuntimeError(
                f"No se pudo obtener el tipo de cambio A3500.\n"
                f"  Error Matba Rofex: {e_matba}\n"
                f"  Error XLS BCRA: {e_xls}"
            )


def _detectar_columna(df: pd.DataFrame, candidatos: list) -> str | None:
    """Devuelve el nombre de la primera columna que coincida con algún candidato."""
    cols_lower = {c.lower(): c for c in df.columns}
    for cand in candidatos:
        # Coincidencia exacta
        if cand in cols_lower:
            return cols_lower[cand]
        # Coincidencia parcial
        for col_l, col_orig in cols_lower.items():
            if cand in col_l:
                return col_orig
    return None


def get_tc_para_fecha(fecha: pd.Timestamp, df_tc: pd.DataFrame) -> float | None:
    """
    Devuelve el tipo de cambio A3500 para una fecha dada.
    Si la fecha exacta no existe (finde, feriado), usa el último día hábil anterior.
    """
    df_prev = df_tc[df_tc["fecha"] <= fecha]
    if df_prev.empty:
        return None
    return float(df_prev.iloc[-1]["tc_vendedor"])


def sincronizar_usd():
    """Función principal: lee el CSV de precios, calcula price_usd y actualiza el CSV USD."""

    print(f"\n{'='*60}")
    print(f"  USD SYNC — {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
    print(f"{'='*60}")

    # ── 1. Verificar que existe el CSV de precios ──────────────────────────────
    if not os.path.exists(ARCHIVO_PRECIOS):
        print(f"❌ No se encontró {ARCHIVO_PRECIOS}. Ejecutá primero nafta_tracker.py.")
        return

    # ── 2. Cargar CSV de precios ───────────────────────────────────────────────
    print("\n[1/4] Cargando CSV de precios ...")
    df_precios = pd.read_csv(ARCHIVO_PRECIOS)
    df_precios["fecha_chequeo"] = pd.to_datetime(df_precios["fecha_chequeo"], errors="coerce")
    df_precios["precio"] = pd.to_numeric(df_precios["precio"], errors="coerce")
    print(f"  {len(df_precios)} filas en {ARCHIVO_PRECIOS}")

    # ── 3. Cargar CSV USD existente (si existe) ────────────────────────────────
    print("\n[2/4] Cargando CSV USD existente ...")
    if os.path.exists(ARCHIVO_USD):
        df_usd = pd.read_csv(ARCHIVO_USD)
        df_usd["fecha_chequeo"] = pd.to_datetime(df_usd["fecha_chequeo"], errors="coerce")
        # Conjunto de fechas ya procesadas
        fechas_ya_en_usd = set(df_usd["fecha_chequeo"].dt.date.dropna())
        print(f"  {len(df_usd)} filas ya en {ARCHIVO_USD}")
    else:
        # Crear el archivo USD con los mismos headers + price_usd
        df_usd = pd.DataFrame(columns=list(df_precios.columns) + ["price_usd"])
        fechas_ya_en_usd = set()
        print(f"  Archivo {ARCHIVO_USD} no existe, se creará.")

    # ── 4. Detectar filas nuevas ───────────────────────────────────────────────
    filas_nuevas = df_precios[
        ~df_precios["fecha_chequeo"].dt.date.isin(fechas_ya_en_usd)
    ].copy()

    if filas_nuevas.empty:
        print("\n✅ El CSV USD ya está al día. No hay filas nuevas para agregar.")
        return

    print(f"\n[3/4] {len(filas_nuevas)} fila(s) nueva(s) detectada(s):")
    for _, r in filas_nuevas.iterrows():
        print(f"  → {r['fecha_chequeo'].date()} | precio: ${r['precio']}")

    # ── 5. Obtener tipo de cambio A3500 ────────────────────────────────────────
    print("\n[4/4] Obteniendo tipo de cambio A3500 ...")
    df_tc = obtener_dolar_a3500()

    # ── 6. Calcular price_usd para cada fila nueva ────────────────────────────
    resultados = []
    for _, fila in filas_nuevas.iterrows():
        fecha = fila["fecha_chequeo"]
        precio_ars = fila["precio"]

        tc = get_tc_para_fecha(fecha, df_tc)

        if tc is None or tc == 0:
            print(f"  ⚠️  Sin TC para {fecha.date()} — se asigna NaN")
            price_usd = float("nan")
        else:
            price_usd = round(precio_ars / tc, 4)
            print(f"  ✓  {fecha.date()} | ${precio_ars} ARS / {tc:.2f} A3500 = ${price_usd:.4f} USD")

        fila_nueva = fila.copy()
        fila_nueva["price_usd"] = price_usd
        resultados.append(fila_nueva)

    df_nuevas_usd = pd.DataFrame(resultados)

    # ── 7. Asegurar orden de columnas igual al CSV USD ─────────────────────────
    if "price_usd" not in df_usd.columns:
        df_usd["price_usd"] = float("nan")

    # Usar el orden de columnas del CSV USD existente
    cols_finales = list(df_usd.columns)
    for col in df_nuevas_usd.columns:
        if col not in cols_finales:
            cols_finales.append(col)

    df_nuevas_usd = df_nuevas_usd.reindex(columns=cols_finales)

    # ── 8. Escribir al CSV USD ─────────────────────────────────────────────────
    os.makedirs(DIR_DATA, exist_ok=True)

    if os.path.exists(ARCHIVO_USD):
        # Append sin header
        df_nuevas_usd.to_csv(ARCHIVO_USD, mode="a", index=False, header=False)
    else:
        # Crear archivo nuevo con header
        df_nuevas_usd.to_csv(ARCHIVO_USD, index=False)

    print(f"\n✅ {len(df_nuevas_usd)} fila(s) agregada(s) a {ARCHIVO_USD}")
    print(f"{'='*60}\n")


if __name__ == "__main__":
    sincronizar_usd()
