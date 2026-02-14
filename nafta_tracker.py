# 2. COMPARATIVA MENSUAL
fecha_hace_30_dias = pd.to_datetime(fecha_hoy - timedelta(days=30))

# LÓGICA HÍBRIDA: Usar fecha_vigencia si no hay fecha_chequeo, sino usar fecha_chequeo
# Crear una columna temporal que combine ambas
df_hist['fecha_comparacion'] = df_hist['fecha_chequeo'].fillna(df_hist['fecha_vigencia'])

# Filtrar registros de hace 30 días o antes
df_mes = df_hist[df_hist['fecha_comparacion'] <= fecha_hace_30_dias]

if not df_mes.empty:
    # Tomar el registro más cercano a hace 30 días (el último del filtro)
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
    
    print(f"📊 Comparativa mensual:")
    print(f"   Precio hace 30 días ({fecha_mes.date()}): ${precio_mes:,.2f}")
    print(f"   Precio hoy ({fecha_hoy}): ${precio_hoy:,.2f}")
    print(f"   Diferencia: ${diff_m:,.2f} ({pct_m:.2f}%)")
else:
    # Si no hay registros de hace 30+ días, usar el más antiguo disponible
    if len(df_hist) > 1:
        reg_mes = df_hist.iloc[0]  # Primer registro (el más antiguo)
        precio_mes = float(reg_mes['precio'])
        fecha_mes = reg_mes['fecha_comparacion']
        dias_transcurridos = (fecha_hoy_dt - fecha_mes).days
        
        diff_m = precio_hoy - precio_mes
        pct_m = (diff_m / precio_mes) * 100
        e_m = "🔺" if diff_m > 0 else "🔻"
        
        informe_mensual = (f"📊 COMPARATIVA MENSUAL\n"
                           f"--------------------------\n"
                           f"⛽ Precio hace {dias_transcurridos} días: ${precio_mes:,.2f}\n"
                           f"Variación nominal: {e_m} ${diff_m:,.2f}\n"
                           f"Variación porcentual: {e_m} {pct_m:.2f}%")
        
        print(f"📊 Comparativa mensual (usando registro más antiguo):")
        print(f"   Precio hace {dias_transcurridos} días ({fecha_mes.date()}): ${precio_mes:,.2f}")
        print(f"   Precio hoy ({fecha_hoy}): ${precio_hoy:,.2f}")
        print(f"   Diferencia: ${diff_m:,.2f} ({pct_m:.2f}%)")
    else:
        print(f"ℹ️  No hay suficientes datos históricos para comparar")
