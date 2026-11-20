# CAPEX y OPEX 2026

MVP 0.1.7 para las 14 Técnicas Sucursales. Aplicación estática para GitHub Pages.

## Prueba local

Descomprime el paquete, abre una terminal en la carpeta extraída y ejecuta:

```bash
python -m http.server 8000
```

Abre http://localhost:8000. La app requiere que los archivos se sirvan por HTTP.

## Reglas de cálculo

Replican la hoja 2026 y la primera calculadora de la pestaña Calculo OPEX del archivo CAPEX_OPEX_2026.

**Ruta urbana y ruta interurbana** (misma regla, una sola fibra por acción, un trimestre):

- CAPEX = metros de fibra × tarifa del tipo de fibra + postes × tarifa del poste.
- Días = cajas ÷ cajas por día (redondeo hacia arriba) + mangas + certificación (1 a 2 días) + días por ODF si se construye.
- Mangas = km ÷ bobina (2 o 4 km) en 144 hilos, km ÷ bobina ÷ 2 en los demás tipos; redondeo hacia arriba. La fibra ducto cuenta como el mismo número de hilos.
- OPEX = días × (técnicos × costo mensual del técnico + costo mensual del coordinador) ÷ días por mes.

**Construcción de cajas** (una fila con varios trimestres):

- CAPEX por trimestre = metros de fibra 2 hilos × tarifa de 2 hilos.
- OPEX por trimestre = cajas ÷ cajas por día (redondeo hacia arriba) × costo diario de la cuadrilla.

**Mejoramiento Infraestructura de Nodos**: regla por definir; la app no permite guardar este tipo de acción.

## Flujo de jefatura

1. Selecciona la Técnica Sucursal y pulsa **Iniciar planificación** (o **Continuar planificación**).
2. Pulsa **Agregar acción**, elige el objetivo estratégico y el tipo de trabajo y completa los datos. Los cuadros CAPEX y OPEX muestran el cálculo mientras escribes. Guarda la acción.
3. **Editar** y **Eliminar** están en cada acción. Las acciones se guardan en el navegador por sucursal. **Descargar borrador** y **Subir borrador** trasladan la planificación en JSON. No hay límite de acciones.
4. **Limpiar todo** borra la planificación local de la sucursal tras pedir confirmación.
5. Carga el **FORMATO CAPEX OPEX 2026v2.xlsx** original, abre **Ver vista previa** y descarga el Excel de la sucursal para la entrega.

Los borradores de la versión 0.1.6 no son compatibles: hay que volver a cargar las acciones.

## Flujo de revisión

Selecciona **admin**, ingresa la clave y abre **Consolidar entregas Excel**. Carga la plantilla v2 y luego los Excel de las sucursales. Cada archivo debe contener una sola sucursal. El consolidado une los bloques en orden alfabético, sin límite de filas, y se puede descargar desde la primera entrega; con menos de 14 sucursales lleva PARCIAL y el número de entregas en el nombre. **Limpiar todo** reinicia las entregas importadas.

## Formato del Excel

El archivo se arma desde cero con los encabezados, estilos y anchos de columna de la plantilla v2. Solo incluye la sección Técnica Sucursal:

- A: TÉCNICA SUCURSAL, combinada en todo el bloque.
- B: sucursal, combinada por sucursal. C: objetivo estratégico, combinado por objetivo dentro de la sucursal.
- D: ciudad (acciones generales). E: acción específica.
- F a M: marca X y valor CAPEX por trimestre. O: fórmula del total de trimestres. P: total anual de la sucursal, combinado.
- Q a T: OPEX por trimestre. V: fórmula del total. W: total anual de la sucursal, combinado.

## Parámetros y publicación

`parametros.json` contiene las tarifas de fibra y poste y los parámetros de mano de obra. El administrador prepara una nueva versión desde **Parámetros generales** y la publica reemplazando el archivo en el repositorio. La app lo descarga sin caché al abrirse.

Para publicar en GitHub Pages, sube el contenido de esta carpeta a la raíz del repositorio y configura esa raíz como origen de Pages. El Excel v2 original se carga localmente y no va en el repositorio. Los datos de trabajo y las entregas se procesan en el navegador.
