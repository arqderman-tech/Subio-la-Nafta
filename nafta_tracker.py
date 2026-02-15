import pandas as pd
import requests
import io
import os
import tweepy
from datetime import datetime, timedelta

# --- CONFIGURACIÓN DE CRÉDITOS X (TWITTER) ---
X_API_KEY = os.getenv("X_API_KEY")
X_API_SECRET = os.getenv("X_API_SECRET")
X_ACCESS_TOKEN = os.getenv("X_ACCESS_TOKEN")
X_ACCESS_SECRET = os.getenv("X_ACCESS_SECRET")
X_BEARER_TOKEN = os.getenv("X_BEARER_TOKEN")

# --- Configuración de Datos ---
URL = "http://datos.energia.gob.ar/dataset/1c181390-5045-475e-94dc-410429be4b17/resource/80ac25de-a44a-4445-9215-090cf55cfda5/download/precios-en-surtidor-resolucin-3142016.csv"
ARCHIVO_HISTORICO = "data/historico_precios.csv"

# --- CONFIGURACIÓN DE BÚSQUEDA ---
BUSCAR_PRODUCTO = 'Nafta (súper) entre 92 y 95 Ron'
BUSCAR_RAZON_SOCIAL = 'UNITECPROCOM SA'

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
    except:
        pass

