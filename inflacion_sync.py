"""
inflacion_sync.py
==================
Sincroniza data/historico_inflacion.csv con el índice de precios al
consumidor (IPC) mensual que publica el INDEC, vía la API pública de
ArgentinaDatos (https://argentinadatos.com), para poder superponerlo al
gráfico de precio de la nafta en pesos.

A diferencia de brent_sync.py, acá NO hace falta lógica de "primera vez
completa / después incremental": la API devuelve la serie histórica
COMPLETA en una sola llamada (es un dataset chico, ~100 filas mensuales),
así que simplemente la volvemos a pedir entera y sobreescribimos el CSV
en cada corrida. Es más simple y siempre queda consistente.

Además del valor mensual (%), calculamos un índice acumulado encadenado
(base 100 en el primer mes disponible) para poder graficarlo como una
curva junto al precio de la nafta, en vez de tener que encadenar los
porcentajes mes a mes del lado del frontend.
"""

import os
from datetime import datetime

import pandas as pd
import requests

# ── CONFIGURACIÓN ────────────────────────────────────────────────────────────
DIR_DATA = "data"
ARCHIVO_INFLACION = os.path.join(DIR_DATA, "historico_inflacion.csv")

URL_INFLACION = "https://api.argentinadatos.com/v1/finanzas/indices/inflacion"


def sincronizar_inflacion():
    """Función principal: crea o sobreescribe data/historico_inflacion.csv."""
    print(f"\n{'='*60}")
    print(f"  INFLACIÓN SYNC — {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
    print(f"{'='*60}")

    os.makedirs(DIR_DATA, exist_ok=True)

    print(f"\n[1/2] Descargando serie de inflación mensual (IPC INDEC) ...")
    try:
        resp = requests.get(URL_INFLACION, timeout=20)
        resp.raise_for_status()
        datos = resp.json()
    except Exception as e:
        print(f"  ❌ No se pudo descargar la inflación: {e}")
        return

    if not datos:
        print("  ⚠️ La API devolvió una lista vacía. Nada para guardar.")
        return

    df = pd.DataFrame(datos)
    df = df.rename(columns={"fecha": "fecha", "valor": "valor"})
    df["fecha"] = pd.to_datetime(df["fecha"], errors="coerce").dt.date
    df["valor"] = pd.to_numeric(df["valor"], errors="coerce")
    df = df.dropna(subset=["fecha", "valor"]).sort_values("fecha").reset_index(drop=True)

    print(f"  {len(df)} meses descargados "
          f"({df['fecha'].min()} a {df['fecha'].max()}).")

    # ── 2. Calcular índice acumulado encadenado (base 100) ──────────────────
    print(f"\n[2/2] Calculando índice acumulado (base 100) ...")
    indice = 100.0
    indices = []
    for variacion in df["valor"]:
        indice = indice * (1 + variacion / 100)
        indices.append(round(indice, 4))
    df["indice"] = indices

    df.to_csv(ARCHIVO_INFLACION, index=False)
    print(f"  ✅ {ARCHIVO_INFLACION} guardado con {len(df)} filas "
          f"(índice final: {df['indice'].iloc[-1]}).")


if __name__ == "__main__":
    sincronizar_inflacion()
