import pandas as pd
import requests
import os
import tweepy
from datetime import datetime, timedelta

# Sincronización automática del CSV en USD
try:
    from usd_sync import sincronizar_usd
    _USD_SYNC_DISPONIBLE = True
except ImportError:
    _USD_SYNC_DISPONIBLE = False

# Sincronización automática del histórico de precio del Brent
try:
    from brent_sync import sincronizar_brent
    _BRENT_SYNC_DISPONIBLE = True
except ImportError:
    _BRENT_SYNC_DISPONIBLE = False

# Sincronización automática del índice de inflación (IPC INDEC)
try:
    from inflacion_sync import sincronizar_inflacion
    _INFLACION_SYNC_DISPONIBLE = True
except ImportError:
    _INFLACION_SYNC_DISPONIBLE = False

# --- CONFIGURACIÓN DE CRÉDITOS X (TWITTER) ---
X_API_KEY = os.getenv("X_API_KEY")
X_API_SECRET = os.getenv("X_API_SECRET")
X_ACCESS_TOKEN = os.getenv("X_ACCESS_TOKEN")
X_ACCESS_SECRET = os.getenv("X_ACCESS_SECRET")
X_BEARER_TOKEN = os.getenv("X_BEARER_TOKEN")

# --- Configuración de Datos (nueva fuente YPF) ---
# El script ypf.py genera este CSV a partir de estaciones_ypf_final.json
# En el runner self-hosted el JSON suele estar en el workspace o en un path fijo.
ARCHIVO_YPF_CSV = "estaciones_ypf_final_con_tasa.csv"
ARCHIVO_YPF_JSON = "estaciones_ypf_final.json"  # fallback
ARCHIVO_HISTORICO = "data/historico_precios.csv"

# Estación objetivo (GAS IMPULSO SA – Pilar)
BUSCAR_APIES = "00322"
BUSCAR_RAZON_SOCIAL = "GAS IMPULSO"
PRODUCTO_CLAVE = "NS"           # Nafta Súper → pvp_NS

# --- Claves de Telegram ---
TELEGRAM_BOT_TOKEN = os.getenv("TELEGRAM_BOT_TOKEN")
TELEGRAM_CHAT_ID = os.getenv("TELEGRAM_CHAT_ID")


def publicar_en_x(texto_principal, texto_mensual=None):
    """Publica el reporte en X (Twitter)."""
    try:
        client = tweepy.Client(
            bearer_token=X_BEARER_TOKEN,
            consumer_key=X_API_KEY,
            consumer_secret=X_API_SECRET,
            access_token=X_ACCESS_TOKEN,
            access_token_secret=X_ACCESS_SECRET
        )
        res1 = client.create_tweet(text=texto_principal)
        print(f"✅ Tuit diario enviado.")
        if texto_mensual:
            client.create_tweet(text=texto_mensual, in_reply_to_tweet_id=res1.data['id'])
            print(f"✅ Hilo mensual enviado.")
    except Exception as e:
        print(f"❌ Error en X: {e}")


def enviar_telegram(mensaje):
    """Envía notificación por Telegram."""
    if not TELEGRAM_BOT_TOKEN or not TELEGRAM_CHAT_ID:
        return
    url_tg = f"https://api.telegram.org/bot{TELEGRAM_BOT_TOKEN}/sendMessage"
    payload = {"chat_id": TELEGRAM_CHAT_ID, "text": mensaje}
    try:
        requests.post(url_tg, json=payload, timeout=10)
    except Exception:
        pass


def cargar_precio_ypf():
    """
    Carga el precio de Nafta Súper (pvp_NS) de la estación 00322
    desde el CSV generado por ypf.py (o del JSON como fallback).
    Devuelve: (precio, nombre_empresa, direccion) o None si falla.
    """
    # 1. Intentar CSV
    if os.path.exists(ARCHIVO_YPF_CSV):
        try:
            df = pd.read_csv(ARCHIVO_YPF_CSV, dtype=str)
            # Normalizar apies (puede venir como 322 o 00322)
            df["apies"] = df["apies"].astype(str).str.strip().str.zfill(5)
            fila = df[df["apies"] == BUSCAR_APIES.zfill(5)]

            if not fila.empty:
                row = fila.iloc[0]
                precio = float(row["pvp_NS"])
                empresa = row.get("operador", BUSCAR_RAZON_SOCIAL)
                direccion = row.get("direccion", "")
                print(f"✅ Precio leído desde CSV: ${precio:,.2f} ({empresa})")
                return precio, empresa, direccion
        except Exception as e:
            print(f"⚠️ Error leyendo CSV YPF: {e}")

    # 2. Fallback al JSON
    if os.path.exists(ARCHIVO_YPF_JSON):
        try:
            import json
            with open(ARCHIVO_YPF_JSON, encoding="utf-8") as f:
                data = json.load(f)

            for est in data:
                apies = str(est.get("apies", "")).strip().zfill(5)
                if apies == BUSCAR_APIES.zfill(5):
                    for p in est.get("productos", []):
                        if p.get("descripcion") == PRODUCTO_CLAVE:
                            precio = float(p.get("pvp"))
                            empresa = est.get("ubicacion", {}).get("operador", BUSCAR_RAZON_SOCIAL)
                            direccion = est.get("ubicacion", {}).get("direccion", "")
                            print(f"✅ Precio leído desde JSON: ${precio:,.2f} ({empresa})")
                            return precio, empresa, direccion
        except Exception as e:
            print(f"⚠️ Error leyendo JSON YPF: {e}")

    return None


