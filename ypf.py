import json
import csv
from collections import Counter

ARCHIVO_JSON = "estaciones_ypf_final.json"
ARCHIVO_CSV = "estaciones_ypf_final_con_tasa.csv"


def extraer(productos, descripcion, campo):
    """Devuelve el valor de `campo` para el producto con esa descripción, o None."""
    for p in productos:
        if p.get("descripcion") == descripcion:
            return p.get(campo)
    return None


def main():
    print("1. Cargando JSON final...")
    with open(ARCHIVO_JSON, encoding="utf-8") as f:
        data = json.load(f)
    print(f"   Estaciones cargadas: {len(data)}")

    # ----------------------------- Validaciones -----------------------------
    print("2. Validando integridad...")
    codigos = [e["apies"] for e in data]
    duplicados = [c for c, n in Counter(codigos).items() if n > 1]
    sin_direccion = [e["apies"] for e in data if not e["ubicacion"].get("direccion")]
    sin_ns = [e["apies"] for e in data
              if not any(p["descripcion"] == "NS" for p in e["productos"])]

    print(f"   Duplicados:       {len(duplicados)}")
    print(f"   Sin dirección:    {len(sin_direccion)}")
    print(f"   Sin precio NS:    {len(sin_ns)}")

    if duplicados:
        print(f"   ⚠️ Códigos duplicados: {duplicados[:10]}")
    if sin_direccion:
        print(f"   ⚠️ Sin dirección: {sin_direccion[:10]}")
    if sin_ns:
        print(f"   ℹ️ Sin NS (puede ser normal): {sin_ns[:10]}")

    # ----------------------------- Exportación CSV -----------------------------
    print("3. Exportando CSV con tasaVial...")
    campos = [
        "apies", "operador", "direccion", "localidad", "provincia",
        "fuente", "latitud", "longitud",
        "pvp_NS", "tasaVial_NS", "neto_NS", "iva_NS",
        "pvp_IN", "tasaVial_IN", "neto_IN", "iva_IN",
        "pvp_EURO", "tasaVial_EURO", "neto_EURO", "iva_EURO",
        "pvp_D500", "tasaVial_D500", "neto_D500", "iva_D500",
    ]

    with open(ARCHIVO_CSV, "w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=campos)
        w.writeheader()
        for est in data:
            ubi = est["ubicacion"]
            prods = est["productos"]
            w.writerow({
                "apies": est["apies"],
                "operador": ubi.get("operador"),
                "direccion": ubi.get("direccion"),
                "localidad": ubi.get("localidad"),
                "provincia": ubi.get("provincia"),
                "fuente": ubi.get("fuente"),
                "latitud": ubi.get("latitud"),
                "longitud": ubi.get("longitud"),
                "pvp_NS":      extraer(prods, "NS",   "pvp"),
                "tasaVial_NS": extraer(prods, "NS",   "tasaVial"),
                "neto_NS":     extraer(prods, "NS",   "neto"),
                "iva_NS":      extraer(prods, "NS",   "iva"),
                "pvp_IN":      extraer(prods, "IN",   "pvp"),
                "tasaVial_IN": extraer(prods, "IN",   "tasaVial"),
                "neto_IN":     extraer(prods, "IN",   "neto"),
                "iva_IN":      extraer(prods, "IN",   "iva"),
                "pvp_EURO":      extraer(prods, "EURO", "pvp"),
                "tasaVial_EURO": extraer(prods, "EURO", "tasaVial"),
                "neto_EURO":     extraer(prods, "EURO", "neto"),
                "iva_EURO":      extraer(prods, "EURO", "iva"),
                "pvp_D500":      extraer(prods, "D500", "pvp"),
                "tasaVial_D500": extraer(prods, "D500", "tasaVial"),
                "neto_D500":     extraer(prods, "D500", "neto"),
                "iva_D500":      extraer(prods, "D500", "iva"),
            })
    print(f"✅ CSV guardado en {ARCHIVO_CSV}")

    # ----------------------------- Resumen -----------------------------
    print("\n4. Resumen de tasa vial:")
    for desc in ("NS", "IN", "EURO", "D500"):
        con_tasa = 0
        monto_total = 0.0
        for est in data:
            tv = extraer(est["productos"], desc, "tasaVial")
            if tv and tv > 0:
                con_tasa += 1
                monto_total += tv
        promedio = monto_total / con_tasa if con_tasa else 0
        print(f"   {desc:5s}: {con_tasa:4d} estaciones con tasa > 0 "
              f"(promedio ${promedio:.2f})")

    print("\n5. Distribución por fuente:")
    fuentes = Counter(e["ubicacion"].get("fuente") for e in data)
    for f, n in fuentes.most_common():
        print(f"   {f}: {n}")


if __name__ == "__main__":
    main()