def main():
    """Función principal del script."""
    print(f"--- Iniciando Verificación: {datetime.now()} ---")
    
    # Crear directorio data si no existe
    os.makedirs("data", exist_ok=True)
    
    try:
        response = requests.get(URL, timeout=30)
        df = pd.read_csv(io.BytesIO(response.content), decimal=',', encoding='utf-8')
    except Exception as e:
        print(f"Error descarga/lectura: {e}")
        return

    df['producto'] = df['producto'].astype(str).str.strip()
    df['empresa'] = df['empresa'].astype(str).str.strip()

    df_filtrado = df[
        (df['producto'].str.contains(BUSCAR_PRODUCTO, case=False, na=False, regex=False)) &       
        (df['empresa'].str.contains(BUSCAR_RAZON_SOCIAL, case=False, na=False, regex=False))
    ].copy()
    
    if df_filtrado.empty:
        print(f"❌ No se encontraron datos para: {BUSCAR_RAZON_SOCIAL}")
        return

    df_filtrado['fecha_vigencia'] = pd.to_datetime(df_filtrado['fecha_vigencia'], errors='coerce')
    df_filtrado = df_filtrado.sort_values(by='fecha_vigencia', ascending=False)
    
    reg_actual = df_filtrado.iloc[0]
    precio_hoy = float(reg_actual['precio'])
    empresa_nombre = reg_actual['empresa']
    fecha_vigencia_precio = reg_actual['fecha_vigencia'].strftime('%d/%m/%Y %H:%M')
    
    # Fecha de HOY para el tracking
    fecha_hoy = datetime.now().date()
    fecha_hoy_dt = pd.to_datetime(fecha_hoy)

    informe_diario = ""
    informe_mensual = ""

    if os.path.exists(ARCHIVO_HISTORICO):
        df_hist = pd.read_csv(ARCHIVO_HISTORICO)
        df_hist['fecha_vigencia'] = pd.to_datetime(df_hist['fecha_vigencia'], errors='coerce')
        
        # Asegurar columna fecha_chequeo
        if 'fecha_chequeo' not in df_hist.columns:
            df_hist['fecha_chequeo'] = df_hist['fecha_vigencia']
            df_hist.to_csv(ARCHIVO_HISTORICO, index=False)
            print("✅ Columna fecha_chequeo inicializada")
        else:
            df_hist['fecha_chequeo'] = pd.to_datetime(df_hist['fecha_chequeo'], errors='coerce')
        
        # Verificar duplicados de hoy
        ya_chequeado_hoy = (df_hist['fecha_chequeo'].dt.date == fecha_hoy).any()
        
        if ya_chequeado_hoy:
            print(f"ℹ️ Ya se realizó un chequeo hoy ({fecha_hoy}). Saltando guardado.")
        else:
            ultimo_precio = float(df_hist['precio'].iloc[-1])
            
            # CALCULAR VARIACIÓN RESPECTO AL DÍA ANTERIOR
            diff = precio_hoy - ultimo_precio
            variacion_pct = (diff / ultimo_precio) * 100 if ultimo_precio != 0 else 0.0
            
            # 1. REPORTE DIARIO
            if precio_hoy != ultimo_precio:
                emoji = "🔺" if diff > 0 else "🔻"
                informe_diario = (f"{emoji} CAMBIO DE PRECIO DETECTADO\n"
                                  f"--------------------------\n"
                                  f"⛽ Nafta Súper en YPF\n\n"
                                  f"Precio anterior: ${ultimo_precio:,.2f}\n"
                                  f"Precio nuevo: ${precio_hoy:,.2f}\n"
                                  f"Variación: {emoji} ${diff:,.2f}\n\n"
                                  f"Vigencia oficial: {fecha_vigencia_precio}")
            else:
                informe_diario = (f"✅ SIN CAMBIOS EN EL PRECIO\n"
                                  f"--------------------------\n"
                                  f"⛽ Nafta Súper en YPF\n\n"
                                  f"Precio actual: ${precio_hoy:,.2f}\n"
                                  f"Estado: Estable\n"
                                  f"Vigencia del precio: {fecha_vigencia_precio}\n"
                                  f"Chequeo: {datetime.now().strftime('%d/%m/%Y %H:%M')}")
            
            # Guardar nuevo registro con %_variacion calculada
            nueva_fila = df_filtrado.iloc[[0]].copy()
            nueva_fila['%_variacion'] = round(variacion_pct, 2)
            nueva_fila['fecha_chequeo'] = str(fecha_hoy)
            nueva_fila.to_csv(ARCHIVO_HISTORICO, mode='a', index=False, header=False)
            print(f"✅ Registro guardado: ${precio_hoy} (variación: {variacion_pct:.2f}%)")

        # --- 2. COMPARATIVA MENSUAL (Lógica Híbrida) ---
        fecha_hace_30_dias = fecha_hoy_dt - timedelta(days=30)
        
        # Crear columna de comparación unificada
        df_hist['fecha_comparacion'] = df_hist['fecha_chequeo'].fillna(df_hist['fecha_vigencia'])
        df_hist['fecha_comparacion'] = pd.to_datetime(df_hist['fecha_comparacion'])

        # Filtrar registros de hace 30 días o antes
        df_mes = df_hist[df_hist['fecha_comparacion'] <= fecha_hace_30_dias]

        if not df_mes.empty:
            reg_mes = df_mes.iloc[-1]
            precio_mes = float(reg_mes['precio'])
            fecha_mes = reg_mes['fecha_comparacion']
            
            diff_m = precio_hoy - precio_mes
            pct_m = (diff_m / precio_mes) * 100
            e_m = "🔺" if diff_m > 0 else "🔻"
            
            informe_mensual = (f"📊 COMPARATIVA MENSUAL\n"
                               f"--------------------------\n"
                               f"⛽ Precio hace 30 días: ${precio_mes:,.2f}\n"
                               f"Variación nominal: {e_m} ${diff_m:,.2f}\n"
                               f"Variación porcentual: {e_m} {pct_m:.2f}%")
            
            print(f"📊 Comparativa mensual calculada.")
        else:
            # Usar registro más antiguo si tiene más de 0 días
            if len(df_hist) > 0:
                reg_mes = df_hist.iloc[0]
                precio_mes = float(reg_mes['precio'])
                fecha_mes = pd.to_datetime(reg_mes['fecha_comparacion'])
                dias = (fecha_hoy_dt - fecha_mes).days
                
                if dias > 0:
                    diff_m = precio_hoy - precio_mes
                    pct_m = (diff_m / precio_mes) * 100
                    e_m = "🔺" if diff_m > 0 else "🔻"
                    informe_mensual = (f"📊 COMPARATIVA MENSUAL\n"
                                       f"--------------------------\n"
                                       f"⛽ Precio hace {dias} días: ${precio_mes:,.2f}\n"
                                       f"Variación nominal: {e_m} ${diff_m:,.2f}\n"
                                       f"Variación porcentual: {e_m} {pct_m:.2f}%")
    else:
        # Primera ejecución
        nueva_fila = df_filtrado.iloc[[0]].copy()
        nueva_fila['%_variacion'] = 0.0
        nueva_fila['fecha_chequeo'] = str(fecha_hoy)
        nueva_fila.to_csv(ARCHIVO_HISTORICO, index=False)
        informe_diario = f"🚀 INICIO DE SEGUIMIENTO\n⛽ Nafta Súper en {empresa_nombre}\nPrecio inicial: ${precio_hoy:,.2f}"
        print(f"✅ Archivo histórico creado")

    # Envío de reportes
    if informe_diario:
        enviar_telegram(informe_diario)
        publicar_en_x(informe_diario, informe_mensual)
    
    print(f"--- Finalizado: {datetime.now()} ---")

if __name__ == "__main__":
    main()