def main():
    """Función principal del script."""
    print(f"--- Iniciando Verificación: {datetime.now()} ---")

    # Crear directorio data si no existe
    os.makedirs("data", exist_ok=True)

    # ── Obtener precio desde fuente YPF ─────────────────────────────────────
    resultado = cargar_precio_ypf()
    if resultado is None:
        print(f"❌ No se encontró la estación {BUSCAR_APIES} ({BUSCAR_RAZON_SOCIAL}) "
              f"en {ARCHIVO_YPF_CSV} ni en {ARCHIVO_YPF_JSON}")
        print("   Asegurate de haber corrido primero ypf.py para generar los archivos.")
        return

    precio_hoy, empresa_nombre, direccion = resultado
    fecha_vigencia_precio = datetime.now().strftime("%d/%m/%Y %H:%M")  # la fuente YPF no trae fecha de vigencia

    # Fecha de HOY para el tracking
    fecha_hoy = datetime.now().date()
    fecha_hoy_dt = pd.to_datetime(fecha_hoy)

    informe_diario = ""
    informe_mensual = ""

    if os.path.exists(ARCHIVO_HISTORICO):
        df_hist = pd.read_csv(ARCHIVO_HISTORICO)

        # Asegurar columnas mínimas
        if "fecha_chequeo" not in df_hist.columns:
            if "fecha_vigencia" in df_hist.columns:
                df_hist["fecha_chequeo"] = df_hist["fecha_vigencia"]
            else:
                df_hist["fecha_chequeo"] = pd.NaT
            df_hist.to_csv(ARCHIVO_HISTORICO, index=False)
            print("✅ Columna fecha_chequeo inicializada")

        df_hist["fecha_chequeo"] = pd.to_datetime(df_hist["fecha_chequeo"], errors="coerce")

        # Verificar si ya se chequeó hoy
        ya_chequeado_hoy = (df_hist["fecha_chequeo"].dt.date == fecha_hoy).any()

        if ya_chequeado_hoy:
            print(f"ℹ️ Ya se realizó un chequeo hoy ({fecha_hoy}). Saltando guardado.")
        else:
            ultimo_precio = float(df_hist["precio"].iloc[-1])

            # CALCULAR VARIACIÓN RESPECTO AL DÍA ANTERIOR
            diff = precio_hoy - ultimo_precio
            variacion_pct = (diff / ultimo_precio) * 100 if ultimo_precio != 0 else 0.0

            # 1. REPORTE DIARIO
            if precio_hoy != ultimo_precio:
                emoji = "🔺" if diff > 0 else "🔻"
                informe_diario = (
                    f"{emoji} CAMBIO DE PRECIO DETECTADO\n"
                    f"--------------------------\n"
                    f"⛽ Nafta Súper en YPF\n"
                    f"Estación: {empresa_nombre}\n\n"
                    f"Precio anterior: ${ultimo_precio:,.2f}\n"
                    f"Precio nuevo: ${precio_hoy:,.2f}\n"
                    f"Variación: {emoji} ${diff:,.2f} ({variacion_pct:+.2f}%)\n\n"
                    f"Chequeo: {fecha_vigencia_precio}"
                )
            else:
                informe_diario = (
                    f"✅ SIN CAMBIOS EN EL PRECIO\n"
                    f"--------------------------\n"
                    f"⛽ Nafta Súper en YPF\n"
                    f"Estación: {empresa_nombre}\n\n"
                    f"Precio actual: ${precio_hoy:,.2f}\n"
                    f"Estado: Estable\n"
                    f"Chequeo: {fecha_vigencia_precio}"
                )

            # Guardar nuevo registro alineado con el header existente
            # (usd_sync solo necesita fecha_chequeo + precio; el resto es informativo)
            columnas_hist = list(df_hist.columns)
            nueva = {c: "" for c in columnas_hist}
            nueva["fecha_chequeo"] = str(fecha_hoy)
            nueva["fecha_vigencia"] = fecha_vigencia_precio
            nueva["precio"] = precio_hoy
            if "%_variacion" in nueva:
                nueva["%_variacion"] = round(variacion_pct, 2)
            if "empresa" in nueva:
                nueva["empresa"] = empresa_nombre
            if "direccion" in nueva:
                nueva["direccion"] = direccion
            if "producto" in nueva:
                nueva["producto"] = "Nafta (súper) entre 92 y 95 Ron"
            if "empresabandera" in nueva:
                nueva["empresabandera"] = "YPF"
            if "idempresa" in nueva:
                nueva["idempresa"] = "1519"
            if "apies" in columnas_hist:
                nueva["apies"] = BUSCAR_APIES

            nueva_fila = pd.DataFrame([nueva])
            # Reordenar exactamente como el header actual
            nueva_fila = nueva_fila.reindex(columns=columnas_hist)
            nueva_fila.to_csv(ARCHIVO_HISTORICO, mode="a", index=False, header=False)
            print(f"✅ Registro guardado: ${precio_hoy} (variación: {variacion_pct:.2f}%)")

        # --- 2. COMPARATIVA MENSUAL ---
        fecha_hace_30_dias = fecha_hoy_dt - timedelta(days=30)

        # Crear columna de comparación unificada
        if "fecha_comparacion" not in df_hist.columns:
            df_hist["fecha_comparacion"] = df_hist["fecha_chequeo"].fillna(
                pd.to_datetime(df_hist.get("fecha_vigencia"), errors="coerce")
            )
        df_hist["fecha_comparacion"] = pd.to_datetime(df_hist["fecha_comparacion"], errors="coerce")

        df_mes = df_hist[df_hist["fecha_comparacion"] <= fecha_hace_30_dias]

        if not df_mes.empty:
            reg_mes = df_mes.iloc[-1]
            precio_mes = float(reg_mes["precio"])
            diff_m = precio_hoy - precio_mes
            pct_m = (diff_m / precio_mes) * 100 if precio_mes != 0 else 0.0
            e_m = "🔺" if diff_m > 0 else "🔻"

            informe_mensual = (
                f"📊 COMPARATIVA MENSUAL\n"
                f"--------------------------\n"
                f"⛽ Precio hace 30 días: ${precio_mes:,.2f}\n"
                f"Variación nominal: {e_m} ${diff_m:,.2f}\n"
                f"Variación porcentual: {e_m} {pct_m:.2f}%"
            )
            print("📊 Comparativa mensual calculada.")
        else:
            # Usar el registro más antiguo si hay datos
            if len(df_hist) > 0:
                reg_mes = df_hist.iloc[0]
                precio_mes = float(reg_mes["precio"])
                fecha_mes = pd.to_datetime(reg_mes["fecha_comparacion"], errors="coerce")
                dias = (fecha_hoy_dt - fecha_mes).days if pd.notna(fecha_mes) else 0

                if dias > 0:
                    diff_m = precio_hoy - precio_mes
                    pct_m = (diff_m / precio_mes) * 100 if precio_mes != 0 else 0.0
                    e_m = "🔺" if diff_m > 0 else "🔻"
                    informe_mensual = (
                        f"📊 COMPARATIVA MENSUAL\n"
                        f"--------------------------\n"
                        f"⛽ Precio hace {dias} días: ${precio_mes:,.2f}\n"
                        f"Variación nominal: {e_m} ${diff_m:,.2f}\n"
                        f"Variación porcentual: {e_m} {pct_m:.2f}%"
                    )
    else:
        # Primera ejecución (archivo no existe)
        nueva_fila = pd.DataFrame([{
            "fecha_chequeo": str(fecha_hoy),
            "fecha_vigencia": fecha_vigencia_precio,
            "precio": precio_hoy,
            "%_variacion": 0.0,
            "empresa": empresa_nombre,
            "apies": BUSCAR_APIES,
            "producto": "Nafta (súper) entre 92 y 95 Ron",
            "direccion": direccion,
            "empresabandera": "YPF",
            "idempresa": "1519",
        }])
        nueva_fila.to_csv(ARCHIVO_HISTORICO, index=False)
        informe_diario = (
            f"🚀 INICIO DE SEGUIMIENTO\n"
            f"⛽ Nafta Súper en {empresa_nombre}\n"
            f"Precio inicial: ${precio_hoy:,.2f}"
        )
        print("✅ Archivo histórico creado")

    # Envío de reportes
    if informe_diario:
        enviar_telegram(informe_diario)
        publicar_en_x(informe_diario, informe_mensual)

    # ── Sincronizar CSV en USD ──────────────────────────────────────────────
    if _USD_SYNC_DISPONIBLE:
        try:
            sincronizar_usd()
        except Exception as e_usd:
            print(f"⚠️ usd_sync falló: {e_usd}")
    else:
        print("⚠️ usd_sync.py no encontrado — el CSV en USD no se actualizó.")

    # ── Sincronizar histórico del Brent ─────────────────────────────────────
    if _BRENT_SYNC_DISPONIBLE:
        try:
            sincronizar_brent()
        except Exception as e_brent:
            print(f"⚠️ brent_sync falló: {e_brent}")
    else:
        print("⚠️ brent_sync.py no encontrado — el histórico del Brent no se actualizó.")

    # ── Sincronizar índice de inflación ─────────────────────────────────────
    if _INFLACION_SYNC_DISPONIBLE:
        try:
            sincronizar_inflacion()
        except Exception as e_inf:
            print(f"⚠️ inflacion_sync falló: {e_inf}")
    else:
        print("⚠️ inflacion_sync.py no encontrado — el índice de inflación no se actualizó.")

    print(f"--- Finalizado: {datetime.now()} ---")


if __name__ == "__main__":
    main()
