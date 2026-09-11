"""
brent_sync.py
=============
Sincroniza data/historico_brent.csv con el precio de cierre diario del
petróleo Brent (ticker "BZ=F" en Yahoo Finance), para poder superponerlo
al gráfico de precio de la nafta en dólares.

Lógica:
  - Si data/historico_brent.csv NO existe: es la primera corrida.
    Descarga TODO el historial disponible desde FECHA_INICIO_HISTORICO
    hasta hoy y crea el archivo completo.
  - Si data/historico_brent.csv YA existe: solo descarga desde unos días
    antes del último dato guardado (para cubrir correcciones de fin de
    semana/feriados) hasta hoy, y agrega/actualiza esas filas.

Se puede ejecutar manualmente o encadenado a nafta_tracker.py (igual que
usd_sync.py), y también agregarlo al mismo workflow de GitHub Actions.
"""

import os
from datetime import datetime, timedelta

import pandas as pd
import yfinance as yf

# ── CONFIGURACIÓN ────────────────────────────────────────────────────────────
DIR_DATA = "data"
ARCHIVO_BRENT = os.path.join(DIR_DATA, "historico_brent.csv")
ARCHIVO_PRECIOS = os.path.join(DIR_DATA, "historico_precios.csv")

TICKER_BRENT = "BZ=F"          # Brent Crude Oil futures
FECHA_INICIO_FALLBACK = "2024-01-01"  # solo si no se puede leer historico_precios.csv
DIAS_SOLAPAMIENTO = 7          # margen al hacer corridas incrementales


def _fecha_inicio_historico() -> str:
    """
    Primera corrida: usamos como punto de partida la fecha más vieja que
    tengamos en el propio histórico de precios de nafta (no tiene sentido
    bajar Brent de antes de que exista ese seguimiento).
    """
    if os.path.exists(ARCHIVO_PRECIOS):
        try:
            df = pd.read_csv(ARCHIVO_PRECIOS)
            col_fecha = "fecha_chequeo" if "fecha_chequeo" in df.columns else "fecha_vigencia"
            fechas = pd.to_datetime(df[col_fecha], errors="coerce").dropna()
            if not fechas.empty:
                return str(fechas.min().date())
        except Exception as e:
            print(f"  ⚠️ No se pudo leer {ARCHIVO_PRECIOS} para fijar fecha de inicio ({e}), "
                  f"uso fallback {FECHA_INICIO_FALLBACK}.")
    else:
        print(f"  ⚠️ No existe {ARCHIVO_PRECIOS}, uso fallback {FECHA_INICIO_FALLBACK}.")
    return FECHA_INICIO_FALLBACK


def _descargar_brent(fecha_inicio: str, fecha_fin: str | None = None) -> pd.DataFrame:
    """Descarga precios de cierre del Brent entre fecha_inicio y fecha_fin (excl.)."""
    print(f"  Descargando Brent ({TICKER_BRENT}) desde {fecha_inicio} "
          f"hasta {fecha_fin or 'hoy'} ...")
    datos = yf.download(TICKER_BRENT, start=fecha_inicio, end=fecha_fin, progress=False)

    if datos.empty:
        return pd.DataFrame(columns=["fecha", "precio_brent"])

    # yfinance puede devolver columnas multi-nivel (Ticker) según la versión.
    if isinstance(datos.columns, pd.MultiIndex):
        cierre = datos["Close"][TICKER_BRENT]
    else:
        cierre = datos["Close"]

    df = cierre.rename("precio_brent").reset_index()
    df = df.rename(columns={"Date": "fecha"})
    df["fecha"] = pd.to_datetime(df["fecha"]).dt.date
    df["precio_brent"] = pd.to_numeric(df["precio_brent"], errors="coerce")
    df = df.dropna(subset=["precio_brent"])
    return df[["fecha", "precio_brent"]]


def sincronizar_brent():
    """Función principal: crea o actualiza data/historico_brent.csv."""
    print(f"\n{'='*60}")
    print(f"  BRENT SYNC — {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
    print(f"{'='*60}")

    os.makedirs(DIR_DATA, exist_ok=True)
    hoy = datetime.now().date()
    fecha_fin = str(hoy + timedelta(days=1))  # end es exclusivo en yfinance

    if not os.path.exists(ARCHIVO_BRENT):
        # --- Primera corrida: bajamos desde el inicio del seguimiento de nafta ---
        fecha_inicio = _fecha_inicio_historico()
        print(f"\n[1/1] Primera corrida: no existe {ARCHIVO_BRENT}.")
        print(f"  Bajando historial completo desde {fecha_inicio} "
              f"(fecha más vieja de tu histórico de nafta) ...")
        df_nuevo = _descargar_brent(fecha_inicio, fecha_fin)

        if df_nuevo.empty:
            print("  ⚠️ No se pudo descargar historial del Brent. Nada para guardar.")
            return

        df_nuevo.to_csv(ARCHIVO_BRENT, index=False)
        print(f"  ✅ {ARCHIVO_BRENT} creado con {len(df_nuevo)} filas "
              f"({df_nuevo['fecha'].min()} a {df_nuevo['fecha'].max()}).")
        return

    # --- Corridas siguientes: solo lo nuevo ---
    print(f"\n[1/2] Cargando histórico existente ...")
    df_existente = pd.read_csv(ARCHIVO_BRENT, parse_dates=["fecha"])
    df_existente["fecha"] = df_existente["fecha"].dt.date
    print(f"  {len(df_existente)} filas ya en {ARCHIVO_BRENT} "
          f"(último dato: {df_existente['fecha'].max()}).")

    fecha_desde = df_existente["fecha"].max() - timedelta(days=DIAS_SOLAPAMIENTO)

    print(f"\n[2/2] Descargando datos nuevos/actualizados ...")
    df_nuevo = _descargar_brent(str(fecha_desde), fecha_fin)

    if df_nuevo.empty:
        print("  ℹ️ No hay datos nuevos del Brent (fin de semana/feriado o sin cambios).")
        return

    # Combinamos, dejando que los datos nuevos (más confiables/actualizados)
    # pisen a los viejos en fechas solapadas.
    df_final = pd.concat([df_existente, df_nuevo], ignore_index=True)
    df_final = df_final.drop_duplicates(subset=["fecha"], keep="last")
    df_final = df_final.sort_values("fecha").reset_index(drop=True)
    df_final.to_csv(ARCHIVO_BRENT, index=False)

    n_agregadas = len(df_final) - len(df_existente)
    print(f"  ✅ {ARCHIVO_BRENT} actualizado: {n_agregadas} fila(s) nueva(s), "
          f"{len(df_final)} filas totales (hasta {df_final['fecha'].max()}).")


if __name__ == "__main__":
    sincronizar_brent()
